import { Download, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Gantt, { GanttLegend, KIND_META, type BlockSelection, type GanttLine } from '../components/Gantt'
import { RecommendationTable, REC_GROUPS } from '../components/Recommendations'
import { toast } from '../components/Toaster'
import { Badge, Button, EmptyState, KeyValue, Panel, QueryView, Segmented, Skeleton, SortTable, StatTile } from '../components/ui'
import type { CapacityResponse, Decision, Job, PlanResult } from '../lib/api'
import { useAuth } from '../lib/auth'
import { dateTime, dayDate, downloadCsv, signed } from '../lib/format'
import { useConsoleParams } from '../lib/params'
import { useCapacity, usePlan, useUndoDecision } from '../lib/queries'

type Mode = 'optimized' | 'baseline' | 'compare'

function DetailDrawer({ sel, plan, onClose }: { sel: BlockSelection; plan: PlanResult; onClose: () => void }) {
  const { link } = useConsoleParams()
  const b = sel.block
  const job: Job | undefined = b.job_id ? plan.jobs.find((j) => j.id === b.job_id) : undefined
  const recs = plan.recommendations.filter((r) => r.job_id === b.job_id)
  const o = b.job_id ? plan.optimized.starts[b.job_id] : undefined
  const r = b.job_id ? plan.baseline.starts[b.job_id] : undefined
  const fc = job?.engine_id ? plan.forecasts_days[job.engine_id] : undefined
  const rows: [string, string][] = [
    ['Plan', sel.side === 'optimized' ? 'Optimised' : 'Reactive baseline'],
    ['Days', `Day ${b.start} to ${b.end} (${dayDate(plan.start_date, b.start)} to ${dayDate(plan.start_date, b.end)})${b.extends_beyond_horizon ? ', continues past the horizon' : ''}`],
  ]
  if (job) rows.push(['Base', job.base_id], ['Duration', `${job.duration} days, ${job.tech_hours_per_day} technician hours per day`], ['Parts', job.parts.join(', ') || 'None'])
  if (b.cannibalized_from) rows.push(['Part source', `Cannibalised from ${b.cannibalized_from}`])
  if (job?.due != null) rows.push(['Window', `Day ${job.earliest} to ${job.due}${job.hard_limit !== job.due ? `, deferral to Day ${job.hard_limit}` : ''}`])
  if (fc) rows.push(['Engine forecast', `P10 ${fc.p10_days} d, P50 ${fc.p50_days} d, P90 ${fc.p90_days} d`])
  if (job?.failure_day != null) rows.push(['Forecast failure', `Day ${job.failure_day} (P50)`])
  if (o) rows.push(['Optimised start', o[0] != null ? `Day ${o[0]}` : 'Not scheduled'])
  if (r) rows.push(['Reactive start', r[0] != null ? `Day ${r[0]}` : 'Not scheduled'])
  return (
    <aside className="fixed bottom-6 right-6 top-20 z-40 w-[420px] overflow-y-auto rounded border border-line2 bg-panel shadow-2xl" aria-label="Task detail">
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <Badge>{KIND_META[b.kind].label}</Badge>
          <h3 className="display mt-1.5 text-[17px] font-semibold">{sel.aircraftId}: {b.label}</h3>
        </div>
        <button onClick={onClose} aria-label="Close" className="grid h-7 w-7 place-items-center rounded text-muted hover:bg-panel2 hover:text-ink"><X className="h-4 w-4" /></button>
      </header>
      <div className="p-4">
        <KeyValue rows={rows} />
        {recs.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="label-caps">Reason</div>
            {recs.map((x) => <p key={x.id} className="text-[13px] text-muted">{x.reason}</p>)}
          </div>
        )}
        <Link to={link(`/app/fleet/${sel.aircraftId}`)} className="mt-4 inline-block text-[13px] text-ink underline decoration-line2 hover:text-accent">Open {sel.aircraftId}</Link>
      </div>
    </aside>
  )
}

function Heatmap({ cap, side, start }: { cap: CapacityResponse; side: 'optimized' | 'reactive'; start: string }) {
  const cell = (used: number, total: number) => {
    if (total === 0) return used > 0 ? 'bg-bad' : 'bg-panel2'
    const u = used / total
    if (u === 0) return 'bg-panel2'
    if (u < 0.5) return 'bg-slate-700'
    if (u < 0.8) return 'bg-slate-500'
    if (u < 1) return 'bg-slate-300'
    return 'bg-accent'
  }
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[760px] gap-y-1" style={{ gridTemplateColumns: `170px repeat(${cap.horizon_days}, minmax(0,1fr))` }}>
        <div />
        {Array.from({ length: cap.horizon_days }, (_, d) => <div key={d} className="num text-center text-[10px] text-dim">{d}</div>)}
        {cap.bases.flatMap((b) => (['bays', 'hours'] as const).map((m) => (
          <div key={b.base_id + m} className="contents">
            <div className="pr-2 text-xs text-muted">{b.base_id} · {m === 'bays' ? 'hangar bays' : 'technician hours'}</div>
            {b.days.map((d) => {
              const used = m === 'bays' ? d.bays_used[side] : d.hours_used[side]
              const total = m === 'bays' ? d.bays : d.tech_hours
              return <div key={d.day} className={`mx-px h-5 rounded-sm ${cell(used, total)}`}
                title={`${b.base_id} Day ${d.day} (${dayDate(start, d.day)}): ${used} of ${total} ${m === 'bays' ? 'bays' : 'technician hours'}`} />
            })}
          </div>
        )))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted">
        {[['bg-panel2', 'Idle'], ['bg-slate-700', 'Under 50%'], ['bg-slate-500', '50 to 80%'], ['bg-slate-300', '80 to 99%'], ['bg-accent', 'Full']].map(([c, l]) => (
          <span key={l} className="inline-flex items-center gap-1.5"><span className={`inline-block h-3 w-4 rounded-sm ${c}`} />{l}</span>
        ))}
      </div>
    </div>
  )
}

function DecisionLog({ plan }: { plan: PlanResult }) {
  const { can } = useAuth()
  const undo = useUndoDecision()
  return (
    <Panel title="Decision log" flush>
      <SortTable rows={[...plan.decisions].reverse()} rowKey={(d) => d.id} sortable={false}
        empty={<EmptyState title="No decisions recorded" />}
        columns={[
          { key: 'a', label: 'Decision', value: (d: Decision) => d.action, width: '120px',
            render: (d) => <span className="flex flex-col gap-0.5"><Badge tone={d.action === 'approve' ? 'ok' : 'bad'}>{d.action === 'approve' ? 'Approved' : 'Rejected'}</Badge>
              {!d.in_effect && <span className="text-[11px] text-warn">Not applied here</span>}</span> },
          { key: 't', label: 'Recommendation', value: (d) => d.title, render: (d) => <span>{d.title}{d.note && <span className="block text-xs text-muted">Note: {d.note}</span>}</span> },
          { key: 'e', label: 'Effect', value: (d) => d.effect, render: (d) => <span className="text-xs text-muted">{d.effect}</span> },
          { key: 'by', label: 'By', value: (d) => d.by },
          { key: 'at', label: 'When', value: (d) => d.at, render: (d) => <span className="num">{dateTime(d.at)}</span> },
          { key: 'u', label: '', value: () => null, align: 'right', render: (d) => can('decide') ? (
            <Button size="sm" busy={undo.isPending && undo.variables === d.id}
              onClick={() => undo.mutate(d.id, { onSuccess: (x) => toast(`Decision undone. Plan re-run: ${x.aircraft_days.after} aircraft-days (${signed(x.aircraft_days.after - x.aircraft_days.before)}).`) })}>
              Undo
            </Button>) : null },
        ]} />
      {undo.isError && <p className="px-4 py-2 text-xs text-bad">{(undo.error as Error).message}</p>}
    </Panel>
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
          rows.push([side === 'optimized' ? 'optimised' : 'reactive', r.aircraft_id, r.base_id, KIND_META[b.kind].label, b.label, b.start, b.end, b.cannibalized_from ?? '', b.job_id ?? ''])
    downloadCsv('aeroready-plan.csv', ['plan', 'tail', 'base', 'block_type', 'task', 'start_day', 'end_day', 'cannibalised_from', 'job_id'], rows)
  }

  return (
    <QueryView q={q} skeleton={<div className="space-y-4"><Skeleton h={80} /><Skeleton h={520} /></div>}>
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
        const recs = p.recommendations.filter((r) => keep(r) && (allowed.size === 0 || allowed.has(r.type))).sort((a, b) => b.aircraft_delta - a.aircraft_delta)
        const side = mode === 'baseline' ? p.baseline : p.optimized

        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <StatTile label="Aircraft-days" value={p.optimized.aircraft_days} sub={`Reactive ${p.baseline.aircraft_days}`} />
              <StatTile label="Unplanned failures" value={p.optimized.unplanned_failures.length} sub={`Reactive ${p.baseline.unplanned_failures.length}`} />
              <StatTile label="Engine risk-days" value={p.optimized.risk_engine_days} sub={`Reactive ${p.baseline.risk_engine_days}`} />
              <StatTile label="Cannibalisations" value={p.optimized.cannibalizations.length} sub={`Reactive ${p.baseline.cannibalizations.length}`} />
              <StatTile label="Downtime past the horizon" value={p.optimized.spillover_days} sub={`Reactive ${p.baseline.spillover_days}`} />
            </div>

            <Panel title={`${p.scenario_name}, Day 0 to Day ${p.horizon_days - 1}`} actions={
              <>
                <Segmented label="Plan view" value={mode} onChange={setMode} options={[
                  { value: 'optimized', label: 'Optimised' }, { value: 'baseline', label: 'Reactive' }, { value: 'compare', label: 'Compare' }]} />
                <Button onClick={() => exportCsv(p)} icon={<Download className="h-3.5 w-3.5" />}>Export CSV</Button>
              </>}>
              <div className="mb-3"><GanttLegend /></div>
              {lines.length ? <Gantt lines={lines} horizon={p.horizon_days} startDate={p.start_date} jobs={jobs} onSelect={setSel} linkTo={(t) => link(`/app/fleet/${t}`)} />
                : <EmptyState title="No aircraft at this base" />}
              <p className="mt-2 text-xs text-muted">
                {side.violations.length === 0 ? 'All bay, technician and parts constraints met.' : `${side.violations.length} constraint violations.`}
                {' '}Right-hand column: mission-ready days per aircraft.
              </p>
            </Panel>

            <Panel title="Hangar bay and technician-hour utilisation" actions={
              <Segmented label="Capacity plan" value={capSide} onChange={setCapSide} options={[{ value: 'optimized', label: 'Optimised' }, { value: 'reactive', label: 'Reactive' }]} />}>
              <QueryView q={cap}>{(c) => <Heatmap cap={c} side={capSide} start={p.start_date} />}</QueryView>
            </Panel>

            <Panel flush title={`Recommendations (${recs.length})`} actions={
              <div className="flex flex-wrap gap-1.5">
                {REC_GROUPS.map((g) => {
                  const n = p.recommendations.filter((r) => keep(r) && g.types.includes(r.type)).length
                  if (!n) return null
                  const on = groups.has(g.id)
                  return (
                    <button key={g.id} aria-pressed={on}
                      onClick={() => setGroups((s) => { const x = new Set(s); if (x.has(g.id)) x.delete(g.id); else x.add(g.id); return x })}
                      className={`h-7 rounded border px-2 text-xs ${on ? 'border-ink bg-panel2 text-ink' : 'border-line2 text-muted hover:text-ink'}`}>
                      {g.label} <span className="num text-dim">{n}</span>
                    </button>
                  )
                })}
              </div>}>
              <RecommendationTable recs={recs} empty="No recommendations match these filters" />
            </Panel>

            <DecisionLog plan={p} />
            {sel && <DetailDrawer sel={sel} plan={p} onClose={() => setSel(null)} />}
          </div>
        )
      }}
    </QueryView>
  )
}
