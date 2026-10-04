import { useState } from 'react'
import { Link } from 'react-router-dom'
import { dayDate, type Block, type BlockKind, type GanttRow, type Job } from '../api'

export const KIND_META: Record<BlockKind, { label: string; cls: string; swatch: string }> = {
  scheduled: { label: 'Scheduled inspection', cls: 'bg-k-scheduled text-[#06101f]', swatch: 'bg-k-scheduled' },
  preventive: { label: 'Predictive (RUL-driven)', cls: 'bg-k-predictive text-[#03201d]', swatch: 'bg-k-predictive' },
  corrective: { label: 'Unplanned failure repair', cls: 'bg-bad text-[#2a0705]', swatch: 'bg-bad' },
  awaiting: { label: 'Grounded, awaiting bay/parts', cls: 'hatch-red text-ink', swatch: 'hatch-red' },
  aog: { label: 'AOG (fixed)', cls: 'hatch-grey text-muted', swatch: 'hatch-grey' },
  cannibalization: { label: 'Cannibalisation', cls: 'bg-k-cannibal text-[#160829]', swatch: 'bg-k-cannibal' },
}

export function GanttLegend({ kinds }: { kinds?: BlockKind[] }) {
  const list = kinds ?? (Object.keys(KIND_META) as BlockKind[])
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      {list.map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={`inline-block h-3 w-4 rounded-[2px] ${KIND_META[k].swatch}`} />{KIND_META[k].label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-4 rounded-[2px] bg-k-predictive outline-2 outline-offset-1 outline-k-cannibal" />Uses cannibalised part
      </span>
    </div>
  )
}

/** Compact block caption: "Engine 1 predictive repair (HPC module)" -> "E1 PdM · HPC module". */
function shortLabel(label: string): string {
  const part = label.match(/\(([^)]+)\)/)?.[1]
  return label
    .replace(/Engine (\d) predictive repair.*/, (_, n) => `E${n} PdM${part ? ' · ' + part : ''}`)
    .replace(/Engine (\d) unplanned failure repair.*/, (_, n) => `E${n} failure repair`)
    .replace(/ \(.*\)/, '')
    .replace(' inspection', ' insp.')
    .replace('Overdue - grounded awaiting ', 'Overdue: ')
    .replace('Engine failure - grounded awaiting bay/parts', 'Failed · awaiting bay/parts')
}

function lanes(blocks: Block[]): (Block & { lane: number })[] {
  const ends: number[] = []
  return [...blocks].sort((a, b) => a.start - b.start || a.end - b.end).map((b) => {
    let lane = ends.findIndex((e) => e < b.start)
    if (lane === -1) { lane = ends.length; ends.push(b.end) } else ends[lane] = b.end
    return { ...b, lane }
  })
}

interface Hover { block: Block; row: GanttRow; x: number; y: number }

export default function Gantt({ rows, horizon, startDate, jobs, compact = false, linkRows = true }: {
  rows: GanttRow[]; horizon: number; startDate: string; jobs?: Record<string, Job>; compact?: boolean; linkRows?: boolean
}) {
  const [hover, setHover] = useState<Hover | null>(null)
  const days = Array.from({ length: horizon }, (_, d) => d)
  const laneH = compact ? 12 : 15
  const label = compact ? 64 : 92

  return (
    <div className="relative">
      <div className="grid" style={{ gridTemplateColumns: `${label}px repeat(${horizon}, minmax(0, 1fr)) 48px` }}>
        <div className="label-caps sticky top-0 z-10 border-b border-line bg-panel py-1.5 !text-[10px]">Tail</div>
        {days.map((d) => (
          <div key={d} title={dayDate(startDate, d)}
            className={`num sticky top-0 z-10 border-b border-line bg-panel py-1.5 text-center text-[10px] ${d === 0 ? 'text-accent' : 'text-dim'}`}>
            {d % 2 === 0 || !compact ? d : ''}
          </div>
        ))}
        <div className="label-caps sticky top-0 z-10 border-b border-line bg-panel py-1.5 text-right !text-[10px]">Up</div>

        {rows.map((row) => {
          const ls = lanes(row.blocks)
          const n = Math.max(1, ...ls.map((b) => b.lane + 1))
          const h = n * laneH + 8
          return (
            <div key={row.aircraft_id} className="contents group">
              <div className="flex items-center gap-1.5 border-b border-line/60 pr-2 group-hover:bg-panel2" style={{ height: h }}>
                {linkRows ? (
                  <Link to={`/aircraft/${row.aircraft_id}`} className="display num text-[15px] font-semibold hover:text-accent">{row.aircraft_id}</Link>
                ) : <span className="display num text-[15px] font-semibold">{row.aircraft_id}</span>}
                {!compact && <span className="text-[10px] text-dim">{row.base_id}</span>}
              </div>
              <div className="relative border-b border-line/60 group-hover:bg-panel2" style={{ gridColumn: `span ${horizon}`, height: h }}>
                <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${horizon}, 1fr)` }}>
                  {days.map((d) => <div key={d} className={`border-l ${d % 7 === 0 ? 'border-line2/70' : 'border-line/40'}`} />)}
                </div>
                {ls.map((b, i) => {
                  const meta = KIND_META[b.kind]
                  const left = (b.start / horizon) * 100
                  const width = ((b.end - b.start + 1) / horizon) * 100
                  return (
                    <div key={i}
                      onMouseEnter={(e) => setHover({ block: b, row, x: e.clientX, y: e.clientY })}
                      onMouseMove={(e) => setHover((hv) => hv && { ...hv, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setHover(null)}
                      className={`absolute overflow-hidden whitespace-nowrap rounded-[3px] px-1 text-[10px] font-semibold leading-none transition-[filter] hover:brightness-125 ${meta.cls} ${
                        b.cannibalized_from ? 'outline-2 outline-offset-1 outline-k-cannibal' : ''} ${b.extends_beyond_horizon ? 'rounded-r-none' : ''}`}
                      style={{ left: `calc(${left}% + 1px)`, width: `calc(${width}% - 2px)`, top: 4 + b.lane * laneH, height: laneH - 3,
                        display: 'flex', alignItems: 'center' }}>
                      {!compact && width > 6 && <span className="truncate">{shortLabel(b.label)}</span>}
                    </div>
                  )
                })}
              </div>
              <div className="num flex items-center justify-end border-b border-line/60 text-xs text-muted group-hover:bg-panel2" style={{ height: h }}>
                {row.available_days}d
              </div>
            </div>
          )
        })}
      </div>

      {hover && (
        <div className="pointer-events-none fixed z-50 w-72 rounded border border-line2 bg-[#0d131a]/95 p-3 text-xs shadow-2xl"
          style={{ left: Math.min(hover.x + 14, window.innerWidth - 300), top: Math.min(hover.y + 14, window.innerHeight - 170) }}>
          <div className="mb-1 flex items-center gap-2">
            <span className={`inline-block h-2.5 w-3 rounded-[2px] ${KIND_META[hover.block.kind].swatch}`} />
            <span className="label-caps !text-[10px]">{KIND_META[hover.block.kind].label}</span>
          </div>
          <div className="font-semibold text-ink">{hover.row.aircraft_id} · {hover.block.label}</div>
          <div className="num mt-1 text-muted">
            Day {hover.block.start}–{hover.block.end}{hover.block.extends_beyond_horizon ? '+' : ''} · {dayDate(startDate, hover.block.start)} → {dayDate(startDate, hover.block.end)}
          </div>
          {hover.block.job_id && jobs?.[hover.block.job_id] && (() => {
            const j = jobs[hover.block.job_id!]
            return (
              <div className="num mt-1.5 space-y-0.5 border-t border-line pt-1.5 text-muted">
                <div>{j.duration} d · {j.tech_hours_per_day} tech-h/day · base {j.base_id}</div>
                {j.parts.length > 0 && <div>Parts: {j.parts.join(', ')}</div>}
                {j.due != null && <div>Window D{j.earliest}–D{j.due}{j.hard_limit !== j.due ? ` (deferral to D${j.hard_limit})` : ''}</div>}
                {j.failure_day != null && <div>Forecast failure (P50): Day {j.failure_day}</div>}
              </div>
            )
          })()}
          {hover.block.cannibalized_from && <div className="mt-1 text-k-cannibal">Part cannibalised from {hover.block.cannibalized_from}</div>}
        </div>
      )}
    </div>
  )
}
