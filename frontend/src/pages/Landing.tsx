import { CalendarRange, ChevronRight, Database, LayoutDashboard, Package, Plane, SlidersHorizontal, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AvailabilityChart, { SERIES_COLORS } from '../components/AvailabilityChart'
import { SimulatedLabel, Skeleton } from '../components/ui'
import { API_BASE } from '../lib/api'
import { pct, signed } from '../lib/format'
import { useMeta, useModelMetrics, useSummary } from '../lib/queries'

// Fill these in before presenting.
const TEAM_NAME = 'Team name'
const GITHUB_URL = '#'

const SECTIONS = [
  { id: 'problem', label: 'Problem' },
  { id: 'how', label: 'How it works' },
  { id: 'console', label: 'Console' },
  { id: 'data', label: 'Data and method' },
]

function Nav() {
  const [solid, setSolid] = useState(false)
  useEffect(() => {
    const on = () => setSolid(window.scrollY > window.innerHeight * 0.6)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <header className={`sticky top-0 z-30 border-b transition-colors ${solid ? 'border-line bg-[#0d131a]' : 'border-transparent bg-bg'}`}>
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-8 px-6">
        <a href="#top" className="display text-xl font-bold tracking-wide">AERO<span className="text-accent">READY</span></a>
        <nav className="hidden flex-1 justify-center gap-6 text-sm text-muted md:flex" aria-label="Sections">
          {SECTIONS.map((s) => <a key={s.id} href={`#${s.id}`} className="hover:text-ink">{s.label}</a>)}
        </nav>
        <Link to="/app/overview" className="ml-auto rounded bg-accent px-4 py-1.5 text-sm font-medium text-bg hover:brightness-110 md:ml-0">Open console</Link>
      </div>
    </header>
  )
}

function HeroChart() {
  const s = useSummary(null, null)
  const meta = useMeta()
  if (s.isPending) return <Skeleton h={340} />
  if (s.isError) {
    return (
      <div className="flex h-[340px] flex-col items-center justify-center gap-2 rounded border border-dashed border-line2 text-center">
        <TriangleAlert className="h-5 w-5 text-warn" aria-hidden />
        <div className="text-sm text-ink">Backend not running</div>
        <div className="max-w-xs text-xs text-muted">The live chart needs the AeroReady service at {API_BASE}.</div>
      </div>
    )
  }
  const d = s.data
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="display num text-4xl font-semibold text-accent">{signed(d.aircraft_days.gain)}</span>
          <span className="ml-2 text-sm text-muted">mission-ready aircraft-days over {d.horizon_days} days, optimised plan vs reactive maintenance</span>
        </div>
        {meta.data && <SimulatedLabel origin={meta.data.data_origin} />}
      </div>
      <AvailabilityChart startDate={d.start_date} maxY={d.fleet_size} height={280} diff={{ a: 'optimized', b: 'reactive', label: 'Difference' }}
        series={[
          { key: 'reactive', label: 'Reactive maintenance', data: d.series.reactive, color: SERIES_COLORS.reactive, dashed: true },
          { key: 'optimized', label: 'Optimised plan', data: d.series.optimized, color: SERIES_COLORS.optimized },
        ]} />
    </div>
  )
}

const STEPS = [
  { title: 'Integrate data', text: 'Engine health, maintenance records, spares stock and hangar capacity are loaded into one data model and checked against a schema.' },
  { title: 'Predict component life', text: 'Gradient-boosted quantile models trained on NASA C-MAPSS give each engine a P10, P50 and P90 remaining life.' },
  { title: 'Optimize fleet schedule', text: 'A CP-SAT model schedules every inspection and engine job within bay, technician and parts limits to maximise mission-ready aircraft-days.' },
  { title: 'Test scenarios', text: 'Part delays, bay closures, surge targets and sortie-rate changes are re-planned and compared before a decision is made.' },
]

const CONSOLE = [
  { to: '/app/overview', icon: LayoutDashboard, title: 'Overview', text: 'See how many aircraft can fly each day and what the plan changes.' },
  { to: '/app/fleet', icon: Plane, title: 'Fleet', text: 'Check each aircraft\'s status, engine life and next task; open any tail for detail.' },
  { to: '/app/plan', icon: CalendarRange, title: 'Plan', text: 'Read the maintenance schedule, its recommendations and hangar utilisation.' },
  { to: '/app/scenarios', icon: SlidersHorizontal, title: 'Scenarios', text: 'Run what-if changes, save them and compare their availability.' },
  { to: '/app/spares', icon: Package, title: 'Spares', text: 'Find part shortfalls, who is waiting, and planned cannibalisation.' },
]

function DataMethod() {
  const m = useModelMetrics()
  const meta = useMeta()
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-3 text-sm text-muted">
        <h3 className="label-caps">What is real</h3>
        <p><span className="text-ink">Engine health.</span> Sensor trajectories and true remaining life come from the NASA C-MAPSS turbofan degradation dataset. The model is trained and tested on it.</p>
        <h3 className="label-caps pt-2">What is simulated</h3>
        <p><span className="text-ink">Everything about the fleet.</span> Fleet size, bases, inspections, spares, lead times and hangar capacity come from a seeded scenario generator.
          {meta.data && ` The current scenario has ${meta.data.aircraft.length} aircraft at ${meta.data.bases.length} bases.`} Every assumption is listed on the Data sources page.</p>
      </div>
      <div>
        <h3 className="label-caps mb-3">Model on the C-MAPSS test sets</h3>
        {m.isPending && <Skeleton h={140} />}
        {m.isError && <p className="text-sm text-muted">Not available: the AeroReady service at {API_BASE} did not respond.</p>}
        {m.data && (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-dim">
              <th className="py-1.5 font-normal">Set</th><th className="font-normal">RMSE</th><th className="font-normal">NASA score</th><th className="font-normal">P10 to P90 coverage</th>
            </tr></thead>
            <tbody>
              {Object.entries(m.data.datasets).map(([ds, r]) => (
                <tr key={ds} className="border-b border-line/60">
                  <td className="py-1.5 text-ink">{ds}</td><td className="num">{r.rmse_p50}</td><td className="num">{r.nasa_score_p50}</td><td className="num">{pct(r.p10_p90_coverage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs text-dim">RMSE in engine cycles. Read from the saved evaluation of the training run.</p>
      </div>
      <div className="space-y-3 text-sm text-muted">
        <h3 className="label-caps">Limitations</h3>
        <p>Not validated on real IAF data. C-MAPSS simulates a commercial turbofan, not a military engine. The prediction intervals are narrower than their nominal coverage.</p>
        <p>Next steps: integration with real health-monitoring, maintenance-record and logistics systems, and validation of the plans with maintenance engineers.</p>
        <div className="flex gap-4 pt-1">
          <Link to="/app/data" className="text-accent hover:underline">Data sources</Link>
          <Link to="/app/model" className="text-accent hover:underline">Model performance and method</Link>
        </div>
      </div>
    </div>
  )
}

export default function Landing() {
  return (
    <div id="top" className="min-h-screen bg-bg">
      <Nav />
      <main>
        <section className="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-10 px-6 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:py-24">
          <div>
            <h1 className="display text-5xl font-bold leading-[1.02] lg:text-6xl">Plan maintenance around fleet availability, not just failures.</h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted">
              AeroReady predicts component life, then schedules maintenance for the whole fleet within hangar, technician and spares limits to keep the most aircraft mission-ready.
            </p>
            <div className="mt-7 flex gap-3">
              <Link to="/app/overview" className="rounded bg-accent px-5 py-2.5 font-medium text-bg hover:brightness-110">Open console</Link>
              <a href="#how" className="rounded border border-line2 px-5 py-2.5 font-medium text-ink hover:border-accent hover:text-accent">How it works</a>
            </div>
          </div>
          <div className="panel p-5"><HeroChart /></div>
        </section>

        <section id="problem" className="scroll-mt-16 border-t border-line">
          <div className="mx-auto max-w-[1280px] px-6 py-16">
            <h2 className="display text-3xl font-semibold uppercase tracking-wide">The problem</h2>
            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
              {[
                ['Fragmented data', 'Health monitoring, technical records, spares and maintenance agencies keep their data apart, so no one sees the whole picture.'],
                ['Reactive maintenance', 'Faults are found late and work starts after something breaks, instead of being planned ahead.'],
                ['Avoidable downtime', 'Aircraft sit idle waiting for bays and parts, and serviceable assets are under-used.'],
              ].map(([t, x]) => (
                <div key={t} className="border-l-2 border-accent pl-4">
                  <h3 className="text-base font-medium text-ink">{t}</h3>
                  <p className="mt-1.5 text-sm text-muted">{x}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-xs text-dim">Source: SIH 2026 problem statement 26249, Ministry of Defence.</p>
          </div>
        </section>

        <section id="how" className="scroll-mt-16 border-t border-line">
          <div className="mx-auto max-w-[1280px] px-6 py-16">
            <h2 className="display text-3xl font-semibold uppercase tracking-wide">How it works</h2>
            <ol className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative">
                  <div className="flex items-center">
                    <div className="display flex h-10 flex-1 items-center rounded border border-line2 bg-panel px-3 text-lg font-semibold uppercase tracking-wider">
                      <span className="mr-2 text-accent">{i + 1}</span>{s.title}
                    </div>
                    {i < STEPS.length - 1 && <ChevronRight className="mx-1 hidden h-5 w-5 shrink-0 text-dim md:block" aria-hidden />}
                  </div>
                  <p className="mt-3 pr-6 text-sm text-muted">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="console" className="scroll-mt-16 border-t border-line">
          <div className="mx-auto max-w-[1280px] px-6 py-16">
            <h2 className="display text-3xl font-semibold uppercase tracking-wide">The console</h2>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {CONSOLE.map((c) => (
                <Link key={c.to} to={c.to} className="panel group p-4 transition-colors hover:border-line2 hover:bg-panel2">
                  <c.icon className="h-5 w-5 text-accent" aria-hidden />
                  <h3 className="mt-3 font-medium text-ink group-hover:text-accent">{c.title}</h3>
                  <p className="mt-1 text-sm text-muted">{c.text}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section id="data" className="scroll-mt-16 border-t border-line">
          <div className="mx-auto max-w-[1280px] px-6 py-16">
            <h2 className="display mb-8 text-3xl font-semibold uppercase tracking-wide">Data and method</h2>
            <DataMethod />
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-dim">
          <span>SIH 2026 · Problem statement 26249 · Air Power – Predictive Maintenance &amp; Fleet Availability</span>
          <span className="flex items-center gap-4">
            <span>{TEAM_NAME}</span>
            <a href={GITHUB_URL} className="hover:text-ink">GitHub repository</a>
            <Link to="/app/data" className="inline-flex items-center gap-1 hover:text-ink"><Database className="h-3 w-3" aria-hidden />Data sources</Link>
          </span>
        </div>
      </footer>
    </div>
  )
}
