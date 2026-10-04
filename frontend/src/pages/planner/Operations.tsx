import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from '../../components/Toaster'
import { Badge, Button, EmptyState, FormField, Modal, Panel, QueryView, Select, SidePanel, SortTable, StatusChip } from '../../components/ui'
import type { Defect, DefectStatus, WorkOrder, WorkOrderStatus } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { dateTime, dayDate } from '../../lib/format'
import { useConsoleParams } from '../../lib/params'
import { useDefectAction, useDefects, useMeta, useReassign, useTechnicians, useUsers, useWorkOrders } from '../../lib/queries'

const DEFECT_STATUSES: DefectStatus[] = ['Reported', 'Under review', 'Planned', 'Closed']
const WO_STATUSES: WorkOrderStatus[] = ['Released', 'In progress', 'Paused', 'Completed', 'Cannot complete']

// ------------------------------------------------------------- defects --
export function PlannerDefects() {
  const q = useDefects()
  const { base } = useConsoleParams()
  const { user } = useAuth()
  const act = useDefectAction()
  const navigate = useNavigate()
  const [status, setStatus] = useState('')
  const [open, setOpen] = useState<Defect | null>(null)
  const [closing, setClosing] = useState<Defect | null>(null)
  const [reason, setReason] = useState('')

  return (
    <>
      <Panel flush title="Defects" actions={<>
        <Select label="Status" value={status} onChange={setStatus} placeholder="All statuses" options={DEFECT_STATUSES.map((s) => ({ value: s, label: s }))} />
      </>}>
        <QueryView q={q}>
          {(d) => {
            const rows = d.defects.filter((x) => (!base || x.base_id === base) && (!status || x.status === status))
            return (
              <SortTable rows={rows} rowKey={(x) => x.id} onRowClick={setOpen} selected={(x) => x.id === open?.id}
                highlight={(x) => x.status === 'Reported'} empty={<EmptyState title="No defects match these filters" />}
                columns={[
                  { key: 'id', label: 'Defect', value: (x) => x.id },
                  { key: 'ac', label: 'Aircraft', value: (x) => x.aircraft_id },
                  { key: 'b', label: 'Base', value: (x) => x.base_id },
                  { key: 'sys', label: 'System', value: (x) => x.system },
                  { key: 'sv', label: 'Serviceable', value: (x) => (x.serviceable ? 1 : 0), render: (x) => x.serviceable ? 'Yes' : <Badge tone="bad">Grounded</Badge> },
                  { key: 'by', label: 'Reported by', value: (x) => x.reported_by },
                  { key: 'at', label: 'Reported', value: (x) => x.reported_at, render: (x) => <span className="num">{dateTime(x.reported_at)}</span> },
                  { key: 's', label: 'Status', value: (x) => x.status, render: (x) => <StatusChip status={x.status} /> },
                ]} />
            )
          }}
        </QueryView>
      </Panel>

      {open && (() => {
        const x = d(q.data?.defects, open.id) ?? open
        const mine = user?.role === 'planner' && user.base_id === x.base_id
        return (
          <SidePanel title={<span className="flex items-center gap-2">{x.id} <StatusChip status={x.status} /></span>} onClose={() => setOpen(null)}>
            <dl className="space-y-2 text-[13px]">
              <Row k="Aircraft" v={`${x.aircraft_id}, base ${x.base_id}`} />
              <Row k="System" v={x.system} />
              <Row k="Description" v={x.description} />
              <Row k="Suspected parts" v={x.suspected_parts.length ? x.suspected_parts.join(', ') : 'None given'} />
              <Row k="Serviceable" v={x.serviceable ? 'Yes' : 'No, aircraft grounded'} />
              <Row k="Reported" v={`${x.reported_by}, ${dateTime(x.reported_at)}`} />
              {x.closed_reason && <Row k="Closed because" v={x.closed_reason} />}
            </dl>
            {act.isError && <p className="mt-3 text-[13px] text-bad">{(act.error as Error).message}</p>}
            {!mine && x.status !== 'Closed' && <p className="mt-3 text-[13px] text-muted">Only the planner for base {x.base_id} can act on this defect.</p>}
            {mine && x.status !== 'Closed' && (
              <div className="mt-4 flex flex-wrap gap-2">
                {x.status === 'Reported' && <Button busy={act.isPending} onClick={() => act.mutate({ id: x.id, action: 'review' }, { onSuccess: () => toast(`${x.id} under review.`) })}>Mark under review</Button>}
                {x.status !== 'Planned' && <Button variant="primary" busy={act.isPending} onClick={() => act.mutate({ id: x.id, action: 'convert' }, {
                  onSuccess: (r) => { toast(r.day != null ? `${x.id} planned on day ${r.day}.` : `${x.id} added to the draft; no feasible day in the horizon.`); navigate(`/planner?task=${r.job_id ?? x.job_id}`) },
                })}>Convert to planned task</Button>}
                <Button variant="danger" onClick={() => { setReason(''); setClosing(x) }}>Close defect</Button>
              </div>
            )}
            <h4 className="display mt-6 text-[15px] font-semibold">History</h4>
            <ol className="mt-2 space-y-1.5 text-[13px]">
              {x.history.map((h, i) => <li key={i} className="flex flex-wrap gap-x-2"><StatusChip status={h.status} /><span className="text-muted">{dateTime(h.at)}</span>{h.by}{h.comment && <span className="basis-full text-muted">{h.comment}</span>}</li>)}
            </ol>
          </SidePanel>
        )
      })()}

      {closing && (
        <Modal title={`Close ${closing.id}`} onClose={() => setClosing(null)}>
          <FormField label="Reason (required)" error={act.isError ? (act.error as Error).message : null}>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </FormField>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setClosing(null)}>Cancel</Button>
            <Button variant="danger" disabled={!reason.trim()} busy={act.isPending}
              onClick={() => act.mutate({ id: closing.id, action: 'close', reason }, { onSuccess: () => { toast(`${closing.id} closed.`); setClosing(null) } })}>Close defect</Button>
          </div>
        </Modal>
      )}
    </>
  )
}

function d(list: Defect[] | undefined, id: string) { return list?.find((x) => x.id === id) }
function Row({ k, v }: { k: string; v: string }) {
  return <div className="grid grid-cols-[120px_1fr] gap-2 border-b border-line pb-2"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>
}

// --------------------------------------------------------- work orders --
export function PlannerWorkOrders() {
  const { base } = useConsoleParams()
  const [status, setStatus] = useState('')
  const q = useWorkOrders({ status: status || null, base })
  const meta = useMeta()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState<WorkOrder | null>(null)
  const start = meta.data?.start_date
  const users = useUsers()
  const nameOf = (u: string) => users.data?.users.find((x) => x.username === u)?.name ?? u

  return (
    <>
      <Panel flush title="Work orders" actions={<>
        <Select label="Status" value={status} onChange={setStatus} placeholder="All statuses" options={WO_STATUSES.map((s) => ({ value: s, label: s }))} />
      </>}>
        <QueryView q={q}>
          {(r) => (
            <SortTable rows={r.work_orders} rowKey={(w) => w.id} onRowClick={setOpen} selected={(w) => w.id === open?.id}
              highlight={(w) => w.status === 'Cannot complete'} initialSort={{ key: 'due', dir: 'asc' }}
              empty={<EmptyState title="No work orders" detail="Work orders are released when the commander approves a plan." />}
              columns={[
                { key: 'id', label: 'Work order', value: (w) => w.id },
                { key: 'ac', label: 'Aircraft', value: (w) => w.aircraft_id },
                { key: 't', label: 'Task', value: (w) => w.task },
                { key: 'tech', label: 'Technician', value: (w) => nameOf(w.technician) },
                { key: 'due', label: 'Planned start', value: (w) => w.planned_day, render: (w) => start ? `Day ${w.planned_day}, ${dayDate(start, w.planned_day)}` : `Day ${w.planned_day}` },
                { key: 'est', label: 'Est. hours', value: (w) => w.est_hours, align: 'right' },
                { key: 'act', label: 'Actual hours', value: (w) => w.completion?.actual_hours ?? null, align: 'right', render: (w) => w.completion?.actual_hours ?? '—' },
                { key: 's', label: 'Status', value: (w) => w.status, render: (w) => <StatusChip status={w.status} /> },
              ]} />
          )}
        </QueryView>
      </Panel>
      {open && <WorkOrderPanel wo={q.data?.work_orders.find((w) => w.id === open.id) ?? open} canEdit={user?.role === 'planner' && user.base_id === open.base_id}
        onClose={() => setOpen(null)} onReplan={(job) => navigate(`/planner?task=${job}`)} />}
    </>
  )
}

function WorkOrderPanel({ wo, canEdit, onClose, onReplan }: { wo: WorkOrder; canEdit: boolean; onClose: () => void; onReplan: (job: string) => void }) {
  const techs = useTechnicians(wo.base_id)
  const reassign = useReassign()
  const [tech, setTech] = useState(wo.technician)
  const open = !['Completed', 'Cannot complete'].includes(wo.status)
  return (
    <SidePanel title={<span className="flex items-center gap-2">{wo.id} <StatusChip status={wo.status} /></span>} onClose={onClose}>
      <dl className="space-y-2 text-[13px]">
        <Row k="Aircraft" v={`${wo.aircraft_id}, base ${wo.base_id}${wo.bay != null ? `, bay ${wo.bay}` : ''}`} />
        <Row k="Task" v={wo.task} />
        <Row k="Reason" v={wo.reason} />
        <Row k="Technician" v={techs.data?.technicians.find((t) => t.username === wo.technician)?.name ?? wo.technician} />
        <Row k="Parts" v={wo.parts.length ? wo.parts.map((p) => `${p.part_id} x${p.qty}`).join(', ') : 'None'} />
        {wo.completion && <Row k="Completion" v={`${wo.completion.actual_hours} h. ${wo.completion.findings || 'No findings recorded.'}`} />}
        {wo.cannot_reason && <Row k="Cannot complete" v={wo.cannot_reason} />}
      </dl>
      {canEdit && open && (
        <div className="mt-4 flex items-end gap-2">
          <FormField label="Reassign to">
            <Select label="Technician" value={tech} onChange={setTech} options={(techs.data?.technicians ?? []).map((t) => ({ value: t.username, label: t.name }))} />
          </FormField>
          <Button disabled={tech === wo.technician} busy={reassign.isPending}
            onClick={() => reassign.mutate({ id: wo.id, technician: tech }, { onSuccess: () => toast(`${wo.id} reassigned.`) })}>Reassign</Button>
        </div>
      )}
      {reassign.isError && <p className="mt-2 text-[13px] text-bad">{(reassign.error as Error).message}</p>}
      {canEdit && wo.status === 'Cannot complete' && (
        <div className="mt-4"><Button variant="primary" onClick={() => onReplan(wo.job_id)}>Re-plan in workspace</Button></div>
      )}
      <h4 className="display mt-6 text-[15px] font-semibold">History</h4>
      <ol className="mt-2 space-y-1.5 text-[13px]">
        {wo.history.map((h, i) => <li key={i} className="flex flex-wrap gap-x-2"><StatusChip status={h.status} /><span className="text-muted">{dateTime(h.at)}</span>{h.by}{h.comment && <span className="basis-full text-muted">{h.comment}</span>}</li>)}
      </ol>
    </SidePanel>
  )
}
