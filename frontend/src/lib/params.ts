import { useSearchParams } from 'react-router-dom'

/** Base filter and active scenario live in the URL so views are shareable. */
export function useConsoleParams() {
  const [params, setParams] = useSearchParams()
  const base = params.get('base')
  const scenario = params.get('scenario')
  const set = (key: 'base' | 'scenario', value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  return {
    base,
    scenario,
    setBase: (b: string | null) => set('base', b),
    setScenario: (s: string | null) => set('scenario', s === 'baseline' ? null : s),
    /** Carry base/scenario along when linking to another console page. */
    link: (path: string) => {
      const keep = new URLSearchParams()
      if (base) keep.set('base', base)
      if (scenario) keep.set('scenario', scenario)
      const q = keep.toString()
      return q ? `${path}?${q}` : path
    },
  }
}
