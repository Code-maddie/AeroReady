import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  api, postJson, qs, type AircraftDetail, type AuditEntry, type BaseReadiness, type CapacityResponse, type DataSource, type Defect,
  type FleetResponse, type Meta, type ModelImportance, type ModelMetrics, type ModelPrediction, type Notification, type PlanResult,
  type PlanReview, type PlansStatus, type PlanSummary, type ReadinessReport, type SavedScenario, type Scenario, type SparesResponse,
  type Summary, type TechAircraft, type UploadResult, type WorkOrder,
} from './api'
import type { User } from './auth'

/** Which plan a view reads: 'active', 'working', a plan id, or undefined for the role default. */
export type PlanRef = string | null | undefined

export const useHealth = () =>
  useQuery({ queryKey: ['health'], queryFn: () => api<{ ok: boolean }>('/health'), refetchInterval: 15_000, retry: false })
export const useMeta = () => useQuery({ queryKey: ['meta'], queryFn: () => api<Meta>('/meta') })

// ---- plans ------------------------------------------------------------------
export const usePlansStatus = () =>
  useQuery({ queryKey: ['plans-status'], queryFn: () => api<PlansStatus>('/plans/status'), refetchInterval: 30_000 })
export const usePlans = () =>
  useQuery({ queryKey: ['plans'], queryFn: () => api<{ plans: PlanSummary[]; active_id: string | null; active_aircraft_days: number | null }>('/plans') })
export const usePlan = (id: string | null | undefined) =>
  useQuery({ queryKey: ['plan', id], queryFn: () => api<PlanResult>(`/plans/${id}`), enabled: !!id })
export const usePlanReview = (id: string | undefined) =>
  useQuery({ queryKey: ['review', id], queryFn: () => api<PlanReview>(`/plans/${id}/review`), enabled: !!id })

export const useSummary = (plan: PlanRef, base: string | null) =>
  useQuery({ queryKey: ['summary', plan, base], queryFn: () => api<Summary & { plan_label: string; plan: PlanSummary | null }>('/summary' + qs({ plan, base })) })
export const useReadinessByBase = (plan: PlanRef) =>
  useQuery({ queryKey: ['by-base', plan], queryFn: () => api<{ rows: BaseReadiness[]; plan_label: string; horizon_days: number }>('/readiness/by-base' + qs({ plan })) })
export const useFleet = (plan: PlanRef, base: string | null) =>
  useQuery({ queryKey: ['fleet', plan, base], queryFn: () => api<FleetResponse & { plan_label: string }>('/fleet' + qs({ plan, base })) })
export const useAircraft = (tail: string, plan: PlanRef) =>
  useQuery({ queryKey: ['aircraft', tail, plan], queryFn: () => api<AircraftDetail>(`/aircraft/${encodeURIComponent(tail)}` + qs({ plan })) })
export const useCapacity = (plan: PlanRef) =>
  useQuery({ queryKey: ['capacity', plan], queryFn: () => api<CapacityResponse>('/capacity' + qs({ plan })) })
export const useSpares = (plan: PlanRef) =>
  useQuery({ queryKey: ['spares', plan], queryFn: () => api<SparesResponse>('/spares' + qs({ plan })) })
export const useReport = (from: number, to: number | null) =>
  useQuery({ queryKey: ['report', from, to], queryFn: () => api<ReadinessReport>('/reports/readiness' + qs({ from_day: String(from), to_day: to == null ? null : String(to) })) })

/** Everything derived from plans or operational state. */
const STATE_KEYS = ['plans-status', 'plans', 'plan', 'review', 'summary', 'by-base', 'fleet', 'aircraft', 'capacity', 'spares',
  'report', 'work-orders', 'work-order', 'defects', 'notifications', 'audit', 'tech-aircraft', 'meta', 'data-sources']

export function useInvalidateState() {
  const qc = useQueryClient()
  return () => Promise.all(STATE_KEYS.map((k) => qc.invalidateQueries({ queryKey: [k] })))
}

function useStateMutation<V, R>(fn: (v: V) => Promise<R>) {
  const invalidate = useInvalidateState()
  return useMutation({ mutationFn: fn, onSuccess: () => { invalidate() } })
}

export const useCreateWorking = () => useStateMutation(() => api<PlanSummary>('/plans/working', { method: 'POST' }))
export const useOptimize = () => useStateMutation((id: string) => api<PlanSummary>(`/plans/${id}/optimize`, { method: 'POST' }))
export const useDecideRec = () => useStateMutation((b: { plan: string; key: string; action: 'accept' | 'reject'; reason?: string }) =>
  postJson<PlanSummary>(`/plans/${b.plan}/recommendations/decide`, { key: b.key, action: b.action, reason: b.reason ?? '' }))
export const useBulkAccept = () => useStateMutation((b: { plan: string; keys: string[] }) =>
  postJson<{ accepted: string[]; skipped: { key: string; reason: string }[] }>(`/plans/${b.plan}/recommendations/accept`, { keys: b.keys }))
export const useCheckMove = () => useMutation({ mutationFn: (b: { plan: string; job: string; day: number }) =>
  postJson<{ ok: boolean; violations: string[] }>(`/plans/${b.plan}/tasks/${encodeURIComponent(b.job)}/check`, { day: b.day }) })
export const useMoveTask = () => useStateMutation((b: { plan: string; job: string; day: number; comment: string }) =>
  postJson<PlanSummary>(`/plans/${b.plan}/tasks/${encodeURIComponent(b.job)}/move`, { day: b.day, comment: b.comment }))
export const useLockTask = () => useStateMutation((b: { plan: string; job: string; locked: boolean }) =>
  postJson<PlanSummary>(`/plans/${b.plan}/tasks/${encodeURIComponent(b.job)}/lock`, { locked: b.locked }))
export const useRemoveTask = () => useStateMutation((b: { plan: string; job: string; reason: string }) =>
  postJson<PlanSummary>(`/plans/${b.plan}/tasks/${encodeURIComponent(b.job)}/remove`, { reason: b.reason }))
export const useSubmitPlan = () => useStateMutation((b: { plan: string; comment: string }) => postJson<PlanSummary>(`/plans/${b.plan}/submit`, { comment: b.comment }))
export const useReturnPlan = () => useStateMutation((b: { plan: string; comment: string }) => postJson<PlanSummary>(`/plans/${b.plan}/return`, { comment: b.comment }))
export const useApprovePlan = () => useStateMutation((b: { plan: string; comment: string }) =>
  postJson<{ plan: PlanSummary; work_orders_released: number }>(`/plans/${b.plan}/approve`, { comment: b.comment }))

// ---- work orders and defects ------------------------------------------------
export const useWorkOrders = (filters: { status?: string | null; base?: string | null } = {}) =>
  useQuery({ queryKey: ['work-orders', filters], queryFn: () => api<{ work_orders: WorkOrder[] }>('/work-orders' + qs({ status: filters.status, base: filters.base })) })
export const useWorkOrder = (id: string) => useQuery({ queryKey: ['work-order', id], queryFn: () => api<WorkOrder>(`/work-orders/${id}`) })
export const useWoAction = () => useStateMutation((b: { id: string; action: 'start' | 'pause' | 'complete' | 'cannot-complete'; body?: unknown }) =>
  postJson<WorkOrder>(`/work-orders/${b.id}/${b.action}`, b.body ?? {}))
export const useReassign = () => useStateMutation((b: { id: string; technician: string }) => postJson<WorkOrder>(`/work-orders/${b.id}/reassign`, { technician: b.technician }))
export const useTechnicians = (base: string | null) =>
  useQuery({ queryKey: ['technicians', base], queryFn: () => api<{ technicians: User[] }>('/technicians' + qs({ base })) })

export const useDefects = () => useQuery({ queryKey: ['defects'], queryFn: () => api<{ defects: Defect[] }>('/defects') })
export const useReportDefect = () => useStateMutation((b: { aircraft_id: string; system: string; description: string; suspected_parts: string[]; serviceable: boolean }) =>
  postJson<Defect>('/defects', b))
export const useDefectAction = () => useStateMutation((b: { id: string; action: 'review' | 'convert' | 'close'; reason?: string }) =>
  postJson<{ defect?: Defect; plan_id?: string; job_id?: string; day?: number | null } & Partial<Defect>>(`/defects/${b.id}/${b.action}`, b.action === 'close' ? { reason: b.reason } : {}))
export const useTechAircraft = (tail: string) =>
  useQuery({ queryKey: ['tech-aircraft', tail], queryFn: () => api<TechAircraft>(`/technician/aircraft/${encodeURIComponent(tail)}`) })

// ---- notifications, audit, users -------------------------------------------
export const useNotifications = () =>
  useQuery({ queryKey: ['notifications'], queryFn: () => api<{ notifications: Notification[]; unread: number }>('/notifications'), refetchInterval: 20_000 })
export const useMarkRead = () => useStateMutation((id: string | null) => api<{ ok: boolean }>(id ? `/notifications/${id}/read` : '/notifications/read-all', { method: 'POST' }))
export const useAudit = (f: { user?: string | null; role?: string | null; object_type?: string | null; from?: string | null; to?: string | null }) =>
  useQuery({ queryKey: ['audit', f], queryFn: () => api<{ entries: AuditEntry[] }>('/audit' + qs(f)) })
export const useUsers = () => useQuery({ queryKey: ['users'], queryFn: () => api<{ users: User[] }>('/users') })

// ---- scenarios ----------------------------------------------------------------
export const useScenarioPlan = (scenario: string | null) =>
  useQuery({ queryKey: ['scenario-plan', scenario], queryFn: () => api<PlanResult>('/plan' + qs({ scenario })) })
export const useScenarios = () => useQuery({ queryKey: ['scenarios'], queryFn: () => api<{ scenarios: SavedScenario[] }>('/scenarios') })
export const useRunScenario = () => useMutation({ mutationFn: (s: Scenario) => postJson<PlanResult>('/plan', s) })
export function useSaveScenario() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (b: { name: string; scenario: Scenario }) => postJson<SavedScenario>('/scenarios', b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scenarios'] }) })
}
export function useDeleteScenario() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => api<void>(`/scenarios/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scenarios'] }) })
}

// ---- data and model -----------------------------------------------------------
export const useDataSources = () =>
  useQuery({ queryKey: ['data-sources'], queryFn: () => api<{ sources: DataSource[]; data_origin: string }>('/data/sources') })
export const useAssumptions = () =>
  useQuery({ queryKey: ['assumptions'], queryFn: () => api<{ statements: string[]; config: Record<string, unknown>; config_file: string }>('/data/assumptions') })
export function useUpload() {
  const invalidate = useInvalidateState()
  return useMutation({
    mutationFn: async ({ source, file }: { source: string; file: File }) =>
      api<UploadResult>(`/data/upload/${source}` + qs({ filename: file.name }), { method: 'POST', headers: { 'content-type': 'text/csv' }, body: await file.text() }),
    onSuccess: (r) => { if (r.ok) invalidate() },
  })
}
export const useResetData = () => useStateMutation(() => api<{ ok: boolean }>('/data/reset', { method: 'POST' }))
export const useModelMetrics = () => useQuery({ queryKey: ['model-metrics'], queryFn: () => api<ModelMetrics>('/model/metrics') })
export const useModelPredictions = () =>
  useQuery({ queryKey: ['model-predictions'], queryFn: () => api<{ datasets: Record<string, ModelPrediction[]> }>('/model/predictions') })
export const useModelImportance = () => useQuery({ queryKey: ['model-importance'], queryFn: () => api<ModelImportance>('/model/importance') })
