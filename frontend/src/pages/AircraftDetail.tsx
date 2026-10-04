import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Area, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Gantt from '../components/Gantt'
import { RecommendationTable } from '../components/Recommendations'
import { Badge, EmptyState, KeyValue, Panel, QueryView, Segmented, SimulatedLabel, Skeleton, SortTable, StatusBadge } from '../components/ui'
import type { AircraftDetail as Detail, EngineDetail } from '../lib/api'
import { dayDate } from '../lib/format'
import { useConsoleParams } from '../lib/params'
import { useAircraft, useMeta } from '../lib/queries'

/** Trailing window for the smoothed sensor line. */
const SMOOTH_CYCLES = 10
const axis = { tick: { fill: '#64748b', fontSize: 11 }, axisLine: { stroke: '#334155' }, tickLine: false as const }
const KIND_LABEL: Record<string, string> = { scheduled: 'Scheduled inspection', preventive: 'Predictive maintenance', corrective: 'Unplanned failure repair' }

function RulChart({ e }: { e: EngineDetail }) {
  const h = e.rul_history
  const rows = h.cycle.map((c, i) => ({ cycle: c, band: [h.p10[i], h.p90[i]] as [number, number], p50: h.p50[i] }))
  const now = h.cycle[h.cycle.length - 1]
  const top = Math.max(...h.p90) + 5
  return (
    <div className="h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 24, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="#1e293b" vertical={false} />
          <XAxis dataKey="cycle" type="number" domain={['dataMin', 'dataMax']} {...axis} />
          <YAxis domain={[0, Math.ceil(top / 10) * 10]} {...axis} width={40} />
          <ReferenceLine x={now} stroke="#94a3b8" strokeDasharray="3 3" label={{ value: 'Latest', fill: '#94a3b8', fontSize: 11, position: 'insideTopRight' }} />
          <Area dataKey="band" stroke="none" fill="#14b8a6" fillOpacity={0.18} isAnimationActive={false} />
          <Line dataKey="p50" stroke="#14b8a6" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Tooltip cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }} content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const r = payload[0].payload as (typeof rows)[number]
            return (
              <div className="num rounded border border-line2 bg-panel px-3 py-2 text-xs">
                <div className="text-ink">Cycle {r.cycle}</div>
                <div className="text-muted">P50 {r.p50} · P10 to P90 {r.band[0]} to {r.band[1]} cycles</div>
              </div>
            )
          }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function SensorTrend({ e, sensor, name }: { e: EngineDetail; sensor: string; name: string }) {
  const ys = e.sensor_trend[sensor] ?? []
  const rows = e.sensor_trend.cycle.map((c, i) => {
    const win = ys.slice(Math.max(0, i - SMOOTH_CYCLES + 1), i + 1)
    return { cycle: c, v: ys[i], avg: win.reduce((a, b) => a + b, 0) / win.length }
  })
  return (
    <div className="rounded border border-line p-2">
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="truncate text-muted" title={name}>{sensor} · {name}</span>
        <span className="num text-ink">{ys[ys.length - 1]}</span>
      </div>
      <div className="h-[56px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
            <YAxis domain={['auto', 'auto']} hide /><XAxis dataKey="cycle" hide />
            <Line dataKey="v" stroke="#475569" strokeWidth={1} dot={false} isAnimationActive={false} />
            <Line dataKey="avg" stroke="#e2e8f0" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function EngineTab({ e, horizon }: { e: EngineDetail; horizon: number }) {
  const d = e.plan_days ?? { p10_days: e.rul_days.p10, p50_days: e.rul_days.p50, p90_days: e.rul_days.p90 }
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <div>
        <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-muted">
          <span>Remaining useful life, cycles. Line P50, band P10 to P90.</span>
          <span>{e.cmapss} · {e.cycles_observed} cycles observed</span>
        </div>
        <RulChart e={e} />
        <div className="mt-3">
          <KeyValue rows={[
            ['P10', <span className={`num ${d.p10_days < horizon ? 'text-warn' : ''}`}>{d.p10_days.toFixed(1)} days · {e.rul_cycles.p10.toFixed(0)} cycles</span>],
            ['P50', <span className="num">{d.p50_days.toFixed(1)} days · {e.rul_cycles.p50.toFixed(0)} cycles</span>],
            ['P90', <span className="num">{d.p90_days.toFixed(1)} days · {e.rul_cycles.p90.toFixed(0)} cycles</span>],
            ['True RUL (validation only)', <span className="num text-muted">{e.true_rul_cycles} cycles</span>],
            ['Conversion', <span className="num">{e.sortie_rate} sorties per day</span>],
            ['Repair part', e.repair_part_id],
            ...(e.forecast_source === 'uploaded' ? [['Forecast source', 'Uploaded file'] as [string, string]] : []),
          ]} />
        </div>
      </div>
      <div className="space-y-4">
        <div>
          <div className="label-caps mb-1">Contributing sensors, cycles added or removed from P50</div>
          <SortTable sortable={false} rows={e.top_sensors} rowKey={(s) => s.sensor}
            columns={[
              { key: 's', label: 'Sensor', value: (s) => `${s.sensor} · ${s.name}` },
              { key: 'c', label: 'Contribution', value: (s) => s.contribution_cycles, align: 'right',
                render: (s) => <span className={s.contribution_cycles < 0 ? 'text-bad' : 'text-ok'}>{s.contribution_cycles > 0 ? '+' : ''}{s.contribution_cycles.toFixed(1)}</span> },
            ]} />
        </div>
        <div>
          <div className="label-caps mb-1">Sensor trends, last {e.sensor_trend.cycle.length} cycles (raw and {SMOOTH_CYCLES}-cycle mean)</div>
          <div className="grid grid-cols-2 gap-2">
            {e.top_sensors.slice(0, 4).filter((s) => e.sensor_trend[s.sensor]).map((s) => <SensorTrend key={s.sensor} e={e} sensor={s.sensor} name={s.name} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

function Body({ a }: { a: Detail }) {
  const [eng, setEng] = useState(a.engines[0].id)
  const { link } = useConsoleParams()
  const meta = useMeta()
  const e = a.engines.find((x) => x.id === eng) ?? a.engines[0]
  const H = a.horizon_days

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to={link('/app/fleet')} className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink"><ArrowLeft className="h-3 w-3" />Fleet</Link>
          <div className="mt-1 flex items-center gap-3">
            <h2 className="display text-[32px] font-bold leading-none">{a.aircraft.id}</h2>
            <StatusBadge status={a.status} />
          </div>
          <div className="mt-1 text-[13px] text-muted">{a.aircraft.type} · {a.base.name} ({a.base.id}) · {a.aircraft.sortie_rate} sorties per day</div>
          <div className="text-xs text-dim">{a.status_reason}</div>
        </div>
        <div className="text-right">
          <div className="label-caps">Mission-ready days, {H}-day horizon</div>
          <div className="display num text-[28px] font-semibold leading-tight">{a.available_days.optimized}
            <span className="text-base text-muted"> optimised · {a.available_days.reactive} reactive</span></div>
        </div>
      </div>

      {a.aircraft.grounding && (
        <div className="rounded border border-bad/50 px-4 py-2 text-[13px]">
          <span className="text-bad">Grounded: </span>{a.aircraft.grounding.reason}
          {Object.keys(a.aircraft.grounding.donor_parts).length > 0 && (
            <span className="text-muted"> · Serviceable parts available to other aircraft: {Object.entries(a.aircraft.grounding.donor_parts).map(([p, q]) => `${p} x${q}`).join(', ')}</span>
          )}
        </div>
      )}

      <Panel title="Engine health" actions={
        <Segmented label="Engine" value={eng} onChange={setEng}
          options={a.engines.map((x) => ({ value: x.id, label: `Engine ${x.position} · ${x.serial}` }))} />}>
        <EngineTab e={e} horizon={H} />
      </Panel>

      <Panel title="Planned work" flush>
        <div className="border-b border-line p-4">
          <Gantt horizon={H} startDate={a.start_date}
            lines={(['optimized', 'baseline'] as const).map((s) => ({ key: s, aircraftId: a.aircraft.id, baseId: a.aircraft.base_id, side: s,
              row: a.timeline[s], caption: s === 'optimized' ? 'Optimised' : 'Reactive' }))} />
        </div>
        <SortTable sortable={false} rows={a.planned_work} rowKey={(w) => w.job_id}
          empty={<EmptyState title="No work planned for this aircraft inside the horizon" />}
          columns={[
            { key: 'task', label: 'Task', value: (w) => w.name },
            { key: 'type', label: 'Type', value: (w) => KIND_LABEL[w.kind] ?? w.kind },
            { key: 'start', label: 'Start', value: (w) => w.start, render: (w) => w.start != null ? <span className="num">Day {w.start} · {dayDate(a.start_date, w.start)}</span> : 'Not in horizon' },
            { key: 'days', label: 'Days', value: (w) => w.duration, align: 'right' },
            { key: 'parts', label: 'Parts', value: (w) => w.parts.join(', ') || null, render: (w) => w.parts.length ? `${w.parts.join(', ')} (${w.part_source})` : 'None' },
            { key: 'reason', label: 'Reason', value: (w) => w.reason, render: (w) => <span className="text-xs text-muted">{w.reason}</span> },
            { key: 'reactive', label: 'Reactive baseline instead', value: (w) => w.reactive, render: (w) => <span className="text-xs text-muted">{w.reactive || 'Same as optimised'}</span> },
          ]} />
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Parts for this aircraft" flush>
          <SortTable sortable={false} rows={a.parts} rowKey={(p) => p.job_id + p.part_id}
            empty={<EmptyState title="No parts needed in the plan" />}
            columns={[
              { key: 'part', label: 'Part', value: (p) => `${p.part_id} ${p.name}`, render: (p) => <span><span className="text-dim">{p.part_id}</span> {p.name}</span> },
              { key: 'src', label: 'Source', value: (p) => p.source },
              { key: 'avail', label: 'Available', value: (p) => p.available_day, align: 'right', render: (p) => `Day ${p.available_day}` },
              { key: 'start', label: 'Planned start', value: (p) => p.start, align: 'right', render: (p) => `Day ${p.start}` },
              { key: 'short', label: 'Fleet shortfall', value: (p) => p.shortfall, align: 'right', render: (p) => p.shortfall ? <span className="text-bad">{p.shortfall}</span> : <span className="text-dim">0</span> },
            ]} />
          {a.cannibalizations.length > 0 && (
            <div className="space-y-1 border-t border-line px-4 py-3 text-[13px]">
              {a.cannibalizations.map((c) => (
                <div key={c.job_id} className="flex items-center gap-2">
                  <Badge tone="cannibal">{c.role === 'donor' ? 'Donor' : 'Receiver'}</Badge>
                  {c.role === 'donor'
                    ? <span>{c.part_name} removed for <Link className="text-ink underline decoration-line2 hover:text-accent" to={link(`/app/fleet/${c.aircraft_id}`)}>{c.aircraft_id}</Link>, fitted Day {c.day}</span>
                    : <span>{c.part_name} from <Link className="text-ink underline decoration-line2 hover:text-accent" to={link(`/app/fleet/${c.donor}`)}>{c.donor}</Link>, fitted Day {c.day}</span>}
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Recommendations for this aircraft" flush>
          <RecommendationTable recs={a.recommendations} showAircraft={false} empty="No changes from the reactive baseline" />
        </Panel>
      </div>

      <Panel title="Maintenance history" flush actions={meta.data && <SimulatedLabel origin={meta.data.data_origin} />}>
        <SortTable rows={[...a.log].reverse()} rowKey={(l) => l.id} initialSort={{ key: 'day', dir: 'desc' }}
          empty={<EmptyState title="No log entries" />}
          columns={[
            { key: 'day', label: 'Day', value: (l) => l.day, width: '90px' },
            { key: 'cat', label: 'Category', value: (l) => l.category.replace('_', ' '), width: '160px' },
            { key: 'entry', label: 'Entry', value: (l) => l.description },
            { key: 'hrs', label: 'Tech hours', value: (l) => l.tech_hours, align: 'right', width: '110px' },
          ]} />
      </Panel>
    </div>
  )
}

export default function AircraftDetail() {
  const { tail = '' } = useParams()
  useConsoleParams()
  const q = useAircraft(tail, undefined)
  return (
    <QueryView q={q} skeleton={<div className="space-y-4"><Skeleton h={64} /><Skeleton h={340} /><Skeleton h={200} /></div>}>
      {(a) => <Body key={tail} a={a} />}
    </QueryView>
  )
}
