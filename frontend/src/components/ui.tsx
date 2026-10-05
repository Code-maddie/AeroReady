import type { UseQueryResult } from '@tanstack/react-query'
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Loader2, RotateCw, Wrench, X, XOctagon } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type { FleetStatus } from '../lib/api'
import { STATUS_LABEL } from '../lib/format'

// ---- layout ---------------------------------------------------------------
export function Panel({ title, actions, children, className = '', flush = false }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string
  /** No body padding (for full-width tables). */
  flush?: boolean
}) {
  return (
    <section className={`panel min-w-0 ${className}`}>
      {(title || actions) && (
        <header className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pb-1 pt-4">
          {title && <h2 className="text-[17px] font-medium tracking-[-0.01em] text-ink">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={flush ? 'pb-2' : 'px-5 pb-5 pt-3'}>{children}</div>
    </section>
  )
}

export function KeyValue({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[160px_1fr] text-[13px]">
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="border-b border-line py-2 pr-4 text-muted">{k}</dt>
          <dd className="border-b border-line py-2 text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

// ---- states ---------------------------------------------------------------
export function Skeleton({ h = 16, w = '100%', className = '' }: { h?: number; w?: number | string; className?: string }) {
  return <div className={`skeleton ${className}`} style={{ height: h, width: w }} aria-hidden />
}

export function SkeletonBlock({ lines = 4, h = 20 }: { lines?: number; h?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} h={h} w={`${100 - (i % 3) * 12}%`} />)}
    </div>
  )
}

export const ErrorState = (props: { message: string; onRetry?: () => void }) => <ErrorBox {...props} />

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-bad/40 bg-bad/10 p-3" role="alert">
      <div className="flex gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-hidden />
        <div>
          <div className="text-[13px] font-medium text-ink">Could not load this section</div>
          <p className="mt-0.5 text-xs text-muted">{message}</p>
        </div>
      </div>
      {onRetry && <Button onClick={onRetry} icon={<RotateCw className="h-3.5 w-3.5" />}>Retry</Button>}
    </div>
  )
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="px-4 py-6 text-center">
      <div className="text-[13px] text-muted">{title}</div>
      {detail && <div className="mx-auto mt-1 max-w-md text-xs text-dim">{detail}</div>}
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

// ---- controls -------------------------------------------------------------
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
const VARIANT: Record<Variant, string> = {
  primary: 'bg-ink text-bg hover:bg-white',
  secondary: 'bg-panel2 text-ink ring-1 ring-white/10 hover:bg-line',
  danger: 'text-bad ring-1 ring-bad/50 hover:bg-bad/10',
  ghost: 'text-muted hover:text-ink hover:bg-white/5',
}

export function Button({ children, onClick, variant = 'secondary', disabled = false, icon, type = 'button', title, busy = false, size = 'md' }: {
  children: ReactNode; onClick?: () => void; variant?: Variant; disabled?: boolean; icon?: ReactNode
  type?: 'button' | 'submit'; title?: string; busy?: boolean
  /** lg = 44px touch target (technician pages) */
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || busy} title={title}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        size === 'sm' ? 'h-7 px-3' : size === 'lg' ? 'h-11 px-5 text-[15px]' : 'h-8 px-3.5'} ${VARIANT[variant]}`}>
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

export function FormField({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string | null }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}{children}
      {error ? <span className="text-bad">{error}</span> : hint ? <span className="text-dim">{hint}</span> : null}
    </label>
  )
}
export const Field = FormField

export function Select({ value, onChange, options, label, placeholder, disabled, large = false }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string
  placeholder?: string; disabled?: boolean; large?: boolean
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} disabled={disabled} className={large ? '!h-11 !text-[15px]' : '!rounded-full'}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function Tabs<T extends string>({ value, onChange, tabs, large = false }: {
  value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode }[]; large?: boolean
}) {
  return (
    <div className="flex w-fit gap-0.5 rounded-full bg-panel2 p-1 ring-1 ring-white/5" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={`rounded-full px-4 ${large ? 'h-10 text-[15px]' : 'h-8 text-[13px]'} ${
            value === t.value ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

/** Right-hand overlay panel for details and edits. */
export function SidePanel({ title, onClose, children, width = 440 }: { title: ReactNode; onClose: () => void; children: ReactNode; width?: number }) {
  return (
    <aside className="fixed bottom-4 right-4 top-20 z-40 flex flex-col overflow-hidden rounded-2xl bg-panel shadow-2xl ring-1 ring-white/10"
      style={{ width }} aria-label="Detail panel" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0 text-[17px] font-medium tracking-[-0.01em]">{title}</div>
        <button onClick={onClose} aria-label="Close panel" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted hover:bg-white/10 hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
    </aside>
  )
}

export function Modal({ title, children, onClose, label }: { title: string; children: ReactNode; onClose: () => void; label?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={label ?? title}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="w-full max-w-md rounded-2xl bg-panel shadow-2xl ring-1 ring-white/10">
        <h3 className="px-5 pt-5 text-[19px] font-medium tracking-[-0.01em]">{title}</h3>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

// ---- data display ---------------------------------------------------------
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

type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'accent' | 'scheduled' | 'predictive' | 'cannibal'
const TONE: Record<Tone, string> = {
  neutral: 'border-line2 text-muted', ok: 'border-ok/50 text-ok', warn: 'border-warn/50 text-warn', bad: 'border-bad/50 text-bad',
  accent: 'border-accent/60 text-accent', scheduled: 'border-k-scheduled/60 text-k-scheduled',
  predictive: 'border-k-predictive/60 text-k-predictive', cannibal: 'border-k-cannibal/60 text-k-cannibal',
}

export function Badge({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[11px] font-medium ${TONE[tone]}`}>
      {children}
    </span>
  )
}

const STATUS: Record<FleetStatus, { tone: Tone; icon: ReactNode }> = {
  ready: { tone: 'ok', icon: <CheckCircle2 className="h-3 w-3" aria-hidden /> },
  scheduled: { tone: 'neutral', icon: <Wrench className="h-3 w-3" aria-hidden /> },
  at_risk: { tone: 'warn', icon: <AlertTriangle className="h-3 w-3" aria-hidden /> },
  grounded: { tone: 'bad', icon: <XOctagon className="h-3 w-3" aria-hidden /> },
}

/** Status chip for workflow objects: plans, recommendations, work orders, defects. */
const STATUS_TONE: Record<string, Tone> = {
  Draft: 'neutral', Submitted: 'warn', Approved: 'ok', Returned: 'bad',
  Proposed: 'neutral', Accepted: 'ok', Modified: 'scheduled', Rejected: 'bad',
  Released: 'neutral', 'In progress': 'warn', Paused: 'neutral', Completed: 'ok', 'Cannot complete': 'bad',
  Reported: 'bad', 'Under review': 'warn', Planned: 'scheduled', Closed: 'ok',
}
export function StatusChip({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{status}</Badge>
}

export function StatusBadge({ status }: { status: FleetStatus }) {
  return <Badge tone={STATUS[status].tone}>{STATUS[status].icon}{STATUS_LABEL[status]}</Badge>
}

export function SimulatedLabel({ origin }: { origin: 'simulated' | 'uploaded' }) {
  return <Badge tone={origin === 'uploaded' ? 'scheduled' : 'accent'}>{origin === 'uploaded' ? 'Uploaded data' : 'Simulated fleet scenario'}</Badge>
}

/** P10-P90 range bar with a P50 tick, scaled to `scale` days; horizon marked. */
export function RulBar({ p10, p50, p90, scale, horizon }: { p10: number; p50: number; p90: number; scale: number; horizon: number }) {
  const pc = (v: number) => `${Math.min(100, (v / scale) * 100)}%`
  return (
    <div className="relative h-1.5 w-full rounded-full bg-line" role="img" aria-label={`RUL P10 ${p10}, P50 ${p50}, P90 ${p90} days`}>
      <div className="absolute top-0 h-1.5 rounded-full bg-muted/35" style={{ left: pc(p10), width: `calc(${pc(p90)} - ${pc(p10)})` }} />
      <div className={`absolute -top-[3px] h-3 w-[2px] ${p10 < horizon ? 'bg-warn' : 'bg-ok'}`} style={{ left: pc(p50) }} />
      <div className="absolute -top-[3px] h-3 w-px bg-accent/70" style={{ left: pc(horizon) }} title="End of planning horizon" />
    </div>
  )
}

// ---- tables ---------------------------------------------------------------
export interface Column<T> {
  key: string; label: string; value: (r: T) => string | number | null; render?: (r: T) => ReactNode
  align?: 'left' | 'right'; width?: string
}

/** Shared table: 40px rows (44px with `large`), optional sorting, row click and highlight. */
export function SortTable<T>({ rows, columns, rowKey, onRowClick, initialSort, highlight, empty, sortable = true, large = false, selected }: {
  rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void
  initialSort?: { key: string; dir: 'asc' | 'desc' }; highlight?: (r: T) => boolean; empty?: ReactNode; sortable?: boolean
  large?: boolean; selected?: (r: T) => boolean
}) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null)
  const sorted = useMemo(() => {
    if (!sort) return rows
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
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="h-10 border-b border-line">
            {columns.map((c) => (
              <th key={c.key} style={{ width: c.width }} className={`px-3 font-normal first:pl-5 last:pr-5 ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                {sortable ? (
                  <button className="label-caps inline-flex items-center gap-1 hover:text-ink"
                    onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === 'asc' ? 'desc' : 'asc' }))}>
                    {c.label}
                    {sort?.key === c.key && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </button>
                ) : <span className="label-caps">{c.label}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={`${large ? 'h-12 text-[15px]' : 'h-10'} border-b border-line/60 ${onRowClick ? 'cursor-pointer hover:bg-panel2' : ''} ${
                highlight?.(r) ? 'bg-bad/[0.06]' : ''} ${selected?.(r) ? 'bg-panel2' : ''}`}>
              {columns.map((c) => (
                <td key={c.key} className={`px-3 py-1.5 align-middle first:pl-5 last:pr-5 ${c.align === 'right' ? 'num text-right' : ''}`}>
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

export const Table = SortTable
