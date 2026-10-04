import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DEFAULT_SCENARIO, postPlan, type Meta, type PlanResult, type Scenario } from '../api'
import AvailabilityChart, { type Series } from '../components/AvailabilityChart'
import { PageHead } from '../components/Layout'
import { ErrorState, Loading } from '../components/States'
import { useApi } from '../hooks'

interface Draft {
  partId: string; partDays: number
  closeBase: string; closeBays: number; closeStart: number; closeEnd: number
  surgeOn: boolean; surgeStart: number; surgeEnd: number; surgeMin: number
  sortie: number
}
const EMPTY: Draft = {
  partId: '', partDays: 10, closeBase: '', closeBays: 1, closeStart: 8, closeEnd: 14,
  surgeOn: false, surgeStart: 10, surgeEnd: 16, surgeMin: 21, sortie: 1,
}
const PRESETS: { key: string; label: string; hint: string; draft: Partial<Draft> }[] = [
  { key: 'spares', label: 'Spares delay', hint: 'Main bearing supplier slips 10 days', draft: { partId: 'P04', partDays: 10 } },
  { key: 'surge', label: 'Surge', hint: '≥ 21 mission-ready aircraft, Days 10–16', draft: { surgeOn: true, surgeStart: 10, surgeEnd: 16, surgeMin: 21 } },
  { key: 'bay', label: 'Bay closure', hint: 'One BS bay out of action, Days 8–14', draft: { closeBase: 'BS', closeBays: 1, closeStart: 8, closeEnd: 14 } },
  { key: 'tempo', label: 'High tempo', hint: 'Sortie rate ×1.3 (engines age faster)', draft: { sortie: 1.3 } },
]

function toScenario(d: Draft): Scenario {
  return {
    ...DEFAULT_SCENARIO,
    part_delays: d.partId && d.partDays > 0 ? [{ part_id: d.partId, days: d.partDays }] : [],
    bay_closures: d.closeBase ? [{ base_id: d.closeBase, start_day: d.closeStart, end_day: Math.max(d.closeStart, d.closeEnd), bays_closed: d.closeBays }] : [],
    surge: d.surgeOn ? { start_day: d.surgeStart, end_day: Math.max(d.surgeStart, d.surgeEnd), min_available: d.surgeMin } : null,
    sortie_rate_multiplier: d.sortie,
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex items-center justify-between gap-3 text-xs text-muted"><span>{label}</span>{children}</label>
}
function DayInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <input type="number" min={0} max={29} value={value} className="num w-16 text-right text-xs"
    onChange={(e) => onChange(Math.max(0, Math.min(29, Number(e.target.value) || 0)))} />
}

export default function WhatIf() {
  const base = useApi<PlanResult>('/api/plan')
  const meta = useApi<Meta>('/api/meta')
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [current, setCurrent] = useState<PlanResult | null>(null)
  const [previous, setPrevious] = useState<PlanResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [runs, setRuns] = useState(0)
  const [params] = useSearchParams()
  const autoRan = useRef(false)
  useEffect(() => { if (base.data && !current) setCurrent(base.data) }, [base.data, current])
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))

  const replan = async (d: Draft = draft) => {
    if (!current) return
    setBusy(true); setError(null)
    try {
      const r = await postPlan(toScenario(d))
      setPrevious(current); setCurrent(r); setRuns((n) => n + 1)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  // /what-if?preset=spares|surge|bay|tempo runs a preset on load (handy for the demo script).
  useEffect(() => {
    const preset = PRESETS.find((p) => p.key === params.get('preset'))
    if (!preset || !current || autoRan.current) return
    autoRan.current = true
    const d = { ...EMPTY, ...preset.draft }
    setDraft(d)
    replan(d)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, params])

  const series = useMemo<Series[]>(() => {
    if (!current) return []
    const s: Series[] = [{ key: 'reactive', label: 'Reactive (this scenario)', data: current.baseline.available_per_day, style: 'reactive' }]
    if (previous) s.push({ key: 'previous', label: 'Previous optimised plan', data: previous.optimized.available_per_day, style: 'previous' })
    s.push({ key: 'optimized', label: 'Optimised (this scenario)', data: current.optimized.available_per_day, style: 'optimized' })
    return s
  }, [current, previous])

  if (base.error) return <ErrorState message={base.error} onRetry={base.reload} />
  if (!current) return <Loading label="Loading baseline plan" />
  const delta = previous ? current.optimized.aircraft_days - previous.optimized.aircraft_days : null
  const bays = meta.data?.bases.find((b) => b.id === draft.closeBase)?.bays ?? 4
  const prevTitles = new Set(previous?.recommendations.map((r) => r.title) ?? [])
  const changed = previous ? current.recommendations.filter((r) => !prevTitles.has(r.title))
    .sort((a, b) => Math.abs(b.aircraft_delta) - Math.abs(a.aircraft_delta)).slice(0, 6) : []
  const prevFailed = new Set(previous?.optimized.unplanned_failures.map((f) => f.engine_id) ?? [])
  const newFailures = previous ? current.optimized.unplanned_failures.filter((f) => !prevFailed.has(f.engine_id)) : []
  const jobByEngine = Object.fromEntries(current.jobs.filter((j) => j.kind === 'preventive').map((j) => [j.engine_id, j]))
  const sc = current.scenario

  return (
    <div className="mx-auto max-w-[1500px]">
    <PageHead title="What if the month doesn't go to plan?" sub="Change a supplier, a hangar or the tempo." />
    <div className="grid grid-cols-[320px_minmax(0,1fr)] gap-5">
      <aside className="space-y-3">

        <div className="panel p-3">
          <div className="label-caps mb-2">Quick scenarios</div>
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.label} title={p.hint} disabled={busy}
                onClick={() => { const d = { ...EMPTY, ...p.draft }; setDraft(d); replan(d) }}
                className="rounded border border-line2 px-2 py-1.5 text-left hover:border-accent disabled:opacity-50">
                <div className="display text-sm font-semibold text-ink">{p.label}</div>
                <div className="text-[10px] leading-tight text-dim">{p.hint}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="panel space-y-2.5 p-3">
          <div className="label-caps">Spares delay</div>
          <Field label="Part">
            <select value={draft.partId} onChange={(e) => set({ partId: e.target.value })} className="w-44 text-xs">
              <option value="">None</option>
              {meta.data?.parts.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.name} ({p.lead_time_days} d)</option>)}
            </select>
          </Field>
          <Field label={`Delay: ${draft.partDays} d`}>
            <input type="range" min={0} max={30} value={draft.partDays} disabled={!draft.partId} className="w-44"
              onChange={(e) => set({ partDays: Number(e.target.value) })} />
          </Field>
        </div>

        <div className="panel space-y-2.5 p-3">
          <div className="label-caps">Bay closure</div>
          <Field label="Base">
            <select value={draft.closeBase} onChange={(e) => set({ closeBase: e.target.value, closeBays: 1 })} className="w-44 text-xs">
              <option value="">None</option>
              {meta.data?.bases.map((b) => <option key={b.id} value={b.id}>{b.id} · {b.bays} bays</option>)}
            </select>
          </Field>
          <Field label={`Bays closed: ${draft.closeBays}`}>
            <input type="range" min={1} max={bays} value={draft.closeBays} disabled={!draft.closeBase} className="w-44"
              onChange={(e) => set({ closeBays: Number(e.target.value) })} />
          </Field>
          <Field label="Days">
            <span className="flex items-center gap-1"><DayInput value={draft.closeStart} onChange={(v) => set({ closeStart: v })} />–<DayInput value={draft.closeEnd} onChange={(v) => set({ closeEnd: v })} /></span>
          </Field>
        </div>

        <div className="panel space-y-2.5 p-3">
          <label className="flex items-center justify-between">
            <span className="label-caps">Surge demand</span>
            <input type="checkbox" checked={draft.surgeOn} onChange={(e) => set({ surgeOn: e.target.checked })} className="h-4 w-4 accent-[#E9A15B]" />
          </label>
          <Field label={`Min available: ${draft.surgeMin}`}>
            <input type="range" min={12} max={23} value={draft.surgeMin} disabled={!draft.surgeOn} className="w-44"
              onChange={(e) => set({ surgeMin: Number(e.target.value) })} />
          </Field>
          <Field label="Days">
            <span className="flex items-center gap-1"><DayInput value={draft.surgeStart} onChange={(v) => set({ surgeStart: v })} />–<DayInput value={draft.surgeEnd} onChange={(v) => set({ surgeEnd: v })} /></span>
          </Field>
        </div>

        <div className="panel space-y-2.5 p-3">
          <div className="label-caps">Operating tempo</div>
          <Field label={`Sortie rate ×${draft.sortie.toFixed(1)}`}>
            <input type="range" min={0.5} max={2} step={0.1} value={draft.sortie} className="w-44"
              onChange={(e) => set({ sortie: Number(e.target.value) })} />
          </Field>
        </div>

        <div className="flex gap-2">
          <button onClick={() => replan()} disabled={busy}
            className="display flex-1 rounded bg-accent py-2.5 text-lg font-medium text-bg hover:brightness-110 disabled:opacity-60">
            {busy ? 'Optimising…' : 'Re-plan'}
          </button>
          <button onClick={() => { setDraft(EMPTY); replan(EMPTY) }} disabled={busy}
            className="display rounded border border-line2 px-3 font-semibold text-muted hover:text-ink">Reset</button>
        </div>
      </aside>

      <div className="min-w-0 space-y-4">
        {error && <ErrorState message={error} />}
        <div className="grid grid-cols-4 gap-3">
          <div className="panel p-3">
            <div className="label-caps">Optimised aircraft-days</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="display num text-4xl font-semibold text-accent">{current.optimized.aircraft_days}</span>
              {delta !== null && (
                <span key={runs} className={`chip-in num whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${delta >= 0 ? 'bg-ok/15 text-ok' : 'bg-bad/15 text-bad'}`}>
                  {delta >= 0 ? '+' : ''}{delta} aircraft-days
                </span>
              )}
            </div>
            <div className="text-[11px] text-dim">vs previous plan</div>
          </div>
          <div className="panel p-3">
            <div className="label-caps">Gain over reactive</div>
            <div className="display num mt-1 text-4xl font-semibold">+{current.gain_aircraft_days}</div>
            <div className="num text-[11px] text-dim">reactive {current.baseline.aircraft_days} aircraft-days</div>
          </div>
          <div className="panel p-3">
            <div className="label-caps">Unplanned failures</div>
            <div className="display num mt-1 text-4xl font-semibold">{current.optimized.unplanned_failures.length}</div>
            <div className="num text-[11px] text-dim">reactive {current.baseline.unplanned_failures.length}</div>
          </div>
          <div className="panel p-3">
            <div className="label-caps">{sc.surge ? 'Surge shortfall' : 'Cannibalisations'}</div>
            <div className={`display num mt-1 text-4xl font-semibold ${sc.surge && current.optimized.surge_shortfall > 0 ? 'text-bad' : ''}`}>
              {sc.surge ? current.optimized.surge_shortfall : current.optimized.cannibalizations.length}
            </div>
            <div className="num text-[11px] text-dim">
              {sc.surge ? `aircraft-days below target · reactive ${current.baseline.surge_shortfall}` : `solver ${current.optimized.solver?.wall_time_s}s`}
            </div>
          </div>
        </div>

        <section className={`panel p-4 transition-opacity ${busy ? 'opacity-60' : ''}`}>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="display text-lg font-semibold">Mission-ready aircraft per day</h2>
            <span className="text-xs text-dim">
              {sc.part_delays.length + sc.bay_closures.length + (sc.surge ? 1 : 0) + (sc.sortie_rate_multiplier !== 1 ? 1 : 0) === 0
                ? 'Default scenario' : 'Scenario: ' + [
                  ...sc.part_delays.map((p) => `${p.part_id} +${p.days} d`),
                  ...sc.bay_closures.map((b) => `${b.base_id} −${b.bays_closed} bay D${b.start_day}–${b.end_day}`),
                  ...(sc.surge ? [`surge ≥${sc.surge.min_available} D${sc.surge.start_day}–${sc.surge.end_day}`] : []),
                  ...(sc.sortie_rate_multiplier !== 1 ? [`sortie ×${sc.sortie_rate_multiplier}`] : []),
                ].join(' · ')}
            </span>
          </div>
          <AvailabilityChart series={series} startDate={current.start_date} maxY={current.fleet_size} surge={sc.surge} height={320} animate={!!previous} />
        </section>

        <section className="panel p-4">
          <h2 className="display mb-2 text-lg font-semibold">What changed in the plan</h2>
          {!previous && <p className="text-sm text-dim">Pick a quick scenario or adjust the inputs, then Re-plan. The optimiser re-solves the full fleet in about a second.</p>}
          {newFailures.map((f) => {
            const part = jobByEngine[f.engine_id]?.parts[0]
            const delay = sc.part_delays.find((d) => d.part_id === part)
            return (
              <div key={f.engine_id} className="mb-2 rounded border border-bad/50 bg-bad/10 px-3 py-2 text-sm">
                <span className="display font-semibold text-bad">Consequence · </span>
                <span className="text-ink">{f.engine_id} can no longer be repaired before its forecast failure on Day {f.day}</span>
                <span className="text-muted">
                  {delay ? ` — the ${part} delay (+${delay.days} d) means no part in time.` : '.'}{' '}
                  Repair {f.repair_start != null ? `starts Day ${f.repair_start}` : 'slips past the horizon'}.
                </span>
              </div>
            )
          })}
          {previous && changed.length === 0 && newFailures.length === 0 && <p className="text-sm text-dim">Same actions as the previous plan.</p>}
          <div className="grid grid-cols-2 gap-2">
            {changed.map((r) => (
              <div key={r.id} className="rounded border border-line bg-panel2/40 p-2.5">
                <div className="text-[13px] font-semibold text-ink">{r.title}</div>
                <p className="mt-1 line-clamp-3 text-xs text-muted">{r.reason}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
    </div>
  )
}
