import { Link } from 'react-router-dom'
import type { Spares as SparesData, SparesPart } from '../api'
import { PageHead } from '../components/Layout'
import { Empty, ErrorState, Loading } from '../components/States'
import { useApi } from '../hooks'

const H = 30

/** 30-day strip: supply arrivals (▲), Day-0-order lead time (|), demand starts (●). */
function SupplyStrip({ p }: { p: SparesPart }) {
  const pos = (d: number) => `${((Math.min(d, H - 0.5) + 0.5) / H) * 100}%`
  return (
    <div className="relative h-6 w-full" aria-hidden>
      <div className="absolute inset-x-0 top-3 h-px bg-line2" />
      {p.lead_time_days < H && (
        <div className="absolute top-0.5 h-5 border-l border-dashed border-accent/70" style={{ left: pos(p.lead_time_days) }}
          title={`Day-0 order arrives Day ${p.lead_time_days}`} />
      )}
      {p.inbound.map((a, i) => (
        <span key={i} className="absolute top-0 -translate-x-1/2 text-[10px] text-ok" style={{ left: pos(a.day) }} title={`Inbound ×${a.qty} Day ${a.day}`}>▲</span>
      ))}
      {p.demand.optimized.map((u, i) => (
        <span key={i} title={`${u.aircraft_id} ${u.kind} Day ${u.day} (${u.source})`}
          className={`absolute top-[8px] h-2.5 w-2.5 -translate-x-1/2 rounded-full ring-2 ring-panel ${u.source === 'cannibalised' ? 'bg-k-cannibal' : u.kind === 'scheduled' ? 'bg-k-scheduled' : 'bg-k-predictive'}`}
          style={{ left: pos(u.day) }} />
      ))}
    </div>
  )
}

export default function Spares() {
  const sp = useApi<SparesData>('/api/spares')
  if (sp.error) return <ErrorState message={sp.error} onRetry={sp.reload} />
  if (!sp.data) return <Loading label="Loading spares" />
  const { parts, cannibalizations, part_orders } = sp.data
  const short = parts.filter((p) => p.status === 'short')

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <PageHead title="Spares and supply." sub="What the plan needs and what to order today." />

      <div className="grid grid-cols-3 gap-4">
        <section className="panel p-4">
          <h2 className="display text-lg font-semibold">Day-0 orders</h2>
          <p className="mb-2 text-xs text-dim">Demand the plan creates beyond stock and inbound. Ordering now beats ordering on failure.</p>
          {part_orders.length === 0 && <Empty text="No orders needed." />}
          <ul className="space-y-1.5">
            {part_orders.map((o) => (
              <li key={o.part_id} className="flex items-baseline justify-between gap-2 rounded border border-accent/30 bg-accent/[0.05] px-2.5 py-1.5 text-sm">
                <span><span className="num text-dim">{o.part_id}</span> {o.part_name}</span>
                <span className="num shrink-0 text-xs text-muted">×{o.qty} · arrives D{o.arrives_day} · needed D{o.needed_from_day}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel p-4">
          <h2 className="display text-lg font-semibold">Cannibalisation actions</h2>
          <p className="mb-2 text-xs text-dim">Serviceable parts taken from aircraft that are grounded for the whole horizon.</p>
          {cannibalizations.length === 0 && <Empty text="None in this plan." />}
          <ul className="space-y-1.5">
            {cannibalizations.map((c) => (
              <li key={c.job_id} className="rounded border border-k-cannibal/40 bg-k-cannibal/[0.06] px-2.5 py-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <Link to={`/aircraft/${c.donor}`} className="display num font-semibold hover:text-accent">{c.donor}</Link>
                  <span className="text-k-cannibal">→</span>
                  <Link to={`/aircraft/${c.aircraft_id}`} className="display num font-semibold hover:text-accent">{c.aircraft_id}</Link>
                  <span className="text-ink">{c.part_name}</span>
                </div>
                <div className="num text-xs text-muted">Remove D{Math.max(0, c.day - 1)} · fit D{c.day} · linked removal record on {c.donor}</div>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel p-4">
          <h2 className="display text-lg font-semibold">Shortages</h2>
          <p className="mb-2 text-xs text-dim">Parts whose planned demand exceeds stock on hand plus inbound.</p>
          {short.length === 0 && <Empty text="No shortages." />}
          <ul className="space-y-1.5">
            {short.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between rounded border border-bad/40 bg-bad/[0.06] px-2.5 py-1.5 text-sm">
                <span><span className="num text-dim">{p.id}</span> {p.name}</span>
                <span className="num text-right text-xs"><span className="text-bad">short {p.shortage_qty}</span>
                  <span className="text-dim"> · {p.day0_order ? `covered by Day-0 order (D${p.day0_order.arrives_day})` : `lead ${p.lead_time_days} d`}</span></span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="display text-lg font-semibold">Stock &amp; demand · optimised plan</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
            <span><span className="text-ok">▲</span> inbound</span>
            <span><span className="mr-1 inline-block h-3 border-l border-dashed border-accent" />Day-0 order arrives</span>
            <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-k-scheduled align-middle" />inspection</span>
            <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-k-predictive align-middle" />engine work</span>
            <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-k-cannibal align-middle" />cannibalised</span>
          </div>
        </div>
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="label-caps border-b border-line text-left !text-[11px]">
              <th className="w-[230px] py-2">Part</th>
              <th className="w-16 text-right">On hand</th>
              <th className="w-28 pl-4">Inbound</th>
              <th className="w-16 text-right">Lead</th>
              <th className="w-16 text-right">Demand</th>
              <th className="pl-6">Day 0 → 29</th>
              <th className="w-20 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((p) => (
              <tr key={p.id} className="border-b border-line/60">
                <td className="py-2"><span className="num text-dim">{p.id}</span> <span className="text-ink">{p.name}</span>
                  <div className="text-[10px] text-dim">{p.category}</div></td>
                <td className={`num text-right ${p.on_hand === 0 ? 'text-bad' : 'text-ink'}`}>{p.on_hand}</td>
                <td className="num pl-4 text-xs text-muted">{p.inbound.map((a) => `×${a.qty} D${a.day}`).join(', ') || '—'}</td>
                <td className="num text-right text-muted">{p.lead_time_days} d</td>
                <td className="num text-right">{p.demand.optimized.length}</td>
                <td className="pl-6 pr-2"><SupplyStrip p={p} /></td>
                <td className="text-right">
                  {p.on_hand === 0 && p.demand.optimized.length > 0 && p.demand.optimized.every((u) => u.source === 'cannibalised') ? (
                    <span className="rounded border border-k-cannibal/50 px-1.5 py-0.5 text-[10px] font-semibold text-k-cannibal"
                      title="No stock; demand met by cannibalisation from a grounded aircraft">◆ Donor</span>
                  ) : (
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                      p.status === 'short' ? 'border-bad/50 text-bad' : p.status === 'low' ? 'border-warn/50 text-warn' : 'border-ok/40 text-ok'}`}>
                      {p.status === 'short' ? '■ Order' : p.status === 'low' ? '▲ Low' : '● OK'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
