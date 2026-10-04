import {
  Activity, CalendarRange, ChevronsLeft, ChevronsRight, Database, LayoutDashboard, Package, Plane, RotateCw,
  SlidersHorizontal, TriangleAlert,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Button, SimulatedLabel } from '../components/ui'
import { unreachableMessage } from '../lib/api'
import { dateTime } from '../lib/format'
import { useConsoleParams } from '../lib/params'
import { useHealth, useMeta, usePlan, useReplan, useScenarios } from '../lib/queries'

const MAIN = [
  { to: '/app/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/app/fleet', label: 'Fleet', icon: Plane },
  { to: '/app/plan', label: 'Plan', icon: CalendarRange },
  { to: '/app/scenarios', label: 'Scenarios', icon: SlidersHorizontal },
  { to: '/app/spares', label: 'Spares', icon: Package },
]
const SECONDARY = [
  { to: '/app/data', label: 'Data sources', icon: Database },
  { to: '/app/model', label: 'Model', icon: Activity },
]

const TITLES: [RegExp, string][] = [
  [/^\/app\/overview/, 'Overview'],
  [/^\/app\/fleet\/.+/, 'Aircraft detail'],
  [/^\/app\/fleet/, 'Fleet'],
  [/^\/app\/plan/, 'Maintenance plan'],
  [/^\/app\/scenarios/, 'Scenarios'],
  [/^\/app\/spares/, 'Spares'],
  [/^\/app\/data/, 'Data sources'],
  [/^\/app\/model/, 'Model'],
]

function readCollapsed(): boolean {
  try {
    const saved = localStorage.getItem('aeroready.sidebar')
    if (saved) return saved === 'collapsed'
  } catch { /* storage unavailable */ }
  return window.innerWidth < 1024       // icons-only sidebar on tablets
}

function NavItem({ to, label, icon: Icon, collapsed, link }: {
  to: string; label: string; icon: typeof Plane; collapsed: boolean; link: (p: string) => string
}) {
  return (
    <NavLink to={link(to)} title={collapsed ? label : undefined}
      className={({ isActive }) => `flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors ${
        isActive ? 'bg-accent/10 text-accent shadow-[inset_2px_0_0_#f5a524]' : 'text-muted hover:bg-panel2 hover:text-ink'}`}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {!collapsed && <span>{label}</span>}
    </NavLink>
  )
}

function TopBar() {
  const { pathname } = useLocation()
  const { base, scenario, setBase, setScenario } = useConsoleParams()
  const meta = useMeta()
  const scenarios = useScenarios()
  const plan = usePlan(scenario)
  const replan = useReplan()
  const title = TITLES.find(([re]) => re.test(pathname))?.[1] ?? 'Console'
  const solver = plan.data?.optimized.solver

  return (
    <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-[#0d131a] px-5 py-2">
      <h1 className="display mr-auto min-w-0 truncate text-xl font-semibold uppercase tracking-wider">{title}</h1>

      <label className="flex items-center gap-2 text-xs text-muted">
        Base
        <select value={base ?? ''} onChange={(e) => setBase(e.target.value || null)} className="text-sm" disabled={!meta.data}>
          <option value="">All bases</option>
          {meta.data?.bases.map((b) => <option key={b.id} value={b.id}>{b.id} · {b.name}</option>)}
        </select>
      </label>

      <label className="flex items-center gap-2 text-xs text-muted">
        Scenario
        <select value={scenario ?? 'baseline'} onChange={(e) => setScenario(e.target.value)} className="max-w-[200px] text-sm"
          disabled={!scenarios.data}>
          {(scenarios.data?.scenarios ?? [{ id: 'baseline', name: 'Baseline scenario' }]).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-3 text-xs">
        <div className="text-right leading-tight">
          <div className="text-muted">
            Last run <span className="num text-ink">{plan.data ? dateTime(plan.data.computed_at) : 'Not available'}</span>
          </div>
          <div className="text-muted">
            Solver{' '}
            <span className={solver?.status === 'OPTIMAL' ? 'text-ok' : solver ? 'text-warn' : 'text-dim'}>
              {solver ? (solver.status === 'OPTIMAL' ? 'optimal' : solver.status === 'FEASIBLE' ? 'feasible (timed out)' : solver.status.toLowerCase()) : 'not available'}
            </span>
            {solver && <span className="num text-dim"> · {solver.wall_time_s} s</span>}
          </div>
        </div>
        <Button onClick={() => replan.mutate(scenario)} busy={replan.isPending} icon={<RotateCw className="h-3.5 w-3.5" />}
          title="Run the optimiser again for the active scenario">Re-plan</Button>
        {replan.isError && <span className="max-w-[180px] text-bad" role="alert">Re-plan failed: {(replan.error as Error).message}</span>}
      </div>

      {meta.data && <SimulatedLabel origin={meta.data.data_origin} />}
    </header>
  )
}

export default function Shell() {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const health = useHealth()
  const { link } = useConsoleParams()
  const toggle = () => {
    setCollapsed((c) => {
      try { localStorage.setItem('aeroready.sidebar', c ? 'open' : 'collapsed') } catch { /* storage unavailable */ }
      return !c
    })
  }
  const nav = (items: typeof MAIN): ReactNode => items.map((n) => <NavItem key={n.to} {...n} collapsed={collapsed} link={link} />)

  return (
    <div className="flex h-screen">
      <aside className={`flex shrink-0 flex-col border-r border-line bg-[#0d131a] transition-[width] ${collapsed ? 'w-[60px]' : 'w-[208px]'}`}>
        <Link to="/" className="flex h-14 items-center border-b border-line px-4" title="AeroReady home">
          <span className="display text-xl font-bold tracking-wide">{collapsed ? 'AR' : <>AERO<span className="text-accent">READY</span></>}</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5 p-2" aria-label="Console">
          {nav(MAIN)}
          <div className="my-2 border-t border-line" role="separator" />
          {nav(SECONDARY)}
        </nav>
        <button onClick={toggle} className="flex items-center gap-2 border-t border-line px-4 py-3 text-xs text-dim hover:text-ink"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" />Collapse</>}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {health.isError && (
          <div className="flex items-center gap-2 border-b border-bad/50 bg-bad/15 px-5 py-2 text-sm" role="alert">
            <TriangleAlert className="h-4 w-4 text-bad" aria-hidden />
            <span className="text-ink">{unreachableMessage()}</span>
            <span className="text-muted">Start it with: cd backend, then .venv/Scripts/python -m uvicorn aeroready.api.main:app --port 8000</span>
          </div>
        )}
        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="mx-auto max-w-[1500px]"><Outlet /></div>
        </main>
      </div>
    </div>
  )
}
