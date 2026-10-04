import { useState } from 'react'
import { RecommendationTable, REC_GROUPS } from '../../components/Recommendations'
import { toast } from '../../components/Toaster'
import { Button, EmptyState, Panel, QueryView, Select, Skeleton } from '../../components/ui'
import type { RecStatus } from '../../lib/api'
import { useConsoleParams } from '../../lib/params'
import { useBulkAccept, usePlan, usePlansStatus } from '../../lib/queries'

const STATUSES: RecStatus[] = ['Proposed', 'Accepted', 'Modified', 'Rejected']

export default function Recommendations() {
  const status = usePlansStatus()
  const { base } = useConsoleParams()
  const working = status.data?.working
  const plan = usePlan(working?.id)
  const bulk = useBulkAccept()
  const [type, setType] = useState('')
  const [st, setSt] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  if (status.isPending) return <Skeleton h={300} />
  if (!working) return <Panel title="Recommendations"><EmptyState title="No draft plan" detail="Run the optimizer in the planning workspace to create one." /></Panel>
  const editable = working.status === 'Draft' || working.status === 'Returned'

  return (
    <QueryView q={plan}>
      {(p) => {
        const group = REC_GROUPS.find((g) => g.id === type)
        const recs = p.recommendations
          .filter((r) => (!base || r.base_id === base) && (!group || group.types.includes(r.type)) && (!st || r.status === st))
          .sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || b.aircraft_delta - a.aircraft_delta)
        const sel = [...selected].filter((k) => recs.some((r) => r.key === k && r.status === 'Proposed'))
        return (
          <Panel flush title={`Draft v${working.version}: ${recs.length} recommendations`} actions={
            <>
              <Select label="Type" value={type} onChange={setType} placeholder="All types" options={REC_GROUPS.map((g) => ({ value: g.id, label: g.label }))} />
              <Select label="Status" value={st} onChange={setSt} placeholder="All statuses" options={STATUSES.map((s) => ({ value: s, label: s }))} />
              <Button variant="primary" disabled={!editable || sel.length === 0} busy={bulk.isPending}
                onClick={() => bulk.mutate({ plan: working.id, keys: sel }, {
                  onSuccess: (r) => { setSelected(new Set()); toast(`Accepted ${r.accepted.length}${r.skipped.length ? `, skipped ${r.skipped.length}` : ''}.`) },
                })}>
                Accept selected ({sel.length})
              </Button>
            </>}>
            {!editable && <p className="border-b border-line px-4 py-2 text-[13px] text-warn">Draft v{working.version} is {working.status.toLowerCase()}; recommendations cannot be changed.</p>}
            {bulk.isError && <p className="border-b border-line px-4 py-2 text-[13px] text-bad">{(bulk.error as Error).message}</p>}
            <RecommendationTable recs={recs} planId={working.id} editable={editable} empty="No recommendations match these filters"
              selected={selected} onSelect={(k, on) => setSelected((s) => { const n = new Set(s); if (on) n.add(k); else n.delete(k); return n })} />
          </Panel>
        )
      }}
    </QueryView>
  )
}
