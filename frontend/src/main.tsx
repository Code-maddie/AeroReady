import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Shell from './console/Shell'
import './index.css'
import AircraftDetail from './pages/AircraftDetail'
import DataSources from './pages/DataSources'
import Fleet from './pages/Fleet'
import Landing from './pages/Landing'
import Model from './pages/Model'
import Overview from './pages/Overview'
import Plan from './pages/Plan'
import Scenarios from './pages/Scenarios'
import Spares from './pages/Spares'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } },
})

/** /app -> /app/overview, keeping any base/scenario query string. */
function ToOverview() {
  const { search } = useLocation()
  return <Navigate to={`/app/overview${search}`} replace />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<Shell />}>
            <Route index element={<ToOverview />} />
            <Route path="overview" element={<Overview />} />
            <Route path="fleet" element={<Fleet />} />
            <Route path="fleet/:tail" element={<AircraftDetail />} />
            <Route path="plan" element={<Plan />} />
            <Route path="scenarios" element={<Scenarios />} />
            <Route path="spares" element={<Spares />} />
            <Route path="data" element={<DataSources />} />
            <Route path="model" element={<Model />} />
            <Route path="*" element={<ToOverview />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
