import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from '../../components/Toaster'
import { Badge, Button, EmptyState, FormField, KeyValue, Modal, Panel, QueryView, Select, SkeletonBlock, SortTable, StatusBadge, StatusChip, Tabs } from '../../components/ui'
import type { HistoryEntry, WorkOrder } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { dateTime, dayDate } from '../../lib/format'
import { useMeta, useReportDefect, useTechAircraft, useWoAction, useWorkOrder, useWorkOrders } from '../../lib/queries'

const TYPE_LABEL: Record<WorkOrder['task_type'], string> = {
  scheduled: 'Scheduled', preventive: 'Predictive', corrective: 'Corrective', defect: 'Defect rectification',
}
const OPEN = new Set(['Released', 'In progress', 'Paused'])

function dayText(start: string | undefined, day: number) {
  return start ? `Day ${day}, ${dayDate(start, day)}` : `Day ${day}`
}

function Back({ to, label }: { to: string; label: string }) {
  return <Link to={to} className="inline-flex h-11 items-center gap-1.5 text-[15px] text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />{label}</Link>
}

// ---------------------------------------------------------------- home --
type Tab = 'today' | 'upcoming' | 'completed'

export function TechnicianHome() {
  const q = useWorkOrders()
  const meta = useMeta()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('today')
  const start = meta.data?.start_date
  const days = meta.data?.work_order_release_days

  return (
    <QueryView q={q} skeleton={<SkeletonBlock lines={6} h={44} />}>
      {(d) => {
        const all = d.work_orders
        const today = all.filter((w) => OPEN.has(w.status) && (w.planned_day <= 0 || w.status !== 'Released'))
        const upcoming = all.filter((w) => w.status === 'Released' && w.planned_day > 0)
        const done = all.filter((w) => !OPEN.has(w.status))
        const rows = tab === 'today' ? today : tab === 'upcoming' ? upcoming : done
        return (
          <Panel flush>
            <div className="px-5 pb-2 pt-4"><Tabs large value={tab} onChange={setTab} tabs={[
              { value: 'today', label: `Today (${today.length})` },
              { value: 'upcoming', label: `Upcoming${days ? `, next ${days} days` : ''} (${upcoming.length})` },
              { value: 'completed', label: `Completed (${done.length})` },
            ]} /></div>
            <SortTable large rows={rows} rowKey={(w) => w.id} sortable={false} onRowClick={(w) => navigate(`/technician/work-orders/${w.id}`)}
              empty={<EmptyState title={tab === 'today' ? 'No work orders for today' : tab === 'upcoming' ? 'No upcoming work orders' : 'No completed work orders'}
                detail={tab === 'completed' ? undefined : 'Work orders appear when the commander approves a plan.'} />}
              columns={[
                { key: 'tail', label: 'Aircraft', value: (w) => w.aircraft_id, render: (w) => <span className="display text-[17px] font-medium">{w.aircraft_id}</span> },
                { key: 'task', label: 'Task', value: (w) => w.task, render: (w) => <span>{w.task}<span className="block text-xs text-muted">{TYPE_LABEL[w.task_type]}</span></span> },
                { key: 'bay', label: 'Base, bay', value: (w) => w.bay, render: (w) => `${w.base_id}, ${w.bay != null ? `bay ${w.bay}` : 'bay not assigned'}` },
                { key: 'day', label: 'Planned start', value: (w) => w.planned_day, render: (w) => dayText(start, w.planned_day) },
                { key: 'h', label: 'Est. hours', value: (w) => w.est_hours, align: 'right' },
                { key: 'parts', label: 'Parts to draw', value: (w) => w.parts.length,
                  render: (w) => w.parts.length ? w.parts.map((p) => `${p.part_id} x${p.qty}`).join(', ') : <span className="text-dim">None</span> },
                { key: 's', label: 'Status', value: (w) => w.status, render: (w) => <StatusChip status={w.status} /> },
              ]} />
          </Panel>
        )
      }}
    </QueryView>
  )
}

// -------------------------------------------------------------- detail --
function History({ items }: { items: HistoryEntry[] }) {
  return (
    <ol className="space-y-2 text-[14px]">
      {items.map((h, i) => (
        <li key={i} className="flex flex-wrap items-baseline gap-x-3 border-b border-line pb-2 last:border-0">
          <StatusChip status={h.status} />
          <span className="num text-muted">{dateTime(h.at)}</span>
          <span>{h.by}</span>
          {h.comment && <span className="basis-full text-muted">{h.comment}</span>}
        </li>
      ))}
    </ol>
  )
}

export function WorkOrderDetail() {
  const { id = '' } = useParams()
  const q = useWorkOrder(id)
  const meta = useMeta()
  const act = useWoAction()
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<'complete' | 'cannot' | null>(null)
  const [hours, setHours] = useState('')
  const [findings, setFindings] = useState('')
  const [followUp, setFollowUp] = useState(false)
  const [used, setUsed] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')

  return (
    <QueryView q={q} skeleton={<SkeletonBlock lines={8} h={36} />}>
      {(w) => {
        const run = (action: 'start' | 'pause', msg: string) => act.mutate({ id: w.id, action }, { onSuccess: () => toast(msg) })
        const hoursOk = Number(hours) > 0
        return (
          <div className="max-w-4xl space-y-4 text-[15px]">
            <Back to="/technician" label="My work orders" />
            <Panel title={<span className="flex items-center gap-3">{w.id} <StatusChip status={w.status} /></span>}>
              <KeyValue rows={[
                ['Aircraft', <Link to={`/technician/aircraft/${w.aircraft_id}`} className="text-ink underline decoration-line2 underline-offset-4 hover:text-accent">{w.aircraft_id}</Link>],
                ['Task', `${w.task} (${TYPE_LABEL[w.task_type]})`],
                ['Base, bay', `${w.base_id}, ${w.bay != null ? `bay ${w.bay}` : 'bay not assigned'}`],
                ['Planned start', `${dayText(meta.data?.start_date, w.planned_day)}, ${w.duration_days} day${w.duration_days === 1 ? '' : 's'}`],
                ['Estimated hours', w.est_hours],
                ['Reason', w.reason],
                ['Reference', 'Procedure: as per applicable technical order'],
                ['Plan', `Approved plan v${w.plan_version}`],
              ]} />
              {act.isError && <p className="mt-3 text-bad">{(act.error as Error).message}</p>}
              <div className="mt-4 flex flex-wrap gap-3">
                {(w.status === 'Released' || w.status === 'Paused') &&
                  <Button size="lg" variant="primary" busy={act.isPending} onClick={() => run('start', `${w.id} started.`)}>{w.status === 'Paused' ? 'Resume' : 'Start'}</Button>}
                {w.status === 'In progress' && <>
                  <Button size="lg" busy={act.isPending} onClick={() => run('pause', `${w.id} paused.`)}>Pause</Button>
                  <Button size="lg" variant="primary" onClick={() => {
                    setHours(String(w.est_hours)); setFindings(''); setFollowUp(false)
                    setUsed(Object.fromEntries(w.parts.map((p) => [p.part_id, String(p.qty)]))); setDialog('complete')
                  }}>Mark complete</Button>
                </>}
                {OPEN.has(w.status) && <Button size="lg" variant="danger" onClick={() => { setReason(''); setDialog('cannot') }}>Cannot complete</Button>}
              </div>
            </Panel>

            <Panel title="Parts" flush>
              <SortTable large sortable={false} rows={w.parts} rowKey={(p) => p.part_id} empty={<EmptyState title="No parts required" />}
                columns={[
                  { key: 'p', label: 'Part', value: (p) => p.part_id, render: (p) => <span>{p.part_id}<span className="block text-xs text-muted">{p.name}</span></span> },
                  { key: 'q', label: 'Qty', value: (p) => p.qty, align: 'right' },
                  { key: 'src', label: 'Source', value: (p) => p.source },
                  { key: 'a', label: 'Availability', value: (p) => p.available_day,
                    render: (p) => p.available_day == null ? <Badge tone="bad">Not available in the horizon</Badge>
                      : p.available_day <= w.planned_day ? <Badge tone="ok">Available</Badge>
                      : <Badge tone="warn">From day {p.available_day}</Badge> },
                ]} />
            </Panel>

            {w.completion && (
              <Panel title="Completion">
                <KeyValue rows={[
                  ['Actual hours', w.completion.actual_hours],
                  ['Parts used', w.completion.parts_used.length ? w.completion.parts_used.map((p) => `${p.part_id} x${p.qty}`).join(', ') : 'None'],
                  ['Findings', w.completion.findings || 'None recorded'],
                  ['Follow-up defect', w.completion.follow_up_defect ? 'Yes' : 'No'],
                  ['Completed', dateTime(w.completion.completed_at)],
                ]} />
              </Panel>
            )}
            {w.cannot_reason && <Panel title="Cannot complete"><p>{w.cannot_reason}</p></Panel>}

            <Panel title="Status history"><History items={w.history} /></Panel>

            {dialog === 'complete' && (
              <Modal title={`Complete ${w.id}`} onClose={() => setDialog(null)}>
                <div className="space-y-3">
                  <FormField label="Actual hours" error={hours && !hoursOk ? 'Enter a number above 0' : null}>
                    <input type="number" inputMode="decimal" min={0} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} className="!h-11" />
                  </FormField>
                  {w.parts.map((p) => (
                    <FormField key={p.part_id} label={`${p.part_id} ${p.name}, quantity used`}>
                      <input type="number" min={0} value={used[p.part_id] ?? ''} onChange={(e) => setUsed((u) => ({ ...u, [p.part_id]: e.target.value }))} className="!h-11" />
                    </FormField>
                  ))}
                  <FormField label="Findings">
                    <textarea rows={3} value={findings} onChange={(e) => setFindings(e.target.value)} />
                  </FormField>
                  <label className="flex min-h-11 items-center gap-3 text-[15px]">
                    <input type="checkbox" className="h-5 w-5" checked={followUp} onChange={(e) => setFollowUp(e.target.checked)} />
                    Follow-up defect found; report it next
                  </label>
                  {act.isError && <p className="text-bad">{(act.error as Error).message}</p>}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button size="lg" variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
                  <Button size="lg" variant="primary" disabled={!hoursOk} busy={act.isPending} onClick={() => act.mutate({
                    id: w.id, action: 'complete', body: {
                      actual_hours: Number(hours), findings, follow_up_defect: followUp,
                      parts_used: Object.entries(used).filter(([, v]) => Number(v) > 0).map(([part_id, v]) => ({ part_id, qty: Number(v) })),
                    },
                  }, {
                    onSuccess: () => {
                      setDialog(null); toast(`${w.id} completed.`)
                      if (followUp) navigate(`/technician/defects/new?aircraft=${w.aircraft_id}`)
                    },
                  })}>Mark complete</Button>
                </div>
              </Modal>
            )}
            {dialog === 'cannot' && (
              <Modal title={`Cannot complete ${w.id}`} onClose={() => setDialog(null)}>
                <FormField label="Reason (required)" error={act.isError ? (act.error as Error).message : null}>
                  <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
                </FormField>
                <div className="mt-4 flex justify-end gap-2">
                  <Button size="lg" variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
                  <Button size="lg" variant="danger" disabled={!reason.trim()} busy={act.isPending}
                    onClick={() => act.mutate({ id: w.id, action: 'cannot-complete', body: { reason } }, { onSuccess: () => { setDialog(null); toast(`${w.id} marked cannot complete. The planner has been notified.`) } })}>
                    Send to planner
                  </Button>
                </div>
              </Modal>
            )}
          </div>
        )
      }}
    </QueryView>
  )
}

// ------------------------------------------------------------- defects --
export function ReportDefect() {
  const { user } = useAuth()
  const meta = useMeta()
  const report = useReportDefect()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [aircraft, setAircraft] = useState(params.get('aircraft') ?? '')
  const [system, setSystem] = useState('')
  const [description, setDescription] = useState('')
  const [parts, setParts] = useState<string[]>([])
  const [serviceable, setServiceable] = useState<'' | 'yes' | 'no'>('')

  return (
    <QueryView q={meta} skeleton={<SkeletonBlock lines={6} h={44} />}>
      {(m) => {
        const tails = m.aircraft.filter((a) => a.base_id === user?.base_id)
        const ok = aircraft && system && description.trim() && serviceable
        return (
          <Panel title={`Defect details, base ${user?.base_id ?? ''}`} className="max-w-2xl">
            <form className="space-y-4 text-[15px]" onSubmit={(e) => {
              e.preventDefault()
              if (!ok) return
              report.mutate({ aircraft_id: aircraft, system, description, suspected_parts: parts, serviceable: serviceable === 'yes' }, {
                onSuccess: (d) => { toast(`${d.id} reported. The planner has been notified.`); navigate('/technician') },
              })
            }}>
              <FormField label="Aircraft">
                <Select large label="Aircraft" value={aircraft} onChange={setAircraft} placeholder="Select aircraft" options={tails.map((a) => ({ value: a.id, label: a.id }))} />
              </FormField>
              <FormField label="System">
                <Select large label="System" value={system} onChange={setSystem} placeholder="Select system" options={m.defect_systems.map((s) => ({ value: s, label: s }))} />
              </FormField>
              <FormField label="Description">
                <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} className="!text-[15px]" />
              </FormField>
              <fieldset>
                <legend className="mb-1 text-xs text-muted">Suspected parts (optional)</legend>
                <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                  {m.parts.map((p) => (
                    <label key={p.id} className="flex min-h-11 items-center gap-3">
                      <input type="checkbox" className="h-5 w-5" checked={parts.includes(p.id)}
                        onChange={(e) => setParts((s) => e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id))} />
                      <span>{p.id} <span className="text-muted">{p.name}</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-1 text-xs text-muted">Aircraft serviceable</legend>
                <div className="flex gap-3">
                  {(['yes', 'no'] as const).map((v) => (
                    <label key={v} className={`flex h-11 min-w-28 cursor-pointer items-center justify-center rounded-full border px-5 ${serviceable === v ? 'border-accent text-ink' : 'border-line2 text-muted'}`}>
                      <input type="radio" name="serviceable" className="sr-only" checked={serviceable === v} onChange={() => setServiceable(v)} />
                      {v === 'yes' ? 'Serviceable' : 'Not serviceable'}
                    </label>
                  ))}
                </div>
                {serviceable === 'no' && <p className="mt-2 text-warn">The aircraft will be grounded until the defect is rectified.</p>}
              </fieldset>
              {report.isError && <p className="text-bad">{(report.error as Error).message}</p>}
              <div className="flex gap-3">
                <Button size="lg" variant="primary" type="submit" disabled={!ok} busy={report.isPending}>Report defect</Button>
                <Button size="lg" variant="ghost" onClick={() => navigate('/technician')}>Cancel</Button>
              </div>
            </form>
          </Panel>
        )
      }}
    </QueryView>
  )
}

// ------------------------------------------------------------ aircraft --
export function TechnicianAircraft() {
  const { tail = '' } = useParams()
  const q = useTechAircraft(tail)
  const { user } = useAuth()
  const meta = useMeta()
  const navigate = useNavigate()
  return (
    <QueryView q={q} skeleton={<SkeletonBlock lines={8} h={36} />}>
      {(a) => (
        <div className="max-w-4xl space-y-4 text-[15px]">
          <Back to="/technician" label="My work orders" />
          <Panel title={<span className="flex items-center gap-3">{a.aircraft.id} <StatusBadge status={a.status} /></span>}>
            <KeyValue rows={[
              ['Type', a.aircraft.type],
              ['Base', a.aircraft.base_id],
              ['Status', a.status_reason],
            ]} />
          </Panel>
          <Panel title="Engine remaining useful life" flush>
            <SortTable large sortable={false} rows={a.engines} rowKey={(e) => e.engine_id} empty={<EmptyState title="No engine forecast" />}
              columns={[
                { key: 'e', label: 'Engine', value: (e) => e.engine_id },
                { key: 'band', label: 'Forecast band, days (P10 to P90)', value: (e) => e.p10_days, render: (e) => `${e.p10_days} to ${e.p90_days}` },
                { key: 'p50', label: 'Median, days', value: (e) => e.p50_days, align: 'right' },
              ]} />
          </Panel>
          <Panel title={`Open work orders (${a.open_work_orders.length})`} flush>
            <SortTable large sortable={false} rows={a.open_work_orders} rowKey={(w) => w.id} onRowClick={(w) => navigate(`/technician/work-orders/${w.id}`)}
              empty={<EmptyState title="No open work orders" />}
              columns={[
                { key: 'id', label: 'Work order', value: (w) => w.id },
                { key: 't', label: 'Task', value: (w) => w.task },
                { key: 'd', label: 'Planned start', value: (w) => w.planned_day, render: (w) => dayText(meta.data?.start_date, w.planned_day) },
                { key: 'tech', label: 'Technician', value: (w) => w.technician, render: (w) => w.technician === user?.username ? 'You' : w.technician },
                { key: 's', label: 'Status', value: (w) => w.status, render: (w) => <StatusChip status={w.status} /> },
              ]} />
          </Panel>
          <Panel title="Recent completed work" flush>
            <SortTable large sortable={false} rows={a.completed_work} rowKey={(w) => w.id} empty={<EmptyState title="No completed work recorded" />}
              columns={[
                { key: 'id', label: 'Work order', value: (w) => w.id },
                { key: 't', label: 'Task', value: (w) => w.task },
                { key: 'c', label: 'Completed', value: (w) => w.completion?.completed_at ?? null, render: (w) => w.completion ? dateTime(w.completion.completed_at) : w.status },
                { key: 'h', label: 'Actual hours', value: (w) => w.completion?.actual_hours ?? null, align: 'right' },
              ]} />
          </Panel>
          {a.open_defects.length > 0 && (
            <Panel title={`Open defects (${a.open_defects.length})`} flush>
              <SortTable large sortable={false} rows={a.open_defects} rowKey={(d) => d.id}
                columns={[
                  { key: 'id', label: 'Defect', value: (d) => d.id },
                  { key: 'sys', label: 'System', value: (d) => d.system },
                  { key: 'desc', label: 'Description', value: (d) => d.description },
                  { key: 's', label: 'Status', value: (d) => d.status, render: (d) => <StatusChip status={d.status} /> },
                ]} />
            </Panel>
          )}
        </div>
      )}
    </QueryView>
  )
}
