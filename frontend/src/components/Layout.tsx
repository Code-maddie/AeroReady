import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import type { Meta } from '../api'
import { useApi, useBase, type BaseFilter } from '../hooks'

const NAV = [
  { to: '/readiness', label: 'Readiness' },
  { to: '/plan', label: 'Plan' },
  { to: '/aircraft', label: 'Aircraft' },
  { to: '/what-if', label: 'What-if' },
  { to: '/spares', label: 'Spares' },
]

/** The floating pill navigation, shared by the landing page and the app. */
export function PillNav({ overlay = false }: { overlay?: boolean }) {
  return (
    <nav aria-label="Main"
      className={`flex items-center gap-0.5 rounded-full p-1 text-[13px] ${overlay
        ? 'bg-black/45 ring-1 ring-white/10 backdrop-blur-md'
        : 'bg-panel ring-1 ring-white/5'}`}>
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to}
          className={({ isActive }) => `rounded-full px-3.5 py-1.5 transition-colors ${
            isActive ? 'bg-ink text-bg' : 'text-ink/75 hover:bg-white/10 hover:text-ink'}`}>
          {n.label}
        </NavLink>
      ))}
    </nav>
  )
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <Link to="/" className={`text-[19px] font-medium tracking-[-0.03em] text-ink ${className}`} aria-label="AeroReady home">
      AeroReady<sup className="ml-px text-[12px] text-ink/70">*</sup>
    </Link>
  )
}

function BackendBanner() {
  const [down, setDown] = useState(false)
  useEffect(() => {
    let alive = true
    const check = () => fetch('/api/health').then((r) => alive && setDown(!r.ok)).catch(() => alive && setDown(true))
    check()
    const t = setInterval(check, 10000)
    return () => { alive = false; clearInterval(t) }
  }, [])
  if (!down) return null
  return (
    <div className="mx-auto mb-2 w-full max-w-[1440px] px-8" role="alert">
      <div className="rounded-xl bg-bad/15 px-4 py-2.5 text-sm ring-1 ring-bad/40">
        <span className="font-medium text-bad">Backend offline.</span>{' '}
        <span className="text-ink/90">Start the API with </span>
        <code className="text-muted">cd backend &amp;&amp; .venv/Scripts/python -m uvicorn aeroready.api.main:app --port 8000</code>
      </div>
    </div>
  )
}

export default function Layout() {
  const { base, setBase } = useBase()
  const meta = useApi<Meta>('/api/meta')
  const bases: { id: BaseFilter; label: string }[] = [
    { id: 'ALL', label: 'All bases' },
    ...(meta.data?.bases ?? [{ id: 'BN' }, { id: 'BC' }, { id: 'BS' }]).map((b) => ({ id: b.id as BaseFilter, label: b.id })),
  ]
  return (
    <div className="flex min-h-screen min-w-[1200px] flex-col">
      <header className="sticky top-0 z-30 bg-bg/85 backdrop-blur-md">
        <div className="mx-auto grid h-16 max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center px-8">
          <Wordmark />
          <PillNav />
          <div className="flex justify-end">
            <div className="flex rounded-full bg-panel p-1 text-[13px] ring-1 ring-white/5" role="radiogroup" aria-label="Base filter">
              {bases.map((b) => (
                <button key={b.id} role="radio" aria-checked={base === b.id} onClick={() => setBase(b.id)}
                  title={meta.data?.bases.find((x) => x.id === b.id)?.name}
                  className={`rounded-full px-3 py-1.5 ${base === b.id ? 'bg-panel2 text-ink ring-1 ring-white/10' : 'text-muted hover:text-ink'}`}>
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>
      <BackendBanner />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-8 pb-12">
        <Outlet />
      </main>
      <footer className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-8 py-5 text-xs text-dim">
        <span>* Synthetic fleet data. Engine sensor data from NASA C-MAPSS.</span>
        <span>Decision support prototype for SIH 26249. Not for operational use.</span>
      </footer>
    </div>
  )
}

/** Two-tone page heading: the statement in ink, the context in grey. */
export function PageHead({ title, sub, children }: { title: ReactNode; sub: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-7 mt-8 flex items-end justify-between gap-8">
      <h1 className="max-w-4xl text-[34px] font-medium leading-[1.15] tracking-[-0.02em]">
        <span className="text-ink">{title}</span><br />
        <span className="text-muted">{sub}</span>
      </h1>
      {children}
    </div>
  )
}
