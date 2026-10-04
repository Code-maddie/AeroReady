import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { RecType, Recommendation } from '../lib/api'
import { useAuth } from '../lib/auth'
import { dateTime, signed } from '../lib/format'
import { useConsoleParams } from '../lib/params'
import { useDecide } from '../lib/queries'
import { toast } from './Toaster'

/** Filter groups shown to users; each maps to one or more optimiser recommendation types. */
export const REC_GROUPS: { id: string; label: string; types: RecType[]; cls: string }[] = [
  { id: 'pull', label: 'Pull forward', types: ['predictive', 'level'], cls: 'text-k-predictive border-k-predictive/50' },
  { id: 'bundle', label: 'Bundle', types: ['bundle'], cls: 'text-k-scheduled border-k-scheduled/50' },
  { id: 'defer', label: 'Defer', types: ['defer'], cls: 'text-muted border-line2' },
  { id: 'cannibalize', label: 'Cannibalise', types: ['cannibalize'], cls: 'text-k-cannibal border-k-cannibal/50' },
  { id: 'order', label: 'Order part', types: ['order'], cls: 'text-accent border-accent/50' },
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
        const d = res.aircraft_days.after - res.aircraft_days.before
        toast(`${action === 'approve' ? 'Approved' : 'Rejected'}: ${r.title}. Plan re-run: ${res.aircraft_days.after} aircraft-days (${signed(d)}).`)
        onClose()
      },
    })
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={`${action} recommendation`}>
      <div className="w-full max-w-md rounded-2xl bg-panel p-5 shadow-2xl ring-1 ring-white/10">
        <h3 className="text-[17px] font-medium">{action === 'approve' ? 'Approve this recommendation?' : 'Reject this recommendation?'}</h3>
        <p className="mt-2 text-sm text-ink">{r.title}</p>
        <p className="mt-3 rounded-xl bg-panel2 px-3 py-2 text-[13px] text-muted ring-1 ring-white/5">{r.effects[action]} The fleet plan is re-run straight away.</p>
        <label className="mt-3 block text-[13px] text-muted">Note (optional)
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className="mt-1.5 w-full text-sm" placeholder="Reason for the decision" />
        </label>
        {decide.isError && <p className="mt-3 text-[13px] text-bad" role="alert">{(decide.error as Error).message}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full px-4 py-1.5 text-[13px] text-muted hover:text-ink">Cancel</button>
          <button onClick={go} disabled={decide.isPending}
            className={`rounded-full px-4 py-1.5 text-[13px] font-medium disabled:opacity-60 ${action === 'approve' ? 'bg-ink text-bg hover:bg-white' : 'bg-bad text-white hover:brightness-110'}`}>
            {decide.isPending ? 'Re-planning' : action === 'approve' ? 'Approve and re-plan' : 'Reject and re-plan'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function RecommendationCard({ r, compact = false }: { r: Recommendation; compact?: boolean }) {
  const { link } = useConsoleParams()
  const { can } = useAuth()
  const [pending, setPending] = useState<'approve' | 'reject' | null>(null)
  const g = groupOf(r.type)
  const d = r.decision
  return (
    <article className={`rounded-xl bg-panel2/60 p-3 ring-1 ${d?.action === 'approve' ? 'ring-ok/40' : 'ring-white/[0.04]'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`shrink-0 rounded-full border px-2 py-px text-[11px] font-medium ${g.cls}`}>{g.label}</span>
        <span className={`num shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${r.aircraft_delta > 0 ? 'bg-accent/15 text-accent' : 'bg-panel2 text-dim'}`}
          title="Mission-ready days for this aircraft: optimised plan minus reactive baseline">
          {signed(r.aircraft_delta)} aircraft-days for {r.aircraft_id}
        </span>
      </div>
      <h3 className="mt-1.5 text-[13px] font-medium leading-snug text-ink">{r.title}</h3>
      <p className={`mt-1.5 text-xs leading-relaxed text-muted ${compact ? 'line-clamp-2' : ''}`}>{r.reason}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-dim">
        <Link to={link(`/app/fleet/${r.aircraft_id}`)} className="hover:text-accent">{r.aircraft_id}</Link>
        <span>{r.base_id}</span>
        {r.day != null && <span className="num">Day {r.day}</span>}
        <span className="ml-auto flex items-center gap-1.5">
          {d ? (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${d.action === 'approve' ? 'bg-ok/15 text-ok' : 'bg-bad/15 text-bad'}`}
              title={`${d.by}, ${dateTime(d.at)}`}>
              {d.action === 'approve' ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              {d.action === 'approve' ? 'Approved' : 'Rejected'} by {d.by}
            </span>
          ) : can('decide') ? (
            <>
              <button onClick={() => setPending('approve')} className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-0.5 font-medium text-bg hover:bg-white">
                <Check className="h-3 w-3" />Approve
              </button>
              <button onClick={() => setPending('reject')} className="inline-flex items-center gap-1 rounded-full bg-panel2 px-2.5 py-0.5 text-ink ring-1 ring-white/10 hover:bg-line">
                <X className="h-3 w-3" />Reject
              </button>
            </>
          ) : <span title="Commander or planner role required">Awaiting decision</span>}
        </span>
      </div>
      {pending && <Confirm r={r} action={pending} onClose={() => setPending(null)} />}
    </article>
  )
}
