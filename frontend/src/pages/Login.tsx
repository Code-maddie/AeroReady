import { ArrowLeft, ArrowUpRight, Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ROLE_HOME, useAuth } from '../lib/auth'

export default function Login() {
  const { user, login } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (user) return <Navigate to={params.get('next') || ROLE_HOME[user.role]} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const u = await login(username, password)
      const next = params.get('next')
      navigate(next && next.startsWith(ROLE_HOME[u.role]) ? next : ROLE_HOME[u.role], { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[1.15fr_1fr]">
      <section className="relative hidden overflow-hidden lg:block">
        <img src="/img/typhoon-storm.jpg" alt="A fighter jet banking through storm cloud at dusk"
          className="absolute inset-0 h-full w-full object-cover object-[50%_45%]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(14,14,13,0.95)_0%,rgba(14,14,13,0.3)_45%,rgba(14,14,13,0.25)_100%)]" />
        <Link to="/" className="absolute left-8 top-6 inline-flex items-center gap-2 rounded-full bg-black/45 px-3.5 py-1.5 text-[13px] text-ink/85 ring-1 ring-white/10 backdrop-blur hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />Back to overview
        </Link>
        <p className="rise absolute bottom-10 left-8 select-none text-[clamp(72px,9vw,150px)] font-light leading-[0.8] tracking-[-0.055em] text-ink" aria-hidden>
          AeroReady<sup className="ml-1 align-[0.9em] text-[0.22em] font-normal">*</sup>
        </p>
      </section>

      <section className="flex flex-col px-6 py-12">
        <div className="m-auto w-full max-w-[420px]">
          <Link to="/" className="mb-8 inline-flex items-center gap-2 text-[13px] text-muted hover:text-ink lg:hidden"><ArrowLeft className="h-3.5 w-3.5" />Back</Link>
          <h1 className="text-[32px] font-medium leading-[1.15] tracking-[-0.02em]">
            <span className="text-ink">AeroReady.</span><br /><span className="text-muted">Fleet maintenance planning — SIH 26249</span>
          </h1>

          <form onSubmit={submit} className="mt-8 space-y-3" noValidate>
            <label className="block text-[13px] text-muted">Username
              <input type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)}
                className="mt-1.5 w-full !h-10 text-sm" required autoFocus />
            </label>
            <label className="block text-[13px] text-muted">Password
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full !h-10 text-sm" required aria-invalid={!!error} />
            </label>
            {error && <p className="rounded-xl bg-bad/10 px-3 py-2 text-[13px] text-bad ring-1 ring-bad/30" role="alert">{error}</p>}
            <button type="submit" disabled={busy || !username || !password}
              className="mt-2 inline-flex w-full items-center justify-between rounded-full bg-ink py-1.5 pl-5 pr-1.5 text-[14px] font-medium text-bg hover:bg-white disabled:opacity-60">
              {busy ? 'Signing in' : 'Sign in'}
              <span className="grid h-8 w-8 place-items-center rounded-full bg-bg text-ink">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
              </span>
            </button>
          </form>
        </div>
        <footer className="mt-10 text-center text-xs text-dim">Prototype. Simulated fleet scenario with NASA C-MAPSS engine data.</footer>
      </section>
    </div>
  )
}
