import { Download, LayoutGrid, Search, Table2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, EmptyState, Panel, QueryView, RulBar, Segmented, Skeleton, SortTable, StatusBadge, type Column } from '../components/ui'
import type { FleetRow, FleetStatus } from '../lib/api'
import { dayDate, downloadCsv, STATUS_LABEL } from '../lib/format'
import { useConsoleParams } from '../lib/params'
import { useFleet } from '../lib/queries'

function FleetCard({ a, horizon, start, scale }: { a: FleetRow; horizon: number; start: string; scale: number }) {
  const { link } = useConsoleParams()
  const w = a.worst_engine
  const edge = { grounded: 'border-l-bad', at_risk: 'border-l-warn', scheduled: 'border-l-k-scheduled', ready: 'border-l-ok' }[a.status]
  return (
    <Link to={link(`/app/fleet/${a.id}`)} className={`panel block border-l-2 p-3 transition-colors hover:bg-panel2 ${edge}`}>
      <div className="flex items-center gap-2">
        <span className="display text-xl font-semibold leading-none">{a.id}</span>
        <span className="rounded bg-panel2 px-1.5 py-0.5 text-[10px] font-semibold text-muted">{a.base_id}</span>
        <span className="ml-auto"><StatusBadge status={a.status} /></span>
      </div>
      <div className="mt-2.5 flex items-baseline justify-between text-[11px]">
        <span className="text-muted">Lowest engine RUL P50 ({w.engine_id.split('-').pop()})</span>
        <span className="num"><span className="display text-base font-semibold text-ink">{w.p50_days.toFixed(0)}</span><span className="text-dim"> days</span></span>
      </div>
      <div className="mt-1"><RulBar p10={w.p10_days} p50={w.p50_days} p90={w.p90_days} scale={scale} horizon={horizon} /></div>
      <div className="num mt-1 flex justify-between text-[10px] text-dim"><span>P10 {w.p10_days.toFixed(0)}</span><span>P90 {w.p90_days.toFixed(0)}</span></div>
      <div className="mt-2 truncate border-t border-line pt-2 text-[11px]">
        <span className="text-dim">Next: </span>
        {a.next_task
          ? <span className="text-ink"><span className="num text-accent">{dayDate(start, a.next_task.start)}</span> {a.next_task.label.replace(/ \(.*\)/, '')}</span>
          : <span className="text-muted">{a.grounded_all_horizon ? 'Grounded all horizon' : 'No work planned in the horizon'}</span>}
      </div>
    </Link>
  )
}

export default function Fleet() {
  const { base, scenario, link } = useConsoleParams()
  const q = useFleet(scenario, base)
  const navigate = useNavigate()
  const [view, setView] = useState<'grid' | 'table'>('grid')
  const [status, setStatus] = useState<FleetStatus | ''>('')
  const [shortOnly, setShortOnly] = useState(false)
  const [p10Max, setP10Max] = useState<string>('')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => (q.data?.aircraft ?? []).filter((a) =>
    (!status || a.status === status) && (!shortOnly || a.part_shortages.length > 0)
    && (p10Max === '' || a.worst_engine.p10_days < Number(p10Max))
    && a.id.toLowerCase().includes(search.trim().toLowerCase())), [q.data, status, shortOnly, p10Max, search])

  const cols: Column<FleetRow>[] = [
    { key: 'tail', label: 'Tail', value: (r) => r.id, render: (r) => <span className="display text-[15px] font-semibold">{r.id}</span> },
    { key: 'base', label: 'Base', value: (r) => r.base_id },
    { key: 'status', label: 'Status', value: (r) => STATUS_LABEL[r.status], render: (r) => <StatusBadge status={r.status} /> },
    { key: 'p10', label: 'RUL P10', value: (r) => r.worst_engine.p10_days, align: 'right' },
    { key: 'p50', label: 'P50', value: (r) => r.worst_engine.p50_days, align: 'right' },
    { key: 'p90', label: 'P90', value: (r) => r.worst_engine.p90_days, align: 'right' },
    { key: 'next', label: 'Next task', value: (r) => r.next_task?.label ?? null },
    { key: 'days', label: 'Days to next', value: (r) => r.days_to_next_task, align: 'right' },
    { key: 'short', label: 'Part shortages', value: (r) => r.part_shortages.join(', ') || null },
  ]

  const exportCsv = () => downloadCsv('aeroready-fleet.csv',
    ['tail', 'base', 'status', 'lowest_engine', 'rul_p10_days', 'rul_p50_days', 'rul_p90_days', 'next_task', 'days_to_next_task', 'part_shortages'],
    filtered.map((r) => [r.id, r.base_id, STATUS_LABEL[r.status], r.worst_engine.engine_id, r.worst_engine.p10_days,
      r.worst_engine.p50_days, r.worst_engine.p90_days, r.next_task?.label, r.days_to_next_task, r.part_shortages.join(' ')]))

  return (
    <Panel title="Fleet status" actions={
      <>
        <Segmented label="View" value={view} onChange={setView} options={[
          { value: 'grid', label: <span className="inline-flex items-center gap-1"><LayoutGrid className="h-3.5 w-3.5" />Grid</span> },
          { value: 'table', label: <span className="inline-flex items-center gap-1"><Table2 className="h-3.5 w-3.5" />Table</span> },
        ]} />
        <Button onClick={exportCsv} disabled={!filtered.length} icon={<Download className="h-3.5 w-3.5" />}>Export CSV</Button>
      </>}>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-muted">
        <label className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim" aria-hidden />
          <input type="search" placeholder="Search tail number" value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-48 pl-7 text-sm" aria-label="Search tail number" />
        </label>
        <label className="flex items-center gap-2">Status
          <select value={status} onChange={(e) => setStatus(e.target.value as FleetStatus | '')} className="text-sm">
            <option value="">All</option>
            {(Object.keys(STATUS_LABEL) as FleetStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={shortOnly} onChange={(e) => setShortOnly(e.target.checked)} className="accent-[#f5a524]" />
          Has part shortage
        </label>
        <label className="flex items-center gap-2">RUL P10 under
          <input type="number" min={0} value={p10Max} onChange={(e) => setP10Max(e.target.value)} placeholder="any" className="num w-20 text-sm" />
          days
        </label>
        <span className="ml-auto">Base filter is set in the top bar.</span>
      </div>

      <QueryView q={q} skeleton={<div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} h={140} />)}</div>}>
        {(d) => {
          if (!d.aircraft.length) return <EmptyState title="No aircraft for this base" />
          if (!filtered.length) return <EmptyState title="No aircraft match these filters" detail="Clear a filter or the search to see more aircraft." />
          const scale = Math.max(d.horizon_days * 2, ...filtered.map((a) => Math.min(a.worst_engine.p90_days, d.horizon_days * 3)))
          return view === 'grid' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
              {filtered.map((a) => <FleetCard key={a.id} a={a} horizon={d.horizon_days} start={d.start_date} scale={scale} />)}
            </div>
          ) : (
            <SortTable rows={filtered} columns={cols} rowKey={(r) => r.id} initialSort={{ key: 'p10', dir: 'asc' }}
              onRowClick={(r) => navigate(link(`/app/fleet/${r.id}`))} highlight={(r) => r.part_shortages.length > 0} />
          )
        }}
      </QueryView>
      {q.data && <p className="mt-3 text-xs text-dim">RUL bar: P10 to P90 range in days, tick at P50, amber line at the end of the {q.data.horizon_days}-day horizon. Status is for Day 0 under the optimised plan.</p>}
    </Panel>
  )
}
