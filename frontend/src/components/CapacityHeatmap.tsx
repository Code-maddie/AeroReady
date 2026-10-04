import type { CapacityResponse } from '../lib/api'
import { dayDate } from '../lib/format'

const LEVELS: [string, string][] = [['bg-panel2', 'Idle'], ['bg-slate-700', 'Under 50%'], ['bg-slate-500', '50 to 80%'], ['bg-slate-300', '80 to 99%'], ['bg-accent', 'Full']]

function cell(used: number, total: number): string {
  if (total === 0) return used > 0 ? 'bg-bad' : 'bg-panel2'
  const u = used / total
  if (u === 0) return LEVELS[0][0]
  if (u < 0.5) return LEVELS[1][0]
  if (u < 0.8) return LEVELS[2][0]
  if (u < 1) return LEVELS[3][0]
  return LEVELS[4][0]
}

/** Per base: hangar-bay and technician-hour utilisation per day. Amber marks full days. */
export default function CapacityHeatmap({ cap, side, start, base }: { cap: CapacityResponse; side: 'optimized' | 'reactive'; start: string; base?: string | null }) {
  const bases = cap.bases.filter((b) => !base || b.base_id === base)
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[760px] gap-y-1" style={{ gridTemplateColumns: `170px repeat(${cap.horizon_days}, minmax(0,1fr))` }}>
        <div />
        {Array.from({ length: cap.horizon_days }, (_, d) => <div key={d} className="num text-center text-[10px] text-dim">{d}</div>)}
        {bases.flatMap((b) => (['bays', 'hours'] as const).map((m) => (
          <div key={b.base_id + m} className="contents">
            <div className="pr-2 text-xs text-muted">{b.base_id} · {m === 'bays' ? 'hangar bays' : 'technician hours'}</div>
            {b.days.map((d) => {
              const used = m === 'bays' ? d.bays_used[side] : d.hours_used[side]
              const total = m === 'bays' ? d.bays : d.tech_hours
              return <div key={d.day} className={`mx-px h-5 rounded-sm ${cell(used, total)}`}
                title={`${b.base_id} day ${d.day} (${dayDate(start, d.day)}): ${used} of ${total} ${m === 'bays' ? 'bays' : 'technician hours'}`} />
            })}
          </div>
        )))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted">
        {LEVELS.map(([c, l]) => <span key={l} className="inline-flex items-center gap-1.5"><span className={`inline-block h-3 w-4 rounded-sm ${c}`} />{l}</span>)}
      </div>
    </div>
  )
}
