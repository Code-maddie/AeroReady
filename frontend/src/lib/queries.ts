import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  api, postJson, qs, type AircraftDetail, type CapacityResponse, type DataSource, type FleetResponse, type Meta,
  type ModelImportance, type ModelMetrics, type ModelPrediction, type PlanResult, type Recommendation,
  type SavedScenario, type Scenario, type SparesResponse, type Summary, type UploadResult,
} from './api'

export const useHealth = () =>
  useQuery({ queryKey: ['health'], queryFn: () => api<{ ok: boolean }>('/health'), refetchInterval: 10_000, retry: false })

export const useMeta = () => useQuery({ queryKey: ['meta'], queryFn: () => api<Meta>('/meta') })

export const useSummary = (scenario: string | null, base: string | null) =>
  useQuery({ queryKey: ['summary', scenario, base], queryFn: () => api<Summary>('/summary' + qs({ scenario, base })) })

export const useFleet = (scenario: string | null, base: string | null) =>
  useQuery({ queryKey: ['fleet', scenario, base], queryFn: () => api<FleetResponse>('/fleet' + qs({ scenario, base })) })

export const useAircraft = (tail: string, scenario: string | null) =>
  useQuery({ queryKey: ['aircraft', tail, scenario],
    queryFn: () => api<AircraftDetail>(`/aircraft/${encodeURIComponent(tail)}` + qs({ scenario })) })

export const usePlan = (scenario: string | null) =>
  useQuery({ queryKey: ['plan', scenario], queryFn: () => api<PlanResult>('/plan' + qs({ scenario })) })

export const useRecommendations = (scenario: string | null, base: string | null) =>
  useQuery({ queryKey: ['recommendations', scenario, base],
    queryFn: () => api<{ recommendations: Recommendation[] }>('/recommendations' + qs({ scenario, base })) })

export const useCapacity = (scenario: string | null) =>
  useQuery({ queryKey: ['capacity', scenario], queryFn: () => api<CapacityResponse>('/capacity' + qs({ scenario })) })

export const useSpares = (scenario: string | null) =>
  useQuery({ queryKey: ['spares', scenario], queryFn: () => api<SparesResponse>('/spares' + qs({ scenario })) })

export const useScenarios = () =>
  useQuery({ queryKey: ['scenarios'], queryFn: () => api<{ scenarios: SavedScenario[] }>('/scenarios') })

export const useDataSources = () =>
  useQuery({ queryKey: ['data-sources'], queryFn: () => api<{ sources: DataSource[]; data_origin: string }>('/data/sources') })

export const useAssumptions = () =>
  useQuery({ queryKey: ['assumptions'],
    queryFn: () => api<{ statements: string[]; config: Record<string, unknown>; config_file: string }>('/data/assumptions') })

export const useModelMetrics = () =>
  useQuery({ queryKey: ['model-metrics'], queryFn: () => api<ModelMetrics>('/model/metrics') })
export const useModelPredictions = () =>
  useQuery({ queryKey: ['model-predictions'],
    queryFn: () => api<{ datasets: Record<string, ModelPrediction[]> }>('/model/predictions') })
export const useModelImportance = () =>
  useQuery({ queryKey: ['model-importance'], queryFn: () => api<ModelImportance>('/model/importance') })

/** Everything derived from a plan; invalidated after a re-plan or a data change. */
const PLAN_KEYS = ['summary', 'fleet', 'aircraft', 'plan', 'recommendations', 'capacity', 'spares', 'meta', 'data-sources']

export function useInvalidatePlans() {
  const qc = useQueryClient()
  return () => Promise.all(PLAN_KEYS.map((k) => qc.invalidateQueries({ queryKey: [k] })))
}

export function useReplan() {
  const invalidate = useInvalidatePlans()
  return useMutation({
    mutationFn: (scenario: string | null) =>
      api<{ computed_at: string }>('/plan/rerun' + qs({ scenario }), { method: 'POST' }),
    onSuccess: invalidate,
  })
}

export const useRunScenario = () => useMutation({ mutationFn: (s: Scenario) => postJson<PlanResult>('/plan', s) })

export function useSaveScenario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: { name: string; scenario: Scenario }) => postJson<SavedScenario>('/scenarios', b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scenarios'] }),
  })
}

export function useDeleteScenario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/scenarios/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scenarios'] }),
  })
}

export function useUpload() {
  const invalidate = useInvalidatePlans()
  return useMutation({
    mutationFn: async ({ source, file }: { source: string; file: File }) =>
      api<UploadResult>(`/data/upload/${source}` + qs({ filename: file.name }),
        { method: 'POST', headers: { 'content-type': 'text/csv' }, body: await file.text() }),
    onSuccess: (r) => { if (r.ok) return invalidate() },
  })
}

export function useResetData() {
  const invalidate = useInvalidatePlans()
  return useMutation({ mutationFn: () => api<{ ok: boolean }>('/data/reset', { method: 'POST' }), onSuccess: invalidate })
}
