import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Area, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Gantt from '../components/Gantt'
import { RecommendationCard } from '../components/Recommendations'
import { EmptyState, Panel, QueryView, SimulatedLabel, Skeleton, StatusBadge } from '../components/ui'
import type { AircraftDetail as Detail, EngineDetail } from '../lib/api'
import { dayDate } from '../lib/format'
import { useConsoleParams } from '../lib/params'
import { useAircraft, useMeta } from '../lib/queries'

/** Trailing window for the smoothed sensor line. */
const SMOOTH_CYCLES = 10

const axis = { tick: { fill: '#6e6b66', fontSize: 11 }, axisLine: { stroke: '#3a3936' }, tickLine: false as const }

function RulChart({ e }: { e: EngineDetail }) {
  const h = e.rul_history
  const rows = h.cycle.map((c, i) => ({ cycle: c, band: [h.p10[i], h.p90[i]] as [number, number], p50: h.p50[i] }))
  const now = h.cycle[h.cycle.length - 1]
  const top = Math.max(...h.p90) + 5
  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 10, right: 30, bottom: 14, left: -4 }}>
          <CartesianGrid stroke="#262523" vertical={false} />
          <XAxis dataKey="cycle" type="number" domain={['dataMin', 'dataMax']} {...axis}
            label={{ value: 'Operating cycle', position: 'insideBottom', offset: -8, fill: '#6e6b66', fontSize: 11 }} />
          <YAxis domain={[0, Math.ceil(top / 10) * 10]} {...axis} width={44} />
          <ReferenceLine x={now} stroke="#e9a15b" strokeDasharray="3 3" label={{ value: 'Latest', fill: '#e9a15b', fontSize: 11, position: 'insideTopRight' }} />
          <Area dataKey="band" stroke="none" fill="#3fb7a6" fillOpacity={0.2} isAnimationActive={false} />
          <Line dataKey="p50" stroke="#3fb7a6" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Tooltip cursor={{ stroke: '#a7a39c', strokeDasharray: '3 3' }} content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const r = payload[0].payload as (typeof rows)[number]
            return (
              <div className="num rounded-xl border border-line2 bg-[#141413] px-3 py-2 text-xs">
                <div className="font-semibold text-ink">Cycle {r.cycle}</div>
                <div className="text-muted">P50 <span className="text-ink">{r.p50}</span> cycles · P10 to P90 <span className="text-ink">{r.band[0]} to {r.band[1]}</span></div>
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
    <div className="rounded-xl border border-line bg-panel2/40 p-2">
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="truncate text-muted" title={`${sensor}: ${name}`}>{sensor} · {name}</span>
        <span className="num text-ink">{ys[ys.length - 1]}</span>
      </div>
      <div className="h-[64px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
            <YAxis domain={['auto', 'auto']} hide /><XAxis dataKey="cycle" hide />
            <Line dataKey="v" stroke="#6e6b66" strokeWidth={1} dot={false} isAnimationActive={false} />
            <Line dataKey="avg" stroke="#e6edf3" strokeWidth={1.75} dot={false} isAnimationActive={false} />
            <Tooltip cursor={{ stroke: '#6e6b66' }} content={({ active, payload }) => active && payload?.length ? (
              <div className="num rounded-xl border border-line2 bg-[#141413] px-2 py-1 text-[11px]">
                Cycle {(payload[0].payload as { cycle: number }).cycle}: <span className="text-ink">{String(payload[0].value)}</span>
              </div>) : null} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function EngineTab({ e, horizon }: { e: EngineDetail; horizon: number }) {
  const d = e.plan_days ?? { p10_days: e.rul_days.p10, p50_days: e.rul_days.p50, p90_days: e.rul_days.p90 }
  const max = Math.max(...e.top_sensors.map((s) => Math.abs(s.contribution_cycles)), 1)
  const uploaded = e.forecast_source === 'uploaded'
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div>
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-xs">
          <span className="label-caps">Remaining useful life, cycles (P50 line, P10 to P90 band)</span>
          <span className="text-dim">{e.cmapss} · {e.cycles_observed} cycles observed · NASA C-MAPSS</span>
        </div>
        <RulChart e={e} />
        <div className="mt-2 grid grid-cols-4 gap-2">
          {([['P10', d.p10_days, e.rul_cycles.p10], ['P50', d.p50_days, e.rul_cycles.p50], ['P90', d.p90_days, e.rul_cycles.p90]] as const).map(([k, days, cyc]) => (
            <div key={k} className="rounded-xl border border-line bg-panel2/40 px-2.5 py-1.5">
              <div className="label-caps">{k}</div>
              <div className={`display num text-xl font-semibold ${k === 'P10' && days < horizon ? 'text-warn' : ''}`}>{days.toFixed(1)}<span className="text-xs text-dim"> days</span></div>
              <div className="num text-[10px] text-dim">{cyc.toFixed(0)} cycles</div>
            </div>
          ))}
          <div className="rounded-xl border border-dashed border-line2 px-2.5 py-1.5" title="C-MAPSS ground truth for this test engine, shown for validation only; the planner uses the forecast">
            <div className="label-caps">True RUL</div>
            <div className="display num text-xl font-semibold text-muted">{e.true_rul_cycles}<span className="text-xs text-dim"> cycles</span></div>
            <div className="text-[10px] text-dim">Validation only</div>
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-dim">
          Days = cycles divided by {e.sortie_rate} sorties per day. Repair part {e.repair_part_id}.
          {uploaded && ' Forecast values for this engine come from an uploaded file; the chart history and sensor attributions are from the trained model.'}
        </p>
      </div>
      <div className="space-y-4">
        <div>
          <div className="label-caps mb-2">Contributing sensors</div>
          <div className="space-y-1.5">
            {e.top_sensors.map((s) => (
              <div key={s.sensor} className="grid grid-cols-[minmax(0,1fr)_110px_52px] items-center gap-2 text-xs">
                <span className="truncate text-muted" title={s.name}>{s.sensor} · {s.name}</span>
                <div className="relative h-2 rounded bg-line">
                  <div className={`absolute top-0 h-2 rounded ${s.contribution_cycles < 0 ? 'bg-bad/80' : 'bg-ok/70'}`}
                    style={{ width: `${(Math.abs(s.contribution_cycles) / max) * 100}%` }} />
                </div>
                <span className={`num text-right ${s.contribution_cycles < 0 ? 'text-bad' : 'text-ok'}`}>{s.contribution_cycles > 0 ? '+' : ''}{s.contribution_cycles.toFixed(1)}</span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-dim">Cycles of remaining life each sensor adds or removes from the P50 forecast at the latest cycle (tree SHAP values).</p>
        </div>
        <div>
          <div className="label-caps mb-2">Sensor trends, last {e.sensor_trend.cycle.length} cycles</div>
          <div className="grid grid-cols-2 gap-2">
            {e.top_sensors.slice(0, 4).filter((s) => e.sensor_trend[s.sensor]).map((s) => <SensorTrend key={s.sensor} e={e} sensor={s.sensor} name={s.name} />)}
          </div>
          <p className="mt-1 text-[11px] text-dim">Grey: raw reading. White: {SMOOTH_CYCLES}-cycle mean.</p>
        </div>
      </div>
    </div>
  )
}

function Body({ a }: { a: Detail }) {
  const [tab, setTab] = useState(0)
  const { link } = useConsoleParams()
  const meta = useMeta()
  const e = a.engines[Math.min(tab, a.engines.length - 1)]
  const H = a.horizon_days

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to={link('/app/fleet')} className="inline-flex items-center gap-1 text-xs text-muted hover:text-accent"><ArrowLeft className="h-3 w-3" />Fleet</Link>
          <div className="mt-1 flex items-center gap-3">
            <h2 className="display text-4xl font-medium leading-none">{a.aircraft.id}</h2>
            <StatusBadge status={a.status} />
          </div>
          <div className="mt-1.5 text-sm text-muted">{a.aircraft.type} · {a.base.name} ({a.base.id}) · {a.aircraft.sortie_rate} sorties per day</div>
          <div className="mt-0.5 text-xs text-dim">{a.status_reason}</div>
        </div>
        <div className="panel px-4 py-2 text-right">
          <div className="label-caps">Mission-ready days, {H}-day horizon</div>
          <div className="display num text-2xl font-semibold">
            <span className="text-accent">{a.available_days.optimized}</span><span className="text-base text-dim"> optimised · {a.available_days.reactive} reactive</span>
          </div>
        </div>
      </div>

      {a.aircraft.grounding && (
        <div className="panel border-line2 p-3 text-sm">
          <span className="font-medium text-ink">Grounded: </span><span className="text-ink">{a.aircraft.grounding.reason}</span>
          {Object.keys(a.aircraft.grounding.donor_parts).length > 0 && (
            <span className="text-muted"> · Serviceable parts available to other aircraft: {Object.entries(a.aircraft.grounding.donor_parts).map(([p, q]) => `${p} x${q}`).join(', ')}</span>
          )}
        </div>
      )}

      <Panel title="Engine health" actions={
        <div className="flex gap-1.5" role="tablist">
          {a.engines.map((x, i) => (
            <button key={x.id} role="tab" aria-selected={i === tab} onClick={() => setTab(i)}
              className={`rounded-full border px-3 py-1 text-sm ${i === tab ? 'border-accent bg-accent/10 text-accent' : 'border-line2 text-muted hover:text-ink'}`}>
              Engine {x.position} · {x.serial}
            </button>
          ))}
        </div>}>
        <EngineTab e={e} horizon={H} />
      </Panel>

      <Panel title="Planned work">
        <div className="mb-3 space-y-2">
          <Gantt horizon={H} startDate={a.start_date}
            lines={(['optimized', 'baseline'] as const).map((s) => ({ key: s, aircraftId: a.aircraft.id, baseId: a.aircraft.base_id, side: s,
              row: a.timeline[s], caption: s === 'optimized' ? 'Optimised' : 'Reactive' }))} />
        </div>
        {a.planned_work.length === 0 ? <EmptyState title="No work planned for this aircraft inside the horizon" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left">
                {['Task', 'Type', 'Start', 'Days', 'Parts', 'Reason', 'Reactive baseline instead'].map((h) => <th key={h} className="label-caps py-2 pr-3 font-normal">{h}</th>)}
              </tr></thead>
              <tbody>
                {a.planned_work.map((w) => (
                  <tr key={w.job_id} className="border-b border-line/60 align-top">
                    <td className="py-2 pr-3 text-ink">{w.name}</td>
                    <td className="py-2 pr-3 text-muted">{{ scheduled: 'Scheduled inspection', preventive: 'Predictive maintenance', corrective: 'Unplanned failure repair' }[w.kind] ?? w.kind}</td>
                    <td className="num py-2 pr-3">{w.start != null ? `Day ${w.start} · ${dayDate(a.start_date, w.start)}` : 'Not started in horizon'}</td>
                    <td className="num py-2 pr-3">{w.duration}</td>
                    <td className="py-2 pr-3 text-muted">{w.parts.length ? `${w.parts.join(', ')} (${w.part_source})` : 'None'}</td>
                    <td className="max-w-[360px] py-2 pr-3 text-xs text-muted">{w.reason}</td>
                    <td className="max-w-[260px] py-2 pr-3 text-xs text-muted">{w.reactive || 'Same as the optimised plan'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Parts">
          {a.parts.length === 0 && a.cannibalizations.length === 0 ? <EmptyState title="This aircraft needs no parts in the plan" /> : (
            <div className="space-y-3">
              {a.parts.length > 0 && (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-line text-left">
                    {['Part', 'For task', 'Source', 'Available', 'Planned start'].map((h) => <th key={h} className="label-caps py-2 pr-3 font-normal">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {a.parts.map((p) => (
                      <tr key={p.job_id + p.part_id} className="border-b border-line/60">
                        <td className="py-2 pr-3"><span className="text-dim">{p.part_id}</span> {p.name}{p.shortfall > 0 && <span className="ml-1 text-xs text-bad">(fleet shortfall {p.shortfall})</span>}</td>
                        <td className="py-2 pr-3 text-xs text-muted">{p.job_id}</td>
                        <td className="py-2 pr-3 text-muted">{p.source}</td>
                        <td className="num py-2 pr-3">Day {p.available_day}</td>
                        <td className="num py-2 pr-3">Day {p.start}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {a.cannibalizations.map((c) => (
                <div key={c.job_id} className="rounded-xl border border-k-cannibal/40 bg-k-cannibal/[0.06] px-3 py-2 text-sm">
                  {c.role === 'donor'
                    ? <>Donor: {c.part_name} removed for <Link className="text-accent hover:underline" to={link(`/app/fleet/${c.aircraft_id}`)}>{c.aircraft_id}</Link>, fitted Day {c.day}.</>
                    : <>Receiver: {c.part_name} taken from <Link className="text-accent hover:underline" to={link(`/app/fleet/${c.donor}`)}>{c.donor}</Link>, fitted Day {c.day}.</>}
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Recommendations">
          {a.recommendations.length === 0 ? <EmptyState title="No changes from the reactive baseline for this aircraft" />
            : <div className="space-y-2">{a.recommendations.map((r) => <RecommendationCard key={r.id} r={r} />)}</div>}
        </Panel>
      </div>

      <Panel title="Maintenance history" actions={meta.data && <SimulatedLabel origin={meta.data.data_origin} />}>
        {a.log.length === 0 ? <EmptyState title="No log entries" /> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left">
              {['Day', 'Category', 'Entry', 'Tech hours'].map((h) => <th key={h} className="label-caps py-2 pr-3 font-normal">{h}</th>)}
            </tr></thead>
            <tbody>
              {[...a.log].reverse().map((l) => (
                <tr key={l.id} className="border-b border-line/60 align-top">
                  <td className="num w-20 py-1.5 pr-3 text-dim">Day {l.day}</td>
                  <td className="w-36 py-1.5 pr-3 text-muted">{l.category.replace('_', ' ')}</td>
                  <td className="py-1.5 pr-3 text-ink">{l.description}</td>
                  <td className="num w-24 py-1.5 text-right text-dim">{l.tech_hours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}

export default function AircraftDetail() {
  const { tail = '' } = useParams()
  const { scenario } = useConsoleParams()
  const q = useAircraft(tail, scenario)
  return (
    <QueryView q={q} skeleton={<div className="space-y-4"><Skeleton h={70} /><Skeleton h={360} /><Skeleton h={200} /></div>}>
      {(a) => <Body key={tail} a={a} />}
    </QueryView>
  )
}
