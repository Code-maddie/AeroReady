import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Block, BlockKind, GanttRow, Job } from '../lib/api'
import { dayDate } from '../lib/format'

export const KIND_META: Record<BlockKind, { label: string; cls: string; swatch: string }> = {
  scheduled: { label: 'Scheduled inspection', cls: 'bg-k-scheduled text-white', swatch: 'bg-k-scheduled' },
  preventive: { label: 'Predictive maintenance', cls: 'bg-k-predictive text-slate-950', swatch: 'bg-k-predictive' },
  corrective: { label: 'Unplanned failure repair', cls: 'bg-bad text-white', swatch: 'bg-bad' },
  awaiting: { label: 'Grounded, waiting for bay or part', cls: 'border border-dashed border-bad bg-bad/20 text-ink', swatch: 'border border-dashed border-bad bg-bad/20' },
  aog: { label: 'Grounded long-term (fixed)', cls: 'bg-line2 text-muted', swatch: 'bg-line2' },
  cannibalization: { label: 'Cannibalisation (part removal)', cls: 'bg-k-cannibal text-white', swatch: 'bg-k-cannibal' },
}

export function GanttLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      {(Object.keys(KIND_META) as BlockKind[]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={`inline-block h-3 w-4 rounded-sm ${KIND_META[k].swatch}`} />{KIND_META[k].label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-4 rounded-sm bg-k-predictive outline outline-2 outline-offset-1 outline-k-cannibal" />Uses a cannibalised part
      </span>
    </div>
  )
}

function shortLabel(label: string): string {
  const part = label.match(/\(([^)]+)\)/)?.[1]
  return label
    .replace(/Engine (\d) predictive repair.*/, (_, n) => `E${n} predictive${part ? ' · ' + part : ''}`)
    .replace(/Engine (\d) unplanned failure repair.*/, (_, n) => `E${n} failure repair`)
    .replace(/ \(.*\)/, '')
    .replace(' inspection', ' insp.')
    .replace('Overdue - grounded awaiting ', 'Overdue: ')
    .replace('Engine failure - grounded awaiting bay/parts', 'Failed, waiting')
}

function lanes(blocks: Block[]): (Block & { lane: number })[] {
  const ends: number[] = []
  return [...blocks].sort((a, b) => a.start - b.start || a.end - b.end).map((b) => {
    let lane = ends.findIndex((e) => e < b.start)
    if (lane === -1) { lane = ends.length; ends.push(b.end) } else ends[lane] = b.end
    return { ...b, lane }
  })
}

export type Side = 'optimized' | 'baseline'
export interface GanttLine { key: string; aircraftId: string; baseId: string; side: Side; row: GanttRow; caption?: string }
export interface BlockSelection { block: Block; aircraftId: string; side: Side }

interface Hover { block: Block; line: GanttLine; x: number; y: number }

export default function Gantt({ lines, horizon, startDate, jobs, onSelect, linkTo }: {
  lines: GanttLine[]; horizon: number; startDate: string; jobs?: Record<string, Job>
  onSelect?: (s: BlockSelection) => void; linkTo?: (tail: string) => string
}) {
  const [hover, setHover] = useState<Hover | null>(null)
  const days = Array.from({ length: horizon }, (_, d) => d)
  const laneH = 15

  return (
    <div className="relative overflow-x-auto">
      <div className="grid min-w-[880px]" style={{ gridTemplateColumns: `112px repeat(${horizon}, minmax(0, 1fr)) 44px` }}>
        <div className="label-caps sticky top-0 z-10 border-b border-line bg-panel py-1.5">Tail</div>
        {days.map((d) => (
          <div key={d} title={dayDate(startDate, d)}
            className={`num sticky top-0 z-10 border-b border-line bg-panel py-1.5 text-center text-[10px] ${d === 0 ? 'text-accent' : 'text-dim'}`}>{d}</div>
        ))}
        <div className="label-caps sticky top-0 z-10 border-b border-line bg-panel py-1.5 text-right" title="Mission-ready days in the horizon">Up</div>

        {lines.map((line) => {
          const ls = lanes(line.row.blocks)
          const h = Math.max(1, ...ls.map((b) => b.lane + 1)) * laneH + 8
          const sep = line.side === 'baseline' && line.caption ? 'border-b border-line' : 'border-b border-line/50'
          return (
            <div key={line.key} className="group contents">
              <div className={`flex items-center gap-1.5 pr-2 group-hover:bg-panel2 ${sep}`} style={{ height: h }}>
                {line.caption ? (
                  <span className={`text-[11px] ${line.side === 'optimized' ? 'text-accent' : 'text-muted'}`}>{line.caption}</span>
                ) : null}
                {(!line.caption || line.side === 'optimized') && (
                  linkTo
                    ? <Link to={linkTo(line.aircraftId)} className="display num text-[15px] font-semibold hover:text-accent">{line.aircraftId}</Link>
                    : <span className="display num text-[15px] font-semibold">{line.aircraftId}</span>
                )}
                {!line.caption && <span className="text-[10px] text-dim">{line.baseId}</span>}
              </div>
              <div className={`relative group-hover:bg-panel2 ${sep}`} style={{ gridColumn: `span ${horizon}`, height: h }}>
                <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${horizon}, 1fr)` }}>
                  {days.map((d) => <div key={d} className={`border-l ${d % 7 === 0 ? 'border-line2/70' : 'border-line/40'}`} />)}
                </div>
                {ls.map((b, i) => {
                  const left = (b.start / horizon) * 100
                  const width = ((b.end - b.start + 1) / horizon) * 100
                  return (
                    <button key={i} type="button"
                      onClick={() => onSelect?.({ block: b, aircraftId: line.aircraftId, side: line.side })}
                      onMouseEnter={(e) => setHover({ block: b, line, x: e.clientX, y: e.clientY })}
                      onMouseMove={(e) => setHover((hv) => hv && { ...hv, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setHover(null)}
                      aria-label={`${line.aircraftId} ${KIND_META[b.kind].label}: ${b.label}, Day ${b.start} to ${b.end}`}
                      className={`absolute flex items-center overflow-hidden whitespace-nowrap rounded-sm px-1 text-left text-[10px] font-semibold leading-none hover:brightness-125 ${KIND_META[b.kind].cls} ${
                        b.cannibalized_from ? 'outline outline-2 outline-offset-1 outline-k-cannibal' : ''}`}
                      style={{ left: `calc(${left}% + 1px)`, width: `calc(${width}% - 2px)`, top: 4 + b.lane * laneH, height: laneH - 3 }}>
                      {width > 6 && <span className="truncate">{shortLabel(b.label)}</span>}
                    </button>
                  )
                })}
              </div>
              <div className={`num flex items-center justify-end text-xs text-muted group-hover:bg-panel2 ${sep}`} style={{ height: h }}>
                {line.row.available_days}
              </div>
            </div>
          )
        })}
      </div>

      {hover && (
        <div className="pointer-events-none fixed z-50 w-72 rounded border border-line2 bg-panel p-3 text-xs shadow-2xl"
          style={{ left: Math.min(hover.x + 14, window.innerWidth - 300), top: Math.min(hover.y + 14, window.innerHeight - 180) }}>
          <div className="mb-1 flex items-center gap-2">
            <span className={`inline-block h-2.5 w-3 rounded-sm ${KIND_META[hover.block.kind].swatch}`} />
            <span className="label-caps">{KIND_META[hover.block.kind].label}</span>
          </div>
          <div className="font-semibold text-ink">{hover.line.aircraftId} · {hover.block.label}</div>
          <div className="num mt-1 text-muted">
            Day {hover.block.start} to {hover.block.end}{hover.block.extends_beyond_horizon ? ' (continues past the horizon)' : ''} · {dayDate(startDate, hover.block.start)} to {dayDate(startDate, hover.block.end)}
          </div>
          {hover.block.job_id && jobs?.[hover.block.job_id] && (() => {
            const j = jobs[hover.block.job_id!]
            return (
              <div className="num mt-1.5 space-y-0.5 border-t border-line pt-1.5 text-muted">
                <div>{j.duration} days · {j.tech_hours_per_day} technician hours per day · base {j.base_id}</div>
                {j.parts.length > 0 && <div>Parts: {j.parts.join(', ')}</div>}
                {j.due != null && <div>Window Day {j.earliest} to {j.due}{j.hard_limit !== j.due ? `, deferral to Day ${j.hard_limit}` : ''}</div>}
                {j.failure_day != null && <div>Forecast failure (P50): Day {j.failure_day}</div>}
              </div>
            )
          })()}
          {hover.block.cannibalized_from && <div className="mt-1 text-k-cannibal">Part cannibalised from {hover.block.cannibalized_from}</div>}
          {onSelect && <div className="mt-1.5 text-dim">Click for full detail</div>}
        </div>
      )}
    </div>
  )
}
