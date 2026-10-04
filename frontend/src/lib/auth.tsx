import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { postJson, setAuthToken } from './api'

export type Permission = 'decide' | 'plan' | 'data'
export interface User { username: string; name: string; role: 'commander' | 'planner' | 'technician'; permissions: Permission[] }

interface AuthState {
  user: User | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  can: (p: Permission) => boolean
}

const AuthContext = createContext<AuthState>({ user: null, login: async () => {}, logout: () => {}, can: () => false })
const KEY = 'aeroready.session'

function readSession(): { token: string; user: User } | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export const ROLE_LABEL: Record<User['role'], string> = { commander: 'Commander', planner: 'Planner', technician: 'Technician' }

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [session, setSession] = useState(() => {
    const s = readSession()
    setAuthToken(s?.token ?? null)
    return s
  })

  const logout = useCallback(() => {
    try { localStorage.removeItem(KEY) } catch { /* storage unavailable */ }
    setAuthToken(null)
    setSession(null)
    qc.clear()
  }, [qc])

  // Any 401 from the API (expired or invalid session) signs the user out.
  useEffect(() => {
    const on = () => logout()
    window.addEventListener('aeroready:unauthorized', on)
    return () => window.removeEventListener('aeroready:unauthorized', on)
  }, [logout])

  const login = async (username: string, password: string) => {
    const r = await postJson<{ token: string; user: User }>('/auth/login', { username, password })
    setAuthToken(r.token)
    try { localStorage.setItem(KEY, JSON.stringify(r)) } catch { /* session lasts this tab only */ }
    qc.clear()
    setSession(r)
  }

  const user = session?.user ?? null
  return (
    <AuthContext.Provider value={{ user, login, logout, can: (p) => !!user?.permissions.includes(p) }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

/** Console routes: send signed-out users to the sign-in page and back afterwards. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const loc = useLocation()
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  return <>{children}</>
}
