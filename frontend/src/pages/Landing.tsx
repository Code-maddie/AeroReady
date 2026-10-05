import { ArrowUpRight, Check, ClipboardCheck, TriangleAlert, Wrench, CalendarRange } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import AvailabilityChart, { SERIES_COLORS } from '../components/AvailabilityChart'
import GooeyNav from '../components/GooeyNav'
import { SimulatedLabel, Skeleton } from '../components/ui'
import { API_BASE } from '../lib/api'
import { ROLE_HOME, useAuth } from '../lib/auth'
import { signed } from '../lib/format'
import { useMeta, useSummary } from '../lib/queries'

const SECTIONS = [
  { id: 'problem', label: 'Problem' },
  { id: 'how', label: 'How it works' },
  { id: 'roles', label: 'Roles' },
  { id: 'data', label: 'Data and method' },
]

function ArrowCircle() {
  return (
    <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-bg" aria-hidden>
      <ArrowUpRight className="h-3.5 w-3.5" />
    </span>
  )
}

/** Floating pill navigation; turns solid once the hero has scrolled past. */
/** Sign-in link that keeps the page the visitor was trying to open. */
function useSignIn() {
  const { search } = useLocation()
  return '/login' + search
}

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
    <header className={`fixed inset-x-0 top-0 z-40 transition-colors ${solid ? 'bg-bg/95 ring-1 ring-white/5 backdrop-blur-md' : ''}`}>
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-6 lg:px-10">
        <a href="#top" className={`text-[19px] font-medium tracking-[-0.03em] transition-opacity ${solid ? 'opacity-100' : 'opacity-0'}`}>
          AeroReady<sup className="ml-px text-[12px] text-ink/70">*</sup>
        </a>
        <div className="hidden md:block">
          <GooeyNav label="Sections" initialActiveIndex={-1} items={SECTIONS.map((s) => ({ label: s.label, href: `#${s.id}` }))} />
        </div>
        <Link to={user ? ROLE_HOME[user.role] : signIn} className="inline-flex items-center gap-3 rounded-full bg-black/55 py-1.5 pl-4 pr-1.5 text-[13px] ring-1 ring-white/15 backdrop-blur hover:bg-black/75">
          {user ? 'Open console' : 'Sign in'} <ArrowCircle />
        </Link>
      </div>
    </header>
  )
}

function Hero() {
  const { user } = useAuth()
  const signIn = useSignIn()
  return (
    <section className="relative h-screen min-h-[660px] overflow-hidden">
      <img src="/img/typhoon-storm.jpg" alt="A fighter jet banking through storm cloud at dusk"
        className="absolute inset-0 h-full w-full object-cover object-[50%_48%]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(14,14,13,1)_0%,rgba(14,14,13,0.85)_12%,rgba(14,14,13,0.3)_45%,rgba(14,14,13,0.15)_70%,rgba(14,14,13,0.5)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 mx-auto flex max-w-[1440px] flex-wrap items-end justify-between gap-x-10 gap-y-6 px-6 pb-14 lg:px-10">
        <p className="rise select-none text-[clamp(84px,14vw,230px)] font-light leading-[0.8] tracking-[-0.055em] text-ink" aria-hidden>
          AeroReady<sup className="ml-2 align-[0.9em] text-[0.22em] font-normal">*</sup>
        </p>
        <div className="rise-late mb-2 max-w-[360px]">
          <h1 className="text-[22px] font-medium leading-snug tracking-[-0.01em] text-ink">Plan maintenance around fleet availability, not just failures.</h1>
          <p className="mt-3 text-[13px] leading-relaxed text-ink/80">
            AeroReady predicts component life, then schedules maintenance for the whole fleet within hangar, technician and spares limits to keep the most aircraft mission-ready.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to={user ? ROLE_HOME[user.role] : signIn} className="inline-flex items-center gap-3 rounded-full bg-ink py-1.5 pl-4 pr-1.5 text-[13px] font-medium text-bg hover:bg-white">
              {user ? 'Open console' : 'Sign in'} <span className="grid h-7 w-7 place-items-center rounded-full bg-bg text-ink"><ArrowUpRight className="h-3.5 w-3.5" /></span>
            </Link>
            <a href="#how" className="inline-flex items-center rounded-full bg-black/55 px-4 py-1.5 text-[13px] text-ink ring-1 ring-white/15 backdrop-blur hover:bg-black/75">How it works</a>
          </div>
          <p className="mt-4 text-[11px] text-ink/55">* Simulated fleet scenario. Engine sensor data from <span className="whitespace-nowrap">NASA C-MAPSS</span>.</p>
        </div>
      </div>
    </section>
  )
}

function TwoTone({ a, b }: { a: string; b: string }) {
  return (
    <h2 className="max-w-3xl text-[34px] font-medium leading-[1.15] tracking-[-0.02em]">
      <span className="text-ink">{a}</span><br /><span className="text-muted">{b}</span>
    </h2>
  )
}

function LiveChart() {
  const s = useSummary('active', null)
  const meta = useMeta()
  return (
    <section className="mx-auto max-w-[1440px] px-6 pt-20 lg:px-10">
      <TwoTone a={s.data ? `Fleet availability, next ${s.data.horizon_days} days.` : 'Fleet availability.'} b="Reactive maintenance against the active plan, live from the planner." />
      <div className="panel mt-10 p-6">
        {s.isPending && <Skeleton h={340} />}
        {s.isError && (
          <div className="flex h-[340px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line2 text-center">
            <TriangleAlert className="h-5 w-5 text-warn" aria-hidden />
            <div className="text-sm text-ink">Backend not running</div>
            <div className="max-w-xs text-xs text-muted">The live chart needs the AeroReady service at {API_BASE}.</div>
          </div>
        )}
        {s.data && (
          <>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <span className="display num text-[44px] font-medium leading-none text-accent">{signed(s.data.aircraft_days.gain)}</span>
                <span className="ml-3 text-sm text-muted">mission-ready aircraft-days, active plan minus reactive maintenance</span>
              </div>
              {meta.data && <SimulatedLabel origin={meta.data.data_origin} />}
            </div>
            <AvailabilityChart startDate={s.data.start_date} maxY={s.data.fleet_size} height={320} diff={{ a: 'optimized', b: 'reactive', label: 'Difference' }}
              series={[
                { key: 'reactive', label: 'Reactive maintenance', data: s.data.series.reactive, color: SERIES_COLORS.reactive, dashed: true },
                { key: 'optimized', label: s.data.plan_label, data: s.data.series.optimized, color: SERIES_COLORS.optimized },
              ]} />
          </>
        )}
      </div>
    </section>
  )
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <article className={`flex flex-col rounded-2xl bg-panel p-5 ring-1 ring-white/[0.04] ${className}`}>{children}</article>
}

const STEPS = [
  { title: 'Integrate data', points: ['Engine health, maintenance records, spares and hangar capacity in one data model', 'Each source checked against a schema'] },
  { title: 'Predict component life', points: ['Quantile models trained on NASA C-MAPSS', 'P10, P50 and P90 remaining life per engine'] },
  { title: 'Optimize fleet schedule', points: ['CP-SAT schedules every inspection and engine job', 'Within bay, technician and parts limits, for the most mission-ready aircraft-days'] },
  { title: 'Test scenarios', points: ['Part delays, bay closures, surge targets and sortie rates', 'Re-planned and compared before a decision'] },
]

const ROLES = [
  { icon: CalendarRange, title: 'Planner', text: 'Runs the optimiser, accepts, modifies or rejects each recommendation, moves tasks within bay, technician and parts limits, and submits the plan.' },
  { icon: ClipboardCheck, title: 'Commander', text: 'Sees fleet readiness, reviews what a submitted plan changes and the risks it accepts, then approves it or returns it with a comment.' },
  { icon: Wrench, title: 'Technician', text: 'Receives work orders for the next seven days from the approved plan, records hours, parts and findings, and reports defects.' },
]

function DataMethod() {
  return (
    <div className="mt-10 grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Card>
        <h3 className="text-[15px] font-medium">What is real and what is simulated</h3>
        <ul className="mt-4 space-y-3 text-[13px] text-ink/85">
          <li className="flex gap-2.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" aria-hidden /><span><span className="text-ink">Real:</span> engine sensor trajectories and true remaining life from the NASA C-MAPSS turbofan degradation dataset. The model is trained and tested on it.</span></li>
          <li className="flex gap-2.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden /><span><span className="text-ink">Simulated:</span> fleet size, bases, inspections, spares, lead times, capacity and people, from a seeded scenario generator.</span></li>
        </ul>
      </Card>
      <Card>
        <h3 className="text-[15px] font-medium">Limitations</h3>
        <ul className="mt-4 space-y-3 text-[13px] text-ink/85">
          {['Not validated on real IAF data.', 'C-MAPSS simulates a commercial turbofan, not a military engine.', 'Prediction intervals are narrower than their nominal coverage.',
            'Next steps: integration with real health-monitoring, maintenance-record and logistics systems, and validation with maintenance engineers.'].map((t) => (
            <li key={t} className="flex gap-2.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />{t}</li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

export default function Landing() {
  const { user } = useAuth()
  return (
    <div id="top" className="min-h-screen bg-bg">
      <Nav />
      <main>
        <Hero />
        {user && <LiveChart />}

        <section id="problem" className="mx-auto max-w-[1440px] scroll-mt-20 px-6 pt-24 lg:px-10">
          <TwoTone a="Why aircraft sit idle." b="Three findings from the problem statement." />
          <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              ['Fragmented data', 'Health monitoring, technical records, spares and maintenance agencies keep their data apart, so no one sees the whole picture.'],
              ['Reactive maintenance', 'Faults are found late and work starts after something breaks, instead of being planned ahead.'],
              ['Avoidable downtime', 'Aircraft sit idle waiting for bays and parts, and serviceable assets are under-used.'],
            ].map(([t, x]) => (
              <Card key={t}><h3 className="text-[15px] font-medium">{t}</h3><p className="mt-2 text-[13px] leading-relaxed text-ink/80">{x}</p></Card>
            ))}
          </div>
          <p className="mt-5 text-xs text-dim">Source: SIH 2026 problem statement 26249, Ministry of Defence.</p>
        </section>

        <section id="how" className="mx-auto max-w-[1440px] scroll-mt-20 px-6 pt-24 lg:px-10">
          <TwoTone a="Maintenance planned around the mission." b="Built on engine health, hangar capacity and spares." />
          <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1.1fr_1fr_1fr_1fr_1fr]">
            <figure className="relative min-h-[380px] overflow-hidden rounded-2xl">
              <img src="/img/canopy-dusk.jpg" alt="Fighter jet canopy against a dusk sky" className="absolute inset-0 h-full w-full object-cover object-[38%_50%]" />
              <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(14,14,13,0.85),transparent_50%)]" />
              <figcaption className="absolute bottom-5 left-5 right-5 text-[15px] font-medium">One plan for the whole fleet</figcaption>
            </figure>
            {STEPS.map((s, i) => (
              <Card key={s.title} className="min-h-[380px]">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[15px] font-medium">{s.title}</h3>
                  <span className="num text-xs text-dim" title="Step in the pipeline">{String(i + 1).padStart(2, '0')}</span>
                </div>
                <ul className="mt-auto space-y-2.5 text-[13px] leading-snug text-ink/85">
                  {s.points.map((p) => <li key={p} className="flex gap-2.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />{p}</li>)}
                </ul>
              </Card>
            ))}
          </div>
        </section>

        <section id="roles" className="mx-auto max-w-[1440px] scroll-mt-20 px-6 pt-24 lg:px-10">
          <TwoTone a="Three roles, one plan." b="The optimiser proposes; people decide." />
          <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-3">
            {ROLES.map((r) => (
              <Card key={r.title} className="min-h-[220px]">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-panel2 ring-1 ring-white/5"><r.icon className="h-4 w-4 text-ink" aria-hidden /></span>
                <h3 className="mt-4 text-[15px] font-medium">{r.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink/75">{r.text}</p>
              </Card>
            ))}
          </div>
        </section>

        <section id="data" className="mx-auto max-w-[1440px] scroll-mt-20 px-6 pb-20 pt-24 lg:px-10">
          <TwoTone a="Data and method." b="What the numbers are built on, and where they stop." />
          <DataMethod />
        </section>
      </main>

      <footer className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-dim lg:px-10">
        <span>SIH 2026 · Problem statement 26249 · Air Power – Predictive Maintenance &amp; Fleet Availability</span>
        <span className="flex items-center gap-4">
          <span>Photos: Samuel Arkwright, Mihai Neagu (Unsplash)</span>
        </span>
      </footer>
    </div>
  )
}
