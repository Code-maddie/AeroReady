import {
  Activity, CalendarRange, ChevronsLeft, ChevronsRight, Database, LayoutDashboard, LogOut, Package, Plane, RotateCw,
  SlidersHorizontal, TriangleAlert,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import Toaster from '../components/Toaster'
import { Button, SimulatedLabel } from '../components/ui'
import { unreachableMessage } from '../lib/api'
import { ROLE_LABEL, useAuth } from '../lib/auth'
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
  [/^\/app\/overview/, 'Fleet availability'],
  [/^\/app\/fleet\/.+/, 'Aircraft detail'],
  [/^\/app\/fleet/, 'Fleet status'],
  [/^\/app\/plan/, 'Maintenance plan'],
  [/^\/app\/scenarios/, 'Scenarios'],
  [/^\/app\/spares/, 'Spares and cannibalisation'],
  [/^\/app\/data/, 'Data sources'],
  [/^\/app\/model/, 'Model performance'],
]

function readCollapsed(): boolean {
  try {
    const saved = localStorage.getItem('aeroready.sidebar')
    if (saved) return saved === 'collapsed'
  } catch { /* storage unavailable */ }
  return window.innerWidth < 1024
}

function NavItem({ to, label, icon: Icon, collapsed, link }: {
  to: string; label: string; icon: typeof Plane; collapsed: boolean; link: (p: string) => string
}) {
  return (
    <NavLink to={link(to)} title={collapsed ? label : undefined}
      className={({ isActive }) => `flex h-9 items-center gap-3 rounded px-3 text-[13px] ${
        isActive ? 'bg-panel2 text-ink shadow-[inset_2px_0_0_var(--color-accent)]' : 'text-muted hover:bg-panel2/60 hover:text-ink'}`}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {!collapsed && <span>{label}</span>}
    </NavLink>
  )
}

function TopBar() {
  const { pathname } = useLocation()
  const { base, scenario, setBase, setScenario } = useConsoleParams()
  const { user, logout, can } = useAuth()
  const meta = useMeta()
  const scenarios = useScenarios()
  const plan = usePlan(scenario)
  const replan = useReplan()
  const title = TITLES.find(([re]) => re.test(pathname))?.[1] ?? 'Console'
  const solver = plan.data?.optimized.solver

  return (
    <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-panel px-6 py-2">
      <h1 className="display mr-auto text-[20px] font-semibold">{title}</h1>
      <select value={base ?? ''} onChange={(e) => setBase(e.target.value || null)} disabled={!meta.data} aria-label="Base filter">
        <option value="">All bases</option>
        {meta.data?.bases.map((b) => <option key={b.id} value={b.id}>{b.id} · {b.name}</option>)}
      </select>
      <select value={scenario ?? 'baseline'} onChange={(e) => setScenario(e.target.value)} disabled={!scenarios.data}
        className="max-w-[200px]" aria-label="Active scenario">
        {(scenarios.data?.scenarios ?? [{ id: 'baseline', name: 'Baseline scenario' }]).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <div className="text-right text-xs leading-tight text-muted">
        <div>Last run <span className="num text-ink">{plan.data ? dateTime(plan.data.computed_at) : 'Not available'}</span></div>
        <div>Solver <span className={solver?.status === 'OPTIMAL' ? 'text-ok' : solver ? 'text-warn' : 'text-dim'}>
          {solver ? (solver.status === 'OPTIMAL' ? 'optimal' : solver.status === 'FEASIBLE' ? 'feasible, timed out' : solver.status.toLowerCase()) : 'not available'}
        </span>{solver && <span className="num text-dim"> · {solver.wall_time_s} s</span>}</div>
      </div>
      <Button onClick={() => replan.mutate(scenario)} busy={replan.isPending} icon={<RotateCw className="h-3.5 w-3.5" />}
        disabled={!can('plan')} title={can('plan') ? 'Run the optimiser again for the active scenario' : 'Planner role required'}>Re-plan</Button>
      {replan.isError && <span className="max-w-[180px] text-xs text-bad" role="alert">Re-plan failed: {(replan.error as Error).message}</span>}
      {meta.data && <SimulatedLabel origin={meta.data.data_origin} />}
      {user && (
        <div className="flex items-center gap-2 border-l border-line pl-4 text-[13px]">
          <span className="text-ink">{user.name}</span>
          <span className="text-xs text-muted">{ROLE_LABEL[user.role]}</span>
          <button onClick={logout} title="Sign out" aria-label="Sign out" className="grid h-8 w-8 place-items-center rounded text-muted hover:bg-panel2 hover:text-ink">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      )}
    </header>
  )
}

export default function Shell() {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const health = useHealth()
  const { link } = useConsoleParams()
  const toggle = () => setCollapsed((c) => {
    try { localStorage.setItem('aeroready.sidebar', c ? 'open' : 'collapsed') } catch { /* storage unavailable */ }
    return !c
  })
  const nav = (items: typeof MAIN): ReactNode => items.map((n) => <NavItem key={n.to} {...n} collapsed={collapsed} link={link} />)

  return (
    <div className="flex h-screen">
      <aside className={`flex shrink-0 flex-col border-r border-line bg-panel ${collapsed ? 'w-14' : 'w-52'}`}>
        <Link to="/" className="flex h-12 items-center border-b border-line px-4" title="AeroReady home">
          <span className="display text-xl font-bold">{collapsed ? 'AR' : 'AeroReady'}</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1 p-2" aria-label="Console">
          {nav(MAIN)}
          <div className="my-2 border-t border-line" role="separator" />
          {nav(SECONDARY)}
        </nav>
        <button onClick={toggle} className="flex h-10 items-center gap-2 border-t border-line px-4 text-xs text-dim hover:text-ink"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" />Collapse</>}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {health.isError && (
          <div className="flex items-center gap-2 border-b border-bad/50 bg-bad/10 px-6 py-2 text-[13px]" role="alert">
            <TriangleAlert className="h-4 w-4 text-bad" aria-hidden />
            <span className="text-ink">{unreachableMessage()}</span>
            <span className="text-muted">Start it with: cd backend, then .venv/Scripts/python -m uvicorn aeroready.api.main:app --port 8000</span>
          </div>
        )}
        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-[1600px]"><Outlet /></div>
        </main>
      </div>
      <Toaster />
    </div>
  )
}
