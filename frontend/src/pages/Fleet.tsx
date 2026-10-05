import { Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, EmptyState, Panel, QueryView, RulBar, SortTable, StatusBadge, type Column } from '../components/ui'
import type { FleetRow, FleetStatus } from '../lib/api'
import { dayDate, downloadCsv, STATUS_LABEL } from '../lib/format'
import { useConsoleParams } from '../lib/params'
import { useFleet } from '../lib/queries'

export default function Fleet() {
  const { base, link } = useConsoleParams()
  const q = useFleet(undefined, base)
  const navigate = useNavigate()
  const [status, setStatus] = useState<FleetStatus | ''>('')
  const [shortOnly, setShortOnly] = useState(false)
  const [p10Max, setP10Max] = useState('')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => (q.data?.aircraft ?? []).filter((a) =>
    (!status || a.status === status) && (!shortOnly || a.part_shortages.length > 0)
    && (p10Max === '' || a.worst_engine.p10_days < Number(p10Max))
    && a.id.toLowerCase().includes(search.trim().toLowerCase())), [q.data, status, shortOnly, p10Max, search])

  const H = q.data?.horizon_days ?? 0
  const start = q.data?.start_date ?? ''
  const scale = Math.max(H * 2, ...filtered.map((a) => Math.min(a.worst_engine.p90_days, H * 3)))
  const cols: Column<FleetRow>[] = [
    { key: 'tail', label: 'Tail', value: (r) => r.id, render: (r) => <span className="display text-[15px] font-medium">{r.id}</span> },
    { key: 'base', label: 'Base', value: (r) => r.base_id },
    { key: 'status', label: 'Status', value: (r) => STATUS_LABEL[r.status], render: (r) => <StatusBadge status={r.status} /> },
    { key: 'engine', label: 'Lowest engine', value: (r) => r.worst_engine.engine_id },
    { key: 'p10', label: 'RUL P10, days', value: (r) => r.worst_engine.p10_days, align: 'right' },
    { key: 'p50', label: 'P50', value: (r) => r.worst_engine.p50_days, align: 'right' },
    { key: 'p90', label: 'P90', value: (r) => r.worst_engine.p90_days, align: 'right' },
    { key: 'bar', label: 'Range', value: (r) => r.worst_engine.p50_days, width: '120px',
      render: (r) => r.grounded_all_horizon ? <span className="text-xs text-dim">Grounded</span>
        : <RulBar p10={r.worst_engine.p10_days} p50={r.worst_engine.p50_days} p90={r.worst_engine.p90_days} scale={scale} horizon={H} /> },
    { key: 'next', label: 'Next task', value: (r) => r.next_task?.label ?? null,
      render: (r) => r.next_task ? r.next_task.label.replace(/ \(.*\)/, '') : <span className="text-dim">None in horizon</span> },
    { key: 'date', label: 'Starts', value: (r) => r.days_to_next_task,
      render: (r) => r.next_task ? <span className="num">Day {r.next_task.start} · {dayDate(start, r.next_task.start)}</span> : '—' },
    { key: 'short', label: 'Part shortages', value: (r) => r.part_shortages.join(', ') || null,
      render: (r) => r.part_shortages.length ? <span className="text-bad">{r.part_shortages.join(', ')}</span> : <span className="text-dim">None</span> },
  ]

  const exportCsv = () => downloadCsv('aeroready-fleet.csv',
    ['tail', 'base', 'status', 'lowest_engine', 'rul_p10_days', 'rul_p50_days', 'rul_p90_days', 'next_task', 'next_task_day', 'part_shortages'],
    filtered.map((r) => [r.id, r.base_id, STATUS_LABEL[r.status], r.worst_engine.engine_id, r.worst_engine.p10_days,
      r.worst_engine.p50_days, r.worst_engine.p90_days, r.next_task?.label, r.days_to_next_task, r.part_shortages.join(' ')]))

  return (
    <Panel flush title={q.data ? `Aircraft (${filtered.length} of ${q.data.aircraft.length})` : 'Aircraft'}
      actions={<Button onClick={exportCsv} disabled={!filtered.length} icon={<Download className="h-3.5 w-3.5" />}>Export CSV</Button>}>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 text-xs text-muted">
        <input type="search" placeholder="Search tail number" value={search} onChange={(e) => setSearch(e.target.value)} className="w-48" aria-label="Search tail number" />
        <select value={status} onChange={(e) => setStatus(e.target.value as FleetStatus | '')} aria-label="Status filter">
          <option value="">All statuses</option>
          {(Object.keys(STATUS_LABEL) as FleetStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <label className="flex items-center gap-2"><input type="checkbox" checked={shortOnly} onChange={(e) => setShortOnly(e.target.checked)} />Has part shortage</label>
        <label className="flex items-center gap-2">RUL P10 under
          <input type="number" min={0} value={p10Max} onChange={(e) => setP10Max(e.target.value)} placeholder="any" className="num w-20" />days
        </label>
      </div>
      <QueryView q={q}>
        {(d) => d.aircraft.length === 0 ? <EmptyState title="No aircraft at this base" /> : (
          <SortTable rows={filtered} columns={cols} rowKey={(r) => r.id} initialSort={{ key: 'p10', dir: 'asc' }}
            onRowClick={(r) => navigate(link(`/app/fleet/${r.id}`))} highlight={(r) => r.part_shortages.length > 0}
            empty={<EmptyState title="No aircraft match these filters" />} />
        )}
      </QueryView>
    </Panel>
  )
}
