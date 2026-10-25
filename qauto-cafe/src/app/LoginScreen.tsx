import { useState, type FormEvent } from 'react'
import { signIn } from '../sync/auth'
import { Button } from '../components/ui/button'
import { Input, fieldClass } from '../components/ui/input'
import { Checkbox } from '../components/ui/checkbox'
import { Label } from '../components/ui/label'
import { cn } from '../lib/utils'
import qautoLogo from '../assets/brand/qauto-logo.svg'
import qautoWordmark from '../assets/brand/qauto-wordmark.svg'

const Eye = ({ open }: { open: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
    {!open && <path d="M3 3l18 18" />}
  </svg>
)

/** The cafe's sign-in: nothing in the app opens until the shared account signs in. */
export function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) { setError('Enter the email and password.'); return }
    setBusy(true); setError('')
    try { await signIn(email, password, remember) } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="grid min-h-full place-items-center bg-[#0A0A0A] p-4 font-sans text-foreground">
      <form onSubmit={submit} noValidate className="grid w-full max-w-sm gap-5 rounded-card bg-card p-7 shadow-card">
        <div className="flex items-center gap-2.5">
          <img src={qautoLogo} alt="" width={40} height={40} />
          <img src={qautoWordmark} alt="Q-Auto" className="h-8 w-auto" />
        </div>
        <div className="grid gap-1">
          <h1 className="m-0 text-xl font-semibold tracking-tight">Sign in to Q-Auto Cafe</h1>
          <p className="m-0 text-sm text-muted-foreground">Use the cafe account.</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="login-email">Email</Label>
          <Input id="login-email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} aria-invalid={!!error || undefined} autoFocus />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="login-password">Password</Label>
          <div className="relative">
            <input
              id="login-password" type={show ? 'text' : 'password'} autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)} aria-invalid={!!error || undefined}
              className={cn(fieldClass, 'pr-11')}
            />
            <button
              type="button" onClick={() => setShow(s => !s)}
              aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}
              className="absolute inset-y-0 right-0 grid w-11 cursor-pointer place-items-center border-0 bg-transparent text-muted-foreground hover:text-foreground"
            >
              <Eye open={show} />
            </button>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <Checkbox checked={remember} onChange={e => setRemember(e.target.checked)} />
          Stay signed in
        </label>
        {error && <p role="alert" className="m-0 rounded-control bg-destructive-soft px-3 py-2.5 text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy} className="w-full">{busy ? 'Signing in…' : 'Sign in'}</Button>
      </form>
    </div>
  )
}
