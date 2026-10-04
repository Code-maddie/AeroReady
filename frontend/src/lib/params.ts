import { useSearchParams } from 'react-router-dom'
import { ROLE_HOME, useAuth } from './auth'

/** Base filter lives in the URL so views are shareable; links stay within the user's role area. */
export function useConsoleParams() {
  const [params, setParams] = useSearchParams()
  const { user } = useAuth()
  const base = params.get('base')
  const home = user ? ROLE_HOME[user.role] : ''
  const setBase = (b: string | null) => {
    const next = new URLSearchParams(params)
    if (b) next.set('base', b)
    else next.delete('base')
    setParams(next, { replace: true })
  }
  return {
    base,
    setBase,
    home,
    /** Path inside the role's area, keeping the base filter. `link('/fleet/A-20')` -> `/planner/fleet/A-20?base=BS`. */
    link: (path: string) => {
      const full = path.startsWith('/audit') ? path : home + path
      return base ? `${full}${full.includes('?') ? '&' : '?'}base=${base}` : full
    },
  }
}
