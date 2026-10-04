// Typed client for the AeroReady FastAPI backend.

export type Status = 'green' | 'amber' | 'red'
export type BlockKind = 'scheduled' | 'preventive' | 'corrective' | 'awaiting' | 'aog' | 'cannibalization'

export interface Block {
  kind: BlockKind
  start: number
  end: number
  label: string
  job_id: string | null
  cannibalized_from?: string | null
  extends_beyond_horizon?: boolean
}

export interface GanttRow { aircraft_id: string; base_id: string; blocks: Block[]; available_days: number }

export interface Cannibalization {
  job_id: string; aircraft_id: string; part_id: string; part_name: string; donor: string; day: number
}

export interface PlanSide {
  aircraft_days: number
  available_per_day: number[]
  avg_available: number
  unplanned_failures: { engine_id: string; aircraft_id: string; day: number; repair_start: number | null }[]
  risk_engine_days: number
  deferral_days: number
  spillover_days: number
  cannibalizations: Cannibalization[]
  carried_over: string[]
  surge_shortfall: number
  violations: string[]
  gantt: GanttRow[]
  starts: Record<string, [number | null, string | null]>
  bay_use: Record<string, number[]>
  hour_use: Record<string, number[]>
  solver?: { status: string; wall_time_s: number; objective: number; num_booleans: number }
}

export interface Recommendation {
  id: string
  type: 'cannibalize' | 'predictive' | 'order' | 'bundle' | 'level' | 'defer'
  aircraft_id: string
  base_id: string
  job_id: string
  day: number | null
  title: string
  reason: string
  aircraft_delta: number
}

export interface Job {
  id: string; aircraft_id: string; base_id: string; kind: 'scheduled' | 'preventive' | 'corrective'
  name: string; duration: number; tech_hours_per_day: number; parts: string[]
  earliest: number; latest: number; due: number | null; hard_limit: number | null
  engine_id: string | null; failure_day: number | null; risk_start: number | null
}

export interface PartDelay { part_id: string; days: number }
export interface BayClosure { base_id: string; start_day: number; end_day: number; bays_closed: number }
export interface Surge { start_day: number; end_day: number; min_available: number }
export interface Scenario {
  part_delays: PartDelay[]
  bay_closures: BayClosure[]
  surge: Surge | null
  sortie_rate_multiplier: number
}

export interface PlanResult {
  synthetic: boolean
  start_date: string
  horizon_days: number
  scenario: Scenario
  fleet_size: number
  max_aircraft_days: number
  baseline: PlanSide
  optimized: PlanSide
  gain_aircraft_days: number
  recommendations: Recommendation[]
  part_orders: { part_id: string; part_name: string; qty: number; order_day: number; arrives_day: number; needed_from_day: number }[]
  capacity: { bays: Record<string, number[]>; tech_hours: Record<string, number[]> }
  jobs: Job[]
  forecasts_days: Record<string, { p10_days: number; p50_days: number; p90_days: number }>
  elapsed_s: number
}

export interface FleetAircraft {
  id: string; type: string; base_id: string; sortie_rate: number
  status: Status; status_reason: string
  engines: { engine_id: string; p10_days: number; p50_days: number; p90_days: number }[]
  worst_engine: { engine_id: string; p10_days: number; p50_days: number; p90_days: number }
  next_task: Block | null
  available_today: boolean
  available_days: { baseline: number; optimized: number }
}

export interface Meta {
  synthetic: boolean; data_notice: string; start_date: string; horizon_days: number
  bases: { id: string; name: string; region: string; agency_id: string; bays: number; tech_hours_per_day: number }[]
  parts: { id: string; name: string; category: string; lead_time_days: number }[]
  planted_tensions: string[]
  rul_metrics: {
    datasets: Record<string, { n_test_engines: number; rmse_p50: number; mae_p50: number; nasa_score_p50: number; p10_p90_coverage: number; mean_interval_width: number }>
    sensors_used: string[]
  } | null
}

export interface EngineDetail {
  id: string; position: number; serial: string; cmapss: string; cmapss_dataset: string; cmapss_unit: number
  cycles_observed: number; sortie_rate: number; repair_part_id: string
  rul_cycles: { p10: number; p50: number; p90: number }
  rul_days: { p10: number; p50: number; p90: number }
  plan_days: { p10_days: number; p50_days: number; p90_days: number } | null
  true_rul_cycles: number
  top_sensors: { sensor: string; name: string; contribution_cycles: number; global_importance: number }[]
  rul_history: { cycle: number[]; p10: number[]; p50: number[]; p90: number[] }
  sensor_trend: { cycle: number[] } & Record<string, number[]>
}

export interface AircraftDetail {
  aircraft: { id: string; type: string; base_id: string; sortie_rate: number; engine_ids: string[]; grounding: null | { reason: string; since_day: number; until_day: number; donor_parts: Record<string, number> } }
  base: { id: string; name: string; region: string }
  status: Status; status_reason: string
  engines: EngineDetail[]
  log: { id: string; day: number; category: string; description: string; tech_hours: number; engine_id: string | null }[]
  tasks: Job[]
  timeline: { baseline: GanttRow; optimized: GanttRow }
  recommendations: Recommendation[]
}

export interface SparesPart {
  id: string; name: string; category: string; lead_time_days: number; on_hand: number
  inbound: { day: number; qty: number }[]
  demand: Record<'baseline' | 'optimized', { job_id: string; aircraft_id: string; day: number; kind: string; source: string }[]>
  shortage_qty: number
  day0_order: PlanResult['part_orders'][number] | null
  status: 'ok' | 'low' | 'short'
}
export interface Spares { parts: SparesPart[]; cannibalizations: Cannibalization[]; part_orders: PlanResult['part_orders'] }

export const DEFAULT_SCENARIO: Scenario = { part_delays: [], bay_closures: [], surge: null, sortie_rate_multiplier: 1 }

export class ApiError extends Error {}

export const BACKEND_DOWN =
  'Cannot reach the AeroReady backend. Start it with: cd backend && .venv/Scripts/python -m uvicorn aeroready.api.main:app --port 8000'

const cache = new Map<string, Promise<unknown>>()

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, init)
  } catch {
    throw new ApiError(BACKEND_DOWN)
  }
  if (!res.ok) {
    let detail: unknown = null
    try { detail = (await res.json()).detail } catch { /* not JSON */ }
    // The Vite proxy answers 5xx with no JSON body when uvicorn is not running.
    if (detail == null && res.status >= 500) throw new ApiError(BACKEND_DOWN)
    throw new ApiError(`${res.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail ?? res.statusText)}`)
  }
  return res.json() as Promise<T>
}

/** GET with an in-memory cache so navigating between pages is instant. */
export function get<T>(path: string, fresh = false): Promise<T> {
  if (fresh || !cache.has(path)) {
    const p = request<T>(path).catch((e) => { cache.delete(path); throw e })
    cache.set(path, p)
  }
  return cache.get(path) as Promise<T>
}

export function postPlan(s: Scenario): Promise<PlanResult> {
  return request<PlanResult>('/api/plan', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(s),
  })
}

export function clearCache() { cache.clear() }

// ---- helpers -------------------------------------------------------------
export const DOWN_KINDS: BlockKind[] = ['scheduled', 'preventive', 'corrective', 'awaiting', 'aog']

/** Per-day availability recomputed from Gantt rows (lets us filter by base). */
export function availabilityFor(rows: GanttRow[], horizon: number): number[] {
  const out = Array(horizon).fill(0)
  for (const r of rows) {
    const down = new Set<number>()
    for (const b of r.blocks) if (DOWN_KINDS.includes(b.kind)) for (let d = b.start; d <= b.end; d++) down.add(d)
    for (let d = 0; d < horizon; d++) if (!down.has(d)) out[d]++
  }
  return out
}

export function dayDate(start: string, day: number): string {
  const d = new Date(start + 'T00:00:00')
  d.setDate(d.getDate() + day)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}
