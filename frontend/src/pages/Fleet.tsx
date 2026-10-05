import { Download, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, EmptyState, ErrorBox, Select, Skeleton } from '../components/ui'
import type { FleetRow, FleetStatus } from '../lib/api'
import { dayDate, downloadCsv, STATUS_LABEL } from '../lib/format'
import { useConsoleParams } from '../lib/params'
import { useFleet } from '../lib/queries'

/** Groups in the order a commander reads them: what needs attention first. */
const ORDER: FleetStatus[] = ['at_risk', 'grounded', 'scheduled', 'ready']
const TONE: Record<FleetStatus, { bar: string; dot: string; text: string }> = {
  at_risk: { bar: 'bg-warn', dot: 'bg-warn', text: 'text-warn' },
  grounded: { bar: 'bg-bad', dot: 'bg-bad', text: 'text-bad' },
  scheduled: { bar: 'bg-[#8b6b5e]', dot: 'bg-[#8b6b5e]', text: 'text-[#8b6b5e]' },
  ready: { bar: 'bg-ok', dot: 'bg-ok', text: 'text-ok' },
}

type Sort = 'life' | 'task' | 'tail'

const pct = (day: number, H: number) => `${Math.max(0, Math.min(100, (day / H) * 100))}%`

/** One aircraft's next H days: engine-life band P10 to P90, median tick, P10 dot, next task diamond. */
function Runway({ a, H }: { a: FleetRow; H: number }) {
  const e = a.worst_engine
  const beyond = e.p10_days >= H
  return (
    <div className="relative h-9" role="img"
      aria-label={`${a.id}: engine life P10 ${e.p10_days}, P50 ${e.p50_days}, P90 ${e.p90_days} days${a.next_task ? `; next task day ${a.next_task.start}` : ''}`}>
      <div className={`absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full ${a.grounded_all_horizon ? 'hatch-red opacity-70' : 'bg-panel2'}`} />
      {!a.grounded_all_horizon && !beyond && (
        <>
          <div className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-[#c9a27e]/70"
            style={{ left: pct(e.p10_days, H), right: `calc(100% - ${pct(e.p90_days, H)})` }} />
          {e.p50_days <= H && <div className="absolute top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-ink" style={{ left: pct(e.p50_days, H) }} />}
          <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bad ring-2 ring-white" style={{ left: pct(e.p10_days, H) }} />
        </>
      )}
      {!a.grounded_all_horizon && beyond && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-dim">Engine life beyond {H} days</span>
      )}
      {a.next_task && (
        <div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[3px] bg-accent ring-2 ring-white"
          style={{ left: pct(a.next_task.start + 0.5, H) }} title={`${a.next_task.label}, day ${a.next_task.start}`} />
      )}
    </div>
  )
}

function Axis({ H, start }: { H: number; start: string }) {
  const ticks = [0, 7, 14, 21, 28].filter((d) => d < H)
  return (
    <div className="relative h-5 text-[11px] text-dim">
      {ticks.map((d) => (
        <span key={d} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pct(d + 0.5, H) }}>
          {d === 0 ? 'Today' : dayDate(start, d)}
        </span>
      ))}
    </div>
  )
}

const GRID = 'grid grid-cols-[150px_minmax(0,1fr)] items-center gap-x-6 lg:grid-cols-[170px_minmax(0,1fr)_250px_120px]'

export default function Fleet() {
  const { base, link } = useConsoleParams()
  const q = useFleet(undefined, base)
  const navigate = useNavigate()
  const [status, setStatus] = useState<FleetStatus | ''>('')
  const [shortOnly, setShortOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>('life')

  const all = useMemo(() => q.data?.aircraft ?? [], [q.data])
  const filtered = useMemo(() => all.filter((a) =>
    (!status || a.status === status) && (!shortOnly || a.part_shortages.length > 0)
    && a.id.toLowerCase().includes(search.trim().toLowerCase())), [all, status, shortOnly, search])
  const sorter = (x: FleetRow, y: FleetRow) =>
    sort === 'tail' ? x.id.localeCompare(y.id, undefined, { numeric: true })
      : sort === 'task' ? (x.next_task?.start ?? 999) - (y.next_task?.start ?? 999)
      : x.worst_engine.p10_days - y.worst_engine.p10_days

  if (q.isPending) return <div className="space-y-4"><Skeleton h={120} /><Skeleton h={480} /></div>
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />
  const H = q.data.horizon_days
  const start = q.data.start_date
  const counts = ORDER.map((s) => [s, all.filter((a) => a.status === s).length] as const)
  // At-risk aircraft can still fly today, so the headline counts what needs attention, not what is grounded.
  const attention = all.filter((a) => a.status === 'at_risk' || a.status === 'grounded').length

  const exportCsv = () => downloadCsv('aeroready-fleet.csv',
    ['tail', 'base', 'status', 'lowest_engine', 'rul_p10_days', 'rul_p50_days', 'rul_p90_days', 'next_task', 'next_task_day', 'part_shortages'],
    filtered.map((r) => [r.id, r.base_id, STATUS_LABEL[r.status], r.worst_engine.engine_id, r.worst_engine.p10_days,
      r.worst_engine.p50_days, r.worst_engine.p90_days, r.next_task?.label, r.days_to_next_task, r.part_shortages.join(' ')]))

  return (
    <div className="space-y-6">
      {/* composition of the fleet; each segment filters the list */}
      <section className="rounded-[24px] bg-white p-6 ring-1 ring-black/[0.06] lg:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <p className="text-[clamp(26px,2.6vw,36px)] font-medium leading-tight tracking-[-0.03em]">
            {attention === 0 ? `All ${all.length} aircraft are clear this month.` : `${attention} of ${all.length} aircraft need attention this month.`}
          </p>
          {status && <button onClick={() => setStatus('')} className="text-[13px] text-muted underline decoration-line2 underline-offset-4 hover:text-ink">Show all aircraft</button>}
        </div>
        <div className="mt-6 flex h-3 gap-1 overflow-hidden rounded-full">
          {counts.filter(([, n]) => n > 0).map(([s, n]) => (
            <button key={s} onClick={() => setStatus(status === s ? '' : s)} style={{ flexGrow: n }} aria-label={`Show ${STATUS_LABEL[s]}`}
              className={`h-full rounded-full transition-opacity ${TONE[s].bar} ${status && status !== s ? 'opacity-25' : ''}`} />
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          {counts.map(([s, n]) => (
            <button key={s} onClick={() => setStatus(status === s ? '' : s)}
              className={`flex items-baseline gap-2 text-left transition-opacity ${status && status !== s ? 'opacity-40' : ''}`}>
              <span className={`mb-0.5 h-2 w-2 shrink-0 self-center rounded-full ${TONE[s].dot}`} />
              <span className="num text-[22px] font-medium leading-none tracking-[-0.02em]">{n}</span>
              <span className="text-[13px] text-muted">{STATUS_LABEL[s]}</span>
            </button>
          ))}
        </div>
      </section>

      {/* the list */}
      <section className="rounded-[24px] bg-white ring-1 ring-black/[0.06]">
        <div className="flex flex-wrap items-center gap-3 px-6 pb-4 pt-6 lg:px-8">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim" aria-hidden />
            <input type="search" placeholder="Find a tail number" value={search} onChange={(e) => setSearch(e.target.value)}
              className="!h-10 w-56 !rounded-full !pl-9" aria-label="Find a tail number" />
          </label>
          <button onClick={() => setShortOnly((v) => !v)} aria-pressed={shortOnly}
            className={`h-10 rounded-full px-4 text-[13px] ring-1 transition-colors ${shortOnly ? 'bg-ink text-white ring-ink' : 'text-ink ring-line2 hover:bg-panel2'}`}>
            Waiting on parts
          </button>
          <Select label="Sort" value={sort} onChange={(v) => setSort(v as Sort)}
            options={[{ value: 'life', label: 'Shortest engine life first' }, { value: 'task', label: 'Next task first' }, { value: 'tail', label: 'Tail number' }]} />
          <div className="ml-auto flex items-center gap-4">
            <span className="text-[13px] text-muted">{filtered.length} of {all.length} aircraft</span>
            <Button onClick={exportCsv} disabled={!filtered.length} icon={<Download className="h-3.5 w-3.5" />}>Export CSV</Button>
          </div>
        </div>

        {/* legend and shared axis */}
        <div className={`${GRID} sticky top-16 z-10 border-y border-line bg-white/95 px-6 py-3 backdrop-blur lg:px-8`}>
          <span className="text-[12px] text-muted">Aircraft</span>
          <div>
            <div className="mb-1 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-5 rounded-full bg-[#c9a27e]/70" />Engine life, P10 to P90</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-[2px] bg-ink" />Median</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-bad" />Pessimistic forecast</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-accent" />Next task starts</span>
            </div>
            <Axis H={H} start={start} />
          </div>
          <span className="hidden text-[12px] text-muted lg:block">Next task</span>
          <span className="hidden text-[12px] text-muted lg:block">Parts short</span>
        </div>

        {filtered.length === 0 && <EmptyState title="No aircraft match these filters" detail="Clear the search or choose another status." />}
        {ORDER.map((s) => {
          const rows = filtered.filter((a) => a.status === s).sort(sorter)
          if (!rows.length) return null
          return (
            <div key={s}>
              <div className="flex items-center gap-2.5 px-6 pb-2 pt-6 lg:px-8">
                <span className={`h-2 w-2 rounded-full ${TONE[s].dot}`} />
                <h3 className="text-[15px] font-semibold">{STATUS_LABEL[s]}</h3>
                <span className="num text-[13px] text-muted">{rows.length}</span>
              </div>
              <ul>
                {rows.map((a) => (
                  <li key={a.id}>
                    <button onClick={() => navigate(link(`/fleet/${a.id}`))}
                      className={`${GRID} w-full border-t border-line/70 px-6 py-3.5 text-left transition-colors hover:bg-bg/70 lg:px-8`}>
                      <div>
                        <div className="text-[22px] font-medium leading-none tracking-[-0.03em]">{a.id}</div>
                        <div className="mt-1.5 truncate text-[12px] text-muted">{a.base_id}, {a.type.split(' ')[0]}</div>
                      </div>
                      <div>
                        <Runway a={a} H={H} />
                        <div className="num -mt-0.5 text-[11px] text-dim">
                          {a.grounded_all_horizon ? a.status_reason
                            : `${a.worst_engine.p10_days} / ${a.worst_engine.p50_days} / ${a.worst_engine.p90_days} days`}
                        </div>
                      </div>
                      <div className="col-span-2 mt-2 lg:col-span-1 lg:mt-0">
                        {a.next_task
                          ? <><div className="truncate text-[14px] font-medium">{a.next_task.label.replace(/ \(.*\)/, '')}</div>
                              <div className="num mt-0.5 text-[12px] text-muted">Day {a.next_task.start}, {dayDate(start, a.next_task.start)}</div></>
                          : <div className="text-[13px] text-dim">Nothing scheduled in {H} days</div>}
                      </div>
                      <div className="col-span-2 mt-2 flex flex-wrap gap-1 lg:col-span-1 lg:mt-0">
                        {a.part_shortages.length
                          ? a.part_shortages.map((p) => <span key={p} className="rounded-full bg-bad/10 px-2 py-0.5 text-[11px] font-medium text-bad">{p}</span>)
                          : <span className="text-[12px] text-dim">None</span>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
        <div className="h-4" />
      </section>
    </div>
  )
}
