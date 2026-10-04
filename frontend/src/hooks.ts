import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { get } from './api'

export interface Loadable<T> { data: T | null; error: string | null; loading: boolean; reload: () => void }

export function useApi<T>(path: string | null): Loadable<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>(
    { data: null, error: null, loading: !!path })
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    if (!path) return
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    get<T>(path, nonce > 0)
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e: Error) => alive && setState({ data: null, error: e.message, loading: false }))
    return () => { alive = false }
  }, [path, nonce])
  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { ...state, reload }
}

export type BaseFilter = 'ALL' | 'BN' | 'BC' | 'BS'
export const BaseContext = createContext<{ base: BaseFilter; setBase: (b: BaseFilter) => void }>(
  { base: 'ALL', setBase: () => {} })
export const useBase = () => useContext(BaseContext)

export function loadBase(): BaseFilter {
  try { return (localStorage.getItem('aeroready.base') as BaseFilter) || 'ALL' } catch { return 'ALL' }
}
export function saveBase(b: BaseFilter) {
  try { localStorage.setItem('aeroready.base', b) } catch { /* storage unavailable */ }
}
