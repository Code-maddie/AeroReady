import {
  CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { dayDate, type Surge } from '../api'

export type SeriesStyle = 'reactive' | 'optimized' | 'previous'
export interface Series { key: string; label: string; data: number[]; style: SeriesStyle }

const STYLE: Record<SeriesStyle, { stroke: string; dash?: string; width: number; opacity: number }> = {
  reactive: { stroke: '#8c8984', dash: '6 4', width: 2, opacity: 1 },
  optimized: { stroke: '#E9A15B', width: 2.5, opacity: 1 },
  previous: { stroke: '#E9A15B', dash: '2 3', width: 1.5, opacity: 0.45 },
}

function LegendSwatch({ style }: { style: SeriesStyle }) {
  const s = STYLE[style]
  return (
    <svg width="26" height="8" aria-hidden>
      <line x1="1" y1="4" x2="25" y2="4" stroke={s.stroke} strokeWidth={s.width} strokeDasharray={s.dash} opacity={s.opacity} />
    </svg>
  )
}

export default function AvailabilityChart({ series, startDate, maxY, surge, height = 300, animate = false }: {
  series: Series[]; startDate: string; maxY: number; surge?: Surge | null; height?: number
  /** Animate data changes (what-if re-plans). Off for first paint so the chart is never blank. */
  animate?: boolean
}) {
  const horizon = series[0]?.data.length ?? 30
  const rows = Array.from({ length: horizon }, (_, d) => {
    const r: Record<string, number | string> = { day: d, date: dayDate(startDate, d) }
    for (const s of series) r[s.key] = s.data[d]
    return r
  })
  const lo = Math.max(0, Math.min(...series.flatMap((s) => s.data), surge?.min_available ?? maxY) - 3)
  const minY = lo - (lo % 2)
  const ticks = Array.from({ length: Math.floor((maxY - minY) / 2) + 1 }, (_, i) => minY + i * 2)

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-2"><LegendSwatch style={s.style} />{s.label}</span>
        ))}
        {surge && (
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-3 w-5 rounded-sm border border-dashed border-accent/60 bg-accent/10" />
            Surge target ≥ {surge.min_available} (D{surge.start_day}–D{surge.end_day})
          </span>
        )}
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 64, bottom: 4, left: -12 }}>
            <CartesianGrid stroke="#262523" vertical={false} />
            <XAxis dataKey="day" tickFormatter={(d) => `D${d}`} interval={2} tick={{ fill: '#6e6b66', fontSize: 11 }}
              axisLine={{ stroke: '#3a3936' }} tickLine={false} />
            <YAxis domain={[minY, maxY]} ticks={ticks} allowDecimals={false} tick={{ fill: '#6e6b66', fontSize: 11 }}
              axisLine={false} tickLine={false} width={44} />
            {surge && (
              <ReferenceArea x1={surge.start_day} x2={Math.min(horizon - 1, surge.end_day)} y1={surge.min_available} y2={maxY}
                fill="rgba(233,161,91,0.16)" fillOpacity={1} stroke="rgba(233,161,91,0.45)" strokeDasharray="4 3" ifOverflow="hidden" />
            )}
            <Tooltip
              cursor={{ stroke: '#a7a39c', strokeWidth: 1, strokeDasharray: '3 3' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const d = Number(label)
                return (
                  <div className="rounded border border-line2 bg-[#141413]/95 px-3 py-2 text-xs shadow-xl">
                    <div className="display num mb-1 text-sm font-semibold text-ink">Day {d} · {dayDate(startDate, d)}</div>
                    {series.map((s) => (
                      <div key={s.key} className="flex items-center justify-between gap-6">
                        <span className="inline-flex items-center gap-2 text-muted"><LegendSwatch style={s.style} />{s.label}</span>
                        <span className="num font-semibold text-ink">{s.data[d]} aircraft</span>
                      </div>
                    ))}
                    {surge && d >= surge.start_day && d <= surge.end_day && (
                      <div className="mt-1 border-t border-line pt-1 text-muted">Surge target: {surge.min_available}</div>
                    )}
                  </div>
                )
              }}
            />
            {series.map((s) => {
              const st = STYLE[s.style]
              return (
                <Line key={s.key} dataKey={s.key} name={s.label} type="linear" stroke={st.stroke}
                  strokeWidth={st.width} strokeDasharray={st.dash} strokeOpacity={st.opacity} dot={false}
                  activeDot={s.style === 'previous' ? false : { r: 4, stroke: '#0e0e0d', strokeWidth: 2 }}
                  isAnimationActive={animate} animationDuration={700} animationEasing="ease-in-out"
                  label={(p: { index?: number; x?: number | string; y?: number | string; value?: unknown }) =>
                    p.index === horizon - 1 && s.style !== 'previous' ? (
                      <text x={Number(p.x) + 8} y={Number(p.y) + 4} fill="#a7a39c" fontSize={11} className="num">
                        {s.style === 'optimized' ? 'Optimised' : 'Reactive'}
                      </text>
                    ) : <g />}
                />
              )
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
