import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, FormField } from '../components/ui'
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
    <div className="flex min-h-screen flex-col bg-bg px-6">
      <main className="mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center">
        <h1 className="display text-[32px] font-bold leading-none">AeroReady</h1>
        <p className="mt-2 text-[13px] text-muted">Fleet maintenance planning — SIH 26249</p>
        <form onSubmit={submit} className="panel mt-6 space-y-4 p-4" noValidate>
          <FormField label="Username">
            <input type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
          </FormField>
          <FormField label="Password" error={error}>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required
              aria-invalid={!!error} />
          </FormField>
          <Button type="submit" variant="primary" busy={busy} disabled={!username || !password}>Sign in</Button>
        </form>
      </main>
      <footer className="py-4 text-center text-xs text-dim">Prototype. Simulated fleet scenario with NASA C-MAPSS engine data.</footer>
    </div>
  )
}
