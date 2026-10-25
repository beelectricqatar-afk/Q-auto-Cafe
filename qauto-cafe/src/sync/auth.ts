// Signing in to the cafe: one shared Supabase account.
//
// Every request to Supabase carries the signed-in session's token, and the
// database only answers signed-in requests. "Stay signed in" keeps the session
// in localStorage (survives closing the browser); otherwise it lives in
// sessionStorage and ends with the tab.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config'

export interface Session { accessToken: string; refreshToken: string; expiresAt: number; email: string }

const KEY = 'qauto.session'
const listeners = new Set<() => void>()

function stores(): Storage[] {
  const s: Storage[] = []
  try { s.push(localStorage) } catch { /* blocked */ }
  try { s.push(sessionStorage) } catch { /* blocked */ }
  return s
}
function read(): { session: Session; remember: boolean } | null {
  for (const st of stores()) {
    try {
      const raw = st.getItem(KEY)
      if (raw) return { session: JSON.parse(raw) as Session, remember: st === stores()[0] }
    } catch { /* unreadable: treat as signed out */ }
  }
  return null
}
function write(session: Session | null, remember: boolean) {
  for (const st of stores()) { try { st.removeItem(KEY) } catch { /* ignore */ } }
  if (session) {
    try { (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(session)) } catch { /* ignore */ }
  }
  listeners.forEach(l => l())
}

let current = read()

export const currentSession = (): Session | null => current?.session ?? null
export function onAuthChange(l: () => void): () => void { listeners.add(l); return () => listeners.delete(l) }

interface TokenResponse { access_token: string; refresh_token: string; expires_in: number; user?: { email?: string } }
const toSession = (t: TokenResponse, email: string): Session =>
  ({ accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: Date.now() + t.expires_in * 1000, email: t.user?.email ?? email })

async function token(grant: 'password' | 'refresh_token', body: object): Promise<Response> {
  return fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Signs in, or throws a message fit to show on the login screen. */
export async function signIn(email: string, password: string, remember: boolean): Promise<void> {
  let res: Response
  try { res = await token('password', { email: email.trim(), password }) } catch { throw new Error('No connection. Check the internet and try again.') }
  if (res.status === 400 || res.status === 401) throw new Error('Wrong email or password.')
  if (!res.ok) throw new Error('Could not sign in right now. Try again in a moment.')
  current = { session: toSession((await res.json()) as TokenResponse, email.trim()), remember }
  write(current.session, remember)
}

export async function signOut(): Promise<void> {
  const s = currentSession()
  current = null
  write(null, false)
  if (s) {
    // Ends the session on the server too; signed out locally even if this fails.
    try { await fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${s.accessToken}` } }) } catch { /* offline */ }
  }
}

let refreshing: Promise<void> | null = null
/** Swaps the refresh token for a new session a minute before it runs out. */
async function fresh(): Promise<Session | null> {
  if (!current) return null
  if (current.session.expiresAt - Date.now() > 60_000) return current.session
  refreshing ??= (async () => {
    const { session, remember } = current!
    try {
      const res = await token('refresh_token', { refresh_token: session.refreshToken })
      if (res.ok) { current = { session: toSession((await res.json()) as TokenResponse, session.email), remember }; write(current.session, remember) }
      // The server no longer accepts this session: sign in again.
      else if (res.status === 400 || res.status === 401) { current = null; write(null, false) }
    } catch { /* offline: keep the session and try again later */ }
  })().finally(() => { refreshing = null })
  await refreshing
  return current?.session ?? null
}

/** Headers for a Supabase REST call, carrying the signed-in session. */
export async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const s = await fresh()
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${s?.accessToken ?? SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}
