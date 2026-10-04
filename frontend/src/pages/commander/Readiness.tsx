import { Link } from 'react-router-dom'
import AvailabilityChart, { SERIES_COLORS } from '../../components/AvailabilityChart'
import { Badge, Button, EmptyState, Panel, QueryView, Skeleton, SortTable, StatTile } from '../../components/ui'
import { dateTime, signed } from '../../lib/format'
import { useConsoleParams } from '../../lib/params'
import { usePlansStatus, useReadinessByBase, useSummary } from '../../lib/queries'

export default function Readiness() {
  const { base, home } = useConsoleParams()
  const status = usePlansStatus()
  const q = useSummary('active', base)
  const byBase = useReadinessByBase('active')
  const w = status.data?.working

  return (
    <div className="space-y-4">
      {w?.status === 'Submitted' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-warn/60 bg-warn/10 px-4 py-2.5 text-[13px]" role="status">
          <span><span className="text-warn">Draft v{w.version} awaiting your approval.</span> Submitted by {w.submitted_by}, {dateTime(w.submitted_at)}.</span>
          <Link to={`/commander/approvals/${w.id}`}><Button variant="primary">Review plan</Button></Link>
        </div>
      )}
      <QueryView q={q} skeleton={<div className="space-y-4"><div className="grid grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={96} />)}</div><Skeleton h={320} /></div>}>
        {(s) => (
          <>
            <div className="flex items-center gap-2 text-[13px] text-muted">Figures for <Badge tone={s.plan ? 'ok' : 'neutral'}>{s.plan_label}</Badge></div>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <StatTile label="Mission-ready today" value={<>{s.mission_ready_today.optimized}<span className="text-xl text-dim"> / {s.fleet_size}</span></>}
                sub={`Reactive baseline ${s.mission_ready_today.reactive}`} />
              <StatTile label={`Average available per day, ${s.horizon_days} days`} value={s.avg_available.optimized.toFixed(1)}
                sub={`Reactive baseline ${s.avg_available.reactive.toFixed(1)}`} />
              <StatTile label="Aircraft-days gained" value={signed(s.aircraft_days.gain)} sub={`${s.aircraft_days.optimized} plan, ${s.aircraft_days.reactive} reactive`} />
              <StatTile label="Aircraft at risk in the horizon" tone={s.aircraft_at_risk.count ? 'bad' : 'ok'} value={s.aircraft_at_risk.count}
                sub={s.aircraft_at_risk.count ? s.aircraft_at_risk.tails.join(', ') : 'None'} />
            </div>
            <Panel title={`Mission-ready aircraft per day, next ${s.horizon_days} days`}>
              <AvailabilityChart startDate={s.start_date} maxY={s.fleet_size} surge={s.surge} height={300} diff={{ a: 'plan', b: 'reactive', label: 'Difference' }}
                series={[
                  { key: 'reactive', label: 'Reactive baseline', data: s.series.reactive, color: SERIES_COLORS.reactive, dashed: true },
                  { key: 'plan', label: s.plan_label, data: s.series.optimized, color: SERIES_COLORS.optimized },
                ]} />
            </Panel>
          </>
        )}
      </QueryView>
      <Panel title="Readiness by base" flush>
        <QueryView q={byBase}>
          {(d) => (
            <SortTable rows={d.rows} rowKey={(r) => r.base_id} sortable={false} empty={<EmptyState title="No bases" />}
              columns={[
                { key: 'base', label: 'Base', value: (r) => r.base_id, render: (r) => <Link to={`${home}/fleet?base=${r.base_id}`} className="text-ink hover:text-accent">{r.base_id} · {r.base_name}</Link> },
                { key: 'ac', label: 'Aircraft', value: (r) => r.aircraft, align: 'right' },
                { key: 'today', label: 'Mission-ready today', value: (r) => r.mission_ready_today, align: 'right' },
                { key: 'avg', label: `${d.horizon_days}-day average`, value: (r) => r.avg_available, align: 'right',
                  render: (r) => <span>{r.avg_available.toFixed(1)} <span className="text-dim">({r.avg_available_reactive.toFixed(1)} reactive)</span></span> },
                { key: 'risk', label: 'Aircraft at risk', value: (r) => r.aircraft_at_risk, align: 'right',
                  render: (r) => <span className={r.aircraft_at_risk ? 'text-bad' : 'text-dim'}>{r.aircraft_at_risk}</span> },
                { key: 'short', label: 'Open part shortages', value: (r) => r.part_shortages.length,
                  render: (r) => r.part_shortages.length ? <span className="text-bad">{r.part_shortages.join(', ')}</span> : <span className="text-dim">None</span> },
              ]} />
          )}
        </QueryView>
      </Panel>
    </div>
  )
}
