import { Download } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, EmptyState, Panel, QueryView, Skeleton, SortTable, type Column } from '../components/ui'
import type { SparesResponse } from '../lib/api'
import { downloadCsv, signed } from '../lib/format'
import { useConsoleParams } from '../lib/params'
import { useSpares } from '../lib/queries'

type Inv = SparesResponse['inventory'][number]

export default function Spares() {
  const { scenario, link } = useConsoleParams()
  const q = useSpares(scenario)

  const cols: Column<Inv>[] = [
    { key: 'part', label: 'Part', value: (r) => r.part_id, render: (r) => <span><span className="text-dim">{r.part_id}</span> <span className="text-ink">{r.name}</span><div className="text-[11px] text-dim">{r.category}</div></span> },
    { key: 'stock', label: 'On hand', value: (r) => r.on_hand, align: 'right' },
    { key: 'inbound', label: 'Inbound', value: (r) => r.inbound_qty, align: 'right',
      render: (r) => r.inbound.length ? r.inbound.map((a) => `${a.qty} on Day ${a.day}`).join(', ') : 'None' },
    { key: 'lead', label: 'Lead time (days)', value: (r) => r.lead_time_days, align: 'right' },
    { key: 'demand', label: 'Demand in horizon', value: (r) => r.demand, align: 'right',
      render: (r) => <span>{r.demand}{r.demand_cannibalised > 0 && <span className="text-xs text-k-cannibal"> ({r.demand_cannibalised} cannibalised)</span>}</span> },
    { key: 'short', label: 'Shortfall', value: (r) => r.shortfall, align: 'right',
      render: (r) => <span className={r.shortfall ? 'font-semibold text-bad' : 'text-dim'}>{r.shortfall}</span> },
    { key: 'order', label: 'Day 0 order', value: (r) => r.day0_order?.qty ?? null,
      render: (r) => r.day0_order ? <span className="text-xs">{r.day0_order.qty} {r.day0_order.qty === 1 ? "unit" : "units"}, arrives Day {r.day0_order.arrives_day}</span> : <span className="text-dim">None</span> },
  ]

  const exportCsv = (d: SparesResponse) => downloadCsv('aeroready-spares.csv',
    ['part_id', 'name', 'category', 'on_hand', 'inbound_qty', 'inbound_days', 'lead_time_days', 'demand', 'demand_cannibalised', 'shortfall', 'day0_order_qty', 'day0_order_arrives'],
    d.inventory.map((r) => [r.part_id, r.name, r.category, r.on_hand, r.inbound_qty, r.inbound.map((a) => a.day).join(' '), r.lead_time_days,
      r.demand, r.demand_cannibalised, r.shortfall, r.day0_order?.qty, r.day0_order?.arrives_day]))

  return (
    <QueryView q={q} skeleton={<div className="space-y-4"><Skeleton h={360} /><Skeleton h={240} /></div>}>
      {(d) => (
        <div className="space-y-4">
          <Panel title="Inventory" actions={<Button onClick={() => exportCsv(d)} icon={<Download className="h-3.5 w-3.5" />}>Export CSV</Button>}>
            <SortTable rows={d.inventory} columns={cols} rowKey={(r) => r.part_id} initialSort={{ key: 'short', dir: 'desc' }} highlight={(r) => r.shortfall > 0} />
            <p className="mt-2 text-xs text-dim">Demand counts parts consumed by work started in the optimised plan. Shortfall is demand from stores beyond stock on hand plus inbound deliveries.</p>
          </Panel>

          <Panel title="Shortage timeline">
            {d.shortage_timeline.length === 0 ? <EmptyState title="No part shortages" detail="Every part the plan needs is on hand or inbound in time." /> : (
              <div className="space-y-4">
                {d.shortage_timeline.map((t) => (
                  <div key={t.part_id} className="rounded-xl border border-line p-3">
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                      <div className="text-sm"><span className="text-dim">{t.part_id}</span> <span className="font-medium text-ink">{t.name}</span></div>
                      <span className={`text-xs ${t.shortfall ? 'text-bad' : 'text-muted'}`}>Shortfall in optimised plan: {t.shortfall}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <div>
                        <div className="label-caps mb-1">Optimised plan</div>
                        {t.optimized.length === 0 ? <p className="text-xs text-dim">No stores demand for this part.</p> : (
                          <table className="w-full text-xs"><thead><tr className="text-left text-dim">
                            <th className="py-1 font-normal">Aircraft</th><th className="font-normal">Needed from</th><th className="font-normal">Part ready</th><th className="font-normal">Planned start</th><th className="text-right font-normal">Days waiting on part</th>
                          </tr></thead><tbody>
                            {t.optimized.map((x) => (
                              <tr key={x.job_id} className="border-t border-line/60">
                                <td className="py-1"><Link to={link(`/app/fleet/${x.aircraft_id}`)} className="text-ink hover:text-accent">{x.aircraft_id}</Link></td>
                                <td className="num">Day {x.need_from}</td><td className="num">Day {x.part_ready_day}</td><td className="num">Day {x.start}</td>
                                <td className={`num text-right ${x.part_wait_days ? 'text-warn' : 'text-dim'}`}>{x.part_wait_days}</td>
                              </tr>
                            ))}
                          </tbody></table>
                        )}
                      </div>
                      <div>
                        <div className="label-caps mb-1">Reactive baseline</div>
                        {t.reactive.length === 0 ? <p className="text-xs text-dim">No aircraft waits for this part.</p> : (
                          <table className="w-full text-xs"><thead><tr className="text-left text-dim">
                            <th className="py-1 font-normal">Aircraft</th><th className="font-normal">Requested</th><th className="font-normal">Part ready</th><th className="font-normal">Start</th><th className="text-right font-normal">Days waiting on part</th>
                          </tr></thead><tbody>
                            {t.reactive.map((x) => (
                              <tr key={x.job_id} className="border-t border-line/60">
                                <td className="py-1"><Link to={link(`/app/fleet/${x.aircraft_id}`)} className="text-ink hover:text-accent">{x.aircraft_id}</Link></td>
                                <td className="num">Day {x.request_day}</td>
                                <td className="num">{x.part_ready_day != null ? `Day ${x.part_ready_day}` : 'After horizon'}</td>
                                <td className="num">{x.start != null ? `Day ${x.start}` : 'After horizon'}</td>
                                <td className="num text-right text-bad">{x.part_wait_days}</td>
                              </tr>
                            ))}
                          </tbody></table>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Cannibalisation actions">
            {d.cannibalizations.length === 0 ? <EmptyState title="No cannibalisation in this plan" /> : (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line text-left">
                  {['Donor', 'Receiver', 'Part', 'Removal', 'Fitted', 'Aircraft-days gained', 'Depends on'].map((h) => <th key={h} className="label-caps py-2 pr-3 font-normal">{h}</th>)}
                </tr></thead>
                <tbody>
                  {d.cannibalizations.map((c) => (
                    <tr key={c.job_id} className="border-b border-line/60 align-top">
                      <td className="py-2 pr-3"><Link to={link(`/app/fleet/${c.donor}`)} className="display text-[15px] font-semibold hover:text-accent">{c.donor}</Link></td>
                      <td className="py-2 pr-3"><Link to={link(`/app/fleet/${c.aircraft_id}`)} className="display text-[15px] font-semibold hover:text-accent">{c.aircraft_id}</Link></td>
                      <td className="py-2 pr-3"><span className="text-dim">{c.part_id}</span> {c.part_name}</td>
                      <td className="num py-2 pr-3">Day {c.removal_day}</td>
                      <td className="num py-2 pr-3">Day {c.day}</td>
                      <td className="num py-2 pr-3 text-accent">{signed(c.aircraft_days_gained)}</td>
                      <td className="py-2 pr-3 text-xs text-muted">{c.condition}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-2 text-xs text-dim">Aircraft-days gained: the optimised plan's total minus the total when the optimiser is re-run without this donor part.</p>
          </Panel>
        </div>
      )}
    </QueryView>
  )
}
