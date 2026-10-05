import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AvailabilityChart, { SERIES_COLORS } from '../../components/AvailabilityChart'
import { toast } from '../../components/Toaster'
import { Button, EmptyState, FormField, Modal, Panel, QueryView, Skeleton, SortTable, StatusChip } from '../../components/ui'
import type { PlanSummary } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { dateTime, signed } from '../../lib/format'
import { useApprovePlan, usePlanReview, usePlans, useReturnPlan } from '../../lib/queries'

export function ApprovalsList() {
  const q = usePlans()
  const navigate = useNavigate()
  return (
    <Panel title="Plans" flush>
      <QueryView q={q}>
        {(d) => (
          <SortTable rows={d.plans} rowKey={(p) => p.id} initialSort={{ key: 'v', dir: 'desc' }} onRowClick={(p) => navigate(`/commander/approvals/${p.id}`)}
            highlight={(p) => p.status === 'Submitted'} empty={<EmptyState title="No plans yet" detail="Plans appear here when a planner creates a draft." />}
            columns={[
              { key: 'v', label: 'Version', value: (p: PlanSummary) => p.version, render: (p) => <span className="display text-[15px] font-medium">v{p.version}</span> },
              { key: 's', label: 'Status', value: (p) => p.status, render: (p) => <span className="flex items-center gap-1.5"><StatusChip status={p.status} />{p.active && <span className="text-xs text-ok">Active</span>}{p.superseded_by != null && <span className="text-xs text-dim">Superseded by v{p.superseded_by}</span>}</span> },
              { key: 'by', label: 'Submitted by', value: (p) => p.submitted_by, render: (p) => p.submitted_by ?? <span className="text-dim">Not submitted</span> },
              { key: 'at', label: 'Submitted at', value: (p) => p.submitted_at, render: (p) => p.submitted_at ? <span className="num">{dateTime(p.submitted_at)}</span> : '—' },
              { key: 'days', label: 'Aircraft-days', value: (p) => p.aircraft_days ?? null, align: 'right' },
              { key: 'vs', label: 'Against approved plan', value: (p) => (d.active_aircraft_days != null && p.aircraft_days != null ? p.aircraft_days - d.active_aircraft_days : null), align: 'right',
                render: (p) => d.active_aircraft_days == null || p.aircraft_days == null ? <span className="text-dim">No approved plan</span>
                  : p.id === d.active_id ? <span className="text-dim">Current</span> : signed(p.aircraft_days - d.active_aircraft_days) },
              { key: 'dec', label: 'Decided', value: (p) => p.decided_at, render: (p) => p.decided_by ? <span className="text-xs text-muted">{p.decided_by}, {dateTime(p.decided_at)}</span> : '—' },
            ]} />
        )}
      </QueryView>
    </Panel>
  )
}

export function PlanReview() {
  const { id = '' } = useParams()
  const q = usePlanReview(id)
  const { user } = useAuth()
  const approve = useApprovePlan()
  const ret = useReturnPlan()
  const [dialog, setDialog] = useState<'approve' | 'return' | null>(null)
  const [comment, setComment] = useState('')

  return (
    <QueryView q={q} skeleton={<div className="space-y-4"><Skeleton h={60} /><Skeleton h={300} /><Skeleton h={300} /></div>}>
      {(r) => {
        const p = r.plan
        const canDecide = user?.role === 'commander' && p.status === 'Submitted'
        const after = r.risks.filter((x) => x.kind === 'after_p10')
        const fails = r.risks.filter((x) => x.kind === 'failure')
        return (
          <div className="space-y-4">
            <Link to="/commander/approvals" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink"><ArrowLeft className="h-3 w-3" />Approvals</Link>
            <Panel title={<span className="flex items-center gap-2">Plan v{p.version} <StatusChip status={p.status} /></span>} actions={canDecide && (
              <>
                <Button variant="danger" onClick={() => { setComment(''); setDialog('return') }}>Return to planner</Button>
                <Button variant="primary" onClick={() => { setComment(''); setDialog('approve') }}>Approve plan</Button>
              </>)}>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-[13px] lg:grid-cols-4">
                <div><span className="text-muted">Created by </span>{p.created_by}</div>
                <div><span className="text-muted">Submitted </span>{p.submitted_by ? `${p.submitted_by}, ${dateTime(p.submitted_at)}` : 'Not submitted'}</div>
                <div><span className="text-muted">Compared with </span>{r.reference}</div>
                <div className="num"><span className="text-muted">Aircraft-days </span>{r.aircraft_days.plan} ({signed(r.aircraft_days.plan - r.aircraft_days.reference)})</div>
              </div>
              {p.comments.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-line pt-3 text-[13px]">
                  {p.comments.map((c, i) => <li key={i}><span className="text-muted">{c.by}, {dateTime(c.at)}: </span>{c.text}</li>)}
                </ul>
              )}
            </Panel>

            <Panel title="Mission-ready aircraft per day">
              <AvailabilityChart startDate={r.start_date} maxY={r.fleet_size} height={260} diff={{ a: 'plan', b: 'ref', label: 'Difference' }}
                series={[
                  { key: 'ref', label: r.reference, data: r.series.reference, color: SERIES_COLORS.reactive, dashed: true },
                  { key: 'plan', label: `Plan v${p.version}`, data: r.series.plan, color: SERIES_COLORS.optimized },
                ]} />
            </Panel>

            <Panel title={`Changes against ${r.reference.toLowerCase()} (${r.changes.length})`} flush>
              <SortTable rows={r.changes} rowKey={(c) => c.job_id} initialSort={{ key: 'ac', dir: 'asc' }} empty={<EmptyState title="No task changes" />}
                columns={[
                  { key: 'chg', label: 'Change', value: (c) => c.change, render: (c) => <span className={c.change === 'removed' ? 'text-bad' : c.change === 'added' ? 'text-ok' : ''}>{c.change[0].toUpperCase() + c.change.slice(1)}</span> },
                  { key: 'ac', label: 'Aircraft', value: (c) => c.aircraft_id },
                  { key: 'task', label: 'Task', value: (c) => c.task },
                  { key: 'from', label: 'From day', value: (c) => c.from_day, align: 'right' },
                  { key: 'to', label: 'To day', value: (c) => c.to_day, align: 'right' },
                  { key: 'cmt', label: 'Planner comment', value: (c) => c.comment, render: (c) => c.comment ? <span className="text-xs">{c.comment}</span> : <span className="text-dim">None</span> },
                ]} />
            </Panel>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Panel title={`Cannibalisations (${r.cannibalizations.length})`} flush>
                <SortTable sortable={false} rows={r.cannibalizations} rowKey={(c) => c.job_id} empty={<EmptyState title="None" />}
                  columns={[
                    { key: 'd', label: 'Donor', value: (c) => c.donor },
                    { key: 'r', label: 'Receiver', value: (c) => c.aircraft_id },
                    { key: 'p', label: 'Part', value: (c) => `${c.part_id} ${c.part_name}` },
                    { key: 'day', label: 'Day', value: (c) => c.day, align: 'right' },
                  ]} />
              </Panel>
              <Panel title={`Deferrals (${r.deferrals.length})`} flush>
                <SortTable sortable={false} rows={r.deferrals} rowKey={(x) => x.key} empty={<EmptyState title="None" />}
                  columns={[
                    { key: 't', label: 'Deferral', value: (x) => x.title },
                    { key: 's', label: 'Status', value: (x) => x.status, render: (x) => <StatusChip status={x.status} /> },
                    { key: 'c', label: 'Planner comment', value: (x) => x.decision?.reason ?? null, render: (x) => x.decision?.reason ?? <span className="text-dim">None</span> },
                  ]} />
              </Panel>
            </div>

            <Panel title={`Risks accepted (${r.risks.length})`} flush>
              <SortTable rows={[...after, ...fails]} rowKey={(x) => x.engine_id + x.kind} sortable={false} empty={<EmptyState title="No engine work after its P10 forecast and no engine left to fail" />}
                columns={[
                  { key: 'a', label: 'Aircraft', value: (x) => x.aircraft_id },
                  { key: 'e', label: 'Engine', value: (x) => x.engine_id },
                  { key: 't', label: 'Task', value: (x) => x.task },
                  { key: 's', label: 'Day', value: (x) => x.start, align: 'right' },
                  { key: 'p', label: 'P10, day', value: (x) => x.p10_days, align: 'right' },
                  { key: 'm', label: 'Margin past P10, days', value: (x) => x.margin_days, align: 'right',
                    render: (x) => x.kind === 'failure' ? <span className="text-bad">Engine fails</span> : <span className="text-warn">{x.margin_days}</span> },
                ]} />
            </Panel>

            {dialog && (
              <Modal title={dialog === 'approve' ? `Approve plan v${p.version}` : `Return plan v${p.version} to planner`} onClose={() => setDialog(null)}>
                <p className="text-[13px] text-muted">{dialog === 'approve'
                  ? 'The plan becomes active and supersedes the current approved plan. Tasks starting in the release window become work orders.'
                  : 'The planner can edit the plan and resubmit it.'}</p>
                <div className="mt-3"><FormField label={dialog === 'approve' ? 'Comment (optional)' : 'Comment (required)'}
                  error={(dialog === 'approve' ? approve : ret).isError ? ((dialog === 'approve' ? approve : ret).error as Error).message : null}>
                  <input type="text" value={comment} onChange={(e) => setComment(e.target.value)} autoFocus />
                </FormField></div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
                  {dialog === 'approve'
                    ? <Button variant="primary" busy={approve.isPending} onClick={() => approve.mutate({ plan: p.id, comment }, {
                        onSuccess: (x) => { setDialog(null); toast(`Plan v${p.version} approved. ${x.work_orders_released} work orders released.`) } })}>Approve plan</Button>
                    : <Button variant="danger" disabled={!comment.trim()} busy={ret.isPending} onClick={() => ret.mutate({ plan: p.id, comment }, {
                        onSuccess: () => { setDialog(null); toast(`Plan v${p.version} returned to the planner.`) } })}>Return to planner</Button>}
                </div>
              </Modal>
            )}
          </div>
        )
      }}
    </QueryView>
  )
}
