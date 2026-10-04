import { Link } from 'react-router-dom'
import type { RecType, Recommendation } from '../lib/api'
import { signed } from '../lib/format'
import { useConsoleParams } from '../lib/params'

/** Filter groups shown to users; each maps to one or more optimiser recommendation types. */
export const REC_GROUPS: { id: string; label: string; types: RecType[]; cls: string }[] = [
  { id: 'pull', label: 'Pull forward', types: ['predictive', 'level'], cls: 'text-k-predictive border-k-predictive/50' },
  { id: 'bundle', label: 'Bundle', types: ['bundle'], cls: 'text-k-scheduled border-k-scheduled/50' },
  { id: 'defer', label: 'Defer', types: ['defer'], cls: 'text-muted border-line2' },
  { id: 'cannibalize', label: 'Cannibalise', types: ['cannibalize'], cls: 'text-k-cannibal border-k-cannibal/50' },
  { id: 'order', label: 'Order part', types: ['order'], cls: 'text-accent border-accent/50' },
]
export const groupOf = (t: RecType) => REC_GROUPS.find((g) => g.types.includes(t))!

export function RecommendationCard({ r, compact = false }: { r: Recommendation; compact?: boolean }) {
  const { link } = useConsoleParams()
  const g = groupOf(r.type)
  return (
    <article className="rounded border border-line bg-panel2/40 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className={`shrink-0 rounded border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider ${g.cls}`}>{g.label}</span>
        <span className={`num shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${r.aircraft_delta > 0 ? 'bg-accent/15 text-accent' : 'bg-panel2 text-dim'}`}
          title="Mission-ready days for this aircraft: optimised plan minus reactive baseline">
          {signed(r.aircraft_delta)} aircraft-days for {r.aircraft_id}
        </span>
      </div>
      <h3 className="mt-1.5 text-[13px] font-medium leading-snug text-ink">{r.title}</h3>
      <p className={`mt-1.5 text-xs leading-relaxed text-muted ${compact ? 'line-clamp-2' : ''}`}>{r.reason}</p>
      <div className="mt-1 flex gap-3 text-[11px] text-dim">
        <Link to={link(`/app/fleet/${r.aircraft_id}`)} className="hover:text-accent">{r.aircraft_id}</Link>
        <span>{r.base_id}</span>
        {r.day != null && <span className="num">Day {r.day}</span>}
      </div>
    </article>
  )
}
