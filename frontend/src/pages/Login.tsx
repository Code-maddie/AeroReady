import { ArrowLeft } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Field, Panel, QueryView, SortTable } from '../components/ui'
import { ROLE_LABEL, useAuth, type User } from '../lib/auth'
import { useDemoAccounts } from '../lib/queries'

const CAN: Record<string, string> = { decide: 'approve or reject recommendations', plan: 're-plan and run scenarios', data: 'upload data' }

export default function Login() {
  const { user, login } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const next = params.get('next') || '/app/overview'
  const demo = useDemoAccounts()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (user) return <Navigate to={next} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await login(username, password)
      navigate(next, { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen bg-bg px-6 py-12">
      <div className="mx-auto w-full max-w-[640px] space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="display text-[28px] font-bold leading-none">AeroReady</div>
            <h1 className="display mt-2 text-[20px] font-semibold text-muted">Sign in</h1>
          </div>
          <Link to="/" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />Overview page</Link>
        </div>

        <Panel>
          <form onSubmit={submit} className="space-y-3">
            <Field label="Username"><input type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required /></Field>
            <Field label="Password"><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
            <Button type="submit" variant="primary" busy={busy}>Sign in</Button>
          </form>
        </Panel>

        <Panel title="Demo accounts" flush>
          <QueryView q={demo}>
            {(d) => (
              <SortTable sortable={false} rows={d.accounts} rowKey={(a) => a.username}
                columns={[
                  { key: 'role', label: 'Role', value: (a) => ROLE_LABEL[a.role as User['role']] ?? a.role },
                  { key: 'user', label: 'Username', value: (a) => a.username, render: (a) => <span className="font-mono text-xs">{a.username}</span> },
                  { key: 'pw', label: 'Password', value: (a) => a.password, render: (a) => <span className="font-mono text-xs">{a.password}</span> },
                  { key: 'can', label: 'Can', value: (a) => a.permissions.map((p) => CAN[p] ?? p).join(', ') || 'View only',
                    render: (a) => <span className="text-xs text-muted">{a.permissions.map((p) => CAN[p] ?? p).join(', ') || 'View only'}</span> },
                  { key: 'use', label: '', value: () => null, align: 'right',
                    render: (a) => <Button size="sm" onClick={() => { setUsername(a.username); setPassword(a.password); setError(null) }}>Use account</Button> },
                ]} />
            )}
          </QueryView>
        </Panel>
      </div>
    </div>
  )
}
