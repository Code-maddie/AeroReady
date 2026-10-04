import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Job, PlanResult, Recommendation } from '../api'
import Gantt, { GanttLegend } from '../components/Gantt'
import { Empty, ErrorState, Loading } from '../components/States'
import { useApi, useBase } from '../hooks'

const TYPE_META: Record<Recommendation['type'], { label: string; cls: string }> = {
  cannibalize: { label: 'Cannibalise', cls: 'text-k-cannibal border-k-cannibal/50' },
  predictive: { label: 'Predictive', cls: 'text-k-predictive border-k-predictive/50' },
  order: { label: 'Order part', cls: 'text-accent border-accent/50' },
  bundle: { label: 'Bundle', cls: 'text-k-scheduled border-k-scheduled/50' },
  level: { label: 'Level load', cls: 'text-muted border-line2' },
  defer: { label: 'Defer', cls: 'text-muted border-line2' },
}

function Metric({ label, b, o, better = 'lower' }: { label: string; b: number; o: number; better?: 'lower' | 'higher' }) {
  const good = better === 'lower' ? o < b : o > b
  return (
    <div className="panel px-3 py-2">
      <div className="label-caps !text-[11px]">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className={`display num text-2xl font-semibold ${good ? 'text-accent' : 'text-ink'}`}>{o}</span>
        <span className="num text-xs text-dim">reactive {b}</span>
      </div>
    </div>
  )
}

export default function Plan() {
  const plan = useApi<PlanResult>('/api/plan')
  const { base } = useBase()
  const [side, setSide] = useState<'optimized' | 'baseline'>('optimized')
  const [types, setTypes] = useState<Set<Recommendation['type']>>(new Set())
  const jobs = useMemo(() => Object.fromEntries((plan.data?.jobs ?? []).map((j) => [j.id, j])) as Record<string, Job>, [plan.data])

  if (plan.error) return <ErrorState message={plan.error} onRetry={plan.reload} />
  if (!plan.data) return <Loading label="Computing fleet plan" />
  const p = plan.data
  const rows = p[side].gantt.filter((r) => base === 'ALL' || r.base_id === base)
  const recs = p.recommendations.filter((r) => (base === 'ALL' || r.base_id === base) && (types.size === 0 || types.has(r.type)))
  const counts = p.recommendations.reduce<Record<string, number>>((c, r) => ({ ...c, [r.type]: (c[r.type] ?? 0) + 1 }), {})
  const toggle = (t: Recommendation['type']) => setTypes((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n })

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="label-caps">Maintenance plan · Day 0–{p.horizon_days - 1}</div>
          <h1 className="display mt-1 text-3xl font-bold uppercase tracking-wide">Fleet schedule</h1>
        </div>
        <div className="flex rounded border border-line2 p-0.5" role="radiogroup" aria-label="Plan">
          {(['optimized', 'baseline'] as const).map((s) => (
            <button key={s} role="radio" aria-checked={side === s} onClick={() => setSide(s)}
              className={`display rounded-sm px-4 py-1.5 font-semibold uppercase tracking-wider ${side === s ? (s === 'optimized' ? 'bg-accent text-bg' : 'bg-reactive text-bg') : 'text-muted hover:text-ink'}`}>
              {s === 'optimized' ? `Optimised · ${p.optimized.aircraft_days} d` : `Reactive · ${p.baseline.aircraft_days} d`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        <Metric label="Aircraft-days" b={p.baseline.aircraft_days} o={p.optimized.aircraft_days} better="higher" />
        <Metric label="Unplanned failures" b={p.baseline.unplanned_failures.length} o={p.optimized.unplanned_failures.length} />
        <Metric label="Engine risk-days" b={p.baseline.risk_engine_days} o={p.optimized.risk_engine_days} />
        <Metric label="Cannibalisations" b={p.baseline.cannibalizations.length} o={p.optimized.cannibalizations.length} better="higher" />
        <Metric label="Downtime past D29" b={p.baseline.spillover_days} o={p.optimized.spillover_days} />
      </div>

      <section className="panel p-4">
        <div className="mb-3 space-y-1.5">
          <h2 className="display text-lg font-semibold uppercase tracking-wider">
            {side === 'optimized' ? 'Optimised plan' : 'Reactive baseline'} <span className="text-sm text-dim">· {rows.length} aircraft · hover a block for details</span>
          </h2>
          <GanttLegend />
        </div>
        {rows.length ? <Gantt rows={rows} horizon={p.horizon_days} startDate={p.start_date} jobs={jobs} /> : <Empty text="No aircraft at this base." />}
      </section>

      <section className="panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="display text-lg font-semibold uppercase tracking-wider">
            Recommendations <span className="text-sm text-dim">· {recs.length} shown · impact = tail's mission-ready days vs reactive</span>
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(TYPE_META) as Recommendation['type'][]).filter((t) => counts[t]).map((t) => (
              <button key={t} onClick={() => toggle(t)} aria-pressed={types.has(t)}
                className={`rounded border px-2 py-0.5 text-xs font-semibold ${TYPE_META[t].cls} ${types.has(t) ? 'bg-white/10' : 'opacity-80 hover:opacity-100'}`}>
                {TYPE_META[t].label} <span className="num text-dim">{counts[t]}</span>
              </button>
            ))}
          </div>
        </div>
        {recs.length === 0 && <Empty text="No recommendations match these filters." />}
        <div className="grid grid-cols-2 gap-2.5">
          {recs.map((r) => (
            <article key={r.id} className="rounded border border-line bg-panel2/40 p-3">
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 shrink-0 rounded border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider ${TYPE_META[r.type].cls}`}>
                  {TYPE_META[r.type].label}
                </span>
                <h3 className="flex-1 text-[13px] font-semibold leading-snug text-ink">{r.title}</h3>
                <span className={`num shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${r.aircraft_delta > 0 ? 'bg-accent/15 text-accent' : 'bg-panel2 text-dim'}`}
                  title={`${r.aircraft_id}: mission-ready days, optimised minus reactive`}>
                  {r.aircraft_id} {r.aircraft_delta >= 0 ? '+' : ''}{r.aircraft_delta}d
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{r.reason}</p>
              <Link to={`/aircraft/${r.aircraft_id}`} className="mt-1 inline-block text-[11px] text-dim hover:text-accent">View {r.aircraft_id} →</Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
