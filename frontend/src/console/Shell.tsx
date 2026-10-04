import { LogOut, RotateCw, TriangleAlert } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import Toaster from '../components/Toaster'
import { Button, SimulatedLabel } from '../components/ui'
import { unreachableMessage } from '../lib/api'
import { ROLE_LABEL, useAuth } from '../lib/auth'
import { dateTime } from '../lib/format'
import { useConsoleParams } from '../lib/params'
import { useHealth, useMeta, usePlan, useReplan, useScenarios } from '../lib/queries'

const NAV = [
  { to: '/app/overview', label: 'Overview' },
  { to: '/app/fleet', label: 'Fleet' },
  { to: '/app/plan', label: 'Plan' },
  { to: '/app/scenarios', label: 'Scenarios' },
  { to: '/app/spares', label: 'Spares' },
  { to: '/app/data', label: 'Data sources' },
  { to: '/app/model', label: 'Model' },
]

/** Two-tone page heading: what the page does, then the context in grey. */
const HEADS: [RegExp, (h: number | null) => [string, string]][] = [
  [/^\/app\/overview/, (h) => [h ? `Fleet availability, next ${h} days.` : 'Fleet availability.', 'Optimised plan against reactive maintenance.']],
  [/^\/app\/fleet\/.+/, () => ['Aircraft detail.', 'Engine health, planned work and history for one tail.']],
  [/^\/app\/fleet/, () => ['Fleet status.', 'Every aircraft, its engine life and its next task.']],
  [/^\/app\/plan/, () => ['Maintenance plan.', 'Every job placed within bay, technician and parts limits.']],
  [/^\/app\/scenarios/, () => ['Scenarios.', 'Test a decision before making it.']],
  [/^\/app\/spares/, () => ['Spares and cannibalisation.', 'What the plan needs, what is short and who is waiting.']],
  [/^\/app\/data/, () => ['Data sources.', 'What is real, what is simulated and how to replace it.']],
  [/^\/app\/model/, () => ['Model performance and method.', 'Read from the saved evaluation of the training run.']],
]

export function Wordmark({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="shrink-0 text-[19px] font-medium tracking-[-0.03em] text-ink" aria-label="AeroReady home">
      AeroReady<sup className="ml-px text-[12px] text-ink/70">*</sup>
    </Link>
  )
}

function PillNav({ link }: { link: (p: string) => string }) {
  return (
    <nav aria-label="Console" className="flex items-center gap-0.5 overflow-x-auto rounded-full bg-panel p-1 text-[13px] ring-1 ring-white/5">
      {NAV.map((n) => (
        <NavLink key={n.to} to={link(n.to)}
          className={({ isActive }) => `whitespace-nowrap rounded-full px-3.5 py-1.5 transition-colors ${
            isActive ? 'bg-ink text-bg' : 'text-ink/75 hover:bg-white/10 hover:text-ink'}`}>
          {n.label}
        </NavLink>
      ))}
    </nav>
  )
}

function UserChip() {
  const { user, logout } = useAuth()
  if (!user) return null
  return (
    <div className="flex items-center gap-2 rounded-full bg-panel py-1 pl-3 pr-1 text-[13px] ring-1 ring-white/5">
      <span className="hidden text-ink sm:inline">{user.name}</span>
      <span className="rounded-full bg-panel2 px-2 py-0.5 text-[11px] text-muted ring-1 ring-white/10">{ROLE_LABEL[user.role]}</span>
      <button onClick={logout} title="Sign out" aria-label="Sign out" className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-white/10 hover:text-ink">
        <LogOut className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function Controls() {
  const { base, scenario, setBase, setScenario } = useConsoleParams()
  const meta = useMeta()
  const scenarios = useScenarios()
  const plan = usePlan(scenario)
  const replan = useReplan()
  const { can } = useAuth()
  const solver = plan.data?.optimized.solver
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 text-xs">
      <select value={base ?? ''} onChange={(e) => setBase(e.target.value || null)} disabled={!meta.data}
        className="!rounded-full text-[13px]" aria-label="Base filter">
        <option value="">All bases</option>
        {meta.data?.bases.map((b) => <option key={b.id} value={b.id}>{b.id} · {b.name}</option>)}
      </select>
      <select value={scenario ?? 'baseline'} onChange={(e) => setScenario(e.target.value)} disabled={!scenarios.data}
        className="max-w-[210px] !rounded-full text-[13px]" aria-label="Active scenario">
        {(scenarios.data?.scenarios ?? [{ id: 'baseline', name: 'Baseline scenario' }]).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <div className="text-right leading-tight text-muted">
        <div>Last run <span className="num text-ink">{plan.data ? dateTime(plan.data.computed_at) : 'Not available'}</span></div>
        <div>
          Solver{' '}
          <span className={solver?.status === 'OPTIMAL' ? 'text-ok' : solver ? 'text-warn' : 'text-dim'}>
            {solver ? (solver.status === 'OPTIMAL' ? 'optimal' : solver.status === 'FEASIBLE' ? 'feasible (timed out)' : solver.status.toLowerCase()) : 'not available'}
          </span>
          {solver && <span className="num text-dim"> · {solver.wall_time_s} s</span>}
        </div>
      </div>
      <Button onClick={() => replan.mutate(scenario)} busy={replan.isPending} icon={<RotateCw className="h-3.5 w-3.5" />}
        disabled={!can('plan')} title={can('plan') ? 'Run the optimiser again for the active scenario' : 'Planner role required'}>Re-plan</Button>
      {replan.isError && <span className="max-w-[180px] text-bad" role="alert">Re-plan failed: {(replan.error as Error).message}</span>}
      {meta.data && <SimulatedLabel origin={meta.data.data_origin} />}
    </div>
  )
}

export default function Shell() {
  const health = useHealth()
  const meta = useMeta()
  const { pathname } = useLocation()
  const { link } = useConsoleParams()
  const head = HEADS.find(([re]) => re.test(pathname))?.[1]
  const [title, sub] = head ? head(meta.data?.horizon_days ?? null) : ['Console.', '']

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1480px] items-center gap-6 px-6 lg:px-8">
          <Wordmark />
          <div className="flex min-w-0 flex-1 justify-center"><PillNav link={link} /></div>
          <UserChip />
        </div>
      </header>

      {health.isError && (
        <div className="mx-auto w-full max-w-[1480px] px-6 lg:px-8" role="alert">
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-bad/15 px-4 py-2.5 text-sm ring-1 ring-bad/40">
            <TriangleAlert className="h-4 w-4 text-bad" aria-hidden />
            <span className="text-ink">{unreachableMessage()}</span>
            <span className="text-muted">Start it with: cd backend, then .venv/Scripts/python -m uvicorn aeroready.api.main:app --port 8000</span>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1480px] flex-1 px-6 pb-12 lg:px-8">
        <div className="mb-7 mt-7 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <h1 className="max-w-3xl text-[32px] font-medium leading-[1.15] tracking-[-0.02em]">
            <span className="text-ink">{title}</span><br /><span className="text-muted">{sub}</span>
          </h1>
          <Controls />
        </div>
        <Outlet />
      </main>

      <footer className="mx-auto flex w-full max-w-[1480px] flex-wrap items-center justify-between gap-2 px-6 py-5 text-xs text-dim lg:px-8">
        <span>* Simulated fleet scenario. Engine sensor data from NASA C-MAPSS.</span>
        <span>Decision support prototype for SIH 2026 problem statement 26249. Not for operational use.</span>
      </footer>
      <Toaster />
    </div>
  )
}
