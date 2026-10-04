import { ArrowRight } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import AvailabilityChart, { SERIES_COLORS } from '../components/AvailabilityChart'
import { RecommendationCard } from '../components/Recommendations'
import { EmptyState, Panel, QueryView, Skeleton, SortTable, StatTile, type Column } from '../components/ui'
import type { WatchRow } from '../lib/api'
import { signed } from '../lib/format'
import { useConsoleParams } from '../lib/params'
import { useSummary } from '../lib/queries'

export default function Overview() {
  const { base, scenario, link } = useConsoleParams()
  const q = useSummary(scenario, base)
  const navigate = useNavigate()

  const watchCols: Column<WatchRow>[] = [
    { key: 'tail', label: 'Tail', value: (r) => r.aircraft_id,
      render: (r) => <Link to={link(`/app/fleet/${r.aircraft_id}`)} className="display text-[15px] font-semibold hover:text-accent">{r.aircraft_id}</Link> },
    { key: 'engine', label: 'Engine', value: (r) => r.engine_id },
    { key: 'base', label: 'Base', value: (r) => r.base_id },
    { key: 'p10', label: 'RUL P10 (days)', value: (r) => r.p10_days, align: 'right' },
    { key: 'p50', label: 'P50', value: (r) => r.p50_days, align: 'right' },
    { key: 'p90', label: 'P90', value: (r) => r.p90_days, align: 'right' },
    { key: 'plan', label: 'Optimised plan', value: (r) => r.optimized_action },
    { key: 'reactive', label: 'Reactive baseline', value: (r) => r.reactive_outcome,
      render: (r) => <span className={r.reactive_outcome.startsWith('Fails') ? 'text-bad' : 'text-muted'}>{r.reactive_outcome}</span> },
  ]

  return (
    <QueryView q={q} skeleton={
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={112} />)}</div>
        <Skeleton h={380} />
      </div>
    }>
      {(s) => (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatTile label="Mission-ready today" value={<>{s.mission_ready_today.optimized}<span className="text-2xl text-dim">/{s.fleet_size}</span></>}
              sub={`Day 0 under the optimised plan. Reactive baseline: ${s.mission_ready_today.reactive}.`} />
            <StatTile label={`Average availability, ${s.horizon_days} days`} value={s.avg_available.optimized.toFixed(1)}
              sub={`Aircraft per day, optimised. Reactive baseline: ${s.avg_available.reactive.toFixed(1)}.`} />
            <StatTile label="Aircraft-days gained" tone="accent" value={signed(s.aircraft_days.gain)}
              sub={`${s.aircraft_days.optimized} optimised minus ${s.aircraft_days.reactive} reactive.`} />
            <StatTile label="Aircraft at risk" tone={s.aircraft_at_risk.count ? 'bad' : 'ok'} value={s.aircraft_at_risk.count}
              sub={s.aircraft_at_risk.count ? `RUL P10 inside the horizon: ${s.aircraft_at_risk.tails.join(', ')}.` : 'No engine has its P10 inside the horizon.'} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <Panel title={`Mission-ready aircraft per day, next ${s.horizon_days} days`}>
              <AvailabilityChart startDate={s.start_date} maxY={s.fleet_size} surge={s.surge} height={340}
                diff={{ a: 'optimized', b: 'reactive', label: 'Difference' }}
                series={[
                  { key: 'reactive', label: 'Reactive baseline', data: s.series.reactive, color: SERIES_COLORS.reactive, dashed: true },
                  { key: 'optimized', label: 'Optimised plan', data: s.series.optimized, color: SERIES_COLORS.optimized },
                ]} />
              {s.surge && (
                <p className="mt-2 text-xs text-muted">
                  Surge target met on {s.surge_days.filter((d) => d.optimized >= d.target).length} of {s.surge_days.length} days in the optimised plan,
                  {' '}{s.surge_days.filter((d) => d.reactive >= d.target).length} in the reactive baseline.
                </p>
              )}
            </Panel>

            <Panel title="Top recommendations" actions={
              <Link to={link('/app/plan')} className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                View full plan <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>}>
              {s.top_recommendations.length === 0
                ? <EmptyState title="No recommendations" detail="The optimised plan makes no changes to the reactive baseline for this selection." />
                : <div className="space-y-2">{s.top_recommendations.map((r) => <RecommendationCard key={r.id} r={r} compact />)}</div>}
            </Panel>
          </div>

          <Panel title="Risk watchlist" actions={<span className="text-xs text-dim">Engines whose RUL P10 falls inside the {s.horizon_days}-day horizon, by P10</span>}>
            <SortTable rows={s.watchlist} columns={watchCols} rowKey={(r) => r.engine_id}
              initialSort={{ key: 'p10', dir: 'asc' }} onRowClick={(r) => navigate(link(`/app/fleet/${r.aircraft_id}`))}
              empty={<EmptyState title="No engines at risk" detail="No engine forecast has its P10 inside the planning horizon for this selection." />} />
          </Panel>
        </div>
      )}
    </QueryView>
  )
}
