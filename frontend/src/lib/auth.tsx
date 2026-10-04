import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation, Outlet } from 'react-router-dom'
import { postJson, setAuthToken } from './api'

export type Role = 'commander' | 'planner' | 'technician'
export interface User { username: string; name: string; role: Role; base_id: string | null }
interface Session { token: string; user: User; expires_at: string }

interface AuthState {
  user: User | null
  login: (username: string, password: string) => Promise<User>
  logout: () => void
}

const AuthContext = createContext<AuthState>({ user: null, login: async () => { throw new Error('no provider') }, logout: () => {} })
const KEY = 'aeroready.session'

export const ROLE_LABEL: Record<Role, string> = { commander: 'Commander', planner: 'Planner', technician: 'Technician' }
export const ROLE_HOME: Record<Role, string> = { commander: '/commander', planner: '/planner', technician: '/technician' }

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Session
    return new Date(s.expires_at).getTime() > Date.now() ? s : null
  } catch { return null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [session, setSession] = useState<Session | null>(() => {
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

  // Expired or invalid session from any API call, or the session clock running out.
  useEffect(() => {
    const on = () => logout()
    window.addEventListener('aeroready:unauthorized', on)
    return () => window.removeEventListener('aeroready:unauthorized', on)
  }, [logout])
  useEffect(() => {
    if (!session) return
    const ms = new Date(session.expires_at).getTime() - Date.now()
    const t = setTimeout(logout, Math.max(0, Math.min(ms, 2 ** 31 - 1)))
    return () => clearTimeout(t)
  }, [session, logout])

  const login = async (username: string, password: string) => {
    const r = await postJson<Session>('/auth/login', { username, password })
    setAuthToken(r.token)
    try { localStorage.setItem(KEY, JSON.stringify(r)) } catch { /* session lasts this tab only */ }
    qc.clear()
    setSession(r)
    return r.user
  }

  return <AuthContext.Provider value={{ user: session?.user ?? null, login, logout }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

/** Route guard: signed-out users go to sign-in; other roles go to their own home. */
export function RequireRole({ roles, children }: { roles: Role[]; children?: ReactNode }) {
  const { user } = useAuth()
  const loc = useLocation()
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  if (!roles.includes(user.role)) return <Navigate to={ROLE_HOME[user.role]} replace />
  return <>{children ?? <Outlet />}</>
}
