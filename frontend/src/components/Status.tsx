import type { Status } from '../api'

const COLORS: Record<Status, string> = { green: 'bg-ok', amber: 'bg-warn', red: 'bg-bad' }
const LABELS: Record<Status, string> = { green: 'Ready', amber: 'Watch', red: 'Critical' }
const ICONS: Record<Status, string> = { green: '●', amber: '▲', red: '■' }

export function StatusDot({ status }: { status: Status }) {
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${COLORS[status]}`} aria-hidden />
}

export function StatusBadge({ status }: { status: Status }) {
  const tone = { green: 'text-ok border-ok/40', amber: 'text-warn border-warn/40', red: 'text-bad border-bad/40' }[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${tone}`}>
      <span aria-hidden>{ICONS[status]}</span>{LABELS[status]}
    </span>
  )
}
