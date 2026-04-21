import { Navigate, Route, Routes } from 'react-router-dom'
import { MainLayout } from './layout/MainLayout.js'
import { DashboardPage } from './pages/DashboardPage.js'
import { DevSandboxPage } from './pages/DevSandboxPage.js'
import { EscribaPage } from './pages/EscribaPage.js'
import { LandingPage } from './pages/LandingPage.tsx'
import { PacienteDetailPage } from './pages/PacienteDetailPage.js'
import { PacientesPage } from './pages/PacientesPage.js'
import { RequireAuth } from './routes/RequireAuth.js'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<RequireAuth />}>
        <Route element={<MainLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/pacientes" element={<PacientesPage />} />
          <Route path="/pacientes/:id" element={<PacienteDetailPage />} />
          <Route path="/consultas/:consultaId/escriba" element={<EscribaPage />} />
          <Route path="/dev/sandbox" element={<DevSandboxPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
