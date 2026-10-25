import { useState, type FormEvent } from 'react'
import { signIn } from '../sync/auth'
import { Button } from '../components/ui/button'
import { Input, fieldClass } from '../components/ui/input'
import { Checkbox } from '../components/ui/checkbox'
import { Label } from '../components/ui/label'
import { cn } from '../lib/utils'
import qautoLogo from '../assets/brand/qauto-logo.svg'
import qautoWordmark from '../assets/brand/qauto-wordmark.svg'
import qautoLogoWhite from '../assets/brand/qauto-logo-white.svg'
import qautoWordmarkWhite from '../assets/brand/qauto-wordmark-white.svg'
import cafePhoto from '../assets/brand/login-cafe.webp'

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
    <div className="grid h-full bg-card font-sans text-foreground lg:grid-cols-[minmax(440px,5fr)_7fr]">
      <div className="flex min-h-full flex-col overflow-auto px-6 py-8 sm:px-12">
        <div className="flex items-center gap-2.5">
          <img src={qautoLogo} alt="" width={40} height={40} />
          <img src={qautoWordmark} alt="Q-Auto" className="h-8 w-auto" />
        </div>
        <form onSubmit={submit} noValidate className="mx-auto my-auto grid w-full max-w-sm gap-5 py-10">
          <div className="grid gap-1.5">
            <h1 className="m-0 text-[28px] leading-9 font-semibold tracking-tight">Welcome back</h1>
            <p className="m-0 text-sm text-muted-foreground">Sign in with the cafe account to open the POS.</p>
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
          <Button type="submit" disabled={busy} className="h-11 w-full">{busy ? 'Signing in…' : 'Sign in'}</Button>
        </form>
        <p className="m-0 text-xs text-muted-foreground">Q-Auto Cafe · Volkswagen &amp; Audi</p>
      </div>
      <div className="relative hidden overflow-hidden bg-[#0A0A0A] lg:block">
        <img src={cafePhoto} alt="A Q-Auto barista handing over a coffee" className="absolute inset-0 h-full w-full object-cover object-[6%_50%]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute bottom-10 left-10 flex items-center gap-3">
          <img src={qautoLogoWhite} alt="" width={36} height={36} />
          <img src={qautoWordmarkWhite} alt="Q-Auto" className="h-7 w-auto" />
        </div>
      </div>
    </div>
  )
}
