import { Link } from 'react-router-dom'
import type { FleetAircraft } from '../api'
import { StatusBadge, StatusDot } from './Status'

/** P10-P90 range bar on a 0..60-day scale with the P50 tick. */
export function RulBar({ p10, p50, p90, scale = 60 }: { p10: number; p50: number; p90: number; scale?: number }) {
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`
  const tone = p10 <= 7 ? 'bg-bad' : p10 < 30 ? 'bg-warn' : 'bg-ok'
  return (
    <div className="relative h-1.5 w-full rounded-full bg-line" aria-label={`RUL P10 ${p10} d, P50 ${p50} d, P90 ${p90} d`}>
      <div className="absolute top-0 h-1.5 rounded-full bg-muted/35" style={{ left: pct(p10), width: `calc(${pct(p90)} - ${pct(p10)})` }} />
      <div className={`absolute -top-[3px] h-3 w-[3px] rounded ${tone}`} style={{ left: pct(p50) }} />
      <div className="absolute -top-[3px] h-3 w-px bg-accent/60" style={{ left: '50%' }} title="30-day horizon" />
    </div>
  )
}

export default function AircraftCard({ a }: { a: FleetAircraft }) {
  const w = a.worst_engine
  const aog = a.status === 'red' && a.status_reason.startsWith('AOG')
  const accent = a.status === 'red' ? 'border-l-2 border-l-bad' : a.status === 'amber' ? 'border-l-2 border-l-warn' : ''
  return (
    <Link to={`/aircraft/${a.id}`} className={`panel group block p-3 transition-colors hover:border-line2 hover:bg-panel2 ${accent}`}>
      <div className="flex items-center gap-2">
        <StatusDot status={a.status} />
        <span className="display num text-xl font-semibold leading-none group-hover:text-accent">{a.id}</span>
        <span className="rounded bg-panel2 px-1.5 py-0.5 text-[10px] font-semibold text-muted">{a.base_id}</span>
        <span className="ml-auto"><StatusBadge status={a.status} /></span>
      </div>
      <div className="mt-1 truncate text-[11px] text-dim" title={a.type}>
        {a.type.split(' ')[0]} · {a.engines.length} eng · {a.sortie_rate} cyc/day
      </div>
      <div className="mt-2.5">
        <div className="flex items-baseline justify-between text-[11px]">
          <span className="text-muted">RUL P50 <span className="text-dim">({w.engine_id.slice(-2)})</span></span>
          <span className="num">
            <span className="display text-base font-semibold text-ink">{aog ? '—' : w.p50_days.toFixed(0)}</span>
            <span className="text-dim"> d</span>
          </span>
        </div>
        <div className="mt-1">
          {aog ? <div className="hatch-grey h-1.5 rounded-full" /> : <RulBar p10={w.p10_days} p50={w.p50_days} p90={w.p90_days} />}
        </div>
        <div className="num mt-1 flex justify-between text-[10px] text-dim">
          <span>P10 {aog ? '—' : w.p10_days.toFixed(0)}</span>
          <span>P90 {aog ? '—' : w.p90_days.toFixed(0)}</span>
        </div>
      </div>
      <div className="mt-2 truncate border-t border-line pt-2 text-[11px]">
        <span className="text-dim">Next: </span>
        {aog ? <span className="text-muted">Awaiting depot repair</span> : a.next_task ? (
          <span className="text-ink">
            <span className="num text-accent">D{a.next_task.start}</span> {a.next_task.label.replace(/ \(.*\)/, '')}
          </span>
        ) : <span className="text-muted">No work in horizon</span>}
      </div>
    </Link>
  )
}
