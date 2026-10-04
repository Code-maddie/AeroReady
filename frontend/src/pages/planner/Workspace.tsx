import { Lock, Play, Send, Unlock } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AvailabilityChart, { SERIES_COLORS } from '../../components/AvailabilityChart'
import CapacityHeatmap from '../../components/CapacityHeatmap'
import Gantt, { GanttLegend, type GanttLine } from '../../components/Gantt'
import { toast } from '../../components/Toaster'
import {
  Badge, Button, EmptyState, FormField, KeyValue, Modal, Panel, QueryView, Segmented, SidePanel, Skeleton, StatusChip,
} from '../../components/ui'
import type { Job, PlanResult } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { dateTime, dayDate, signed } from '../../lib/format'
import { useConsoleParams } from '../../lib/params'
import {
  useCapacity, useCheckMove, useCreateWorking, useLockTask, useMoveTask, useOptimize, usePlan, usePlansStatus, useRemoveTask, useSubmitPlan,
} from '../../lib/queries'

const KIND_LABEL: Record<string, string> = { scheduled: 'Scheduled inspection', preventive: 'Predictive maintenance', corrective: 'Unplanned failure repair' }

function TaskPanel({ plan, jobId, editable, onClose }: { plan: PlanResult; jobId: string; editable: boolean; onClose: () => void }) {
  const { user } = useAuth()
  const job: Job | undefined = plan.jobs.find((j) => j.id === jobId)
  const start = plan.optimized.starts[jobId]?.[0] ?? null
  const donor = plan.optimized.starts[jobId]?.[1] ?? null
  const locked = !!plan.plan?.locks[jobId]
  const [day, setDay] = useState<number>(start ?? job?.earliest ?? 0)
  const [comment, setComment] = useState('')
  const [removing, setRemoving] = useState(false)
  const [reason, setReason] = useState('')
  const check = useCheckMove()
  const move = useMoveTask()
  const lock = useLockTask()
  const remove = useRemoveTask()
  useEffect(() => { setDay(start ?? job?.earliest ?? 0); check.reset() }, [jobId]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!job || !plan.plan) return <SidePanel title="Task" onClose={onClose}><EmptyState title="This task is not in the plan" /></SidePanel>
  const pid = plan.plan.id
  const canEdit = editable && user?.role === 'planner' && user.base_id === job.base_id
  const recs = plan.recommendations.filter((r) => r.job_id === jobId && r.current !== false)
  const fc = job.engine_id ? plan.forecasts_days[job.engine_id] : undefined
  const violations = move.isError ? ((move.error as Error & { violations?: string[] }).violations ?? null) : null

  const rows: [string, React.ReactNode][] = [
    ['Aircraft', `${job.aircraft_id} · base ${job.base_id}`],
    ['Type', job.defect_id ? `Defect rectification (${job.defect_id})` : KIND_LABEL[job.kind]],
    ['Planned start', start != null ? <span className="num">Day {start} · {dayDate(plan.start_date, start)}</span> : 'Not scheduled'],
    ['Duration', `${job.duration} day${job.duration === 1 ? "" : "s"}, ${job.tech_hours_per_day} technician hours per day`],
    ['Parts', job.parts.length ? `${job.parts.join(', ')}${donor ? ` (cannibalised from ${donor})` : ''}` : 'None'],
    ['Allowed start', `Day ${job.earliest} to day ${job.latest}`],
  ]
  if (job.due != null && !job.defect_id) rows.push(['Due', `Day ${job.due}${job.hard_limit !== job.due ? `, authorised deferral to day ${job.hard_limit}` : ''}`])
  if (fc) rows.push(['Engine RUL', <span className="num">P10 {fc.p10_days} d, P50 {fc.p50_days} d, P90 {fc.p90_days} d</span>])
  if (job.failure_day != null) rows.push(['Forecast failure', `Day ${job.failure_day} (P50)`])
  if (plan.plan.removed[jobId]) rows.push(['Removed', plan.plan.removed[jobId]])
  if (plan.plan.change_notes[jobId]) rows.push(['Planner note', plan.plan.change_notes[jobId]])

  return (
    <SidePanel title={<span className="flex items-center gap-2">{job.name}{locked && <Badge><Lock className="h-3 w-3" />Locked</Badge>}</span>} onClose={onClose}>
      <KeyValue rows={rows} />
      {recs.length > 0 && (
        <div className="mt-4">
          <div className="label-caps mb-1">Reason in the plan</div>
          {recs.map((r) => <p key={r.key} className="mb-1 text-[13px] text-muted">{r.reason}</p>)}
        </div>
      )}
      {canEdit ? (
        <div className="mt-5 space-y-4 border-t border-line pt-4">
          <div className="flex items-end gap-2">
            <FormField label="Move to day">
              <input type="number" min={job.earliest} max={job.latest} value={day} className="num w-24"
                onChange={(e) => { setDay(Number(e.target.value)); check.reset(); move.reset() }} />
            </FormField>
            <Button onClick={() => check.mutate({ plan: pid, job: jobId, day })} busy={check.isPending}>Check constraints</Button>
          </div>
          {check.data && (check.data.ok
            ? <p className="text-[13px] text-ok">Day {day} is within bay, technician-hour and parts limits.</p>
            : <ul className="space-y-1 text-[13px] text-bad">{check.data.violations.map((v) => <li key={v}>{v}</li>)}</ul>)}
          {violations && <ul className="space-y-1 text-[13px] text-bad">{violations.map((v) => <li key={v}>{v}</li>)}</ul>}
          <FormField label="Comment for the commander (optional)">
            <input type="text" value={comment} onChange={(e) => setComment(e.target.value)} />
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" busy={move.isPending} disabled={day === start}
              onClick={() => move.mutate({ plan: pid, job: jobId, day, comment }, { onSuccess: () => toast(`Moved ${job.name} on ${job.aircraft_id} to day ${day} and locked it.`) })}>
              Move to day {day}
            </Button>
            <Button busy={lock.isPending} disabled={start == null && !locked} icon={locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              onClick={() => lock.mutate({ plan: pid, job: jobId, locked: !locked })}>{locked ? 'Unlock' : 'Lock'}</Button>
            <Button variant="danger" onClick={() => setRemoving(true)} disabled={start == null}>Remove</Button>
          </div>
          {(lock.isError || remove.isError) && <p className="text-[13px] text-bad">{((lock.error ?? remove.error) as Error).message}</p>}
        </div>
      ) : (
        <p className="mt-4 text-xs text-dim">{!editable ? 'The plan is not editable in its current status.' : `Only the base ${job.base_id} planner can change this task.`}</p>
      )}
      {removing && (
        <Modal title="Remove task from the plan" onClose={() => setRemoving(false)}>
          <p className="text-[13px] text-muted">{job.name} on {job.aircraft_id} will not be scheduled inside the horizon.</p>
          <div className="mt-3"><FormField label="Reason (required)"><input type="text" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></FormField></div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRemoving(false)}>Cancel</Button>
            <Button variant="danger" disabled={!reason.trim()} busy={remove.isPending}
              onClick={() => remove.mutate({ plan: pid, job: jobId, reason }, { onSuccess: () => { setRemoving(false); toast(`Removed ${job.name} on ${job.aircraft_id}.`) } })}>Remove task</Button>
          </div>
        </Modal>
      )}
    </SidePanel>
  )
}

export default function Workspace() {
  const status = usePlansStatus()
  const create = useCreateWorking()
  const optimize = useOptimize()
  const submit = useSubmitPlan()
  const { base } = useConsoleParams()
  const [params, setParams] = useSearchParams()
  const [submitting, setSubmitting] = useState(false)
  const [comment, setComment] = useState('')
  const [capSide, setCapSide] = useState<'optimized' | 'reactive'>('optimized')
  const working = status.data?.working
  const activeId = status.data?.active?.id
  const plan = usePlan(working?.id)
  const approved = usePlan(activeId && activeId !== working?.id ? activeId : null)
  const cap = useCapacity(working?.id)
  const taskId = params.get('task')
  const setTask = (id: string | null) => { const n = new URLSearchParams(params); if (id) n.set('task', id); else n.delete('task'); setParams(n, { replace: true }) }
  const locked = useMemo(() => new Set(Object.keys(plan.data?.plan?.locks ?? {})), [plan.data])
  const jobs = useMemo(() => Object.fromEntries((plan.data?.jobs ?? []).map((j) => [j.id, j])) as Record<string, Job>, [plan.data])

  if (status.isPending) return <Skeleton h={400} />
  if (!working) {
    return (
      <Panel title="No draft plan">
        <p className="mb-3 text-[13px] text-muted">{status.data?.label}.</p>
        <Button variant="primary" icon={<Play className="h-3.5 w-3.5" />} busy={create.isPending} onClick={() => create.mutate(undefined)}>Run optimizer</Button>
        {create.isError && <p className="mt-2 text-[13px] text-bad">{(create.error as Error).message}</p>}
      </Panel>
    )
  }
  const editable = working.status === 'Draft' || working.status === 'Returned'
  const lastReturn = [...working.comments].reverse().find((c) => c.kind === 'return')

  return (
    <QueryView q={plan} skeleton={<div className="space-y-4"><Skeleton h={64} /><Skeleton h={300} /><Skeleton h={500} /></div>}>
      {(p) => {
        const keep = (r: { base_id: string }) => !base || r.base_id === base
        const lines: GanttLine[] = p.optimized.gantt.filter(keep).map((r) => ({ key: r.aircraft_id, aircraftId: r.aircraft_id, baseId: r.base_id, side: 'optimized', row: r }))
        const ref = approved.data
        const refLabel = ref ? `Approved plan v${status.data?.active?.version}` : 'Reactive baseline'
        const refSeries = ref ? ref.optimized.available_per_day : p.baseline.available_per_day
        const refDays = ref ? ref.optimized.aircraft_days : p.baseline.aircraft_days
        const ignored = working.solver.locks_ignored ?? []
        return (
          <div className="space-y-4">
            <Panel title={<span className="flex items-center gap-2">Draft v{working.version} <StatusChip status={working.status} /></span>}
              actions={<>
                <Button icon={<Play className="h-3.5 w-3.5" />} disabled={!editable} busy={optimize.isPending}
                  onClick={() => optimize.mutate(working.id, { onSuccess: () => toast('Optimizer re-run. Locked tasks kept.') })}>Run optimizer</Button>
                <Button variant="primary" icon={<Send className="h-3.5 w-3.5" />} disabled={!editable} onClick={() => setSubmitting(true)}>Submit for approval</Button>
              </>}>
              <div className="grid grid-cols-2 gap-x-8 text-[13px] lg:grid-cols-4">
                <div><span className="text-muted">Based on </span>{working.based_on ? `approved plan v${working.based_on}` : 'no approved plan'}</div>
                <div><span className="text-muted">Optimizer run </span><span className="num">{dateTime(working.optimized_at)}</span></div>
                <div><span className="text-muted">Solver </span><span className={working.solver.status === 'OPTIMAL' ? 'text-ok' : 'text-warn'}>{working.solver.status?.toLowerCase() ?? 'not available'}</span>
                  {working.solver.wall_time_s != null && <span className="num text-dim"> · {working.solver.wall_time_s} s</span>}</div>
                <div><span className="text-muted">Locked tasks </span><span className="num">{locked.size}</span></div>
              </div>
              {working.status === 'Submitted' && <p className="mt-3 text-[13px] text-warn">Submitted by {working.submitted_by}, {dateTime(working.submitted_at)}. Awaiting the commander's decision.</p>}
              {working.status === 'Returned' && lastReturn && (
                <p className="mt-3 border-l-2 border-bad pl-3 text-[13px]"><span className="text-bad">Returned by {lastReturn.by}: </span>{lastReturn.text}</p>
              )}
              {ignored.length > 0 && <p className="mt-3 text-[13px] text-warn">{ignored.length} locked tasks could not be kept together within capacity; the optimizer placed them freely.</p>}
              {(optimize.isError || submit.isError) && <p className="mt-2 text-[13px] text-bad">{((optimize.error ?? submit.error) as Error).message}</p>}
            </Panel>

            <Panel title="Mission-ready aircraft per day" actions={
              <span className="num text-[13px] text-muted">Draft {p.optimized.aircraft_days} aircraft-days · {refLabel} {refDays} ({signed(p.optimized.aircraft_days - refDays)})</span>}>
              <AvailabilityChart startDate={p.start_date} maxY={p.fleet_size} height={220} animate diff={{ a: 'draft', b: 'ref', label: 'Difference' }}
                series={[
                  { key: 'ref', label: refLabel, data: refSeries, color: SERIES_COLORS.reactive, dashed: true },
                  { key: 'draft', label: `Draft v${working.version}`, data: p.optimized.available_per_day, color: SERIES_COLORS.optimized },
                ]} />
            </Panel>

            <Panel title={`Schedule, day 0 to day ${p.horizon_days - 1}`}>
              <div className="mb-3"><GanttLegend /></div>
              {lines.length ? <Gantt lines={lines} horizon={p.horizon_days} startDate={p.start_date} jobs={jobs} locked={locked} selectedJob={taskId}
                onSelect={(s) => s.block.job_id && setTask(s.block.job_id)} /> : <EmptyState title="No aircraft at this base" />}
              <p className="mt-2 text-xs text-muted">{p.optimized.violations.length === 0 ? 'All bay, technician and parts constraints met.' : `${p.optimized.violations.length} constraint violations.`}</p>
            </Panel>

            <Panel title="Hangar bay and technician-hour utilisation" actions={
              <Segmented label="Plan" value={capSide} onChange={setCapSide} options={[{ value: 'optimized', label: 'Draft' }, { value: 'reactive', label: 'Reactive' }]} />}>
              <QueryView q={cap}>{(c) => <CapacityHeatmap cap={c} side={capSide} start={p.start_date} base={base} />}</QueryView>
            </Panel>

            {taskId && <TaskPanel plan={p} jobId={taskId} editable={editable} onClose={() => setTask(null)} />}
            {submitting && (
              <Modal title={`Submit draft v${working.version} for approval`} onClose={() => setSubmitting(false)}>
                <p className="text-[13px] text-muted">{p.optimized.aircraft_days} aircraft-days against {refDays} for the {refLabel.toLowerCase()}. The draft cannot be changed while it is under review.</p>
                <div className="mt-3"><FormField label="Comment (optional)"><input type="text" value={comment} onChange={(e) => setComment(e.target.value)} /></FormField></div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setSubmitting(false)}>Cancel</Button>
                  <Button variant="primary" busy={submit.isPending}
                    onClick={() => submit.mutate({ plan: working.id, comment }, { onSuccess: () => { setSubmitting(false); toast(`Draft v${working.version} submitted for approval.`) } })}>Submit for approval</Button>
                </div>
              </Modal>
            )}
          </div>
        )
      }}
    </QueryView>
  )
}
