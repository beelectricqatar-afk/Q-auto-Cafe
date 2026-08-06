// Supabase connection. The URL and the *publishable* (anon) key are public by
// design — they ship in the client bundle. Access is controlled by the
// database's row-level policies (currently open, per project decision). The
// SECRET key is never used here. Defaults below let the Vercel build work with
// no env setup; override via VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
const env = import.meta.env as Record<string, string | undefined>

export const SUPABASE_URL = env.VITE_SUPABASE_URL ?? 'https://zyeasvvudmaqxaojesyn.supabase.co'
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_ymxN2pVuLjfwnu4faSgHGA_ZjA1zvdH'

export function isConfigured(): boolean {
  return !!SUPABASE_URL && !!SUPABASE_ANON_KEY
}
