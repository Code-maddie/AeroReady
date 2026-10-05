import { ArrowUpRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import AvailabilityChart, { SERIES_COLORS } from '../components/AvailabilityChart'
import GooeyNav from '../components/GooeyNav'
import SideRays from '../components/SideRays'
import { Skeleton } from '../components/ui'
import { ROLE_HOME, useAuth } from '../lib/auth'
import { signed } from '../lib/format'
import { useSummary } from '../lib/queries'

const SECTIONS = [
  { id: 'question', label: 'The question' },
  { id: 'idle', label: 'Why aircraft sit idle' },
  { id: 'how', label: 'How it works' },
  { id: 'roles', label: 'Roles' },
  { id: 'data', label: 'Data' },
]

/** Sign-in link that keeps the page the visitor was trying to open. */
function useSignIn() {
  const { search } = useLocation()
  return '/login' + search
}

/** Dark pill with a light circle holding the arrow, as in the hero reference. */
function PillLink({ to, children, light = false }: { to: string; children: string; light?: boolean }) {
  return (
    <Link to={to} className={`group inline-flex items-center gap-3 rounded-full py-1.5 pl-5 pr-1.5 text-[14px] font-medium transition-colors ${
      light ? 'bg-white text-ink hover:bg-white/90' : 'bg-ink text-white hover:bg-black'}`}>
      {children}
      <span className={`grid h-8 w-8 place-items-center rounded-full transition-transform group-hover:rotate-45 ${light ? 'bg-ink text-white' : 'bg-white text-ink'}`}>
        <ArrowUpRight className="h-4 w-4" aria-hidden />
      </span>
    </Link>
  )
}

// ---------------------------------------------------------------- nav --
function Nav() {
  const { user } = useAuth()
  const signIn = useSignIn()
  const [solid, setSolid] = useState(false)
  useEffect(() => {
    const on = () => setSolid(window.scrollY > window.innerHeight * 0.85)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <header className={`fixed inset-x-0 top-0 z-40 transition-colors ${solid ? 'bg-bg shadow-[0_1px_0_var(--color-line)]' : ''}`}>
      <div className="mx-auto grid h-16 max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 lg:px-10">
        <a href="#top" className={`justify-self-start text-[19px] font-semibold tracking-[-0.03em] transition-opacity ${solid ? 'text-ink opacity-100' : 'opacity-0'}`}>
          AeroReady<sup className="ml-px text-[12px]">*</sup>
        </a>
        <div className="hidden md:block">
          <GooeyNav label="Sections" initialActiveIndex={-1} items={SECTIONS.map((s) => ({ label: s.label, href: `#${s.id}` }))} />
        </div>
        <div className="justify-self-end">
          <PillLink to={user ? ROLE_HOME[user.role] : signIn} light={!solid}>{user ? 'Open console' : 'Sign in'}</PillLink>
        </div>
      </div>
    </header>
  )
}

// --------------------------------------------------------------- hero --
function Hero() {
  const { user } = useAuth()
  const signIn = useSignIn()
  return (
    <section className="relative h-screen min-h-[680px] overflow-hidden bg-ink">
      <img src="/img/hero.jpg" alt="A fighter jet banking through storm cloud at dusk"
        className="absolute inset-0 h-full w-full object-cover object-[50%_48%]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(16,18,22,0.92)_0%,rgba(16,18,22,0.55)_22%,rgba(16,18,22,0.05)_55%,rgba(16,18,22,0.25)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 mx-auto flex max-w-[1440px] flex-col items-start gap-8 px-6 pb-12 lg:flex-row lg:items-end lg:justify-between lg:px-10">
        <p className="rise select-none text-[clamp(84px,12.5vw,230px)] font-normal leading-[0.78] tracking-[-0.06em] text-[#f6f1e7]" aria-hidden>
          AeroReady<sup className="ml-2 align-[0.95em] text-[0.2em] font-normal">*</sup>
        </p>
        <div className="rise-late mb-3 max-w-[320px] shrink-0 text-white">
          <h1 className="text-[15px] font-medium leading-snug">Maintenance planned around how many aircraft can fly, not around the next failure.</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-white/75">
            AeroReady forecasts engine life, then schedules every inspection and repair across the fleet within hangar, technician and spares limits.
          </p>
          <div className="mt-5"><PillLink to={user ? ROLE_HOME[user.role] : signIn} light>{user ? 'Open console' : 'Sign in'}</PillLink></div>
        </div>
      </div>
      <p className="absolute right-6 top-20 text-[11px] text-white/60 lg:right-10">* Simulated fleet scenario. Engine sensor data from NASA C-MAPSS.</p>
    </section>
  )
}

// ------------------------------------------- the question (side rays) --
const ANSWER = [
  ['Engine life', 'Quantile models trained on NASA C-MAPSS give each engine a pessimistic, median and optimistic remaining life.'],
  ['A plan that fits', 'A constraint solver places every job inside hangar bays, technician hours and parts on hand.'],
  ['People decide', 'Planners adjust it, the commander approves it, and only then does work reach technicians.'],
]

function LiveFigure() {
  const s = useSummary('active', null)
  if (s.isPending) return <Skeleton h={300} />
  if (s.isError || !s.data) return <p className="text-[14px] text-muted">The live plan is not available: {(s.error as Error | null)?.message ?? 'no data'}.</p>
  return (
    <div className="rounded-[28px] bg-white/80 p-6 ring-1 ring-black/[0.06] backdrop-blur">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="num text-[64px] font-medium leading-none tracking-[-0.04em] text-accent">{signed(s.data.aircraft_days.gain)}</span>
        <span className="max-w-xs text-[14px] text-muted">mission-ready aircraft-days over the next {s.data.horizon_days} days, {s.data.plan_label.toLowerCase()} against reactive maintenance</span>
      </div>
      <div className="mt-6">
        <AvailabilityChart startDate={s.data.start_date} maxY={s.data.fleet_size} height={260} diff={{ a: 'plan', b: 'reactive', label: 'Difference' }}
          series={[
            { key: 'reactive', label: 'Reactive maintenance', data: s.data.series.reactive, color: SERIES_COLORS.reactive, dashed: true },
            { key: 'plan', label: s.data.plan_label, data: s.data.series.optimized, color: SERIES_COLORS.optimized },
          ]} />
      </div>
    </div>
  )
}

function Question() {
  const { user } = useAuth()
  return (
    <section id="question" className="relative scroll-mt-16 overflow-hidden">
      <div className="absolute inset-0">
        <SideRays rayColor1="#e39a3b" rayColor2="#6f9cc9" intensity={3} spread={2.2} speed={1.6} saturation={1.3} blend={0.5} falloff={0.9} opacity={0.85} />
      </div>
      <div className="relative z-[4] mx-auto max-w-[1440px] px-6 py-28 lg:px-10 lg:py-36">
        <h2 className="max-w-[17ch] text-[clamp(40px,5.4vw,76px)] font-medium leading-[1.02] tracking-[-0.035em] text-ink">
          How many aircraft can fly each day this month, and what would raise that number?
        </h2>
        <p className="mt-6 max-w-[52ch] text-[17px] leading-relaxed text-muted">
          That is the commander's question in problem statement 26249. AeroReady answers it with one fleet-wide plan instead of a list of alerts.
        </p>
        <dl className="mt-16 grid max-w-5xl grid-cols-1 gap-x-12 gap-y-10 md:grid-cols-3">
          {ANSWER.map(([t, d]) => (
            <div key={t} className="border-t-2 border-ink pt-4">
              <dt className="text-[17px] font-semibold tracking-[-0.01em]">{t}</dt>
              <dd className="mt-2 text-[14px] leading-relaxed text-muted">{d}</dd>
            </div>
          ))}
        </dl>
        {user && <div className="mt-20 max-w-5xl"><LiveFigure /></div>}
      </div>
    </section>
  )
}

// ------------------------------------------------ why aircraft sit idle --
/** One aircraft's month, drawn twice. An illustration of the mechanism, not fleet data. */
function Strip({ label, parts }: { label: string; parts: { w: number; cls: string; text?: string }[] }) {
  return (
    <div>
      <div className="mb-2 text-[13px] font-medium text-ink">{label}</div>
      <div className="flex h-11 overflow-hidden rounded-full ring-1 ring-black/[0.06]">
        {parts.map((p, i) => (
          <div key={i} style={{ width: `${p.w}%` }} className={`flex items-center px-3 text-[12px] font-medium ${p.cls}`}>
            <span className="truncate">{p.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const CAUSES = [
  ['Data kept apart', 'Health monitoring, technical records, spares and maintenance agencies each hold part of the picture.'],
  ['Work starts after the fault', 'Repairs are triggered by failures, so bays and parts are found busy or missing at the worst moment.'],
  ['Waiting, not flying', 'Aircraft sit grounded for a bay or a part while serviceable assets elsewhere are under-used.'],
]

function Idle() {
  return (
    <section id="idle" className="scroll-mt-16 bg-white">
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-16 px-6 py-28 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:px-10">
        <div>
          <h2 className="max-w-[14ch] text-[clamp(32px,3.6vw,52px)] font-medium leading-[1.05] tracking-[-0.03em]">Why aircraft sit idle.</h2>
          <ul className="mt-10 space-y-7">
            {CAUSES.map(([t, d]) => (
              <li key={t} className="grid grid-cols-[14px_1fr] gap-4">
                <span className="mt-2 h-2.5 w-2.5 rounded-full bg-accent" aria-hidden />
                <div><div className="text-[17px] font-semibold tracking-[-0.01em]">{t}</div><p className="mt-1 text-[14px] leading-relaxed text-muted">{d}</p></div>
              </li>
            ))}
          </ul>
          <p className="mt-10 text-[12px] text-dim">From SIH 2026 problem statement 26249, Ministry of Defence.</p>
        </div>
        <figure className="self-center rounded-[32px] bg-bg p-8 lg:p-10">
          <figcaption className="mb-8 max-w-[46ch] text-[15px] leading-relaxed text-ink">
            The same aircraft over one month. Reactive maintenance flies the engine to failure and then waits; a planned repair takes it out earlier, briefly, when a bay and the part are free.
          </figcaption>
          <div className="space-y-7">
            <Strip label="Reactive" parts={[
              { w: 32, cls: 'bg-[#dfe7ef] text-[#36506b]', text: 'Flying' },
              { w: 9, cls: 'bg-bad text-white', text: 'Fails' },
              { w: 29, cls: 'hatch-red text-[#7a2a1d]', text: 'Waiting for a bay and the part' },
              { w: 12, cls: 'bg-[#e9d9c2] text-[#6b4a1d]', text: 'Repair' },
              { w: 18, cls: 'bg-[#dfe7ef] text-[#36506b]', text: 'Flying' },
            ]} />
            <Strip label="Planned" parts={[
              { w: 22, cls: 'bg-[#dfe7ef] text-[#36506b]', text: 'Flying' },
              { w: 12, cls: 'bg-accent text-white', text: 'Repair' },
              { w: 66, cls: 'bg-[#dfe7ef] text-[#36506b]', text: 'Flying for the rest of the month' },
            ]} />
          </div>
          <p className="mt-6 text-[12px] text-dim">Illustration of the mechanism, not fleet data.</p>
        </figure>
      </div>
    </section>
  )
}

// ---------------------------------------------------------- how it works --
const STEPS = [
  ['Integrate', 'Engine health, maintenance records, spares and hangar capacity in one data model, each source checked against a schema.'],
  ['Forecast', 'Remaining engine life with a P10 to P90 range for every engine, from sensor trajectories.'],
  ['Optimise', 'Every inspection and repair placed for the most mission-ready aircraft-days, within bay, technician and parts limits.'],
  ['Review and approve', 'The planner accepts, moves or rejects each change; the commander approves the plan or returns it.'],
  ['Release work', 'Tasks in the next seven days become work orders; completions and defects feed the next plan.'],
]

function How() {
  return (
    <section id="how" className="scroll-mt-16">
      <div className="mx-auto max-w-[1440px] px-6 py-28 lg:px-10">
        <h2 className="max-w-[20ch] text-[clamp(32px,3.6vw,52px)] font-medium leading-[1.05] tracking-[-0.03em]">From sensor data to a work order on the hangar floor.</h2>
        <div className="mt-14 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <figure className="relative min-h-[460px] overflow-hidden rounded-[32px]">
            <img src="/img/canopy-dusk.jpg" alt="Fighter jet canopy against a dusk sky" className="absolute inset-0 h-full w-full object-cover object-[38%_50%]" />
            <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(16,18,22,0.75),transparent_55%)]" />
            <figcaption className="absolute bottom-7 left-7 right-7 text-[22px] font-medium leading-tight tracking-[-0.02em] text-white">One plan for the whole fleet, not one alert per engine.</figcaption>
          </figure>
          <ol className="relative self-center">
            <span className="absolute bottom-6 left-[19px] top-6 w-px bg-line2" aria-hidden />
            {STEPS.map(([t, d], i) => (
              <li key={t} className="relative grid grid-cols-[40px_1fr] gap-5 py-4">
                <span className={`num relative z-10 grid h-10 w-10 place-items-center rounded-full text-[13px] font-semibold ${
                  i === STEPS.length - 1 ? 'bg-accent text-white' : 'bg-white text-ink ring-1 ring-line2'}`}>{i + 1}</span>
                <div className="pt-1.5">
                  <div className="text-[19px] font-semibold tracking-[-0.015em]">{t}</div>
                  <p className="mt-1 max-w-[58ch] text-[14px] leading-relaxed text-muted">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

// ------------------------------------------------------------------ roles --
const ROLES = [
  ['Planner', 'Runs the optimiser, accepts, modifies or rejects each recommendation, moves tasks within bay, technician and parts limits, and submits the plan.'],
  ['Commander', 'Sees fleet readiness, reviews what a submitted plan changes and which risks it accepts, then approves it or returns it with a comment.'],
  ['Technician', 'Receives work orders for the next seven days, records hours, parts and findings, and reports defects that ground an aircraft.'],
]

function Roles() {
  return (
    <section id="roles" className="scroll-mt-16 bg-white">
      <div className="mx-auto max-w-[1440px] px-6 py-28 lg:px-10">
        <h2 className="max-w-[18ch] text-[clamp(32px,3.6vw,52px)] font-medium leading-[1.05] tracking-[-0.03em]">Three roles. The optimiser proposes; people decide.</h2>
        <div className="mt-14 border-t border-line">
          {ROLES.map(([r, d]) => (
            <div key={r} className="grid grid-cols-1 items-baseline gap-x-12 gap-y-2 border-b border-line py-9 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <h3 className="text-[clamp(40px,5vw,72px)] font-medium leading-none tracking-[-0.045em]">{r}</h3>
              <p className="max-w-[56ch] text-[16px] leading-relaxed text-muted">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ------------------------------------------------------------------- data --
function Data() {
  return (
    <section id="data" className="scroll-mt-16">
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-16 px-6 py-28 lg:grid-cols-2 lg:px-10">
        <div>
          <h2 className="max-w-[16ch] text-[clamp(32px,3.6vw,52px)] font-medium leading-[1.05] tracking-[-0.03em]">What the numbers are built on.</h2>
          <dl className="mt-10 space-y-8">
            <div>
              <dt className="flex items-center gap-3 text-[17px] font-semibold"><span className="h-2.5 w-2.5 rounded-full bg-ok" aria-hidden />Real</dt>
              <dd className="mt-1.5 max-w-[56ch] text-[14px] leading-relaxed text-muted">Engine sensor trajectories and true remaining life from the NASA C-MAPSS turbofan degradation dataset. The model is trained and tested on it.</dd>
            </div>
            <div>
              <dt className="flex items-center gap-3 text-[17px] font-semibold"><span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden />Simulated</dt>
              <dd className="mt-1.5 max-w-[56ch] text-[14px] leading-relaxed text-muted">Fleet size, bases, inspections, spares, lead times, capacity and people, from a seeded scenario generator. Every assumption is in one configuration file and shown in the console.</dd>
            </div>
          </dl>
        </div>
        <div className="lg:pt-24">
          <h3 className="text-[17px] font-semibold">Where it stops</h3>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {['Not validated on real IAF data.', 'C-MAPSS simulates a commercial turbofan, not a military engine.',
              'Prediction intervals are narrower than their nominal coverage.',
              'Next: integration with real health-monitoring, maintenance-record and logistics systems, and validation with maintenance engineers.'].map((t) => (
              <li key={t} className="py-3.5 text-[14px] leading-relaxed text-ink">{t}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

// ----------------------------------------------------------------- footer --
function Footer() {
  const { user } = useAuth()
  const signIn = useSignIn()
  return (
    <footer className="overflow-hidden border-t border-line bg-panel2 text-ink">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-end justify-between gap-8 px-6 pt-20 lg:px-10">
        <p className="max-w-[22ch] text-[clamp(28px,3vw,40px)] font-medium leading-[1.1] tracking-[-0.03em]">Open the plan, approvals and work orders for your role.</p>
        <PillLink to={user ? ROLE_HOME[user.role] : signIn}>{user ? 'Open console' : 'Sign in'}</PillLink>
      </div>
      <p className="mx-auto mt-12 max-w-[1440px] select-none px-4 text-[clamp(88px,17vw,280px)] font-normal leading-[0.75] tracking-[-0.065em] text-ink/[0.07] lg:px-8" aria-hidden>
        AeroReady*
      </p>
      <div className="mx-auto flex max-w-[1440px] flex-wrap justify-between gap-3 px-6 py-6 text-[12px] text-muted lg:px-10">
        <span>SIH 2026, problem statement 26249: Air Power, predictive maintenance and fleet availability.</span>
        <span>Photos: Samuel Arkwright, Mihai Neagu (Unsplash). Decision support prototype, not for operational use.</span>
      </div>
    </footer>
  )
}

export default function Landing() {
  return (
    <div id="top" className="min-h-screen bg-bg text-ink">
      <Nav />
      <main>
        <Hero />
        <Question />
        <Idle />
        <How />
        <Roles />
        <Data />
      </main>
      <Footer />
    </div>
  )
}
