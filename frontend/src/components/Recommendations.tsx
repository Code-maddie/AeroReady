import { Check, ChevronDown, ChevronRight, X } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import type { RecType, Recommendation } from '../lib/api'
import { useAuth } from '../lib/auth'
import { dateTime, signed } from '../lib/format'
import { useConsoleParams } from '../lib/params'
import { useDecide } from '../lib/queries'
import { toast } from './Toaster'
import { Badge, Button, EmptyState, Field, Modal } from './ui'

/** Filter groups shown to users; each maps to one or more optimiser recommendation types. */
export const REC_GROUPS: { id: string; label: string; types: RecType[]; tone: 'predictive' | 'scheduled' | 'neutral' | 'cannibal' | 'accent' }[] = [
  { id: 'pull', label: 'Pull forward', types: ['predictive', 'level'], tone: 'predictive' },
  { id: 'bundle', label: 'Bundle', types: ['bundle'], tone: 'scheduled' },
  { id: 'defer', label: 'Defer', types: ['defer'], tone: 'neutral' },
  { id: 'cannibalize', label: 'Cannibalise', types: ['cannibalize'], tone: 'cannibal' },
  { id: 'order', label: 'Order part', types: ['order'], tone: 'neutral' },
]
export const groupOf = (t: RecType) => REC_GROUPS.find((g) => g.types.includes(t))!

function Confirm({ r, action, onClose }: { r: Recommendation; action: 'approve' | 'reject'; onClose: () => void }) {
  const decide = useDecide()
  const { scenario } = useConsoleParams()
  const [note, setNote] = useState('')
  const go = () => decide.mutate(
    { job_id: r.job_id, type: r.type, action, part_id: r.part_id, note, scenario },
    {
      onSuccess: (res) => {
        toast(`${action === 'approve' ? 'Approved' : 'Rejected'}: ${r.title}. Plan re-run: ${res.aircraft_days.after} aircraft-days (${signed(res.aircraft_days.after - res.aircraft_days.before)}).`)
        onClose()
      },
    })
  return (
    <Modal title={action === 'approve' ? 'Approve recommendation' : 'Reject recommendation'} onClose={onClose}>
      <p className="text-[13px] text-ink">{r.title}</p>
      <p className="mt-3 border-l-2 border-line2 pl-3 text-[13px] text-muted">{r.effects[action]} The fleet plan is re-run.</p>
      <div className="mt-4"><Field label="Note (optional)">
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for the decision" />
      </Field></div>
      {decide.isError && <p className="mt-3 text-[13px] text-bad" role="alert">{(decide.error as Error).message}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant={action === 'approve' ? 'primary' : 'danger'} onClick={go} busy={decide.isPending}>
          {action === 'approve' ? 'Approve and re-plan' : 'Reject and re-plan'}
        </Button>
      </div>
    </Modal>
  )
}

function DecisionCell({ r }: { r: Recommendation }) {
  const { can } = useAuth()
  const [pending, setPending] = useState<'approve' | 'reject' | null>(null)
  const d = r.decision
  if (d) {
    return (
      <Badge tone={d.action === 'approve' ? 'ok' : 'bad'} title={`${d.by}, ${dateTime(d.at)}`}>
        {d.action === 'approve' ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
        {d.action === 'approve' ? 'Approved' : 'Rejected'} by {d.by}
      </Badge>
    )
  }
  if (!can('decide')) return <span className="text-xs text-dim" title="Commander or planner role required">Awaiting decision</span>
  return (
    <span className="flex justify-end gap-1.5">
      <Button size="sm" variant="primary" onClick={() => setPending('approve')} icon={<Check className="h-3 w-3" />}>Approve</Button>
      <Button size="sm" onClick={() => setPending('reject')} icon={<X className="h-3 w-3" />}>Reject</Button>
      {pending && <Confirm r={r} action={pending} onClose={() => setPending(null)} />}
    </span>
  )
}

/** Recommendations as a table; the reason opens in a detail row. */
export function RecommendationTable({ recs, showAircraft = true, empty }: { recs: Recommendation[]; showAircraft?: boolean; empty?: string }) {
  const { link } = useConsoleParams()
  const [open, setOpen] = useState<Set<string>>(new Set())
  if (!recs.length) return <EmptyState title={empty ?? 'No recommendations'} />
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const cols = showAircraft ? 7 : 6
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="h-9 border-b border-line text-left">
            <th className="w-8" />
            <th className="label-caps px-3 font-normal">Action</th>
            <th className="label-caps px-3 font-normal">Recommendation</th>
            {showAircraft && <th className="label-caps px-3 font-normal">Aircraft</th>}
            <th className="label-caps px-3 text-right font-normal">Day</th>
            <th className="label-caps px-3 text-right font-normal" title="Mission-ready days for this aircraft, optimised plan minus reactive baseline">Aircraft-days</th>
            <th className="label-caps px-3 text-right font-normal">Decision</th>
          </tr>
        </thead>
        <tbody>
          {recs.map((r) => {
            const g = groupOf(r.type)
            const isOpen = open.has(r.id)
            return (
              <Fragment key={r.id}>
                <tr className="h-10 border-b border-line hover:bg-panel2/40">
                  <td className="pl-2">
                    <button onClick={() => toggle(r.id)} aria-expanded={isOpen} aria-label={isOpen ? 'Hide reason' : 'Show reason'}
                      className="grid h-6 w-6 place-items-center rounded text-muted hover:bg-panel2 hover:text-ink">
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                  <td className="px-3"><Badge tone={g.tone}>{g.label}</Badge></td>
                  <td className="px-3 text-ink">{r.title}</td>
                  {showAircraft && <td className="px-3"><Link to={link(`/app/fleet/${r.aircraft_id}`)} className="text-ink hover:text-accent">{r.aircraft_id}</Link> <span className="text-xs text-dim">{r.base_id}</span></td>}
                  <td className="num px-3 text-right">{r.day ?? '—'}</td>
                  <td className={`num px-3 text-right ${r.aircraft_delta > 0 ? 'text-ink' : 'text-dim'}`}>{signed(r.aircraft_delta)}</td>
                  <td className="px-3 text-right"><DecisionCell r={r} /></td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-line bg-panel2/30">
                    <td />
                    <td colSpan={cols - 1} className="px-3 py-2 text-xs text-muted">{r.reason}</td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
