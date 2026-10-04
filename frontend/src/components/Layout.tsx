import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { dayDate, type Meta } from '../api'
import { useApi, useBase, type BaseFilter } from '../hooks'

const ICON: Record<string, ReactNode> = {
  readiness: <path d="M3 17l5-6 4 3 6-8M3 21h18" />,
  plan: <path d="M4 5h9M4 10h14M4 15h7M4 20h11" />,
  aircraft: <path d="M12 2l2 7 8 3-8 2-2 8-2-8-8-2 8-3z" />,
  whatif: <path d="M5 4v16M5 8h10l-2 3 2 3H5M19 4v16" />,
  spares: <path d="M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10" />,
}

const NAV = [
  { to: '/', label: 'Readiness', icon: 'readiness' },
  { to: '/plan', label: 'Plan', icon: 'plan' },
  { to: '/aircraft', label: 'Aircraft', icon: 'aircraft' },
  { to: '/what-if', label: 'What-if', icon: 'whatif' },
  { to: '/spares', label: 'Spares', icon: 'spares' },
]

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
    <div className="flex items-center gap-3 border-b border-bad/50 bg-bad/15 px-5 py-2 text-sm" role="alert">
      <span className="display font-semibold uppercase tracking-wider text-bad">Backend offline</span>
      <span className="text-ink">Live data unavailable. Start the API: <code className="text-muted">cd backend &amp;&amp; .venv/Scripts/python -m uvicorn aeroready.api.main:app --port 8000</code></span>
    </div>
  )
}

export default function Layout() {
  const { base, setBase } = useBase()
  const meta = useApi<Meta>('/api/meta')
  const start = meta.data?.start_date ?? '2026-10-05'
  const bases: { id: BaseFilter; label: string }[] = [
    { id: 'ALL', label: 'All bases' },
    ...(meta.data?.bases ?? [{ id: 'BN' }, { id: 'BC' }, { id: 'BS' }]).map((b) => ({ id: b.id as BaseFilter, label: b.id })),
  ]
  return (
    <div className="flex h-full min-w-[1200px]">
      <aside className="flex w-[200px] shrink-0 flex-col border-r border-line bg-[#0d131a]">
        <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
          <svg viewBox="0 0 32 32" className="h-7 w-7"><path d="M16 3 L19.5 14.5 L29 18 L19.5 19.5 L16 29 L12.5 19.5 L3 18 L12.5 14.5 Z" fill="#F5A524" /></svg>
          <div>
            <div className="display text-xl font-bold leading-none tracking-wide">AERO<span className="text-accent">READY</span></div>
            <div className="mt-1 whitespace-nowrap text-[9px] uppercase tracking-[0.12em] text-dim">Availability-first MRO</div>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 p-3">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              className={({ isActive }) => `display flex items-center gap-3 rounded px-3 py-2 text-[15px] font-semibold uppercase tracking-wider transition-colors ${
                isActive ? 'bg-accent/10 text-accent shadow-[inset_2px_0_0_#F5A524]' : 'text-muted hover:bg-panel2 hover:text-ink'}`}>
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{ICON[n.icon]}</svg>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-line p-4 text-[11px] leading-relaxed text-dim">
          SIH 26249 · Air Power<br />Predictive Maintenance &amp; Fleet Availability
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-6 border-b border-line bg-[#0d131a] px-5">
          <div className="min-w-0">
            <div className="display truncate text-lg font-semibold uppercase tracking-wider">Synthetic Air Wing</div>
            <div className="text-[11px] text-dim">24 aircraft · 3 bases · 30-day planning horizon</div>
          </div>
          <div className="ml-auto flex items-center gap-2 rounded border border-line px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden />
            <span className="label-caps !text-[11px]">Plan day</span>
            <span className="display num text-base font-semibold">D0 · {dayDate(start, 0)} {start.slice(0, 4)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="label-caps !text-[11px]">Base</span>
            <div className="flex rounded border border-line2 p-0.5" role="radiogroup" aria-label="Base filter">
              {bases.map((b) => (
                <button key={b.id} role="radio" aria-checked={base === b.id} onClick={() => setBase(b.id)}
                  className={`display rounded-sm px-3 py-1 text-sm font-semibold uppercase tracking-wider ${
                    base === b.id ? 'bg-accent text-bg' : 'text-muted hover:text-ink'}`}>
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        </header>
        <BackendBanner />
        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <Outlet />
        </main>
        <footer className="flex h-8 shrink-0 items-center justify-between border-t border-line px-5 text-[11px] text-dim">
          <span>AeroReady prototype · decision support only · not for operational use</span>
          <span className="rounded border border-accent/40 px-2 py-0.5 font-semibold uppercase tracking-wider text-accent/90">
            Synthetic fleet data · C-MAPSS engine data
          </span>
        </footer>
      </div>
    </div>
  )
}
