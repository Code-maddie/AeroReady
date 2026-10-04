import { useQueries } from '@tanstack/react-query'
import { Play, Save, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import AvailabilityChart, { SERIES_COLORS } from '../components/AvailabilityChart'
import { Button, EmptyState, ErrorBox, Panel, QueryView, SkeletonBlock } from '../components/ui'
import { api, qs, EMPTY_SCENARIO, type Meta, type PlanResult, type Scenario } from '../lib/api'
import { dateTime, signed } from '../lib/format'
import { useConsoleParams } from '../lib/params'
import { useAuth } from '../lib/auth'
import { useDeleteScenario, useMeta, usePlan, useRunScenario, useSaveScenario, useScenarios } from '../lib/queries'

interface Form {
  partOn: boolean; partId: string; partDays: number
  bayOn: boolean; bayBase: string; bays: number; bayStart: number; bayEnd: number
  surgeOn: boolean; surgeMin: number; surgeStart: number; surgeEnd: number
  rateOn: boolean; rateScope: 'base' | 'aircraft'; rateId: string; rate: number
}

function initialForm(m: Meta): Form {
  const last = m.horizon_days - 1
  return {
    partOn: false, partId: m.parts[0]?.id ?? '', partDays: 0,
    bayOn: false, bayBase: m.bases[0]?.id ?? '', bays: 1, bayStart: 0, bayEnd: last,
    surgeOn: false, surgeMin: 0, surgeStart: 0, surgeEnd: last,
    rateOn: false, rateScope: 'base', rateId: m.bases[0]?.id ?? '', rate: 1,
  }
}

function toScenario(f: Form): Scenario {
  return {
    ...EMPTY_SCENARIO,
    part_delays: f.partOn && f.partId ? [{ part_id: f.partId, days: f.partDays }] : [],
    bay_closures: f.bayOn ? [{ base_id: f.bayBase, start_day: f.bayStart, end_day: f.bayEnd, bays_closed: f.bays }] : [],
    surge: f.surgeOn ? { start_day: f.surgeStart, end_day: f.surgeEnd, min_available: f.surgeMin } : null,
    sortie_rates: f.rateOn && f.rateId ? [{ scope: f.rateScope, id: f.rateId, sorties_per_day: f.rate }] : [],
  }
}

function describe(s: Scenario): string {
  const parts = [
    ...s.part_delays.map((d) => `${d.part_id} delayed ${d.days} days`),
    ...s.bay_closures.map((c) => `${c.bays_closed} bay(s) closed at ${c.base_id}, Day ${c.start_day} to ${c.end_day}`),
    ...(s.surge ? [`surge: at least ${s.surge.min_available} aircraft, Day ${s.surge.start_day} to ${s.surge.end_day}`] : []),
    ...s.sortie_rates.map((r) => `${r.id} at ${r.sorties_per_day} sorties per day`),
    ...(s.sortie_rate_multiplier !== 1 ? [`sortie rate x${s.sortie_rate_multiplier}`] : []),
  ]
  return parts.length ? parts.join('; ') : 'No changes'
}

function Section({ title, on, setOn, children }: { title: string; on: boolean; setOn: (v: boolean) => void; children: ReactNode }) {
  return (
    <fieldset className={`rounded-xl border p-3 ${on ? 'border-accent/50' : 'border-line'}`}>
      <legend className="px-1">
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="accent-[#e9a15b]" />{title}
        </label>
      </legend>
      <div className={`grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-muted ${on ? '' : 'pointer-events-none opacity-40'}`}>{children}</div>
    </fieldset>
  )
}

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="flex flex-col gap-1">{label}{children}</label>
)

function NumberInput({ value, onChange, min, max, step = 1 }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  return <input type="number" value={value} min={min} max={max} step={step} className="num text-sm"
    onChange={(e) => { const v = Number(e.target.value); if (!Number.isNaN(v)) onChange(Math.min(max, Math.max(min, v))) }} />
}

function Builder({ meta, onRun, running }: { meta: Meta; onRun: (s: Scenario) => void; running: boolean }) {
  const { can } = useAuth()
  const [f, setF] = useState<Form>(() => initialForm(meta))
  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }))
  const last = meta.horizon_days - 1
  const baseBays = meta.bases.find((b) => b.id === f.bayBase)?.bays ?? 0
  const sc = toScenario(f)
  return (
    <div className="space-y-3">
      <Section title="Delay a part" on={f.partOn} setOn={(v) => set({ partOn: v })}>
        <Field label="Part">
          <select value={f.partId} onChange={(e) => set({ partId: e.target.value })} className="text-sm">
            {meta.parts.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.name} (lead {p.lead_time_days} d)</option>)}
          </select>
        </Field>
        <Field label="Delay (days)"><NumberInput value={f.partDays} onChange={(v) => set({ partDays: v })} min={0} max={60} /></Field>
      </Section>
      <Section title="Close hangar bays" on={f.bayOn} setOn={(v) => set({ bayOn: v })}>
        <Field label="Base">
          <select value={f.bayBase} onChange={(e) => set({ bayBase: e.target.value, bays: 1 })} className="text-sm">
            {meta.bases.map((b) => <option key={b.id} value={b.id}>{b.id} · {b.bays} bays</option>)}
          </select>
        </Field>
        <Field label="Bays closed"><NumberInput value={f.bays} onChange={(v) => set({ bays: v })} min={1} max={Math.max(1, baseBays)} /></Field>
        <Field label="From day"><NumberInput value={f.bayStart} onChange={(v) => set({ bayStart: v })} min={0} max={last} /></Field>
        <Field label="To day"><NumberInput value={f.bayEnd} onChange={(v) => set({ bayEnd: v })} min={0} max={last} /></Field>
      </Section>
      <Section title="Surge requirement" on={f.surgeOn} setOn={(v) => set({ surgeOn: v })}>
        <Field label="Minimum mission-ready aircraft"><NumberInput value={f.surgeMin} onChange={(v) => set({ surgeMin: v })} min={0} max={meta.aircraft.length} /></Field>
        <div />
        <Field label="From day"><NumberInput value={f.surgeStart} onChange={(v) => set({ surgeStart: v })} min={0} max={last} /></Field>
        <Field label="To day"><NumberInput value={f.surgeEnd} onChange={(v) => set({ surgeEnd: v })} min={0} max={last} /></Field>
      </Section>
      <Section title="Change sortie rate" on={f.rateOn} setOn={(v) => set({ rateOn: v })}>
        <Field label="Apply to">
          <select value={f.rateScope} onChange={(e) => {
            const scope = e.target.value as 'base' | 'aircraft'
            set({ rateScope: scope, rateId: scope === 'base' ? meta.bases[0]?.id ?? '' : meta.aircraft[0]?.id ?? '' })
          }} className="text-sm">
            <option value="base">A base</option><option value="aircraft">One aircraft</option>
          </select>
        </Field>
        <Field label={f.rateScope === 'base' ? 'Base' : 'Aircraft'}>
          <select value={f.rateId} onChange={(e) => set({ rateId: e.target.value })} className="text-sm">
            {(f.rateScope === 'base' ? meta.bases.map((b) => b.id) : meta.aircraft.map((a) => a.id)).map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </Field>
        <Field label="Sorties per day (engine cycles)"><NumberInput value={f.rate} onChange={(v) => set({ rate: v })} min={0.1} max={6} step={0.1} /></Field>
      </Section>
      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={() => onRun(sc)} busy={running} disabled={!can('plan')} title={can('plan') ? undefined : 'Planner role required'}
          icon={<Play className="h-3.5 w-3.5" />}>Run scenario</Button>
        {!can('plan') && <span className="text-xs text-warn">Planner role required to run scenarios.</span>}
        <span className="text-xs text-dim">{describe(sc)}</span>
      </div>
    </div>
  )
}

function Results({ run, base, onSave, saving, saveError }: {
  run: PlanResult; base: PlanResult; onSave: (name: string) => void; saving: boolean; saveError: string | null
}) {
  const [name, setName] = useState('')
  const canSave = useAuth().can('plan')
  const delta = run.optimized.aircraft_days - base.optimized.aircraft_days
  // Match recommendations by job and action type; a moved day counts as changed, not added + removed.
  const key = (r: { job_id: string; type: string }) => `${r.job_id}|${r.type}`
  const before = new Map(base.recommendations.map((r) => [key(r), r]))
  const after = new Map(run.recommendations.map((r) => [key(r), r]))
  const added = run.recommendations.filter((r) => !before.has(key(r)))
  const removed = base.recommendations.filter((r) => !after.has(key(r)))
  const changed = run.recommendations.filter((r) => before.has(key(r)) && before.get(key(r))!.title !== r.title)
  const surge = run.scenario.surge
  const missed = surge ? Array.from({ length: Math.min(run.horizon_days - 1, surge.end_day) - surge.start_day + 1 }, (_, i) => surge.start_day + i)
    .filter((d) => run.optimized.available_per_day[d] < surge.min_available) : []
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="panel p-3"><div className="label-caps">This scenario</div><div className="display num text-3xl font-semibold text-accent">{run.optimized.aircraft_days}</div><div className="text-xs text-dim">aircraft-days, optimised</div></div>
        <div className="panel p-3"><div className="label-caps">Change vs baseline scenario</div><div className={`display num text-3xl font-semibold ${delta < 0 ? 'text-bad' : delta > 0 ? 'text-ok' : ''}`}>{signed(delta)}</div><div className="text-xs text-dim">baseline scenario {base.optimized.aircraft_days}</div></div>
        <div className="panel p-3"><div className="label-caps">Unplanned failures</div><div className="display num text-3xl font-semibold">{run.optimized.unplanned_failures.length}</div><div className="text-xs text-dim">baseline scenario {base.optimized.unplanned_failures.length}</div></div>
        <div className="panel p-3"><div className="label-caps">Surge target</div>
          {surge ? (
            <><div className={`display num text-3xl font-semibold ${missed.length ? 'text-bad' : 'text-ok'}`}>{missed.length ? 'Not met' : 'Met'}</div>
              <div className="text-xs text-dim">{missed.length ? `Short on Day ${missed.join(', ')}` : `Every day from ${surge.start_day} to ${surge.end_day}`}</div></>
          ) : <><div className="display text-3xl font-semibold text-dim">None set</div><div className="text-xs text-dim">Add a surge requirement to test it</div></>}
        </div>
      </div>
      <AvailabilityChart startDate={run.start_date} maxY={run.fleet_size} surge={surge} animate height={300}
        diff={{ a: 'run', b: 'base', label: 'Change' }}
        series={[
          { key: 'base', label: 'Baseline scenario (optimised)', data: base.optimized.available_per_day, color: SERIES_COLORS.reactive, dashed: true },
          { key: 'run', label: 'This scenario (optimised)', data: run.optimized.available_per_day, color: SERIES_COLORS.optimized },
          { key: 'reactive', label: 'This scenario (reactive)', data: run.baseline.available_per_day, color: SERIES_COLORS.reactive, faint: true },
        ]} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {([['Added', added, '!text-ok'], ['Removed', removed, '!text-bad'], ['Changed timing', changed, '!text-warn']] as const).map(([t, list, cls]) => (
          <div key={t} className="rounded-xl border border-line p-3">
            <div className={`label-caps mb-2 ${cls}`}>{t} ({list.length})</div>
            {list.length === 0 ? <p className="text-xs text-dim">None</p> : (
              <ul className="max-h-56 space-y-1.5 overflow-y-auto text-xs">
                {list.map((r) => (
                  <li key={r.id} className="text-ink">{r.title}
                    {t === 'Changed timing' && <div className="text-dim">Baseline scenario: {before.get(key(r))!.title}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSave(name.trim()) }}>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Scenario name" className="w-64 text-sm" aria-label="Scenario name" />
        <Button type="submit" disabled={!name.trim() || !canSave} busy={saving} icon={<Save className="h-3.5 w-3.5" />}>Save scenario</Button>
        {saveError && <span className="text-xs text-bad">{saveError}</span>}
      </form>
    </div>
  )
}

function Compare({ ids, names, horizonPlan }: { ids: string[]; names: Record<string, string>; horizonPlan: PlanResult }) {
  const results = useQueries({ queries: ids.map((id) => ({ queryKey: ['plan', id], queryFn: () => api<PlanResult>('/plan' + qs({ scenario: id })) })) })
  if (results.some((r) => r.isPending)) return <SkeletonBlock lines={6} h={30} />
  const err = results.find((r) => r.isError)
  if (err) return <ErrorBox message={(err.error as Error).message} onRetry={() => err.refetch()} />
  return (
    <div>
      <AvailabilityChart startDate={horizonPlan.start_date} maxY={horizonPlan.fleet_size} height={280}
        series={results.map((r, i) => ({ key: ids[i], label: `${names[ids[i]]} (${r.data!.optimized.aircraft_days} aircraft-days)`,
          data: r.data!.optimized.available_per_day, color: SERIES_COLORS.compare[i] }))} />
      <p className="mt-2 text-xs text-dim">Optimised plan for each scenario.</p>
    </div>
  )
}

export default function Scenarios() {
  const meta = useMeta()
  const baseline = usePlan(null)
  const saved = useScenarios()
  const run = useRunScenario()
  const save = useSaveScenario()
  const del = useDeleteScenario()
  const { setScenario } = useConsoleParams()
  const canPlan = useAuth().can('plan')
  const [lastRun, setLastRun] = useState<{ sc: Scenario; at: string } | null>(null)
  const [compare, setCompare] = useState<string[]>([])

  const doRun = (sc: Scenario) => run.mutate(sc, { onSuccess: () => setLastRun({ sc, at: new Date().toISOString() }) })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
        <Panel title="Scenario builder">
          <QueryView q={meta}>{(m) => <Builder meta={m} onRun={doRun} running={run.isPending} />}</QueryView>
        </Panel>
        <Panel title="Result" actions={lastRun && <span className="text-xs text-dim">Run at {dateTime(lastRun.at)} · solver {run.data?.optimized.solver.status.toLowerCase()} in {run.data?.optimized.solver.wall_time_s} s</span>}>
          {run.isPending && <div className="space-y-2"><div className="text-sm text-muted">Running the optimiser for the full fleet.</div><SkeletonBlock lines={6} h={28} /></div>}
          {run.isError && <ErrorBox message={(run.error as Error).message} onRetry={() => lastRun && doRun(lastRun.sc)} />}
          {!run.isPending && !run.isError && !run.data && (
            <EmptyState title="No scenario run yet" detail="Choose one or more changes in the builder and select Run scenario. The result is compared with the baseline scenario." />
          )}
          {!run.isPending && run.data && (
            <QueryView q={baseline}>
              {(b) => <Results run={run.data!} base={b} saving={save.isPending}
                saveError={save.isError ? (save.error as Error).message : null}
                onSave={(name) => lastRun && save.mutate({ name, scenario: lastRun.sc })} />}
            </QueryView>
          )}
        </Panel>
      </div>

      <Panel title="Saved scenarios" actions={<span className="text-xs text-dim">Select up to three to compare. Saved on the AeroReady service.</span>}>
        <QueryView q={saved}>
          {(d) => {
            const names = Object.fromEntries(d.scenarios.map((s) => [s.id, s.name]))
            return (
              <div className="space-y-4">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-line text-left">
                    {['Compare', 'Name', 'Changes', 'Saved', ''].map((h) => <th key={h} className="label-caps py-2 pr-3 font-normal">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {d.scenarios.map((s) => (
                      <tr key={s.id} className="border-b border-line/60">
                        <td className="py-2 pr-3">
                          <input type="checkbox" className="accent-[#e9a15b]" aria-label={`Compare ${s.name}`}
                            checked={compare.includes(s.id)} disabled={!compare.includes(s.id) && compare.length >= 3}
                            onChange={(e) => setCompare((c) => e.target.checked ? [...c, s.id] : c.filter((x) => x !== s.id))} />
                        </td>
                        <td className="py-2 pr-3 text-ink">{s.name}</td>
                        <td className="py-2 pr-3 text-xs text-muted">{describe(s.scenario)}</td>
                        <td className="num py-2 pr-3 text-xs text-dim">{s.created_at ? dateTime(s.created_at) : 'Built in'}</td>
                        <td className="py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <Button onClick={() => setScenario(s.id)}>Make active</Button>
                            {s.id !== 'baseline' && canPlan && (
                              <Button onClick={() => { setCompare((c) => c.filter((x) => x !== s.id)); del.mutate(s.id) }}
                                icon={<Trash2 className="h-3.5 w-3.5" />} busy={del.isPending && del.variables === s.id}>Delete</Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {d.scenarios.length === 1 && <p className="text-xs text-dim">Only the baseline scenario exists. Run and save a scenario to compare it here.</p>}
                {compare.length > 0 && baseline.data && <Compare ids={compare} names={names} horizonPlan={baseline.data} />}
              </div>
            )
          }}
        </QueryView>
      </Panel>
    </div>
  )
}
