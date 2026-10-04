import {
  Activity, Bell, CalendarRange, ClipboardCheck, ClipboardList, Database, FileBarChart, Gauge, History, ListChecks, LogOut,
  Package, Plane, SlidersHorizontal, TriangleAlert, Wrench,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import Toaster from '../components/Toaster'
import { Badge, Button, EmptyState, SimulatedLabel } from '../components/ui'
import { unreachableMessage } from '../lib/api'
import { ROLE_LABEL, useAuth, type Role } from '../lib/auth'
import { dateTime } from '../lib/format'
import { useConsoleParams } from '../lib/params'
import { useHealth, useMarkRead, useMeta, useNotifications, usePlansStatus } from '../lib/queries'

type Item = { to: string; label: string; icon: typeof Plane; end?: boolean }
const NAV: Record<Role, Item[]> = {
  commander: [
    { to: '/commander', label: 'Readiness', icon: Gauge, end: true },
    { to: '/commander/approvals', label: 'Approvals', icon: ClipboardCheck },
    { to: '/commander/scenarios', label: 'Scenarios', icon: SlidersHorizontal },
    { to: '/commander/fleet', label: 'Fleet', icon: Plane },
    { to: '/commander/reports', label: 'Reports', icon: FileBarChart },
    { to: '/audit', label: 'Audit log', icon: History },
  ],
  planner: [
    { to: '/planner', label: 'Planning workspace', icon: CalendarRange, end: true },
    { to: '/planner/recommendations', label: 'Recommendations', icon: ListChecks },
    { to: '/planner/defects', label: 'Defects', icon: TriangleAlert },
    { to: '/planner/work-orders', label: 'Work orders', icon: ClipboardList },
    { to: '/planner/spares', label: 'Spares', icon: Package },
    { to: '/planner/scenarios', label: 'Scenarios', icon: SlidersHorizontal },
    { to: '/planner/fleet', label: 'Fleet', icon: Plane },
    { to: '/planner/data', label: 'Data sources', icon: Database },
    { to: '/planner/model', label: 'Model', icon: Activity },
    { to: '/audit', label: 'Audit log', icon: History },
  ],
  technician: [
    { to: '/technician', label: 'My work orders', icon: Wrench, end: true },
    { to: '/technician/defects/new', label: 'Report defect', icon: TriangleAlert },
  ],
}

const TITLES: [RegExp, string][] = [
  [/^\/commander\/approvals\/.+/, 'Plan review'],
  [/^\/commander\/approvals/, 'Approvals'],
  [/^\/commander\/reports/, 'Readiness report'],
  [/^\/commander\/?$/, 'Readiness'],
  [/^\/planner\/?$/, 'Planning workspace'],
  [/^\/planner\/recommendations/, 'Recommendations'],
  [/^\/planner\/defects/, 'Defects'],
  [/^\/planner\/work-orders/, 'Work orders'],
  [/^\/planner\/spares/, 'Spares'],
  [/^\/planner\/data/, 'Data sources'],
  [/^\/planner\/model/, 'Model performance'],
  [/^\/(commander|planner)\/scenarios/, 'Scenarios'],
  [/^\/(commander|planner)\/fleet\/.+/, 'Aircraft detail'],
  [/^\/(commander|planner)\/fleet/, 'Fleet status'],
  [/^\/technician\/work-orders\/.+/, 'Work order'],
  [/^\/technician\/defects\/new/, 'Report defect'],
  [/^\/technician\/aircraft\/.+/, 'Aircraft'],
  [/^\/technician\/?$/, 'My work orders'],
  [/^\/audit/, 'Audit log'],
]

function useOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void) {
  useEffect(() => {
    const on = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onOut() }
    document.addEventListener('mousedown', on)
    return () => document.removeEventListener('mousedown', on)
  }, [ref, onOut])
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
        className="relative grid h-8 w-8 place-items-center rounded text-muted hover:bg-panel2 hover:text-ink">
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="num absolute -right-1 -top-1 min-w-4 rounded-sm bg-accent px-1 text-center text-[10px] font-semibold leading-4 text-bg">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-[380px] rounded border border-line2 bg-panel shadow-2xl">
          <div className="flex h-10 items-center justify-between border-b border-line px-3">
            <span className="display text-[15px] font-semibold">Notifications</span>
            <Button size="sm" variant="ghost" disabled={!unread} busy={mark.isPending} onClick={() => mark.mutate(null)}>Mark all read</Button>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {q.isError && <p className="p-3 text-xs text-bad">{(q.error as Error).message}</p>}
            {q.data?.notifications.length === 0 && <EmptyState title="No notifications" />}
            {q.data?.notifications.map((n) => (
              <button key={n.id} onClick={() => { if (!n.read) mark.mutate(n.id); setOpen(false); navigate(n.link) }}
                className={`block w-full border-b border-line px-3 py-2 text-left hover:bg-panel2 ${n.read ? '' : 'bg-panel2/50'}`}>
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
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex h-8 items-center gap-2 rounded px-2 text-[13px] hover:bg-panel2">
        <span className="text-ink">{user.name}</span>
        <span className="text-xs text-muted">{ROLE_LABEL[user.role]}{user.base_id ? ` · ${user.base_id}` : ''}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-56 rounded border border-line2 bg-panel p-1 shadow-2xl">
          <div className="border-b border-line px-3 py-2 text-[13px]">
            <div className="text-ink">{user.name}</div>
            <div className="text-xs text-muted">{ROLE_LABEL[user.role]}{user.base_id ? `, base ${user.base_id}` : ', all bases'}</div>
            <div className="font-mono text-[11px] text-dim">{user.username}</div>
          </div>
          <button onClick={logout} className="flex h-9 w-full items-center gap-2 rounded px-3 text-[13px] text-ink hover:bg-panel2">
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
  const title = TITLES.find(([re]) => re.test(pathname))?.[1] ?? 'AeroReady'

  return (
    <div className="flex h-screen">
      <aside className="flex w-52 print:hidden shrink-0 flex-col border-r border-line bg-panel">
        <Link to={NAV[user.role][0].to} className="flex h-12 items-center border-b border-line px-4">
          <span className="display text-xl font-bold">AeroReady</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1 p-2" aria-label="Pages">
          {NAV[user.role].map((n) => (
            <NavLink key={n.to} to={n.to + (base && staff ? `?base=${base}` : '')} end={n.end}
              className={({ isActive }) => `flex items-center gap-3 rounded px-3 text-[13px] ${user.role === 'technician' ? 'h-11 text-[15px]' : 'h-9'} ${
                isActive ? 'bg-panel2 text-ink shadow-[inset_2px_0_0_var(--color-accent)]' : 'text-muted hover:bg-panel2/60 hover:text-ink'}`}>
              <n.icon className="h-4 w-4 shrink-0" aria-hidden />{n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line p-3 text-[11px] text-dim">
          {meta.data ? <SimulatedLabel origin={meta.data.data_origin} /> : null}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 print:hidden shrink-0 items-center gap-3 border-b border-line bg-panel px-6">
          <h1 className="display mr-auto truncate text-[20px] font-semibold">{title}</h1>
          {staff && (
            <select value={base ?? ''} onChange={(e) => setBase(e.target.value || null)} disabled={!meta.data} aria-label="Base filter">
              <option value="">All bases</option>
              {meta.data?.bases.map((b) => <option key={b.id} value={b.id}>{b.id} · {b.name}</option>)}
            </select>
          )}
          <PlanChip />
          <Notifications />
          <UserMenu />
        </header>
        {health.isError && (
          <div className="flex items-center gap-2 border-b border-bad/50 bg-bad/10 px-6 py-2 text-[13px]" role="alert">
            <TriangleAlert className="h-4 w-4 text-bad" aria-hidden />{unreachableMessage()}
          </div>
        )}
        <main className="min-h-0 flex-1 overflow-y-auto p-6 print:overflow-visible">
          <div className="mx-auto max-w-[1600px]"><Outlet /></div>
        </main>
      </div>
      <Toaster />
    </div>
  )
}
