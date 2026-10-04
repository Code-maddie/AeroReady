import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { BaseContext, loadBase, saveBase, type BaseFilter } from './hooks'
import './index.css'
import Aircraft from './pages/Aircraft'
import Home from './pages/Home'
import Plan from './pages/Plan'
import Readiness from './pages/Readiness'
import Spares from './pages/Spares'
import WhatIf from './pages/WhatIf'

function App() {
  const [base, setBaseState] = useState<BaseFilter>(loadBase)
  const setBase = (b: BaseFilter) => { setBaseState(b); saveBase(b) }
  return (
    <BaseContext.Provider value={{ base, setBase }}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route element={<Layout />}>
            <Route path="readiness" element={<Readiness />} />
            <Route path="plan" element={<Plan />} />
            <Route path="aircraft" element={<Aircraft />} />
            <Route path="aircraft/:id" element={<Aircraft />} />
            <Route path="what-if" element={<WhatIf />} />
            <Route path="spares" element={<Spares />} />
          </Route>
          <Route path="*" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </BaseContext.Provider>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
