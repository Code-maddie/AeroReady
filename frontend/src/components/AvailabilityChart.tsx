import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Surge } from '../lib/api'
import { dayDate, signed } from '../lib/format'

export interface Series {
  key: string; label: string; data: number[]
  color: string; dashed?: boolean; faint?: boolean
}

/** Fixed series colours: reactive is dashed slate, the plan is light slate. Amber is kept for attention (surge target). */
export const SERIES_COLORS = { reactive: '#64748b', optimized: '#e2e8f0', compare: ['#e2e8f0', '#3b82f6', '#14b8a6'] }

function Swatch({ s }: { s: Series }) {
  return (
    <svg width="24" height="8" aria-hidden>
      <line x1="1" y1="4" x2="23" y2="4" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '5 3' : undefined} opacity={s.faint ? 0.5 : 1} />
    </svg>
  )
}

export default function AvailabilityChart({ series, startDate, maxY, surge, height = 300, animate = false, diff, dayOffset = 0 }: {
  series: Series[]; startDate: string; maxY: number; surge?: Surge | null; height?: number; animate?: boolean
  /** Day number of the first data point (for a slice of the horizon). */
  dayOffset?: number
  /** Show `a - b` for each day in the tooltip. */
  diff?: { a: string; b: string; label: string }
}) {
  const horizon = series[0]?.data.length ?? 0
  const rows = Array.from({ length: horizon }, (_, d) => {
    const r: Record<string, number> = { day: d + dayOffset }
    for (const s of series) r[s.key] = s.data[d]
    return r
  })
  const all = series.flatMap((s) => s.data)
  const lo = Math.max(0, Math.min(...all, surge?.min_available ?? maxY) - 2)
  const minY = lo - (lo % 2)
  const ticks = Array.from({ length: Math.floor((maxY - minY) / 2) + 1 }, (_, i) => minY + i * 2)
  const byKey = Object.fromEntries(series.map((s) => [s.key, s]))

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
        {series.map((s) => <span key={s.key} className="inline-flex items-center gap-2"><Swatch s={s} />{s.label}</span>)}
        {surge && (
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-3 w-5 border border-dashed border-accent bg-accent/10" />
            Surge target: at least {surge.min_available} aircraft, Day {surge.start_day} to {surge.end_day}
          </span>
        )}
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            <XAxis dataKey="day" tickFormatter={(d) => `D${d}`} interval={2} tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={{ stroke: '#334155' }} tickLine={false} />
            <YAxis domain={[minY, maxY]} ticks={ticks} allowDecimals={false} tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={false} tickLine={false} width={44} />
            {surge && (
              <ReferenceArea x1={surge.start_day} x2={Math.min(horizon - 1 + dayOffset, surge.end_day)} y1={surge.min_available} y2={maxY}
                fill="rgba(245,158,11,0.10)" fillOpacity={1} stroke="rgba(245,158,11,0.6)" strokeDasharray="4 3" />
            )}
            <Tooltip
              cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '3 3' }}
              content={({ active, label }) => {
                if (!active || label == null) return null
                const d = Number(label)
                return (
                  <div className="rounded border border-line2 bg-panel px-3 py-2 text-xs shadow-xl">
                    <div className="display num mb-1 text-sm font-semibold text-ink">Day {d} · {dayDate(startDate, d)}</div>
                    {series.map((s) => (
                      <div key={s.key} className="flex items-center justify-between gap-6">
                        <span className="inline-flex items-center gap-2 text-muted"><Swatch s={s} />{s.label}</span>
                        <span className="num font-semibold text-ink">{s.data[d]} aircraft</span>
                      </div>
                    ))}
                    {diff && byKey[diff.a] && byKey[diff.b] && (
                      <div className="mt-1 flex justify-between gap-6 border-t border-line pt-1 text-muted">
                        <span>{diff.label}</span>
                        <span className="num font-semibold text-ink">{signed(byKey[diff.a].data[d] - byKey[diff.b].data[d])}</span>
                      </div>
                    )}
                    {surge && d >= surge.start_day && d <= surge.end_day && (
                      <div className="mt-1 border-t border-line pt-1 text-muted">Surge target: {surge.min_available}</div>
                    )}
                  </div>
                )
              }}
            />
            {series.map((s) => (
              <Line key={s.key} dataKey={s.key} name={s.label} type="linear" stroke={s.color}
                strokeWidth={s.faint ? 1.5 : 2.25} strokeDasharray={s.dashed ? '6 4' : undefined} strokeOpacity={s.faint ? 0.5 : 1}
                dot={false} activeDot={s.faint ? false : { r: 4, stroke: '#020617', strokeWidth: 2 }}
                isAnimationActive={animate} animationDuration={600} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
