import { ArrowUpRight, ChevronDown, TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import AvailabilityChart, { SERIES_COLORS } from '../../components/AvailabilityChart'
import { EmptyState, ErrorBox, Skeleton, SortTable, StatusChip, Tabs } from '../../components/ui'
import { dateTime, dayDate, signed } from '../../lib/format'
import { useConsoleParams } from '../../lib/params'
import { usePlans, usePlansStatus, useReadinessByBase, useReport, useSummary } from '../../lib/queries'

/** Editorial readiness page: hero with the live answer, tabbed attention rows, base table, questions, decision band. */

function PillLink({ to, children, dark = true }: { to: string; children: ReactNode; dark?: boolean }) {
  return (
    <Link to={to} className={`group inline-flex items-center gap-3 rounded-full py-1.5 pl-5 pr-1.5 text-[14px] font-medium transition-colors ${
      dark ? 'bg-ink text-white hover:bg-black' : 'bg-white text-ink ring-1 ring-black/10 hover:bg-panel2'}`}>
      {children}
      <span className={`grid h-8 w-8 place-items-center rounded-full transition-transform group-hover:rotate-45 ${dark ? 'bg-white text-ink' : 'bg-ink text-white'}`}>
        <ArrowUpRight className="h-4 w-4" aria-hidden />
      </span>
    </Link>
  )
}

/** A white floating card, used over the hero window. */
function Float({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl bg-white p-4 shadow-[0_18px_40px_-18px_rgba(20,12,8,0.45)] ring-1 ring-black/[0.04] ${className}`}>{children}</div>
}

// ------------------------------------------------------------------ hero --
function Hero() {
  const { base } = useConsoleParams()
  const q = useSummary('active', base)
  const status = usePlansStatus()
  const w = status.data?.working
  const pending = w?.status === 'Submitted'

  if (q.isPending) return <Skeleton h={520} />
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />
  const s = q.data
  const scope = base ? `at base ${base}` : 'in the fleet'

  return (
    <section className="grid grid-cols-1 items-center gap-12 py-10 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:py-16">
      <div>
        <h1 className="text-[clamp(44px,5vw,76px)] font-medium leading-[1.0] tracking-[-0.04em]">
          {s.mission_ready_today.optimized} of {s.fleet_size} aircraft {scope} can fly today.
        </h1>
        <p className="mt-6 max-w-[48ch] text-[17px] leading-relaxed text-muted">
          Over the next {s.horizon_days} days {s.plan_label.toLowerCase()} keeps an average of {s.avg_available.optimized.toFixed(1)} mission-ready,{' '}
          {s.aircraft_days.gain >= 0 ? `${s.aircraft_days.gain} aircraft-days more` : `${-s.aircraft_days.gain} aircraft-days fewer`} than reactive maintenance.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {pending
            ? <><PillLink to={`/commander/approvals/${w!.id}`}>Review plan v{w!.version}</PillLink><PillLink to="/commander/reports" dark={false}>Open report</PillLink></>
            : <><PillLink to="/commander/reports">Open report</PillLink><PillLink to="/commander/scenarios" dark={false}>Test a scenario</PillLink></>}
        </div>
        {pending && <p className="mt-4 text-[13px] text-muted">Submitted by {w!.submitted_by}, {dateTime(w!.submitted_at)}.</p>}
      </div>

      <div className="relative">
        <div className="relative overflow-hidden rounded-[28px] px-5 pb-10 pt-16 sm:px-12">
          <img src="/img/hero.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_40%]" />
          <div className="absolute inset-0 bg-[#7b5a4e] opacity-60 mix-blend-multiply" />
          <div className="absolute inset-0 bg-[rgba(42,32,27,0.35)]" />
          <div className="relative rounded-[16px] bg-white p-5 shadow-[0_30px_80px_-30px_rgba(20,12,8,0.7)]">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <span className="text-[14px] font-semibold">Mission-ready aircraft per day</span>
              <span className="text-[12px] text-muted">next {s.horizon_days} days</span>
            </div>
            <AvailabilityChart startDate={s.start_date} maxY={base ? Math.max(...s.series.optimized, ...s.series.reactive) : s.fleet_size} surge={base ? null : s.surge} height={240}
              diff={{ a: 'plan', b: 'reactive', label: 'Difference' }}
              series={[
                { key: 'reactive', label: 'Reactive maintenance', data: s.series.reactive, color: SERIES_COLORS.reactive, dashed: true },
                { key: 'plan', label: s.plan_label, data: s.series.optimized, color: SERIES_COLORS.optimized },
              ]} />
          </div>
        </div>
        <Float className="absolute -left-6 -top-6 hidden w-[230px] lg:block">
          <div className="text-[12px] text-muted">Aircraft-days against reactive</div>
          <div className="num mt-1 text-[34px] font-medium leading-none tracking-[-0.03em] text-accent">{signed(s.aircraft_days.gain)}</div>
          <div className="mt-1 text-[11px] text-muted">{s.aircraft_days.optimized} planned, {s.aircraft_days.reactive} reactive</div>
        </Float>
        <Float className="absolute -bottom-8 -right-4 hidden w-[260px] lg:block">
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <TriangleAlert className={`h-4 w-4 ${s.aircraft_at_risk.count ? 'text-bad' : 'text-ok'}`} aria-hidden />
            {s.aircraft_at_risk.count ? `${s.aircraft_at_risk.count} aircraft at risk` : 'No aircraft at risk'}
          </div>
          <div className="mt-1.5 text-[12px] leading-snug text-muted">
            {s.aircraft_at_risk.count ? s.aircraft_at_risk.tails.join(', ') : `No engine reaches its pessimistic forecast in ${s.horizon_days} days.`}
          </div>
        </Float>
      </div>
    </section>
  )
}

// ---------------------------------------------------- attention (tabbed) --
type Tab = 'decisions' | 'risks' | 'spares'

/** One alternating text / live-panel row. */
function Row({ title, text, action, children, flip = false }: { title: string; text: ReactNode; action?: ReactNode; children: ReactNode; flip?: boolean }) {
  return (
    <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className={flip ? 'lg:order-2' : ''}>
        <h3 className="text-[clamp(26px,2.6vw,36px)] font-medium leading-[1.1] tracking-[-0.03em]">{title}</h3>
        <div className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-muted">{text}</div>
        {action && <div className="mt-6">{action}</div>}
      </div>
      <div className={`overflow-hidden rounded-[20px] bg-white ring-1 ring-black/[0.06] ${flip ? 'lg:order-1' : ''}`}>{children}</div>
    </div>
  )
}

function Attention() {
  const [tab, setTab] = useState<Tab>('decisions')
  const plans = usePlans()
  const status = usePlansStatus()
  const report = useReport(0, null)
  const w = status.data?.working

  return (
    <section className="border-t border-line py-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h2 className="max-w-[18ch] text-[clamp(32px,3.6vw,52px)] font-medium leading-[1.05] tracking-[-0.035em]">What needs a decision from you.</h2>
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: 'decisions', label: 'Plans' }, { value: 'risks', label: 'Engine risks' }, { value: 'spares', label: 'Part shortages' },
        ]} />
      </div>
      <div className="mt-12">
        {tab === 'decisions' && (
          <Row title={w?.status === 'Submitted' ? `Plan v${w.version} is waiting for you.` : 'No plan is waiting for approval.'}
            text={w?.status === 'Submitted'
              ? <>Submitted by {w.submitted_by}. The review shows every task it moves, adds or removes, the parts it takes from grounded aircraft and the engine risks it accepts.</>
              : <>{status.data?.label ?? 'Not available'} is in force. Planners submit new versions here when the fleet or the forecast changes.</>}
            action={w?.status === 'Submitted' ? <PillLink to={`/commander/approvals/${w.id}`}>Review plan v{w.version}</PillLink> : <PillLink to="/commander/approvals" dark={false}>See all plans</PillLink>}>
            {plans.isPending ? <div className="p-5"><Skeleton h={200} /></div> : plans.isError ? <div className="p-5"><ErrorBox message={(plans.error as Error).message} /></div> : (
              <SortTable rows={plans.data.plans.slice(0, 6)} rowKey={(p) => p.id} sortable={false} empty={<EmptyState title="No plans yet" />}
                columns={[
                  { key: 'v', label: 'Plan', value: (p) => p.version, render: (p) => <Link to={`/commander/approvals/${p.id}`} className="font-semibold hover:text-accent">v{p.version}</Link> },
                  { key: 's', label: 'Status', value: (p) => p.status, render: (p) => <span className="flex items-center gap-1.5"><StatusChip status={p.status} />{p.active && <span className="text-xs text-ok">Active</span>}</span> },
                  { key: 'by', label: 'Submitted by', value: (p) => p.submitted_by, render: (p) => p.submitted_by ?? <span className="text-dim">Not submitted</span> },
                  { key: 'd', label: 'Aircraft-days', value: (p) => p.aircraft_days ?? null, align: 'right' },
                ]} />
            )}
          </Row>
        )}
        {tab === 'risks' && (
          <Row flip title={report.data ? `${report.data.risks.length} engines reach their pessimistic forecast this month.` : 'Engine risks'}
            text="P10 is the day by which there is a one-in-ten chance the engine has failed. The plan schedules work before it where bays and parts allow."
            action={<PillLink to="/commander/fleet" dark={false}>Open fleet status</PillLink>}>
            {report.isPending ? <div className="p-5"><Skeleton h={200} /></div> : report.isError ? <div className="p-5"><ErrorBox message={(report.error as Error).message} /></div> : (
              <SortTable rows={report.data.risks.slice(0, 6)} rowKey={(r) => r.engine_id} sortable={false} empty={<EmptyState title="No engine reaches its P10 forecast in the horizon" />}
                columns={[
                  { key: 'a', label: 'Aircraft', value: (r) => r.aircraft_id, render: (r) => <Link to={`/commander/fleet/${r.aircraft_id}`} className="font-semibold hover:text-accent">{r.aircraft_id}</Link> },
                  { key: 'e', label: 'Engine', value: (r) => r.engine_id },
                  { key: 'p', label: 'P10, days', value: (r) => r.p10_days, align: 'right' },
                  { key: 'o', label: 'Plan action', value: (r) => r.optimized_action },
                ]} />
            )}
          </Row>
        )}
        {tab === 'spares' && (
          <Row title={report.data ? (report.data.shortages.length ? `${report.data.shortages.length} part types are short.` : 'No part is short this month.') : 'Part shortages'}
            text="A shortage is demand from the plan above stock on hand plus deliveries due inside the horizon. Planners can order on day 0 or take a part from a grounded aircraft."
            action={<PillLink to="/commander/reports" dark={false}>Open report</PillLink>}>
            {report.isPending ? <div className="p-5"><Skeleton h={200} /></div> : report.isError ? <div className="p-5"><ErrorBox message={(report.error as Error).message} /></div> : (
              <SortTable rows={report.data.shortages} rowKey={(p) => p.part_id} sortable={false} empty={<EmptyState title="No part shortages" />}
                columns={[
                  { key: 'p', label: 'Part', value: (p) => p.part_id, render: (p) => <span><span className="font-semibold">{p.part_id}</span> <span className="text-muted">{p.name}</span></span> },
                  { key: 's', label: 'Short by', value: (p) => p.shortfall, align: 'right' },
                  { key: 'l', label: 'Lead time, days', value: (p) => p.lead_time_days, align: 'right' },
                ]} />
            )}
          </Row>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------- by base row --
function Bases() {
  const { home } = useConsoleParams()
  const q = useReadinessByBase('active')
  return (
    <section className="border-t border-line py-16">
      <Row flip title="Readiness by base."
        text={q.data ? <>Each base's aircraft, how many can fly today and the {q.data.horizon_days}-day average under the active plan, with reactive maintenance for comparison.</> : 'Aircraft and availability per base.'}>
        {q.isPending ? <div className="p-5"><Skeleton h={180} /></div> : q.isError ? <div className="p-5"><ErrorBox message={(q.error as Error).message} /></div> : (
          <SortTable rows={q.data.rows} rowKey={(r) => r.base_id} sortable={false} empty={<EmptyState title="No bases" />}
            columns={[
              { key: 'b', label: 'Base', value: (r) => r.base_id, render: (r) => <Link to={`${home}/fleet?base=${r.base_id}`} className="hover:text-accent"><span className="font-semibold">{r.base_id}</span> <span className="text-muted">{r.base_name}</span></Link> },
              { key: 't', label: 'Ready today', value: (r) => r.mission_ready_today, align: 'right', render: (r) => `${r.mission_ready_today} of ${r.aircraft}` },
              { key: 'a', label: 'Average', value: (r) => r.avg_available, align: 'right', render: (r) => <span>{r.avg_available.toFixed(1)} <span className="text-dim">({r.avg_available_reactive.toFixed(1)})</span></span> },
              { key: 'r', label: 'At risk', value: (r) => r.aircraft_at_risk, align: 'right', render: (r) => <span className={r.aircraft_at_risk ? 'text-bad' : 'text-dim'}>{r.aircraft_at_risk}</span> },
            ]} />
        )}
      </Row>
    </section>
  )
}

// ------------------------------------------------------------ questions --
function Question({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group border-b border-line py-5 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[19px] font-medium tracking-[-0.015em]">
        {q}<ChevronDown className="h-5 w-5 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="mt-3 max-w-[70ch] text-[15px] leading-relaxed text-muted">{children}</div>
    </details>
  )
}

function Questions() {
  const { base } = useConsoleParams()
  const s = useSummary('active', base)
  const r = useReport(0, null)
  if (!s.data || !r.data) return null
  const d = s.data
  const low = d.series.optimized.reduce((m, v, i) => (v < d.series.optimized[m] ? i : m), 0)
  const commented = r.data.changes.filter((c) => c.comment)
  return (
    <section className="grid grid-cols-1 gap-10 border-t border-line py-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <h2 className="max-w-[14ch] text-[clamp(32px,3.6vw,52px)] font-medium leading-[1.05] tracking-[-0.035em]">Questions a commander asks.</h2>
      <div className="border-t border-line">
        <Question q="When is availability lowest this month?">
          Day {low}, {dayDate(d.start_date, low)}, with {d.series.optimized[low]} aircraft mission-ready under the active plan
          ({d.series.reactive[low]} under reactive maintenance).
        </Question>
        {d.surge && (
          <Question q="Does the plan meet the surge target?">
            {d.surge_days.filter((x) => x.optimized < x.target).length === 0
              ? `Yes. At least ${d.surge.min_available} aircraft are mission-ready on every day from ${d.surge.start_day} to ${d.surge.end_day}.`
              : `Not on day ${d.surge_days.filter((x) => x.optimized < x.target).map((x) => x.day).join(', ')}. The target is ${d.surge.min_available} aircraft.`}
          </Question>
        )}
        <Question q="Which aircraft are at risk?">
          {d.aircraft_at_risk.count
            ? <>{d.aircraft_at_risk.tails.join(', ')}. Each has an engine whose pessimistic forecast falls inside the {d.horizon_days}-day horizon.</>
            : <>None. No engine reaches its pessimistic forecast inside the {d.horizon_days}-day horizon.</>}
        </Question>
        <Question q="What did the planners change and why?">
          {r.data.changes.length} tasks differ from the reference schedule; {commented.length} carry a planner comment.
          {commented.slice(0, 3).map((c) => <span key={c.job_id} className="mt-2 block text-ink">{c.aircraft_id}, {c.task}: {c.comment}</span>)}
        </Question>
        <Question q="How much does planning gain over reactive maintenance?">
          {signed(d.aircraft_days.gain)} mission-ready aircraft-days over {d.horizon_days} days: {d.aircraft_days.optimized} planned against {d.aircraft_days.reactive} reactive,
          and {d.unplanned_failures.optimized} unplanned engine failures against {d.unplanned_failures.reactive}.
        </Question>
      </div>
    </section>
  )
}

// ------------------------------------------------------------ decision band --
function Band() {
  const status = usePlansStatus()
  const w = status.data?.working
  const pending = w?.status === 'Submitted'
  return (
    <section className="relative mt-4 overflow-hidden rounded-[28px] bg-ink px-8 py-14 text-white sm:px-14">
      <img src="/img/canopy-dusk.jpg" alt="" className="absolute inset-y-0 right-0 hidden h-full w-[42%] object-cover object-[40%_50%] opacity-80 lg:block" />
      <div className="absolute inset-y-0 right-0 hidden w-[42%] bg-[linear-gradient(to_right,#2a201b,transparent_60%)] lg:block" />
      <div className="relative max-w-[30ch]">
        <h2 className="text-[clamp(28px,3vw,44px)] font-medium leading-[1.08] tracking-[-0.03em]">
          {pending ? `Plan v${w!.version} needs your decision.` : 'Take the figures to the briefing.'}
        </h2>
        <p className="mt-4 text-[15px] leading-relaxed text-white/75">
          {pending ? 'Approve it to release work orders for the next seven days, or return it to the planner with a comment.'
            : 'The report covers availability, readiness by base, risks, shortages and plan changes for any date range, as PDF or CSV.'}
        </p>
        <div className="mt-8">
          {pending
            ? <Link to={`/commander/approvals/${w!.id}`} className="group inline-flex items-center gap-3 rounded-full bg-white py-1.5 pl-5 pr-1.5 text-[14px] font-medium text-ink">Review plan v{w!.version}<span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-white transition-transform group-hover:rotate-45"><ArrowUpRight className="h-4 w-4" /></span></Link>
            : <Link to="/commander/reports" className="group inline-flex items-center gap-3 rounded-full bg-white py-1.5 pl-5 pr-1.5 text-[14px] font-medium text-ink">Open report<span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-white transition-transform group-hover:rotate-45"><ArrowUpRight className="h-4 w-4" /></span></Link>}
        </div>
      </div>
    </section>
  )
}

export default function Readiness() {
  return (
    <div>
      <Hero />
      <Attention />
      <Bases />
      <Questions />
      <Band />
    </div>
  )
}
