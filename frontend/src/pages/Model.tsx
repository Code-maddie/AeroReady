import { useState } from 'react'
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { Panel, QueryView, Segmented, Skeleton } from '../components/ui'
import { pct } from '../lib/format'
import { useModelImportance, useModelMetrics, useModelPredictions } from '../lib/queries'

const COLORS = ['#c7862c', '#4f79a8']
const axis = { tick: { fill: '#8a9098', fontSize: 11 }, axisLine: { stroke: '#cdcfc7' }, tickLine: false as const }

export default function Model() {
  const metrics = useModelMetrics()
  const preds = useModelPredictions()
  const imp = useModelImportance()
  const [impView, setImpView] = useState<'sensors' | 'features'>('sensors')

  return (
    <div className="space-y-4">
      <Panel title="Test-set metrics" actions={metrics.data && (
        <span className="text-xs text-dim">Training run {metrics.data.trained_at ? new Date(metrics.data.trained_at).toLocaleString('en-GB') : 'timestamp not available'}</span>)}>
        <QueryView q={metrics}>
          {(m) => (
            <div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-line text-left">
                    {['Test set', 'Engines', 'RMSE (cycles)', 'MAE (cycles)', 'NASA score', 'P10 to P90 coverage', 'Mean interval width', 'True RUL below P10'].map((h) => (
                      <th key={h} className="label-caps py-2 pr-4 font-normal">{h}</th>))}
                  </tr></thead>
                  <tbody>
                    {Object.entries(m.datasets).map(([ds, r]) => (
                      <tr key={ds} className="border-b border-line/60">
                        <td className="py-2 pr-4 font-medium text-ink">{ds}</td>
                        <td className="num py-2 pr-4">{r.n_test_engines}</td>
                        <td className="num py-2 pr-4">{r.rmse_p50}</td>
                        <td className="num py-2 pr-4">{r.mae_p50}</td>
                        <td className="num py-2 pr-4">{r.nasa_score_p50}</td>
                        <td className="num py-2 pr-4">{pct(r.p10_p90_coverage)} <span className="text-xs text-dim">(target {pct(m.quantiles.p90 - m.quantiles.p10)})</span></td>
                        <td className="num py-2 pr-4">{r.mean_interval_width} cycles</td>
                        <td className="num py-2 pr-4">{pct(r.frac_true_below_p10)} <span className="text-xs text-dim">(target {pct(m.quantiles.p10)})</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-dim">
                Metrics use the P50 forecast at each test engine's last observed cycle against the published true RUL, capped at {m.rul_cap_cycles} cycles.
                The NASA score penalises late predictions more than early ones; lower is better. Coverage below the target means the P10 to P90 interval is narrower than it should be.
              </p>
            </div>
          )}
        </QueryView>
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Predicted vs actual RUL, test set">
          <QueryView q={preds} skeleton={<Skeleton h={340} />}>
            {(p) => {
              const sets = Object.entries(p.datasets)
              const max = Math.max(...sets.flatMap(([, rows]) => rows.flatMap((r) => [r.true_rul_capped, r.p50])))
              return (
                <div>
                  <div className="mb-2 flex gap-4 text-xs text-muted">
                    {sets.map(([ds, rows], i) => <span key={ds} className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % 2] }} />{ds} ({rows.length} engines)</span>)}
                    <span className="inline-flex items-center gap-1.5"><span className="inline-block h-px w-5 border-t border-dashed border-muted" />Perfect prediction</span>
                    <span className="ml-auto text-dim">Horizontal: true RUL (cycles, capped). Vertical: predicted P50 (cycles).</span>
                  </div>
                  <div className="h-[340px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 8, right: 16, bottom: 4, left: -4 }}>
                        <CartesianGrid stroke="#e1e2dc" />
                        <XAxis type="number" dataKey="true_rul_capped" name="True RUL" domain={[0, Math.ceil(max / 10) * 10]} {...axis} />
                        <YAxis type="number" dataKey="p50" name="Predicted P50" domain={[0, Math.ceil(max / 10) * 10]} {...axis} width={44} />
                        <ZAxis range={[28, 28]} />
                        <ReferenceLine segment={[{ x: 0, y: 0 }, { x: max, y: max }]} stroke="#8a9098" strokeDasharray="4 4" />
                        <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                          if (!active || !payload?.length) return null
                          const r = payload[0].payload as { unit: number; true_rul_capped: number; p10: number; p50: number; p90: number }
                          return (
                            <div className="num rounded-xl border border-line2 bg-[#ffffff] px-3 py-2 text-xs">
                              <div className="font-medium text-ink">{payload[0].name} engine {r.unit}</div>
                              <div className="text-muted">True {r.true_rul_capped} · P50 {r.p50} · P10 to P90 {r.p10} to {r.p90}</div>
                            </div>
                          )
                        }} />
                        {sets.map(([ds, rows], i) => <Scatter key={ds} name={ds} data={rows} fill={COLORS[i % 2]} fillOpacity={0.75} isAnimationActive={false} />)}
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )
            }}
          </QueryView>
        </Panel>

        <Panel title="Global feature importance" actions={
          <Segmented label="Importance grouping" value={impView} onChange={setImpView}
            options={[{ value: 'sensors', label: 'By sensor' }, { value: 'features', label: 'By feature' }]} />}>
          <QueryView q={imp} skeleton={<Skeleton h={340} />}>
            {(d) => {
              const rows = impView === 'sensors'
                ? d.sensors.map((s) => ({ key: s.sensor, label: s.sensor === 'cycle' ? s.name : `${s.sensor} · ${s.name}`, v: s.gain_share }))
                : d.features.slice(0, 15).map((f) => ({ key: f.feature, label: f.feature, v: f.gain_share }))
              const max = Math.max(...rows.map((r) => r.v))
              return (
                <div>
                  <div className="space-y-1.5">
                    {rows.map((r) => (
                      <div key={r.key} className="grid grid-cols-[minmax(0,240px)_1fr_52px] items-center gap-3 text-xs">
                        <span className="truncate text-muted" title={r.label}>{r.label}</span>
                        <div className="h-2.5 rounded bg-line"><div className="h-2.5 rounded bg-accent/80" style={{ width: `${(r.v / max) * 100}%` }} /></div>
                        <span className="num text-right text-ink">{pct(r.v)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-dim">
                    Share of total split gain in the P50 model{impView === 'features' ? ' (top 15 features)' : ', summed over each sensor\'s raw, rolling-mean and rolling-std features'}.
                    The cycle count is the engine's age in cycles; it carries a large share because degradation in C-MAPSS grows with age.
                  </p>
                </div>
              )
            }}
          </QueryView>
        </Panel>
      </div>

      <Panel title="Method">
        <QueryView q={metrics}>
          {(m) => (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm md:grid-cols-[200px_1fr]">
              <dt className="text-muted">Data</dt>
              <dd className="text-ink">NASA C-MAPSS turbofan degradation simulation, subsets {m.train?.datasets.join(' and ') ?? Object.keys(m.datasets).join(' and ')}.
                {m.train && ` Training: ${m.train.engines} engines, ${m.train.rows} rows.`}
                {m.test && ` Test: ${Object.entries(m.test).map(([k, v]) => `${v.engines} engines in ${k}`).join(', ')}.`}</dd>
              {m.method && Object.entries(m.method).map(([k, v]) => (
                <div key={k} className="contents"><dt className="capitalize text-muted">{k}</dt><dd className="text-ink">{v}</dd></div>
              ))}
              <dt className="text-muted">Sensors used</dt><dd className="text-ink">{m.sensors_used.join(', ')}</dd>
              <dt className="text-muted">Boosting rounds</dt><dd className="num text-ink">{m.num_rounds}</dd>
              <dt className="text-muted">Limitations</dt>
              <dd className="text-ink">C-MAPSS is a simulation of a commercial turbofan, not a military engine. The model has not been validated on IAF data.</dd>
            </dl>
          )}
        </QueryView>
      </Panel>
    </div>
  )
}
