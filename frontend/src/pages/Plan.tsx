import { Download, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Gantt, { GanttLegend, KIND_META, type BlockSelection, type GanttLine } from '../components/Gantt'
import { RecommendationCard, REC_GROUPS } from '../components/Recommendations'
import { Button, EmptyState, Panel, QueryView, Segmented, Skeleton } from '../components/ui'
import type { CapacityResponse, Job, PlanResult } from '../lib/api'
import { dayDate, downloadCsv } from '../lib/format'
import { useConsoleParams } from '../lib/params'
import { useCapacity, usePlan } from '../lib/queries'

type Mode = 'optimized' | 'baseline' | 'compare'

function DetailPanel({ sel, plan, onClose }: { sel: BlockSelection; plan: PlanResult; onClose: () => void }) {
  const { link } = useConsoleParams()
  const b = sel.block
  const job: Job | undefined = b.job_id ? plan.jobs.find((j) => j.id === b.job_id) : undefined
  const recs = plan.recommendations.filter((r) => r.job_id === b.job_id)
  const o = b.job_id ? plan.optimized.starts[b.job_id] : undefined
  const r = b.job_id ? plan.baseline.starts[b.job_id] : undefined
  const fc = job?.engine_id ? plan.forecasts_days[job.engine_id] : undefined
  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[130px_1fr] gap-2 border-b border-line/60 py-1.5 text-sm"><span className="text-muted">{label}</span><span className="text-ink">{value}</span></div>
  )
  return (
    <aside className="panel fixed bottom-4 right-4 top-20 z-40 w-[400px] overflow-y-auto p-4 shadow-2xl" aria-label="Task detail">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="label-caps">{KIND_META[b.kind].label} · {sel.side === 'optimized' ? 'Optimised plan' : 'Reactive baseline'}</div>
          <h3 className="mt-1 text-base font-medium text-ink">{sel.aircraftId}: {b.label}</h3>
        </div>
        <button onClick={onClose} aria-label="Close detail" className="text-muted hover:text-ink"><X className="h-4 w-4" /></button>
      </div>
      {row('Days', `Day ${b.start} to ${b.end} (${dayDate(plan.start_date, b.start)} to ${dayDate(plan.start_date, b.end)})${b.extends_beyond_horizon ? ', continues past the horizon' : ''}`)}
      {job && row('Base', job.base_id)}
      {job && row('Duration', `${job.duration} days, ${job.tech_hours_per_day} technician hours per day`)}
      {job && row('Parts', job.parts.length ? job.parts.join(', ') : 'None')}
      {b.cannibalized_from && row('Part source', `Cannibalised from ${b.cannibalized_from}`)}
      {job?.due != null && row('Window', `Opens Day ${job.earliest}, due Day ${job.due}${job.hard_limit !== job.due ? `, authorised deferral to Day ${job.hard_limit}` : ''}`)}
      {fc && row('Engine forecast', `P10 ${fc.p10_days} d, P50 ${fc.p50_days} d, P90 ${fc.p90_days} d`)}
      {job?.failure_day != null && row('Forecast failure', `Day ${job.failure_day} (P50)`)}
      {o && row('Optimised start', o[0] != null ? `Day ${o[0]}` : 'Not scheduled')}
      {r && row('Reactive start', r[0] != null ? `Day ${r[0]}` : 'Not scheduled')}
      {recs.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="label-caps">Reason</div>
          {recs.map((x) => <p key={x.id} className="text-sm text-muted">{x.reason}</p>)}
        </div>
      )}
      <Link to={link(`/app/fleet/${sel.aircraftId}`)} className="mt-4 inline-block text-sm text-accent hover:underline">Open {sel.aircraftId}</Link>
    </aside>
  )
}

function Heatmap({ cap, side, plan }: { cap: CapacityResponse; side: 'optimized' | 'reactive'; plan: PlanResult }) {
  const cell = (used: number, total: number) => {
    if (total === 0) return used > 0 ? 'bg-bad' : 'bg-line'
    const u = used / total
    if (u === 0) return 'bg-panel2'
    if (u < 0.5) return 'bg-accent/20'
    if (u < 0.8) return 'bg-accent/45'
    if (u < 1) return 'bg-accent/70'
    return 'bg-accent'
  }
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[760px] gap-y-1" style={{ gridTemplateColumns: `150px repeat(${cap.horizon_days}, minmax(0,1fr))` }}>
        <div />
        {Array.from({ length: cap.horizon_days }, (_, d) => <div key={d} className="num text-center text-[10px] text-dim">{d}</div>)}
        {cap.bases.flatMap((b) => (['bays', 'hours'] as const).map((m) => (
          <div key={b.base_id + m} className="contents">
            <div className="pr-2 text-xs text-muted">{b.base_id} · {m === 'bays' ? 'hangar bays' : 'technician hours'}</div>
            {b.days.map((d) => {
              const used = m === 'bays' ? d.bays_used[side] : d.hours_used[side]
              const total = m === 'bays' ? d.bays : d.tech_hours
              return (
                <div key={d.day} className={`mx-px h-5 rounded-[2px] ${cell(used, total)}`}
                  title={`${b.base_id} Day ${d.day} (${dayDate(plan.start_date, d.day)}): ${used} of ${total} ${m === 'bays' ? 'bays' : 'technician hours'}`} />
              )
            })}
          </div>
        )))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted">
        <span>Utilisation:</span>
        {[['bg-panel2', 'idle'], ['bg-accent/20', 'under 50%'], ['bg-accent/45', '50 to 80%'], ['bg-accent/70', '80 to 99%'], ['bg-accent', 'full']].map(([c, l]) => (
          <span key={l} className="inline-flex items-center gap-1"><span className={`inline-block h-3 w-4 rounded-[2px] ${c}`} />{l}</span>
        ))}
        <span>Hover a cell for exact values.</span>
      </div>
    </div>
  )
}

export default function Plan() {
  const { base, scenario, link } = useConsoleParams()
  const q = usePlan(scenario)
  const cap = useCapacity(scenario)
  const [mode, setMode] = useState<Mode>('optimized')
  const [groups, setGroups] = useState<Set<string>>(new Set())
  const [sel, setSel] = useState<BlockSelection | null>(null)
  const [capSide, setCapSide] = useState<'optimized' | 'reactive'>('optimized')

  const jobs = useMemo(() => Object.fromEntries((q.data?.jobs ?? []).map((j) => [j.id, j])) as Record<string, Job>, [q.data])

  const exportCsv = (p: PlanResult) => {
    const rows: (string | number | null)[][] = []
    for (const side of ['optimized', 'baseline'] as const)
      for (const r of p[side].gantt)
        for (const b of r.blocks)
          rows.push([side === 'optimized' ? 'optimised' : 'reactive', r.aircraft_id, r.base_id, KIND_META[b.kind].label, b.label,
            b.start, b.end, b.cannibalized_from ?? '', b.job_id ?? ''])
    downloadCsv('aeroready-plan.csv', ['plan', 'tail', 'base', 'block_type', 'task', 'start_day', 'end_day', 'cannibalised_from', 'job_id'], rows)
  }

  return (
    <QueryView q={q} skeleton={<div className="space-y-4"><Skeleton h={60} /><Skeleton h={520} /></div>}>
      {(p) => {
        const keep = (r: { base_id: string }) => !base || r.base_id === base
        const opt = p.optimized.gantt.filter(keep)
        const reb = Object.fromEntries(p.baseline.gantt.map((r) => [r.aircraft_id, r]))
        const lines: GanttLine[] = mode === 'compare'
          ? opt.flatMap((r) => [
            { key: r.aircraft_id + 'o', aircraftId: r.aircraft_id, baseId: r.base_id, side: 'optimized' as const, row: r, caption: 'Opt' },
            { key: r.aircraft_id + 'b', aircraftId: r.aircraft_id, baseId: r.base_id, side: 'baseline' as const, row: reb[r.aircraft_id], caption: 'Reactive' },
          ])
          : (mode === 'optimized' ? opt : p.baseline.gantt.filter(keep)).map((r) => ({ key: r.aircraft_id, aircraftId: r.aircraft_id, baseId: r.base_id, side: mode as 'optimized' | 'baseline', row: r }))
        const allowed = new Set(REC_GROUPS.filter((g) => groups.has(g.id)).flatMap((g) => g.types))
        const recs = p.recommendations.filter((r) => keep(r) && (allowed.size === 0 || allowed.has(r.type)))
          .sort((a, b) => b.aircraft_delta - a.aircraft_delta)
        const side = mode === 'baseline' ? p.baseline : p.optimized

        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {[
                ['Aircraft-days', p.optimized.aircraft_days, p.baseline.aircraft_days],
                ['Unplanned failures', p.optimized.unplanned_failures.length, p.baseline.unplanned_failures.length],
                ['Engine risk-days', p.optimized.risk_engine_days, p.baseline.risk_engine_days],
                ['Cannibalisations', p.optimized.cannibalizations.length, p.baseline.cannibalizations.length],
                ['Downtime past the horizon', p.optimized.spillover_days, p.baseline.spillover_days],
              ].map(([label, o, r]) => (
                <div key={label as string} className="panel px-3 py-2">
                  <div className="label-caps">{label}</div>
                  <div className="mt-0.5 flex items-baseline gap-2">
                    <span className="display num text-2xl font-semibold">{o}</span><span className="num text-xs text-dim">reactive {r}</span>
                  </div>
                </div>
              ))}
            </div>

            <Panel title={`${p.scenario_name}: Day 0 to Day ${p.horizon_days - 1}`} actions={
              <>
                <Segmented label="Plan view" value={mode} onChange={setMode} options={[
                  { value: 'optimized', label: 'Optimised plan' }, { value: 'baseline', label: 'Reactive baseline' }, { value: 'compare', label: 'Compare' }]} />
                <Button onClick={() => exportCsv(p)} icon={<Download className="h-3.5 w-3.5" />}>Export CSV</Button>
              </>}>
              <div className="mb-3"><GanttLegend /></div>
              {lines.length ? <Gantt lines={lines} horizon={p.horizon_days} startDate={p.start_date} jobs={jobs} onSelect={setSel} linkTo={(t) => link(`/app/fleet/${t}`)} />
                : <EmptyState title="No aircraft at this base" />}
              <p className="mt-2 text-xs text-dim">
                {mode === 'compare' ? 'Each aircraft shows the optimised plan above the reactive baseline. ' : ''}
                Right-hand column: mission-ready days for each aircraft. {side.violations.length === 0 ? 'Capacity and parts constraints are all met.' : `${side.violations.length} constraint violations.`}
              </p>
            </Panel>

              <Panel title="Capacity utilisation" actions={
                <Segmented label="Capacity plan" value={capSide} onChange={setCapSide} options={[
                  { value: 'optimized', label: 'Optimised' }, { value: 'reactive', label: 'Reactive' }]} />}>
                <QueryView q={cap}>{(c) => <Heatmap cap={c} side={capSide} plan={p} />}</QueryView>
              </Panel>
              <Panel title="Recommendations" actions={
                <div className="flex flex-wrap gap-1.5">
                  {REC_GROUPS.map((g) => {
                    const n = p.recommendations.filter((r) => keep(r) && g.types.includes(r.type)).length
                    if (!n) return null
                    return (
                      <button key={g.id} aria-pressed={groups.has(g.id)}
                        onClick={() => setGroups((s) => { const x = new Set(s); if (x.has(g.id)) x.delete(g.id); else x.add(g.id); return x })}
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${g.cls} ${groups.has(g.id) ? 'bg-white/10' : 'opacity-75 hover:opacity-100'}`}>
                        {g.label} <span className="num text-dim">{n}</span>
                      </button>
                    )
                  })}
                </div>}>
                {recs.length === 0 ? <EmptyState title="No recommendations match these filters" />
                  : <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">{recs.map((r) => <RecommendationCard key={r.id} r={r} />)}</div>}
              </Panel>
            {sel && <DetailPanel sel={sel} plan={p} onClose={() => setSel(null)} />}
          </div>
        )
      }}
    </QueryView>
  )
}
