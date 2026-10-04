import type { UseQueryResult } from '@tanstack/react-query'
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, CircleDot, Inbox, Loader2, RotateCw, Wrench, XOctagon } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type { FleetStatus } from '../lib/api'
import { STATUS_LABEL } from '../lib/format'

export function Panel({ title, actions, children, className = '', pad = true }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean
}) {
  return (
    <section className={`panel min-w-0 ${pad ? 'p-5' : ''} ${className}`}>
      {(title || actions) && (
        <div className={`mb-3 flex flex-wrap items-center justify-between gap-3 ${pad ? '' : 'px-4 pt-4'}`}>
          {title && <h2 className="text-[17px] font-medium tracking-[-0.01em]">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Skeleton({ h = 16, w = '100%', className = '' }: { h?: number; w?: number | string; className?: string }) {
  return <div className={`skeleton ${className}`} style={{ height: h, width: w }} aria-hidden />
}

export function SkeletonBlock({ lines = 4, h = 18 }: { lines?: number; h?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} h={h} w={`${100 - (i % 3) * 12}%`} />)}
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-bad/40 bg-bad/10 p-3" role="alert">
      <div className="flex gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-hidden />
        <div>
          <div className="text-sm font-medium text-ink">Could not load this section</div>
          <p className="mt-0.5 text-xs text-muted">{message}</p>
        </div>
      </div>
      {onRetry && <Button onClick={onRetry} icon={<RotateCw className="h-3.5 w-3.5" />}>Retry</Button>}
    </div>
  )
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
      <Inbox className="h-5 w-5 text-dim" aria-hidden />
      <div className="text-sm text-muted">{title}</div>
      {detail && <div className="max-w-md text-xs text-dim">{detail}</div>}
    </div>
  )
}

/** Loading skeleton, error with retry, or the data. */
export function QueryView<T>({ q, children, skeleton }: {
  q: UseQueryResult<T>; children: (data: T) => ReactNode; skeleton?: ReactNode
}) {
  if (q.isPending) return <>{skeleton ?? <SkeletonBlock />}</>
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />
  return <>{children(q.data as T)}</>
}

export function Button({ children, onClick, primary = false, disabled = false, icon, type = 'button', title, busy = false }: {
  children: ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean; icon?: ReactNode
  type?: 'button' | 'submit'; title?: string; busy?: boolean
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || busy} title={title}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        primary ? 'bg-ink text-bg hover:bg-white' : 'bg-panel2 text-ink ring-1 ring-white/10 hover:bg-line'}`}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string
}) {
  return (
    <div className="flex rounded-full bg-panel2 p-1 ring-1 ring-white/5" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`rounded-full px-3 py-1 text-xs font-medium ${value === o.value ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function StatTile({ label, value, sub, tone = 'ink' }: {
  label: string; value: ReactNode; sub?: ReactNode; tone?: 'ink' | 'accent' | 'bad' | 'ok'
}) {
  const color = { ink: 'text-ink', accent: 'text-accent', bad: 'text-bad', ok: 'text-ok' }[tone]
  return (
    <div className={`panel flex min-w-0 flex-col p-5 ${tone === 'accent' ? 'ring-1 ring-accent/40' : ''}`}>
      <div className="label-caps">{label}</div>
      <div className={`display num mt-2 text-[40px] font-medium leading-none ${color}`}>{value}</div>
      {sub && <div className="mt-2 text-xs text-muted">{sub}</div>}
    </div>
  )
}

const STATUS_STYLE: Record<FleetStatus, { cls: string; icon: ReactNode }> = {
  ready: { cls: 'text-ok border-ok/40', icon: <CheckCircle2 className="h-3 w-3" aria-hidden /> },
  scheduled: { cls: 'text-k-scheduled border-k-scheduled/40', icon: <Wrench className="h-3 w-3" aria-hidden /> },
  at_risk: { cls: 'text-warn border-warn/40', icon: <AlertTriangle className="h-3 w-3" aria-hidden /> },
  grounded: { cls: 'text-bad border-bad/40', icon: <XOctagon className="h-3 w-3" aria-hidden /> },
}

export function StatusBadge({ status }: { status: FleetStatus }) {
  const s = STATUS_STYLE[status]
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>
      {s.icon}{STATUS_LABEL[status]}
    </span>
  )
}

export function SimulatedLabel({ origin }: { origin: 'simulated' | 'uploaded' }) {
  const uploaded = origin === 'uploaded'
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium ${
      uploaded ? 'border-k-scheduled/50 text-k-scheduled' : 'border-accent/50 text-accent'}`}>
      <CircleDot className="h-3 w-3" aria-hidden />{uploaded ? 'Uploaded data' : 'Simulated fleet scenario'}
    </span>
  )
}

/** P10-P90 range bar with a P50 tick, scaled to `scale` days; horizon marked. */
export function RulBar({ p10, p50, p90, scale, horizon }: { p10: number; p50: number; p90: number; scale: number; horizon: number }) {
  const pc = (v: number) => `${Math.min(100, (v / scale) * 100)}%`
  const tone = p10 < horizon ? 'bg-warn' : 'bg-ok'
  return (
    <div className="relative h-1.5 w-full rounded-full bg-line" role="img" aria-label={`RUL P10 ${p10}, P50 ${p50}, P90 ${p90} days`}>
      <div className="absolute top-0 h-1.5 rounded-full bg-muted/35" style={{ left: pc(p10), width: `calc(${pc(p90)} - ${pc(p10)})` }} />
      <div className={`absolute -top-[3px] h-3 w-[3px] rounded ${tone}`} style={{ left: pc(p50) }} />
      <div className="absolute -top-[3px] h-3 w-px bg-accent/70" style={{ left: pc(horizon) }} title="End of planning horizon" />
    </div>
  )
}

// ---- sortable table ------------------------------------------------------
export interface Column<T> {
  key: string; label: string; value: (r: T) => string | number | null; render?: (r: T) => ReactNode
  align?: 'left' | 'right'; width?: string
}

export function SortTable<T>({ rows, columns, rowKey, onRowClick, initialSort, highlight, empty }: {
  rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void
  initialSort?: { key: string; dir: 'asc' | 'desc' }; highlight?: (r: T) => boolean; empty?: ReactNode
}) {
  const [sort, setSort] = useState(initialSort ?? { key: columns[0].key, dir: 'asc' as const })
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key) ?? columns[0]
    return [...rows].sort((a, b) => {
      const va = col.value(a), vb = col.value(b)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true })
      return sort.dir === 'asc' ? c : -c
    })
  }, [rows, columns, sort])
  if (!rows.length) return <>{empty ?? <EmptyState title="No rows match." />}</>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th key={c.key} style={{ width: c.width }} className={`py-2 pr-3 font-normal ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <button className="label-caps inline-flex items-center gap-1 hover:text-ink"
                  onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key && s.dir === 'asc' ? 'desc' : 'asc' }))}>
                  {c.label}
                  {sort.key === c.key && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={`border-b border-line/60 ${onRowClick ? 'cursor-pointer hover:bg-panel2' : ''} ${highlight?.(r) ? 'bg-bad/[0.07]' : ''}`}>
              {columns.map((c) => (
                <td key={c.key} className={`py-2 pr-3 align-top ${c.align === 'right' ? 'num text-right' : ''}`}>
                  {c.render ? c.render(r) : (c.value(r) ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
