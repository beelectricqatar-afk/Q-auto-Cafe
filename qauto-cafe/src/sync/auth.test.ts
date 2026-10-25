import { describe, it, expect, beforeEach, vi } from 'vitest'

const tokenReply = (expiresIn = 3600) => new Response(JSON.stringify({ access_token: 'tok', refresh_token: 'ref', expires_in: expiresIn, user: { email: 'cafe@q-auto.com' } }), { status: 200 })

// A fresh copy of the module each time, as if the page had just loaded.
const load = async () => { vi.resetModules(); return import('./auth') }

describe('signing in', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks() })

  it('"Stay signed in" keeps the session after the page reloads', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(tokenReply())
    const auth = await load()
    await auth.signIn('cafe@q-auto.com', 'pw', true)
    expect(localStorage.getItem('qauto.session')).not.toBeNull()
    expect(sessionStorage.getItem('qauto.session')).toBeNull()
    expect((await load()).currentSession()?.email).toBe('cafe@q-auto.com')
  })

  it('without it, the session only lives in this tab', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(tokenReply())
    const auth = await load()
    await auth.signIn('cafe@q-auto.com', 'pw', false)
    expect(localStorage.getItem('qauto.session')).toBeNull()
    expect(sessionStorage.getItem('qauto.session')).not.toBeNull()
  })

  it('says so when the password is wrong', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 400 }))
    const auth = await load()
    await expect(auth.signIn('cafe@q-auto.com', 'nope', true)).rejects.toThrow('Wrong email or password.')
    expect(auth.currentSession()).toBeNull()
  })

  it('sends the session token with every request, and logging out forgets it', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(tokenReply())
    const auth = await load()
    await auth.signIn('cafe@q-auto.com', 'pw', true)
    expect((await auth.authHeaders()).Authorization).toBe('Bearer tok')
    await auth.signOut()
    expect(auth.currentSession()).toBeNull()
    expect(localStorage.getItem('qauto.session')).toBeNull()
  })

  it('renews a session about to run out, and signs out when the server refuses it', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(tokenReply(30))
    const auth = await load()
    await auth.signIn('cafe@q-auto.com', 'pw', true)
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok2', refresh_token: 'ref2', expires_in: 3600 }), { status: 200 }))
    expect((await auth.authHeaders()).Authorization).toBe('Bearer tok2')

    localStorage.setItem('qauto.session', JSON.stringify({ accessToken: 'old', refreshToken: 'bad', expiresAt: Date.now(), email: 'cafe@q-auto.com' }))
    const again = await load()
    fetch.mockResolvedValueOnce(new Response('{}', { status: 400 }))
    await again.authHeaders()
    expect(again.currentSession()).toBeNull()
  })

  it('stays signed in when renewing fails only because the device is offline', async () => {
    localStorage.setItem('qauto.session', JSON.stringify({ accessToken: 'old', refreshToken: 'ref', expiresAt: Date.now(), email: 'cafe@q-auto.com' }))
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    const auth = await load()
    await auth.authHeaders()
    expect(auth.currentSession()?.email).toBe('cafe@q-auto.com')
  })
})
