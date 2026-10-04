import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { PlanResult } from '../api'
import { PillNav } from '../components/Layout'
import { useApi } from '../hooks'

function ArrowCircle() {
  return (
    <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-bg" aria-hidden>
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M3 8h10M9 4l4 4-4 4" />
      </svg>
    </span>
  )
}

function Check() {
  return (
    <svg viewBox="0 0 16 16" className="mt-[3px] h-3.5 w-3.5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const GLYPHS: Record<string, ReactNode> = {
  health: <path d="M2 12h4l2-6 3 10 2-4h5" />,
  plan: <path d="M3 6h9M3 11h14M3 16h7" />,
  whatif: <path d="M4 15c3-8 9-8 12-10M12 5h4v4" />,
}

function StageCard({ step, glyph, title, points, to, cta }: {
  step: string; glyph: string; title: string; points: string[]; to: string; cta: string
}) {
  return (
    <article className="flex min-h-[440px] flex-col rounded-2xl bg-panel p-5 ring-1 ring-white/[0.04]">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-panel2 ring-1 ring-white/5">
            <svg viewBox="0 0 20 20" className="h-4 w-4 text-ink" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              {GLYPHS[glyph]}
            </svg>
          </span>
          <h3 className="text-[15px] font-medium">{title}</h3>
        </div>
        <span className="num text-xs text-dim" title="Step in the planning pipeline">{step}</span>
      </div>
      <ul className="mt-auto space-y-2.5 text-[13px] leading-snug text-ink/85">
        {points.map((p) => <li key={p} className="flex gap-2.5"><Check />{p}</li>)}
      </ul>
      <Link to={to} className="mt-7 inline-flex items-center gap-1.5 text-[13px] text-ink hover:text-accent">
        {cta}
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M5 11l6-6M6 5h5v5" /></svg>
      </Link>
    </article>
  )
}

export default function Home() {
  const plan = useApi<PlanResult>('/api/plan')
  const p = plan.data
  const avg = (a: number[]) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1)

  return (
    <div className="min-w-[1200px] bg-bg">
      {/* Hero ---------------------------------------------------------------- */}
      <section className="relative h-screen min-h-[680px] overflow-hidden">
        <img src="/img/typhoon-storm.jpg" alt="A grey fighter jet banking hard through dark storm cloud at dusk"
          className="absolute inset-0 h-full w-full object-cover object-[50%_48%]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(14,14,13,1)_0%,rgba(14,14,13,0.88)_8%,rgba(14,14,13,0.35)_38%,rgba(14,14,13,0.15)_70%,rgba(14,14,13,0.45)_100%)]" />

        <div className="absolute inset-x-0 top-5 flex justify-center">
          <PillNav overlay />
        </div>

        <div className="absolute inset-x-0 bottom-0 mx-auto flex max-w-[1440px] items-end justify-between gap-10 px-10 pb-16">
          <h1 className="rise select-none text-[clamp(120px,15.5vw,250px)] font-light leading-[0.8] tracking-[-0.055em] text-ink">
            AeroReady<sup className="ml-2 align-[0.9em] text-[0.22em] font-normal">*</sup>
          </h1>
          <div className="rise-late mb-3 max-w-[300px] text-[13px] leading-relaxed text-ink/85">
            <p>
              AeroReady plans maintenance for the whole fleet around engine-health forecasts, hangar bays and spares, so
              more aircraft are ready to fly each day.
            </p>
            {p && (
              <p className="num mt-3 text-ink">
                This month: {avg(p.optimized.available_per_day)} aircraft ready per day instead of {avg(p.baseline.available_per_day)}.
              </p>
            )}
            <Link to="/readiness"
              className="mt-5 inline-flex items-center gap-3 rounded-full bg-black/55 py-1.5 pl-4 pr-1.5 text-[13px] text-ink ring-1 ring-white/15 backdrop-blur hover:bg-black/75">
              Open fleet readiness <ArrowCircle />
            </Link>
            <p className="mt-4 text-[11px] text-ink/55">* Synthetic fleet data. Engine sensor data from <span className="whitespace-nowrap">NASA C-MAPSS</span>.</p>
          </div>
        </div>
      </section>

      {/* How it works -------------------------------------------------------- */}
      <section className="mx-auto max-w-[1440px] px-10 pb-16 pt-24">
        <h2 className="max-w-3xl text-[34px] font-medium leading-[1.15] tracking-[-0.02em]">
          <span className="text-ink">Maintenance planned around the mission.</span><br />
          <span className="text-muted">Built on engine health, hangar capacity and spares.</span>
        </h2>

        <div className="mt-12 grid grid-cols-[1.15fr_1fr_1fr_1fr] gap-3">
          <figure className="relative min-h-[440px] overflow-hidden rounded-2xl">
            <img src="/img/canopy-dusk.jpg" alt="Fighter jet canopy against a dusk sky"
              className="absolute inset-0 h-full w-full object-cover object-[38%_50%]" />
            <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(14,14,13,0.8),transparent_45%)]" />
            <figcaption className="absolute bottom-5 left-5 right-5">
              <div className="text-[15px] font-medium">{p ? `${p.fleet_size} aircraft, ${p.horizon_days} days ahead` : 'Your fleet, 30 days ahead'}</div>
              {p && (
                <div className="num mt-1 text-[13px] text-ink/75">
                  {p.optimized.aircraft_days - p.baseline.aircraft_days >= 0 ? '+' : ''}
                  {p.optimized.aircraft_days - p.baseline.aircraft_days} aircraft-days over reactive maintenance
                </div>
              )}
            </figcaption>
          </figure>
          <StageCard step="01" glyph="health" title="Engine health forecasts" to="/aircraft" cta="See an aircraft"
            points={[
              'Remaining life for every engine, with a likely range, not one number',
              'Trained on NASA turbofan sensor data',
              'Shows which sensors drive each forecast',
            ]} />
          <StageCard step="02" glyph="plan" title="Fleet schedule" to="/plan" cta="Open the plan"
            points={[
              'Fits inspections and engine work around bays, technicians and parts',
              'Groups jobs so an aircraft is grounded once, not twice',
              'Takes parts from grounded aircraft when stores run dry',
            ]} />
          <StageCard step="03" glyph="whatif" title="What-if planning" to="/what-if" cta="Try a scenario"
            points={[
              'Delay a part, close a bay or set a surge target',
              'Re-plans the whole fleet in about a second',
              'Shows the aircraft-days each change costs or saves',
            ]} />
        </div>

        <p className="mt-10 text-xs text-dim">
          Photos: Samuel Arkwright and Mihai Neagu on Unsplash. Fleet, bases and spares are synthetic; engine data is NASA C-MAPSS.
          Decision support prototype for SIH 26249, not for operational use.
        </p>
      </section>
    </div>
  )
}
