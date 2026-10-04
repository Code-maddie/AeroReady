import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { availabilityFor, type FleetAircraft, type PlanResult } from '../api'
import AircraftCard from '../components/AircraftCard'
import AvailabilityChart from '../components/AvailabilityChart'
import { PageHead } from '../components/Layout'
import { StatTile } from '../components/StatTile'
import { Empty, ErrorState, Loading } from '../components/States'
import { useApi, useBase } from '../hooks'

const RANK = { red: 0, amber: 1, green: 2 }
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

export default function Readiness() {
  const plan = useApi<PlanResult>('/api/plan')
  const fleet = useApi<{ aircraft: FleetAircraft[] }>('/api/fleet')
  const { base } = useBase()

  const view = useMemo(() => {
    if (!plan.data) return null
    const p = plan.data
    const pick = (rows: PlanResult['baseline']['gantt']) => rows.filter((r) => base === 'ALL' || r.base_id === base)
    const b = availabilityFor(pick(p.baseline.gantt), p.horizon_days)
    const o = availabilityFor(pick(p.optimized.gantt), p.horizon_days)
    return { b, o, gain: sum(o) - sum(b), n: pick(p.optimized.gantt).length, avgB: sum(b) / p.horizon_days, avgO: sum(o) / p.horizon_days }
  }, [plan.data, base])

  if (plan.error) return <ErrorState message={plan.error} onRetry={plan.reload} />
  if (!plan.data || !view) return <Loading label="Computing fleet plan" />
  const p = plan.data
  const aircraft = (fleet.data?.aircraft ?? []).filter((a) => base === 'ALL' || a.base_id === base)
  const critical = aircraft.filter((a) => a.status === 'red')
  const watch = aircraft.filter((a) => a.status === 'amber')
  const inBase = (id: string) => base === 'ALL' || p.baseline.gantt.find((r) => r.aircraft_id === id)?.base_id === base
  const failuresAvoided = p.baseline.unplanned_failures.filter((f) => inBase(f.aircraft_id)).length
    - p.optimized.unplanned_failures.filter((f) => inBase(f.aircraft_id)).length
  const top = p.recommendations.filter((r) => base === 'ALL' || r.base_id === base).slice(0, 4)
  const sorted = [...aircraft].sort((a, b) => RANK[a.status] - RANK[b.status] || a.worst_engine.p50_days - b.worst_engine.p50_days)

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <PageHead
        title={<><span className="num">{view.gain >= 0 ? '+' : ''}{view.gain}</span> mission-ready aircraft-days over the next 30 days{base !== 'ALL' ? ` at ${base}` : ''}.</>}
        sub="Same fleet, same hangars, same spares.">
        <Link to="/plan" className="mb-1 inline-flex shrink-0 items-center gap-3 rounded-full bg-panel py-1.5 pl-4 pr-1.5 text-[13px] ring-1 ring-white/10 hover:bg-panel2">
          Open the plan
          <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-bg" aria-hidden>
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
          </span>
        </Link>
      </PageHead>
      <div>
        <div>
          <p className="-mt-3 max-w-3xl text-sm text-muted">
            Scheduling maintenance around forecast engine health, bay capacity and parts
            lifts average availability from <span className="num text-ink">{view.avgB.toFixed(1)}</span> to{' '}
            <span className="num text-accent">{view.avgO.toFixed(1)}</span> aircraft per day
            {failuresAvoided > 0 && <> and avoids <span className="num text-ink">{failuresAvoided}</span> unplanned engine failures</>}.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatTile label="Mission-ready today" value={<>{view.o[0]}<span className="text-2xl text-dim">/{view.n}</span></>}
          sub={`Day 0, optimised plan · reactive ${view.b[0]}`} />
        <StatTile label="Avg availability (30 d)" value={view.avgO.toFixed(1)}
          sub={<>Optimised vs <span className="num text-ink">{view.avgB.toFixed(1)}</span> reactive aircraft/day</>} />
        <StatTile label="Aircraft-days gained" tone="accent" value={<>{view.gain >= 0 ? '+' : ''}{view.gain}</>}
          sub={<><span className="num">{sum(view.o)}</span> vs <span className="num">{sum(view.b)}</span> over 30 days</>} />
        <StatTile label="Critical risks" tone={critical.length ? 'bad' : 'ok'} value={critical.length}
          sub={<>{critical.map((a) => a.id).join(', ') || 'None'} · {watch.length} on watch</>} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-4">
        <section className="panel min-w-0 p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="display text-lg font-semibold">Mission-ready aircraft per day</h2>
            <span className="text-xs text-dim">CP-SAT {p.optimized.solver?.status.toLowerCase()} in {p.optimized.solver?.wall_time_s}s</span>
          </div>
          <AvailabilityChart startDate={p.start_date} maxY={view.n} height={400}
            series={[
              { key: 'reactive', label: 'Reactive maintenance (today)', data: view.b, style: 'reactive' },
              { key: 'optimized', label: 'AeroReady optimised plan', data: view.o, style: 'optimized' },
            ]} />
        </section>
        <section className="panel flex flex-col p-4">
          <h2 className="display text-lg font-semibold">Top actions</h2>
          <div className="mt-2 flex-1 space-y-2.5">
            {top.length === 0 && <Empty text="No actions for this base." />}
            {top.map((r) => (
              <Link key={r.id} to="/plan" className="block rounded border border-line bg-panel2/50 p-2.5 hover:border-line2">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[13px] font-medium leading-snug text-ink">{r.title}</div>
                  <span className="num shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[11px] font-semibold text-accent">
                    {r.aircraft_delta >= 0 ? '+' : ''}{r.aircraft_delta}d
                  </span>
                </div>
                <div className="mt-1 line-clamp-2 text-[11px] text-muted">{r.reason}</div>
              </Link>
            ))}
          </div>
          <Link to="/plan" className="mt-3 text-xs text-accent hover:underline">All {p.recommendations.length} recommendations</Link>
        </section>
      </div>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="display text-lg font-semibold">Fleet status</h2>
          <span className="text-xs text-dim">{aircraft.length} aircraft · sorted by risk · bar: RUL P10–P90 (0–60 d), tick = P50, amber line = 30-day horizon</span>
        </div>
        {fleet.error && <ErrorState message={fleet.error} onRetry={fleet.reload} />}
        {fleet.loading && <Loading label="Loading fleet" />}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
          {sorted.map((a) => <AircraftCard key={a.id} a={a} />)}
        </div>
      </section>
    </div>
  )
}
