import { useState } from 'react'
import AvailabilityChart, { SERIES_COLORS } from '../../components/AvailabilityChart'
import { Button, EmptyState, Panel, QueryView, Select, Skeleton, SortTable, StatTile } from '../../components/ui'
import { dayDate, downloadCsv, signed } from '../../lib/format'
import { useMeta, useReport } from '../../lib/queries'

export default function Reports() {
  const meta = useMeta()
  const [from, setFrom] = useState(0)
  const [to, setTo] = useState<number | null>(null)
  const q = useReport(from, to)
  const H = meta.data?.horizon_days ?? 0
  const start = meta.data?.start_date
  const dayOpts = Array.from({ length: H }, (_, d) => ({ value: String(d), label: start ? `Day ${d}, ${dayDate(start, d)}` : `Day ${d}` }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <span className="text-[13px] text-muted">From</span>
        <Select label="From day" value={String(from)} onChange={(v) => setFrom(Number(v))} options={dayOpts} />
        <span className="text-[13px] text-muted">to</span>
        <Select label="To day" value={to == null ? String(Math.max(0, H - 1)) : String(to)} onChange={(v) => setTo(Number(v))} options={dayOpts} />
        <div className="ml-auto flex gap-2">
          <Button onClick={() => window.print()} disabled={!q.data}>Export PDF</Button>
          <Button disabled={!q.data} onClick={() => {
            const r = q.data!
            const rows: (string | number | null)[][] = [
              ...r.series.plan.map((v, i) => ['availability', `day ${r.from_day + i}`, 'plan', v, r.series.reactive[i]]),
              ...r.by_base.map((b) => ['readiness_by_base', b.base_id, 'mission_ready_today', b.mission_ready_today, b.avg_available]),
              ...r.risks.map((w) => ['top_risk', w.aircraft_id, w.engine_id, w.p10_days, w.optimized_action]),
              ...r.shortages.map((p) => ['part_shortage', p.part_id, p.name, p.shortfall, p.lead_time_days]),
              ...r.changes.map((c) => ['plan_change', c.aircraft_id, `${c.change}: ${c.task}`, c.from_day, c.to_day]),
            ]
            downloadCsv(`aeroready-report-day${r.from_day}-${r.to_day}.csv`, ['section', 'item', 'detail', 'value_1', 'value_2'], rows)
          }}>Export CSV</Button>
        </div>
      </div>
      <QueryView q={q} skeleton={<div className="space-y-4"><Skeleton h={96} /><Skeleton h={300} /></div>}>
        {(r) => {
          const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
          const days = r.series.plan.length
          return (
            <>
              <h2 className="display text-[19px] font-medium">Readiness report, day {r.from_day} to {r.to_day}{start ? ` (${dayDate(start, r.from_day)} to ${dayDate(start, r.to_day)})` : ''}. {r.plan_label}</h2>
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatTile label="Average available per day" value={(sum(r.series.plan) / days).toFixed(1)} sub={`Reactive baseline ${(sum(r.series.reactive) / days).toFixed(1)}`} />
                <StatTile label="Aircraft-days against reactive" value={signed(sum(r.series.plan) - sum(r.series.reactive))} sub={`${sum(r.series.plan)} plan, ${sum(r.series.reactive)} reactive`} />
                <StatTile label="Engines at risk in range" value={r.risks.length} tone={r.risks.length ? 'bad' : 'ok'} sub="P10 forecast inside the range" />
                <StatTile label="Parts short" value={r.shortages.length} tone={r.shortages.length ? 'bad' : 'ok'} sub="Demand above stock and inbound" />
              </div>
              <Panel title="Mission-ready aircraft per day">
                <AvailabilityChart startDate={r.start_date} dayOffset={r.from_day} maxY={r.fleet_size} height={260} diff={{ a: 'plan', b: 'reactive', label: 'Difference' }}
                  series={[
                    { key: 'reactive', label: 'Reactive baseline', data: r.series.reactive, color: SERIES_COLORS.reactive, dashed: true },
                    { key: 'plan', label: r.plan_label, data: r.series.plan, color: SERIES_COLORS.optimized },
                  ]} />
              </Panel>
              <Panel title="Readiness by base" flush>
                <SortTable sortable={false} rows={r.by_base} rowKey={(b) => b.base_id} columns={[
                  { key: 'b', label: 'Base', value: (b) => `${b.base_id} ${b.base_name}` },
                  { key: 'a', label: 'Aircraft', value: (b) => b.aircraft, align: 'right' },
                  { key: 't', label: 'Mission-ready today', value: (b) => b.mission_ready_today, align: 'right' },
                  { key: 'avg', label: 'Horizon average', value: (b) => b.avg_available.toFixed(1), align: 'right' },
                  { key: 'r', label: 'Aircraft at risk', value: (b) => b.aircraft_at_risk, align: 'right' },
                ]} />
              </Panel>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <Panel title={`Top risks (${r.risks.length})`} flush>
                  <SortTable sortable={false} rows={r.risks.slice(0, 10)} rowKey={(w) => w.engine_id} empty={<EmptyState title="No engine reaches its P10 forecast in this range" />} columns={[
                    { key: 'a', label: 'Aircraft', value: (w) => w.aircraft_id },
                    { key: 'e', label: 'Engine', value: (w) => w.engine_id },
                    { key: 'p', label: 'P10, days', value: (w) => w.p10_days, align: 'right' },
                    { key: 'o', label: 'Plan action', value: (w) => w.optimized_action },
                  ]} />
                </Panel>
                <Panel title={`Part shortages (${r.shortages.length})`} flush>
                  <SortTable sortable={false} rows={r.shortages} rowKey={(p) => p.part_id} empty={<EmptyState title="No part shortages" />} columns={[
                    { key: 'p', label: 'Part', value: (p) => `${p.part_id} ${p.name}` },
                    { key: 's', label: 'Shortfall', value: (p) => p.shortfall, align: 'right' },
                    { key: 'l', label: 'Lead time, days', value: (p) => p.lead_time_days, align: 'right' },
                  ]} />
                </Panel>
              </div>
              <Panel title={`Plan changes in range (${r.changes.length})`} flush>
                <SortTable rows={r.changes} rowKey={(c) => c.job_id} empty={<EmptyState title="No plan changes in this range" />} columns={[
                  { key: 'c', label: 'Change', value: (c) => c.change, render: (c) => c.change[0].toUpperCase() + c.change.slice(1) },
                  { key: 'a', label: 'Aircraft', value: (c) => c.aircraft_id },
                  { key: 't', label: 'Task', value: (c) => c.task },
                  { key: 'f', label: 'From day', value: (c) => c.from_day, align: 'right' },
                  { key: 'to', label: 'To day', value: (c) => c.to_day, align: 'right' },
                  { key: 'm', label: 'Planner comment', value: (c) => c.comment ?? '' },
                ]} />
              </Panel>
            </>
          )
        }}
      </QueryView>
    </div>
  )
}
