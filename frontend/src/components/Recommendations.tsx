import { ChevronDown, ChevronRight } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { RecType, Recommendation } from '../lib/api'
import { useAuth } from '../lib/auth'
import { signed } from '../lib/format'
import { useConsoleParams } from '../lib/params'
import { useDecideRec } from '../lib/queries'
import { toast } from './Toaster'
import { Badge, Button, EmptyState, FormField, Modal, StatusChip } from './ui'

/** Filter groups shown to users; each maps to one or more optimiser recommendation types. */
export const REC_GROUPS: { id: string; label: string; types: RecType[]; tone: 'predictive' | 'scheduled' | 'neutral' | 'cannibal' }[] = [
  { id: 'pull', label: 'Pull forward', types: ['predictive', 'level'], tone: 'predictive' },
  { id: 'bundle', label: 'Bundle', types: ['bundle'], tone: 'scheduled' },
  { id: 'defer', label: 'Defer', types: ['defer'], tone: 'neutral' },
  { id: 'cannibalize', label: 'Cannibalise', types: ['cannibalize'], tone: 'cannibal' },
  { id: 'order', label: 'Order part', types: ['order'], tone: 'neutral' },
]
export const groupOf = (t: RecType) => REC_GROUPS.find((g) => g.types.includes(t))!

function RejectModal({ r, planId, onClose }: { r: Recommendation; planId: string; onClose: () => void }) {
  const decide = useDecideRec()
  const [reason, setReason] = useState('')
  return (
    <Modal title="Reject recommendation" onClose={onClose}>
      <p className="text-[13px] text-ink">{r.title}</p>
      {r.effects.reject && <p className="mt-3 border-l-2 border-line2 pl-3 text-[13px] text-muted">{r.effects.reject} The optimizer re-runs the draft.</p>}
      <div className="mt-4">
        <FormField label="Reason (required)" error={decide.isError ? (decide.error as Error).message : null}>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </FormField>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="danger" disabled={!reason.trim()} busy={decide.isPending}
          onClick={() => decide.mutate({ plan: planId, key: r.key, action: 'reject', reason }, {
            onSuccess: () => { toast(`Rejected: ${r.title}. Draft re-optimised.`); onClose() },
          })}>
          Reject
        </Button>
      </div>
    </Modal>
  )
}

/**
 * Recommendations table. `planId` + editable turns on the planner actions
 * (accept, modify, reject) and row selection for bulk accept.
 */
export function RecommendationTable({ recs, showAircraft = true, empty, planId, editable = false, selected, onSelect }: {
  recs: Recommendation[]; showAircraft?: boolean; empty?: string; planId?: string; editable?: boolean
  selected?: Set<string>; onSelect?: (key: string, on: boolean) => void
}) {
  const { link } = useConsoleParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const decide = useDecideRec()
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [rejecting, setRejecting] = useState<Recommendation | null>(null)
  if (!recs.length) return <EmptyState title={empty ?? 'No recommendations'} />
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const canAct = (r: Recommendation) => editable && !!planId && user?.role === 'planner' && user.base_id === r.base_id
  const cols = 6 + (showAircraft ? 1 : 0) + (onSelect ? 1 : 0) + (editable ? 1 : 0)
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="h-9 border-b border-line text-left">
            {onSelect && <th className="w-10 pl-3"><span className="sr-only">Select</span></th>}
            <th className="w-8" />
            <th className="label-caps px-3 font-normal">Status</th>
            <th className="label-caps px-3 font-normal">Action</th>
            {showAircraft && <th className="label-caps px-3 font-normal">Aircraft</th>}
            <th className="label-caps px-3 text-right font-normal">Day</th>
            <th className="label-caps px-3 font-normal">Recommendation</th>
            <th className="label-caps px-3 text-right font-normal" title="Mission-ready days for this aircraft, plan minus reactive baseline">Aircraft-days</th>
            {editable && <th className="label-caps px-3 text-right font-normal">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {recs.map((r) => {
            const g = groupOf(r.type)
            const isOpen = open.has(r.key)
            const act = canAct(r)
            return (
              <Fragment key={r.key}>
                <tr className={`h-10 border-b border-line hover:bg-panel2/40 ${r.current === false ? 'text-muted' : ''}`}>
                  {onSelect && (
                    <td className="pl-3">
                      <input type="checkbox" aria-label={`Select ${r.title}`} disabled={!act || r.status !== 'Proposed'}
                        checked={selected?.has(r.key) ?? false} onChange={(e) => onSelect(r.key, e.target.checked)} />
                    </td>
                  )}
                  <td className="pl-2">
                    <button onClick={() => toggle(r.key)} aria-expanded={isOpen} aria-label={isOpen ? 'Hide reason' : 'Show reason'}
                      className="grid h-6 w-6 place-items-center rounded text-muted hover:bg-panel2 hover:text-ink">
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                  <td className="px-3"><StatusChip status={r.status} /></td>
                  <td className="px-3"><Badge tone={g.tone}>{g.label}</Badge></td>
                  {showAircraft && <td className="px-3 whitespace-nowrap"><Link to={link(`/fleet/${r.aircraft_id}`)} className="text-ink hover:text-accent">{r.aircraft_id}</Link> <span className="text-xs text-dim">{r.base_id}</span></td>}
                  <td className="num px-3 text-right">{r.day ?? '—'}</td>
                  <td className="px-3">{r.title}</td>
                  <td className={`num px-3 text-right ${r.aircraft_delta > 0 ? 'text-ink' : 'text-dim'}`}>{signed(r.aircraft_delta)}</td>
                  {editable && (
                    <td className="px-3 text-right">
                      {act && r.status === 'Proposed' && r.current !== false ? (
                        <span className="flex justify-end gap-1.5">
                          <Button size="sm" variant="primary" busy={decide.isPending && decide.variables?.key === r.key}
                            onClick={() => decide.mutate({ plan: planId!, key: r.key, action: 'accept' }, { onSuccess: () => toast(`Accepted: ${r.title}`) })}>Accept</Button>
                          {r.type !== 'order' && <Button size="sm" onClick={() => navigate(`/planner?task=${encodeURIComponent(r.job_id)}`)}>Modify</Button>}
                          <Button size="sm" variant="danger" onClick={() => setRejecting(r)}>Reject</Button>
                        </span>
                      ) : r.decision ? (
                        <span className="text-xs text-muted" title={r.decision.reason ?? undefined}>{r.decision.by}</span>
                      ) : !act && editable ? <span className="text-xs text-dim">Base {r.base_id} planner</span> : null}
                    </td>
                  )}
                </tr>
                {isOpen && (
                  <tr className="border-b border-line bg-panel2/30">
                    <td colSpan={cols} className="px-12 py-2 text-xs text-muted">
                      {r.reason}
                      {r.decision?.reason && <span className="mt-1 block text-ink">{r.decision.status} by {r.decision.by}: {r.decision.reason}</span>}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
      {rejecting && planId && <RejectModal r={rejecting} planId={planId} onClose={() => setRejecting(null)} />}
    </div>
  )
}
