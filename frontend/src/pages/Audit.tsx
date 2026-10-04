import { useState } from 'react'
import { Button, EmptyState, Panel, QueryView, Select, SortTable } from '../components/ui'
import { ROLE_LABEL } from '../lib/auth'
import { dateTime, downloadCsv } from '../lib/format'
import { useAudit, useUsers } from '../lib/queries'

const OBJECT_TYPES = ['plan', 'recommendation', 'task', 'work_order', 'defect', 'scenario', 'data_source']

export default function Audit() {
  const users = useUsers()
  const [user, setUser] = useState('')
  const [role, setRole] = useState('')
  const [obj, setObj] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const q = useAudit({ user: user || null, role: role || null, object_type: obj || null, from: from || null, to: to || null })

  return (
    <Panel flush title="Audit log" actions={<>
      <Select label="User" value={user} onChange={setUser} placeholder="All users" options={(users.data?.users ?? []).map((u) => ({ value: u.username, label: u.name }))} />
      <Select label="Role" value={role} onChange={setRole} placeholder="All roles" options={Object.entries(ROLE_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
      <Select label="Object type" value={obj} onChange={setObj} placeholder="All objects" options={OBJECT_TYPES.map((o) => ({ value: o, label: o.replace(/_/g, ' ') }))} />
      <input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} />
      <input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} />
      <Button disabled={!q.data?.entries.length} onClick={() => q.data && downloadCsv('aeroready-audit.csv',
        ['timestamp', 'user', 'name', 'role', 'action', 'object_type', 'object_id', 'comment', 'detail'],
        q.data.entries.map((e) => [e.at, e.user, e.name, e.role, e.action, e.object_type, e.object_id, e.comment, e.detail]))}>Export CSV</Button>
    </>}>
      <QueryView q={q}>
        {(d) => (
          <SortTable rows={d.entries} rowKey={(e) => e.id} initialSort={{ key: 'at', dir: 'desc' }} empty={<EmptyState title="No audit entries match these filters" />}
            columns={[
              { key: 'at', label: 'Time', value: (e) => e.at, render: (e) => <span className="num whitespace-nowrap">{dateTime(e.at)}</span> },
              { key: 'u', label: 'User', value: (e) => e.name },
              { key: 'r', label: 'Role', value: (e) => e.role, render: (e) => ROLE_LABEL[e.role as keyof typeof ROLE_LABEL] ?? e.role },
              { key: 'a', label: 'Action', value: (e) => e.action },
              { key: 'o', label: 'Object', value: (e) => e.object_id, render: (e) => <span>{e.object_id} <span className="text-dim">{e.object_type.replace('_', ' ')}</span></span> },
              { key: 'c', label: 'Comment', value: (e) => e.comment, render: (e) => e.comment ?? <span className="text-dim">None</span> },
              { key: 'd', label: 'Detail', value: (e) => e.detail, render: (e) => <span className="text-xs text-muted">{e.detail ?? ''}</span> },
            ]} />
        )}
      </QueryView>
    </Panel>
  )
}
