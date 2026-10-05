import { Bell, LogOut, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import Toaster from '../components/Toaster'
import { Badge, Button, EmptyState, SimulatedLabel } from '../components/ui'
import { unreachableMessage } from '../lib/api'
import { ROLE_LABEL, useAuth, type Role } from '../lib/auth'
import { dateTime } from '../lib/format'
import { useConsoleParams } from '../lib/params'
import { useHealth, useMarkRead, useMeta, useNotifications, usePlansStatus } from '../lib/queries'

type Item = { to: string; label: string; end?: boolean }
const NAV: Record<Role, Item[]> = {
  commander: [
    { to: '/commander', label: 'Readiness', end: true },
    { to: '/commander/approvals', label: 'Approvals' },
    { to: '/commander/scenarios', label: 'Scenarios' },
    { to: '/commander/fleet', label: 'Fleet' },
    { to: '/commander/reports', label: 'Reports' },
    { to: '/audit', label: 'Audit log' },
  ],
  planner: [
    { to: '/planner', label: 'Workspace', end: true },
    { to: '/planner/recommendations', label: 'Recommendations' },
    { to: '/planner/defects', label: 'Defects' },
    { to: '/planner/work-orders', label: 'Work orders' },
    { to: '/planner/spares', label: 'Spares' },
    { to: '/planner/scenarios', label: 'Scenarios' },
    { to: '/planner/fleet', label: 'Fleet' },
    { to: '/planner/data', label: 'Data' },
    { to: '/planner/model', label: 'Model' },
    { to: '/audit', label: 'Audit log' },
  ],
  technician: [
    { to: '/technician', label: 'My work orders', end: true },
    { to: '/technician/defects/new', label: 'Report defect' },
  ],
}

/** Two-tone page heading: what the page shows, then the context in grey. */
const HEADS: [RegExp, string, string][] = [
  [/^\/commander\/approvals\/.+/, 'Plan review.', 'What changes if this plan is approved.'],
  [/^\/commander\/approvals/, 'Approvals.', 'Plans submitted by planners, newest first.'],
  [/^\/commander\/reports/, 'Readiness report.', 'Availability, risks, shortages and plan changes for a date range.'],
  [/^\/commander\/?$/, 'Fleet readiness.', 'Active plan against reactive maintenance.'],
  [/^\/planner\/?$/, 'Planning workspace.', 'Every job placed within bay, technician and parts limits.'],
  [/^\/planner\/recommendations/, 'Recommendations.', 'Accept, modify or reject each optimiser proposal.'],
  [/^\/planner\/defects/, 'Defects.', 'Reported by technicians, waiting to be planned or closed.'],
  [/^\/planner\/work-orders/, 'Work orders.', 'Released from the approved plan to technicians.'],
  [/^\/planner\/spares/, 'Spares and cannibalisation.', 'What the plan needs, what is short and who is waiting.'],
  [/^\/planner\/data/, 'Data sources.', 'What is real, what is simulated and how to replace it.'],
  [/^\/planner\/model/, 'Model performance and method.', 'Read from the saved evaluation of the training run.'],
  [/^\/(commander|planner)\/scenarios/, 'Scenarios.', 'Test a decision before making it.'],
  [/^\/(commander|planner)\/fleet\/.+/, 'Aircraft detail.', 'Engine health, planned work and history for one tail.'],
  [/^\/(commander|planner)\/fleet/, 'Fleet status.', 'Every aircraft, its engine life and its next task.'],
  [/^\/technician\/work-orders\/.+/, 'Work order.', 'Details, parts and status history.'],
  [/^\/technician\/defects\/new/, 'Report a defect.', 'The base planner and the commander are notified.'],
  [/^\/technician\/aircraft\/.+/, 'Aircraft.', 'Status, open work and engine life.'],
  [/^\/technician\/?$/, 'My work orders.', 'Work released to you from the approved plan.'],
  [/^\/audit/, 'Audit log.', 'Every action, who took it and when.'],
]

export function Wordmark({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="shrink-0 text-[19px] font-medium tracking-[-0.03em] text-ink" aria-label="AeroReady home">
      AeroReady<sup className="ml-px text-[12px] text-ink/70">*</sup>
    </Link>
  )
}

function useOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void) {
  useEffect(() => {
    const on = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onOut() }
    document.addEventListener('mousedown', on)
    return () => document.removeEventListener('mousedown', on)
  }, [ref, onOut])
}

function PillNav({ items, suffix, large }: { items: Item[]; suffix: string; large: boolean }) {
  return (
    <nav aria-label="Pages" className="flex items-center gap-0.5 overflow-x-auto rounded-full bg-panel p-1 text-[13px] ring-1 ring-white/5">
      {items.map((n) => (
        <NavLink key={n.to} to={n.to + suffix} end={n.end}
          className={({ isActive }) => `whitespace-nowrap rounded-full px-3.5 transition-colors ${large ? 'py-2.5 text-[15px]' : 'py-1.5'} ${
            isActive ? 'bg-ink text-bg' : 'text-ink/75 hover:bg-white/10 hover:text-ink'}`}>
          {n.label}
        </NavLink>
      ))}
    </nav>
  )
}

function Notifications() {
  const [open, setOpen] = useState(false)
  const q = useNotifications()
  const mark = useMarkRead()
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  useOutside(ref, () => setOpen(false))
  const unread = q.data?.unread ?? 0
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-label={`Notifications, ${unread} unread`} aria-expanded={open}
        className="relative grid h-10 w-10 place-items-center rounded-full bg-panel text-ink/80 ring-1 ring-white/5 hover:text-ink">
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="num absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-[18px] text-bg">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-[380px] overflow-hidden rounded-2xl bg-panel shadow-2xl ring-1 ring-white/10">
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <span className="text-[15px] font-medium">Notifications</span>
            <Button size="sm" variant="ghost" disabled={!unread} busy={mark.isPending} onClick={() => mark.mutate(null)}>Mark all read</Button>
          </div>
          <div className="max-h-[420px] overflow-y-auto pb-2">
            {q.isError && <p className="p-4 text-xs text-bad">{(q.error as Error).message}</p>}
            {q.data?.notifications.length === 0 && <EmptyState title="No notifications" />}
            {q.data?.notifications.map((n) => (
              <button key={n.id} onClick={() => { if (!n.read) mark.mutate(n.id); setOpen(false); navigate(n.link) }}
                className="block w-full px-4 py-2.5 text-left hover:bg-panel2">
                <div className="flex items-start gap-2">
                  {!n.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
                  <span className={`text-[13px] ${n.read ? 'text-muted' : 'text-ink'}`}>{n.text}</span>
                </div>
                <div className="num mt-0.5 pl-3.5 text-[11px] text-dim">{dateTime(n.at)}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function UserMenu() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useOutside(ref, () => setOpen(false))
  if (!user) return null
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex h-10 items-center gap-2 rounded-full bg-panel py-1 pl-4 pr-1.5 text-[13px] ring-1 ring-white/5 hover:bg-panel2">
        <span className="hidden text-ink sm:inline">{user.name}</span>
        <span className="rounded-full bg-panel2 px-2.5 py-1 text-[11px] text-muted ring-1 ring-white/10">
          {ROLE_LABEL[user.role]}{user.base_id ? ` · ${user.base_id}` : ''}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-60 rounded-2xl bg-panel p-1.5 shadow-2xl ring-1 ring-white/10">
          <div className="px-3 py-2.5 text-[13px]">
            <div className="text-ink">{user.name}</div>
            <div className="text-xs text-muted">{ROLE_LABEL[user.role]}{user.base_id ? `, base ${user.base_id}` : ', all bases'}</div>
            <div className="mt-0.5 text-[11px] text-dim">{user.username}</div>
          </div>
          <button onClick={logout} className="flex h-9 w-full items-center gap-2 rounded-full px-3 text-[13px] text-ink hover:bg-white/10">
            <LogOut className="h-4 w-4" />Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function PlanChip() {
  const q = usePlansStatus()
  if (!q.data) return null
  const w = q.data.working
  return (
    <div className="flex items-center gap-1.5">
      <Badge tone={q.data.active ? 'ok' : 'neutral'}>{q.data.label}</Badge>
      {w && <Badge tone={w.status === 'Submitted' ? 'warn' : w.status === 'Returned' ? 'bad' : 'neutral'}>{q.data.working_label}</Badge>}
    </div>
  )
}

export default function Shell() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const { base, setBase } = useConsoleParams()
  const health = useHealth()
  const meta = useMeta()
  if (!user) return null
  const staff = user.role !== 'technician'
  const head = HEADS.find(([re]) => re.test(pathname))
  const [title, sub] = head ? [head[1], head[2]] : ['AeroReady.', '']

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 bg-bg/90 backdrop-blur-md print:hidden">
        <div className="mx-auto flex h-16 max-w-[1480px] items-center gap-6 px-6 lg:px-8">
          <Wordmark to={NAV[user.role][0].to} />
          <div className="flex min-w-0 flex-1 justify-center">
            <PillNav items={NAV[user.role]} suffix={base && staff ? `?base=${base}` : ''} large={!staff} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Notifications />
            <UserMenu />
          </div>
        </div>
      </header>

      {health.isError && (
        <div className="mx-auto w-full max-w-[1480px] px-6 lg:px-8" role="alert">
          <div className="flex items-center gap-2 rounded-xl bg-bad/15 px-4 py-2.5 text-sm ring-1 ring-bad/40">
            <TriangleAlert className="h-4 w-4 text-bad" aria-hidden />{unreachableMessage()}
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1480px] flex-1 px-6 pb-12 lg:px-8">
        <div className="mb-7 mt-7 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 print:mt-0">
          <h1 className="max-w-3xl text-[32px] font-medium leading-[1.15] tracking-[-0.02em]">
            <span className="text-ink">{title}</span><br /><span className="text-muted">{sub}</span>
          </h1>
          <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
            {staff && (
              <select value={base ?? ''} onChange={(e) => setBase(e.target.value || null)} disabled={!meta.data}
                className="!rounded-full text-[13px]" aria-label="Base filter">
                <option value="">All bases</option>
                {meta.data?.bases.map((b) => <option key={b.id} value={b.id}>{b.id} · {b.name}</option>)}
              </select>
            )}
            <PlanChip />
            {meta.data && <SimulatedLabel origin={meta.data.data_origin} />}
          </div>
        </div>
        <Outlet />
      </main>

      <footer className="mx-auto flex w-full max-w-[1480px] flex-wrap items-center justify-between gap-2 px-6 py-5 text-xs text-dim lg:px-8 print:hidden">
        <span>* Simulated fleet scenario. Engine sensor data from NASA C-MAPSS.</span>
        <span>Decision support prototype for SIH 2026 problem statement 26249. Not for operational use.</span>
      </footer>
      <Toaster />
    </div>
  )
}
