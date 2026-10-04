// Typed client for the AeroReady API. Base URL comes from VITE_API_BASE.

export const API_BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/$/, '')

export class ApiError extends Error {
  status: number
  constructor(message: string, status = 0) { super(message); this.status = status }
}

export const unreachableMessage = () => `Cannot reach the AeroReady service at ${API_BASE}.`

let authToken: string | null = null
export function setAuthToken(t: string | null) { authToken = t }

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  const headers = new Headers(init?.headers)
  if (authToken) headers.set('authorization', `Bearer ${authToken}`)
  try {
    res = await fetch(API_BASE + path, { ...init, headers })
  } catch {
    throw new ApiError(unreachableMessage())
  }
  if (res.status === 401 && authToken && !path.startsWith('/auth/login')) {
    window.dispatchEvent(new Event('aeroready:unauthorized'))
  }
  if (!res.ok) {
    let detail: unknown = null
    try { detail = (await res.json()).detail } catch { /* not JSON */ }
    // A proxy in front of a stopped backend answers 5xx with no JSON detail.
    if (detail == null && res.status >= 500) throw new ApiError(unreachableMessage(), res.status)
    throw new ApiError(typeof detail === 'string' ? detail : `Request failed (${res.status})`, res.status)
  }
  if (res.status === 204) return undefined as T
  const type = res.headers.get('content-type') ?? ''
  return (type.includes('json') ? res.json() : res.text()) as Promise<T>
}

export const postJson = <T,>(path: string, body: unknown) =>
  api<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

export function qs(params: Record<string, string | null | undefined>): string {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) u.set(k, v)
  const s = u.toString()
  return s ? `?${s}` : ''
}

// ---- types ---------------------------------------------------------------
export type FleetStatus = 'ready' | 'scheduled' | 'at_risk' | 'grounded'
export type BlockKind = 'scheduled' | 'preventive' | 'corrective' | 'awaiting' | 'aog' | 'cannibalization'
export type RecType = 'cannibalize' | 'predictive' | 'order' | 'bundle' | 'level' | 'defer'

export interface Solver { status: string; wall_time_s: number; objective: number; num_booleans: number; locks_ignored?: string[] }

export interface Block {
  kind: BlockKind; start: number; end: number; label: string; job_id: string | null
  cannibalized_from?: string | null; extends_beyond_horizon?: boolean
}
export interface GanttRow { aircraft_id: string; base_id: string; blocks: Block[]; available_days: number }

export interface Recommendation {
  id: string; type: RecType; aircraft_id: string; base_id: string; job_id: string
  day: number | null; title: string; reason: string; aircraft_delta: number
  start: number | null; donor: string | null; part_id: string | null
  decision: { id: string; action: 'approve' | 'reject'; by: string; at: string } | null
  effects: { approve: string; reject: string }
}

export interface Decision {
  id: string; key: string; action: 'approve' | 'reject'; type: RecType; job_id: string; aircraft_id: string
  base_id: string; title: string; start: number | null; donor: string | null; part_id: string | null
  effect: string; note: string; by: string; role: string; at: string; in_effect: boolean
}

export interface Cannibalization { job_id: string; aircraft_id: string; part_id: string; part_name: string; donor: string; day: number }

export interface Job {
  id: string; aircraft_id: string; base_id: string; kind: 'scheduled' | 'preventive' | 'corrective'
  name: string; duration: number; tech_hours_per_day: number; parts: string[]
  earliest: number; latest: number; due: number | null; hard_limit: number | null
  engine_id: string | null; failure_day: number | null; risk_start: number | null
}

export interface PartDelay { part_id: string; days: number }
export interface BayClosure { base_id: string; start_day: number; end_day: number; bays_closed: number }
export interface Surge { start_day: number; end_day: number; min_available: number }
export interface SortieRate { scope: 'base' | 'aircraft'; id: string; sorties_per_day: number }
export interface Scenario {
  part_delays: PartDelay[]; bay_closures: BayClosure[]; surge: Surge | null
  sortie_rate_multiplier: number; sortie_rates: SortieRate[]
}
export const EMPTY_SCENARIO: Scenario = { part_delays: [], bay_closures: [], surge: null, sortie_rate_multiplier: 1, sortie_rates: [] }

export interface PlanSide {
  aircraft_days: number; available_per_day: number[]; avg_available: number
  unplanned_failures: { engine_id: string; aircraft_id: string; day: number; repair_start: number | null }[]
  risk_engine_days: number; deferral_days: number; spillover_days: number
  cannibalizations: Cannibalization[]; carried_over: string[]; surge_shortfall: number; violations: string[]
  gantt: GanttRow[]; starts: Record<string, [number | null, string | null]>
  bay_use: Record<string, number[]>; hour_use: Record<string, number[]>
  solver?: Solver
}

export interface PlanResult {
  start_date: string; horizon_days: number; scenario: Scenario; fleet_size: number; max_aircraft_days: number
  baseline: PlanSide; optimized: PlanSide & { solver: Solver }
  gain_aircraft_days: number; recommendations: Recommendation[]
  part_orders: { part_id: string; part_name: string; qty: number; order_day: number; arrives_day: number; needed_from_day: number }[]
  capacity: { bays: Record<string, number[]>; tech_hours: Record<string, number[]> }
  jobs: Job[]; forecasts_days: Record<string, { p10_days: number; p50_days: number; p90_days: number }>
  computed_at: string; elapsed_s: number; decisions: Decision[]
  scenario_id: string | null; scenario_name: string; data_origin: 'simulated' | 'uploaded'; uploaded_sources: string[]
}

export interface WatchRow {
  aircraft_id: string; engine_id: string; base_id: string; p10_days: number; p50_days: number; p90_days: number
  optimized_action: string; reactive_outcome: string
}

export interface Summary {
  horizon_days: number; start_date: string; base: string | null; fleet_size: number
  mission_ready_today: { optimized: number; reactive: number }
  avg_available: { optimized: number; reactive: number }
  aircraft_days: { optimized: number; reactive: number; gain: number }
  aircraft_at_risk: { count: number; tails: string[] }
  unplanned_failures: { optimized: number; reactive: number }
  series: { optimized: number[]; reactive: number[] }
  surge: Surge | null
  surge_days: { day: number; target: number; optimized: number; reactive: number }[]
  top_recommendations: Recommendation[]; watchlist: WatchRow[]
  solver: Solver; computed_at: string; scenario_id: string | null; scenario_name: string
}

export interface EngineDays { engine_id: string; p10_days: number; p50_days: number; p90_days: number; forecast_source: string }
export interface FleetRow {
  id: string; type: string; base_id: string; sortie_rate: number
  status: FleetStatus; status_reason: string; grounded_all_horizon: boolean
  engines: EngineDays[]; worst_engine: EngineDays
  next_task: { label: string; kind: string; start: number; job_id: string } | null
  days_to_next_task: number | null; part_shortages: string[]
  available_days: { optimized: number; reactive: number }
}
export interface FleetResponse { horizon_days: number; start_date: string; aircraft: FleetRow[] }

export interface EngineDetail {
  id: string; position: number; serial: string; cmapss: string; cmapss_dataset: string; cmapss_unit: number
  cycles_observed: number; sortie_rate: number; repair_part_id: string; forecast_source?: string
  rul_cycles: { p10: number; p50: number; p90: number }
  plan_days: { p10_days: number; p50_days: number; p90_days: number } | null
  rul_days: { p10: number; p50: number; p90: number }
  true_rul_cycles: number
  top_sensors: { sensor: string; name: string; contribution_cycles: number; global_importance: number }[]
  rul_history: { cycle: number[]; p10: number[]; p50: number[]; p90: number[] }
  sensor_trend: { cycle: number[] } & Record<string, number[]>
}
export interface PlannedWork {
  job_id: string; kind: string; name: string; start: number | null; duration: number; parts: string[]
  part_source: string | null; reason: string; reactive: string
}
export interface AircraftDetail {
  aircraft: { id: string; type: string; base_id: string; sortie_rate: number; engine_ids: string[]
    grounding: null | { reason: string; since_day: number; until_day: number; donor_parts: Record<string, number> } }
  base: { id: string; name: string; region: string }
  status: FleetStatus; status_reason: string; next_task: FleetRow['next_task']
  available_days: { optimized: number; reactive: number }
  engines: EngineDetail[]
  log: { id: string; day: number; category: string; description: string; tech_hours: number; engine_id: string | null }[]
  planned_work: PlannedWork[]
  parts: { part_id: string; name: string; job_id: string; start: number; source: string; available_day: number; shortfall: number }[]
  cannibalizations: (Cannibalization & { role: 'donor' | 'receiver' })[]
  timeline: { optimized: GanttRow; baseline: GanttRow }
  recommendations: Recommendation[]; horizon_days: number; start_date: string
}

export interface CapacityDay {
  day: number; bays: number; tech_hours: number
  bays_used: { optimized: number; reactive: number }; hours_used: { optimized: number; reactive: number }
}
export interface CapacityResponse { horizon_days: number; bases: { base_id: string; days: CapacityDay[] }[] }

export interface SparesResponse {
  horizon_days: number
  inventory: { part_id: string; name: string; category: string; on_hand: number; inbound_qty: number
    inbound: { day: number; qty: number }[]; lead_time_days: number; demand: number
    demand_from_stores: number; demand_cannibalised: number; shortfall: number
    day0_order: PlanResult['part_orders'][number] | null }[]
  shortage_timeline: { part_id: string; name: string; shortfall: number
    optimized: { job_id: string; aircraft_id: string; kind: string; name: string; start: number; need_from: number; part_ready_day: number; part_wait_days: number }[]
    reactive: { job_id: string; aircraft_id: string; kind: string; name: string; request_day: number; part_ready_day: number | null; start: number | null; waiting_days: number; part_wait_days: number }[] }[]
  cannibalizations: (Cannibalization & { removal_day: number; aircraft_days_gained: number; condition: string })[]
  part_orders: PlanResult['part_orders']
}

export interface SavedScenario { id: string; name: string; created_at: string | null; scenario: Scenario }

export interface Meta {
  start_date: string; horizon_days: number; data_origin: 'simulated' | 'uploaded'; uploaded_sources: string[]
  bases: { id: string; name: string; region: string; agency_id: string; bays: number; tech_hours_per_day: number }[]
  parts: { id: string; name: string; category: string; lead_time_days: number }[]
  aircraft: { id: string; base_id: string; sortie_rate: number }[]
}

export interface DataSource {
  id: string; title: string; system: string; origin: string; detail: string; rows: number
  last_updated: string; uploaded: boolean; schema: { name: string; description: string }[]
}
export interface UploadResult {
  ok: boolean; errors?: { row: number; column: string; message: string }[]; rows?: number; rows_read?: number
}

export interface ModelMetrics {
  trained_at: string | null
  datasets: Record<string, { n_test_engines: number; rmse_p50: number; mae_p50: number; nasa_score_p50: number
    p10_p90_coverage: number; mean_interval_width: number; frac_true_below_p10: number }>
  sensors_used: string[]; rul_cap_cycles: number; num_rounds: number
  train?: { datasets: string[]; engines: number; rows: number }
  test?: Record<string, { engines: number }>
  method?: Record<string, string>
  quantiles: { p10: number; p50: number; p90: number }
}
export interface ModelPrediction { unit: number; true_rul: number; true_rul_capped: number; p10: number; p50: number; p90: number }
export interface ModelImportance {
  features: { feature: string; gain_share: number }[]
  sensors: { sensor: string; name: string; gain_share: number }[]
}
