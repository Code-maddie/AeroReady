import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  Area, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { AircraftDetail, EngineDetail, FleetAircraft, Job } from '../api'
import Gantt from '../components/Gantt'
import { StatusBadge, StatusDot } from '../components/Status'
import { Empty, ErrorState, Loading } from '../components/States'
import { useApi, useBase } from '../hooks'

const axis = { tick: { fill: '#6e6b66', fontSize: 11 }, axisLine: { stroke: '#3a3936' }, tickLine: false as const }

function RulBandChart({ e }: { e: EngineDetail }) {
  const h = e.rul_history
  const rows = h.cycle.map((c, i) => ({ cycle: c, band: [h.p10[i], h.p90[i]] as [number, number], p50: h.p50[i] }))
  const now = h.cycle[h.cycle.length - 1]
  return (
    <div className="h-[230px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="#262523" vertical={false} />
          <XAxis dataKey="cycle" type="number" domain={['dataMin', 'dataMax']} {...axis} tickFormatter={(c) => `${c}`} />
          <YAxis domain={[0, 130]} {...axis} width={40} />
          <ReferenceLine x={now} stroke="#E9A15B" strokeDasharray="3 3" label={{ value: 'now', fill: '#E9A15B', fontSize: 11, position: 'insideTopRight' }} />
          <Area dataKey="band" stroke="none" fill="#3fb7a6" fillOpacity={0.18} isAnimationActive={false} name="P10–P90" />
          <Line dataKey="p50" stroke="#3fb7a6" strokeWidth={2} dot={false} isAnimationActive={false} name="P50" />
          <Tooltip cursor={{ stroke: '#a7a39c', strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const r = payload[0].payload as (typeof rows)[number]
              return (
                <div className="num rounded border border-line2 bg-[#141413]/95 px-3 py-2 text-xs">
                  <div className="font-semibold text-ink">Cycle {r.cycle}</div>
                  <div className="text-muted">RUL P50 <span className="text-ink">{r.p50}</span> cycles</div>
                  <div className="text-muted">P10–P90 <span className="text-ink">{r.band[0]}–{r.band[1]}</span></div>
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
  // 10-cycle trailing mean over the raw (noisy) sensor reading.
  const rows = e.sensor_trend.cycle.map((c, i) => {
    const win = ys.slice(Math.max(0, i - 9), i + 1)
    return { cycle: c, v: ys[i], avg: win.reduce((a, b) => a + b, 0) / win.length }
  })
  return (
    <div className="rounded border border-line bg-panel2/40 p-2">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="truncate text-muted" title={name}>{name}</span>
        <span className="num ml-2 text-ink">{ys[ys.length - 1]}</span>
      </div>
      <div className="h-[70px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
            <YAxis domain={['auto', 'auto']} hide />
            <XAxis dataKey="cycle" hide />
            <Line dataKey="v" stroke="#6e6b66" strokeWidth={1} dot={false} isAnimationActive={false} />
            <Line dataKey="avg" stroke="#e6edf3" strokeWidth={1.75} dot={false} isAnimationActive={false} />
            <Tooltip cursor={{ stroke: '#6e6b66' }} content={({ active, payload }) => active && payload?.length ? (
              <div className="num rounded border border-line2 bg-[#141413]/95 px-2 py-1 text-[11px]">
                cycle {(payload[0].payload as { cycle: number }).cycle}: <span className="text-ink">{String(payload[0].value)}</span>
              </div>) : null} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function Contributions({ e }: { e: EngineDetail }) {
  const max = Math.max(...e.top_sensors.map((s) => Math.abs(s.contribution_cycles)), 1)
  return (
    <div className="space-y-1.5">
      {e.top_sensors.map((s) => (
        <div key={s.sensor} className="grid grid-cols-[150px_1fr_56px] items-center gap-2 text-xs">
          <span className="truncate text-muted" title={s.name}>{s.name}</span>
          <div className="relative h-2 rounded bg-line">
            <div className={`absolute top-0 h-2 rounded ${s.contribution_cycles < 0 ? 'bg-bad/80' : 'bg-ok/70'}`}
              style={{ width: `${(Math.abs(s.contribution_cycles) / max) * 100}%` }} />
          </div>
          <span className={`num text-right ${s.contribution_cycles < 0 ? 'text-bad' : 'text-ok'}`}>
            {s.contribution_cycles > 0 ? '+' : ''}{s.contribution_cycles.toFixed(1)}
          </span>
        </div>
      ))}
      <p className="pt-1 text-[11px] text-dim">Cycles of RUL each sensor adds (+) or removes (−) from the P50 forecast now (tree SHAP values).</p>
    </div>
  )
}

function EnginePanel({ e }: { e: EngineDetail }) {
  const d = e.plan_days ?? { p10_days: e.rul_days.p10, p50_days: e.rul_days.p50, p90_days: e.rul_days.p90 }
  const err = e.rul_cycles.p50 - Math.min(e.true_rul_cycles, 125)
  return (
    <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4">
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <div className="label-caps">Remaining useful life · cycles</div>
          <div className="text-[11px] text-dim">{e.cmapss} · {e.cycles_observed} cycles observed</div>
        </div>
        <RulBandChart e={e} />
        <div className="mt-2 grid grid-cols-4 gap-2">
          {([['P10', d.p10_days, e.rul_cycles.p10], ['P50', d.p50_days, e.rul_cycles.p50], ['P90', d.p90_days, e.rul_cycles.p90]] as const).map(([k, days, cyc]) => (
            <div key={k} className="rounded border border-line bg-panel2/40 px-2.5 py-1.5">
              <div className="label-caps">{k}</div>
              <div className="display num text-xl font-semibold">{days.toFixed(1)}<span className="text-xs text-dim"> d</span></div>
              <div className="num text-[10px] text-dim">{cyc.toFixed(0)} cycles</div>
            </div>
          ))}
          <div className="rounded border border-dashed border-line2 px-2.5 py-1.5" title="C-MAPSS ground truth for this test engine; shown for validation only, never used by the planner">
            <div className="label-caps">Truth (validation)</div>
            <div className="display num text-xl font-semibold text-muted">{e.true_rul_cycles}<span className="text-xs text-dim"> cyc</span></div>
            <div className="num text-[10px] text-dim">P50 error {err > 0 ? '+' : ''}{err.toFixed(0)}</div>
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-dim">Days = cycles ÷ {e.sortie_rate} sorties/day. Engine repair part: {e.repair_part_id}.</p>
      </div>
      <div className="space-y-4">
        <div>
          <div className="label-caps mb-2">Contributing sensors</div>
          <Contributions e={e} />
        </div>
        <div>
          <div className="label-caps mb-2">Sensor trends · last {e.sensor_trend.cycle.length} cycles <span className="normal-case tracking-normal text-dim">(raw · 10-cycle mean)</span></div>
          <div className="grid grid-cols-2 gap-2">
            {e.top_sensors.slice(0, 4).filter((s) => e.sensor_trend[s.sensor]).map((s) => (
              <SensorTrend key={s.sensor} e={e} sensor={s.sensor} name={s.name} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Detail({ id }: { id: string }) {
  const det = useApi<AircraftDetail>(`/api/aircraft/${id}`)
  const [eng, setEng] = useState(0)
  if (det.error) return <ErrorState message={det.error} onRetry={det.reload} />
  if (!det.data) return <Loading label={`Loading ${id}`} />
  const a = det.data
  const e = a.engines[Math.min(eng, a.engines.length - 1)]
  const jobs = Object.fromEntries(a.tasks.map((t) => [t.id, t])) as Record<string, Job>
  const delta = a.timeline.optimized.available_days - a.timeline.baseline.available_days

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="display num text-4xl font-medium leading-none">{a.aircraft.id}</h1>
            <StatusBadge status={a.status} />
          </div>
          <div className="mt-1.5 text-sm text-muted">{a.aircraft.type} · {a.base.name} ({a.base.id}) · {a.aircraft.sortie_rate} sorties/day</div>
          <div className="mt-0.5 text-xs text-dim">{a.status_reason}</div>
        </div>
        <div className="panel px-4 py-2 text-right">
          <div className="label-caps">Mission-ready days (30)</div>
          <div className="display num text-2xl font-semibold">
            <span className="text-accent">{a.timeline.optimized.available_days}</span>
            <span className="text-base text-dim"> vs {a.timeline.baseline.available_days} reactive</span>
          </div>
          {delta !== 0 && <div className="num text-xs text-accent">{delta > 0 ? '+' : ''}{delta} aircraft-days</div>}
        </div>
      </div>

      {a.aircraft.grounding && (
        <div className="panel hatch-grey border-line2 p-3 text-sm">
          <span className="display font-semibold text-ink">Grounded · </span>
          <span className="text-ink">{a.aircraft.grounding.reason}</span>
          {Object.keys(a.aircraft.grounding.donor_parts).length > 0 && (
            <span className="text-muted"> · serviceable donor parts: {Object.entries(a.aircraft.grounding.donor_parts).map(([p, q]) => `${p} ×${q}`).join(', ')}</span>
          )}
        </div>
      )}

      <section className="panel p-4">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="display mr-2 text-lg font-semibold">Engine health</h2>
          {a.engines.map((x, i) => (
            <button key={x.id} onClick={() => setEng(i)}
              className={`display rounded border px-3 py-0.5 text-sm font-semibold ${i === eng ? 'border-accent bg-accent/10 text-accent' : 'border-line2 text-muted hover:text-ink'}`}>
              {x.id.slice(-2)} · {x.serial}
            </button>
          ))}
        </div>
        <EnginePanel e={e} />
      </section>

      <section className="panel p-4">
        <h2 className="display mb-2 text-lg font-semibold">Timeline</h2>
        <div className="space-y-3">
          {(['baseline', 'optimized'] as const).map((s) => (
            <div key={s}>
              <div className="label-caps mb-1">{s === 'optimized' ? 'Optimised plan' : 'Reactive baseline'}</div>
              <Gantt rows={[a.timeline[s]]} horizon={30} startDate="2026-10-05" jobs={jobs} linkRows={false} />
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4">
        <section className="panel p-4">
          <h2 className="display mb-2 text-lg font-semibold">Recommendations</h2>
          {a.recommendations.length === 0 && <Empty text="No changes versus the reactive plan." />}
          <div className="space-y-2">
            {a.recommendations.map((r) => (
              <div key={r.id} className="rounded border border-line bg-panel2/40 p-2.5">
                <div className="text-[13px] font-semibold text-ink">{r.title}</div>
                <p className="mt-1 text-xs text-muted">{r.reason}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="panel p-4">
          <h2 className="display mb-2 text-lg font-semibold">Maintenance log · last 60 days</h2>
          {a.log.length === 0 && <Empty text="No entries." />}
          <table className="w-full text-xs">
            <tbody>
              {[...a.log].reverse().map((l) => (
                <tr key={l.id} className="border-b border-line/60 align-top">
                  <td className="num w-14 py-1.5 text-dim">D{l.day}</td>
                  <td className="w-28 py-1.5"><span className="rounded bg-panel2 px-1.5 py-0.5 text-[10px] text-muted">{l.category.replace('_', ' ')}</span></td>
                  <td className="py-1.5 text-ink">{l.description}</td>
                  <td className="num w-12 py-1.5 text-right text-dim">{l.tech_hours}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}

export default function Aircraft() {
  const { id } = useParams()
  const fleet = useApi<{ aircraft: FleetAircraft[] }>('/api/fleet')
  const { base } = useBase()
  if (!id) {
    if (fleet.error) return <ErrorState message={fleet.error} onRetry={fleet.reload} />
    if (!fleet.data) return <Loading label="Loading fleet" />
    const first = fleet.data.aircraft.find((a) => a.status === 'red' && !a.status_reason.startsWith('AOG')) ?? fleet.data.aircraft[0]
    return <Navigate to={`/aircraft/${first.id}`} replace />
  }
  const list = (fleet.data?.aircraft ?? []).filter((a) => base === 'ALL' || a.base_id === base)
  return (
    <div className="mx-auto grid max-w-[1500px] grid-cols-[150px_minmax(0,1fr)] gap-5">
      <nav className={`h-fit max-h-[calc(100vh-140px)] overflow-y-auto p-1.5 ${list.length || fleet.loading ? 'panel' : ''}`} aria-label="Aircraft">
        {fleet.loading && <Loading />}
        {list.map((a) => (
          <Link key={a.id} to={`/aircraft/${a.id}`}
            className={`flex items-center gap-2 rounded px-2 py-1.5 ${a.id === id ? 'bg-accent/10 text-accent' : 'text-ink hover:bg-panel2'}`}>
            <StatusDot status={a.status} />
            <span className="display num font-semibold">{a.id}</span>
            <span className="ml-auto text-[10px] text-dim">{a.base_id}</span>
          </Link>
        ))}
      </nav>
      <Detail key={id} id={id} />
    </div>
  )
}
