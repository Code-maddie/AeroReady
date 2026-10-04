import { useState } from 'react'
import {
  Badge, Button, EmptyState, ErrorState, FormField, KeyValue, Modal, Panel, Segmented, Select, SidePanel, Skeleton, StatTile,
  StatusBadge, StatusChip, Table, Tabs,
} from '../components/ui'

/** Hidden review page for the shared UI kit (not linked from navigation). */
const ROWS = [
  { id: 'r1', name: 'Row one', value: 3, status: 'Released' },
  { id: 'r2', name: 'Row two', value: 12, status: 'In progress' },
  { id: 'r3', name: 'Row three', value: 7, status: 'Completed' },
]

export default function DevUI() {
  const [tab, setTab] = useState<'a' | 'b'>('a')
  const [seg, setSeg] = useState<'x' | 'y'>('x')
  const [sel, setSel] = useState('')
  const [side, setSide] = useState(false)
  const [modal, setModal] = useState(false)
  return (
    <div className="min-h-screen space-y-4 bg-bg p-6">
      <h1 className="display text-[28px] font-bold">UI kit</h1>
      <Panel title="Buttons" actions={<Button size="sm">Small</Button>}>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">Approve plan</Button>
          <Button>Export CSV</Button>
          <Button variant="danger">Reject</Button>
          <Button variant="ghost">Cancel</Button>
          <Button busy>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button size="lg" variant="primary">Mark complete</Button>
        </div>
      </Panel>
      <div className="grid grid-cols-4 gap-4">
        <StatTile label="Stat tile" value="21" sub="Secondary line" />
        <StatTile label="Accent tone" value="+58" tone="accent" />
        <StatTile label="Bad tone" value="3" tone="bad" />
        <StatTile label="OK tone" value="0" tone="ok" />
      </div>
      <Panel title="Status chips and badges">
        <div className="flex flex-wrap gap-2">
          {['Draft', 'Submitted', 'Approved', 'Returned', 'Proposed', 'Accepted', 'Modified', 'Rejected', 'Released', 'In progress',
            'Paused', 'Completed', 'Cannot complete', 'Reported', 'Under review', 'Planned', 'Closed'].map((s) => <StatusChip key={s} status={s} />)}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusBadge status="ready" /><StatusBadge status="scheduled" /><StatusBadge status="at_risk" /><StatusBadge status="grounded" />
          <Badge tone="accent">Accent</Badge><Badge tone="cannibal">Cannibalise</Badge>
        </div>
      </Panel>
      <Panel title="Tabs, segmented, select, form field">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'a', label: 'Today' }, { value: 'b', label: 'Upcoming' }]} />
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <Segmented label="Demo" value={seg} onChange={setSeg} options={[{ value: 'x', label: 'Optimised' }, { value: 'y', label: 'Reactive' }]} />
          <Select label="Demo select" value={sel} onChange={setSel} placeholder="All" options={[{ value: '1', label: 'One' }, { value: '2', label: 'Two' }]} />
          <FormField label="Field with hint" hint="Hint text"><input type="text" /></FormField>
          <FormField label="Field with error" error="Incorrect username or password"><input type="text" /></FormField>
        </div>
      </Panel>
      <Panel title="Table" flush>
        <Table rows={ROWS} rowKey={(r) => r.id} columns={[
          { key: 'name', label: 'Name', value: (r) => r.name },
          { key: 'value', label: 'Value', value: (r) => r.value, align: 'right' },
          { key: 'status', label: 'Status', value: (r) => r.status, render: (r) => <StatusChip status={r.status} /> },
        ]} />
      </Panel>
      <div className="grid grid-cols-3 gap-4">
        <Panel title="Empty state"><EmptyState title="No work orders" detail="Nothing is assigned for today." /></Panel>
        <Panel title="Error state"><ErrorState message="Cannot reach the AeroReady service at /api." onRetry={() => {}} /></Panel>
        <Panel title="Skeleton"><div className="space-y-2"><Skeleton h={20} /><Skeleton h={20} w="70%" /></div></Panel>
      </div>
      <Panel title="Key-value and overlays">
        <KeyValue rows={[['Aircraft', 'A-20'], ['Planned day', 'Day 2']]} />
        <div className="mt-3 flex gap-2"><Button onClick={() => setSide(true)}>Open side panel</Button><Button onClick={() => setModal(true)}>Open modal</Button></div>
      </Panel>
      {side && <SidePanel title="Side panel" onClose={() => setSide(false)}><p className="text-[13px] text-muted">Panel content.</p></SidePanel>}
      {modal && <Modal title="Modal" onClose={() => setModal(false)}><div className="flex justify-end"><Button onClick={() => setModal(false)}>Close</Button></div></Modal>}
    </div>
  )
}
