export function dayDate(start: string, day: number): string {
  const d = new Date(start + 'T00:00:00')
  d.setDate(d.getDate() + day)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return 'Not available'
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)
export const pct = (x: number) => `${Math.round(x * 100)}%`

export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const text = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export const STATUS_LABEL = {
  ready: 'Mission ready', scheduled: 'Scheduled maintenance', at_risk: 'At risk', grounded: 'Grounded',
} as const
