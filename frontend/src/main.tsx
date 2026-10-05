import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Shell from './console/Shell'
import { AuthProvider, RequireRole, ROLE_HOME, useAuth, type Role } from './lib/auth'
import './index.css'
import AircraftDetail from './pages/AircraftDetail'
import Audit from './pages/Audit'
import { ApprovalsList, PlanReview } from './pages/commander/Approvals'
import Readiness from './pages/commander/Readiness'
import Reports from './pages/commander/Reports'
import DataSources from './pages/DataSources'
import DevUI from './pages/DevUI'
import Fleet from './pages/Fleet'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Model from './pages/Model'
import { PlannerDefects, PlannerWorkOrders } from './pages/planner/Operations'
import Recommendations from './pages/planner/Recommendations'
import Workspace from './pages/planner/Workspace'
import Scenarios from './pages/Scenarios'
import Spares from './pages/Spares'
import { ReportDefect, TechnicianAircraft, TechnicianHome, WorkOrderDetail } from './pages/technician/Technician'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
})

function Home() {
  const { user } = useAuth()
  return <Navigate to={user ? ROLE_HOME[user.role] : '/'} replace />
}

const area = (roles: Role[], children?: ReactNode) => <RequireRole roles={roles}>{children}</RequireRole>

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dev/ui" element={<DevUI />} />
            <Route element={area(['commander', 'planner', 'technician'], <Shell />)}>
              <Route path="/commander" element={area(['commander'])}>
                <Route index element={<Readiness />} />
                <Route path="approvals" element={<ApprovalsList />} />
                <Route path="approvals/:id" element={<PlanReview />} />
                <Route path="scenarios" element={<Scenarios />} />
                <Route path="fleet" element={<Fleet />} />
                <Route path="fleet/:tail" element={<AircraftDetail />} />
                <Route path="reports" element={<Reports />} />
              </Route>
              <Route path="/planner" element={area(['planner'])}>
                <Route index element={<Workspace />} />
                <Route path="recommendations" element={<Recommendations />} />
                <Route path="defects" element={<PlannerDefects />} />
                <Route path="work-orders" element={<PlannerWorkOrders />} />
                <Route path="spares" element={<Spares />} />
                <Route path="scenarios" element={<Scenarios />} />
                <Route path="fleet" element={<Fleet />} />
                <Route path="fleet/:tail" element={<AircraftDetail />} />
                <Route path="data" element={<DataSources />} />
                <Route path="model" element={<Model />} />
              </Route>
              <Route path="/technician" element={area(['technician'])}>
                <Route index element={<TechnicianHome />} />
                <Route path="work-orders/:id" element={<WorkOrderDetail />} />
                <Route path="defects/new" element={<ReportDefect />} />
                <Route path="aircraft/:tail" element={<TechnicianAircraft />} />
              </Route>
              <Route path="/audit" element={area(['commander', 'planner'], <Audit />)} />
            </Route>
            <Route path="*" element={<Home />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
