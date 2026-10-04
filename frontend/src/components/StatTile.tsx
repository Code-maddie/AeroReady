import type { ReactNode } from 'react'

export function StatTile({ label, value, sub, tone = 'ink', children }: {
  label: string; value: ReactNode; sub?: ReactNode; tone?: 'ink' | 'accent' | 'bad' | 'ok'; children?: ReactNode
}) {
  const color = { ink: 'text-ink', accent: 'text-accent', bad: 'text-bad', ok: 'text-ok' }[tone]
  return (
    <div className={`panel flex min-w-0 flex-col justify-between p-4 ${tone === 'accent' ? 'border-accent/50 bg-accent/[0.06]' : ''}`}>
      <div className="label-caps">{label}</div>
      <div className={`display num mt-1 text-[40px] font-semibold leading-none ${color}`}>{value}</div>
      {sub && <div className="mt-2 text-xs text-muted">{sub}</div>}
      {children}
    </div>
  )
}
