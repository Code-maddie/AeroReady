import { Download, RotateCcw, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button, ErrorBox, Panel, QueryView, SimulatedLabel, SkeletonBlock } from '../components/ui'
import { API_BASE, type DataSource, type UploadResult } from '../lib/api'
import { dateTime } from '../lib/format'
import { useAssumptions, useDataSources, useResetData, useUpload } from '../lib/queries'

function SourceCard({ s }: { s: DataSource }) {
  const upload = useUpload()
  const input = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [showSchema, setShowSchema] = useState(false)
  const pick = (f: File | undefined) => {
    if (!f) return
    setResult(null)
    upload.mutate({ source: s.id, file: f }, { onSuccess: setResult })
    if (input.current) input.current.value = ''
  }
  const originCls = s.uploaded ? 'text-k-scheduled border-k-scheduled/50' : s.origin.startsWith('NASA') ? 'text-ok border-ok/40' : 'text-accent border-accent/50'
  return (
    <section className="panel flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="display text-lg font-semibold uppercase tracking-wider">{s.title}</h3>
          <div className="text-xs text-dim">{s.system}</div>
        </div>
        <span className={`whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-medium ${originCls}`}>{s.origin}</span>
      </div>
      <dl className="mt-3 grid grid-cols-[110px_1fr] gap-y-1 text-sm">
        <dt className="text-muted">Rows</dt><dd className="num text-ink">{s.rows}</dd>
        <dt className="text-muted">Last updated</dt><dd className="num text-ink">{dateTime(s.last_updated)}</dd>
        <dt className="text-muted">Detail</dt><dd className="text-ink">{s.detail}</dd>
      </dl>
      <button onClick={() => setShowSchema((x) => !x)} className="mt-3 self-start text-xs text-accent hover:underline" aria-expanded={showSchema}>
        {showSchema ? 'Hide schema' : `Show schema (${s.schema.length} columns)`}
      </button>
      {showSchema && (
        <table className="mt-2 w-full text-xs">
          <tbody>
            {s.schema.map((c) => (
              <tr key={c.name} className="border-t border-line/60 align-top">
                <td className="py-1 pr-3 font-mono text-ink">{c.name}</td><td className="py-1 text-muted">{c.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <a href={`${API_BASE}/data/template/${s.id}`} download={`${s.id}.csv`}
          className="inline-flex items-center gap-1.5 rounded border border-line2 px-3 py-1.5 text-sm hover:border-accent hover:text-accent">
          <Download className="h-3.5 w-3.5" aria-hidden />Download CSV template
        </a>
        <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => pick(e.target.files?.[0])} aria-label={`Upload ${s.title} CSV`} />
        <Button onClick={() => input.current?.click()} busy={upload.isPending} icon={<Upload className="h-3.5 w-3.5" />}>Upload CSV</Button>
      </div>
      {upload.isError && <div className="mt-3"><ErrorBox message={(upload.error as Error).message} /></div>}
      {result?.ok && <p className="mt-3 text-sm text-ok">Accepted {result.rows} rows. The plan was re-run with the uploaded data.</p>}
      {result && !result.ok && (
        <div className="mt-3 rounded border border-bad/40 bg-bad/10 p-3">
          <div className="text-sm font-medium text-ink">File rejected: {result.errors?.length} problem(s). Nothing was changed.</div>
          <div className="mt-2 max-h-56 overflow-y-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-dim"><th className="py-1 font-normal">Row</th><th className="font-normal">Column</th><th className="font-normal">Problem</th></tr></thead>
              <tbody>
                {result.errors?.map((e, i) => (
                  <tr key={i} className="border-t border-bad/20">
                    <td className="num py-1 pr-3">{e.row === 0 ? 'Header' : e.row}</td>
                    <td className="py-1 pr-3 font-mono">{e.column || 'File'}</td>
                    <td className="py-1 text-muted">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

export default function DataSources() {
  const q = useDataSources()
  const a = useAssumptions()
  const reset = useResetData()
  const [showConfig, setShowConfig] = useState(false)
  return (
    <div className="space-y-4">
      <Panel title="Integrated sources" actions={
        <>
          {q.data && <SimulatedLabel origin={q.data.data_origin as 'simulated' | 'uploaded'} />}
          <Button onClick={() => reset.mutate()} busy={reset.isPending} disabled={q.data?.data_origin !== 'uploaded'}
            icon={<RotateCcw className="h-3.5 w-3.5" />} title="Remove all uploads and re-run the plan on the simulated scenario">
            Reset to simulated scenario
          </Button>
        </>}>
        <p className="mb-4 max-w-4xl text-sm text-muted">
          The planner joins four sources that sit in separate systems today. Engine health comes from NASA C-MAPSS trajectories scored by the trained model.
          The other three come from the simulated fleet scenario until you upload your own CSV. Each upload is checked against the schema; a file with errors changes nothing.
        </p>
        {reset.isError && <div className="mb-3"><ErrorBox message={(reset.error as Error).message} /></div>}
        <QueryView q={q} skeleton={<div className="grid grid-cols-2 gap-4"><SkeletonBlock lines={6} /><SkeletonBlock lines={6} /></div>}>
          {(d) => <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{d.sources.map((s) => <SourceCard key={s.id} s={s} />)}</div>}
        </QueryView>
      </Panel>

      <Panel title="Assumptions behind the simulated scenario">
        <QueryView q={a}>
          {(d) => (
            <div>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink marker:text-dim">
                {d.statements.map((s) => <li key={s}>{s}</li>)}
              </ul>
              <p className="mt-3 text-xs text-dim">Read from <span className="font-mono">{d.config_file}</span>, the file the scenario generator uses.</p>
              <button onClick={() => setShowConfig((x) => !x)} className="mt-2 text-xs text-accent hover:underline" aria-expanded={showConfig}>
                {showConfig ? 'Hide full configuration' : 'Show full configuration'}
              </button>
              {showConfig && <pre className="mt-2 max-h-[420px] overflow-auto rounded border border-line bg-bg p-3 text-[11px] text-muted">{JSON.stringify(d.config, null, 2)}</pre>}
            </div>
          )}
        </QueryView>
      </Panel>
    </div>
  )
}
