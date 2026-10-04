import { Link, useNavigate } from 'react-router-dom'
import AvailabilityChart, { SERIES_COLORS } from '../components/AvailabilityChart'
import { RecommendationTable } from '../components/Recommendations'
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
    { key: 'tail', label: 'Tail', value: (r) => r.aircraft_id, render: (r) => <span className="display text-[15px] font-semibold">{r.aircraft_id}</span> },
    { key: 'engine', label: 'Engine', value: (r) => r.engine_id },
    { key: 'base', label: 'Base', value: (r) => r.base_id },
    { key: 'p10', label: 'RUL P10, days', value: (r) => r.p10_days, align: 'right' },
    { key: 'p50', label: 'P50', value: (r) => r.p50_days, align: 'right' },
    { key: 'p90', label: 'P90', value: (r) => r.p90_days, align: 'right' },
    { key: 'plan', label: 'Optimised plan', value: (r) => r.optimized_action },
    { key: 'reactive', label: 'Reactive baseline', value: (r) => r.reactive_outcome,
      render: (r) => <span className={r.reactive_outcome.startsWith('Fails') ? 'text-bad' : 'text-muted'}>{r.reactive_outcome}</span> },
  ]

  return (
    <QueryView q={q} skeleton={<div className="space-y-4"><div className="grid grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={96} />)}</div><Skeleton h={360} /></div>}>
      {(s) => (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatTile label="Mission-ready today" value={<>{s.mission_ready_today.optimized}<span className="text-xl text-dim"> / {s.fleet_size}</span></>}
              sub={`Reactive baseline ${s.mission_ready_today.reactive}`} />
            <StatTile label={`Average available per day, ${s.horizon_days} days`} value={s.avg_available.optimized.toFixed(1)}
              sub={`Reactive baseline ${s.avg_available.reactive.toFixed(1)}`} />
            <StatTile label="Aircraft-days gained" value={signed(s.aircraft_days.gain)}
              sub={`${s.aircraft_days.optimized} optimised, ${s.aircraft_days.reactive} reactive`} />
            <StatTile label="Aircraft at risk" tone={s.aircraft_at_risk.count ? 'bad' : 'ok'} value={s.aircraft_at_risk.count}
              sub={s.aircraft_at_risk.count ? s.aircraft_at_risk.tails.join(', ') : 'None'} />
          </div>

          <Panel title={`Mission-ready aircraft per day, next ${s.horizon_days} days`}>
            <AvailabilityChart startDate={s.start_date} maxY={s.fleet_size} surge={s.surge} height={300}
              diff={{ a: 'optimized', b: 'reactive', label: 'Difference' }}
              series={[
                { key: 'reactive', label: 'Reactive baseline', data: s.series.reactive, color: SERIES_COLORS.reactive, dashed: true },
                { key: 'optimized', label: 'Optimised plan', data: s.series.optimized, color: SERIES_COLORS.optimized },
              ]} />
            {s.surge && (
              <p className="mt-2 text-xs text-muted">
                Surge target met on {s.surge_days.filter((d) => d.optimized >= d.target).length} of {s.surge_days.length} days (optimised),{' '}
                {s.surge_days.filter((d) => d.reactive >= d.target).length} (reactive).
              </p>
            )}
          </Panel>

          <Panel title="Highest-impact recommendations" flush
            actions={<Link to={link('/app/plan')} className="text-[13px] text-muted hover:text-ink">Open plan</Link>}>
            <RecommendationTable recs={s.top_recommendations} empty="No changes from the reactive baseline for this selection" />
          </Panel>

          <Panel title="Engines with RUL P10 inside the horizon" flush>
            <SortTable rows={s.watchlist} columns={watchCols} rowKey={(r) => r.engine_id}
              initialSort={{ key: 'p10', dir: 'asc' }} onRowClick={(r) => navigate(link(`/app/fleet/${r.aircraft_id}`))}
              empty={<EmptyState title="No engine has its P10 inside the horizon" />} />
          </Panel>
        </div>
      )}
    </QueryView>
  )
}
