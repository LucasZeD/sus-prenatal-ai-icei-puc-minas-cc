import { Navigate, Route, Routes } from 'react-router-dom'
import { MainLayout } from './layout/MainLayout.js'
import { DashboardPage } from './pages/DashboardPage.js'
import { EscribaPage } from './pages/EscribaPage.js'
import { HomeRedirect } from './pages/HomeRedirect.js'
import { LoginPage } from './pages/LoginPage.js'
import { PacienteDetailPage } from './pages/PacienteDetailPage.js'
import { PacientesPage } from './pages/PacientesPage.js'
import { RequireAuth } from './routes/RequireAuth.js'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<MainLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/pacientes" element={<PacientesPage />} />
          <Route path="/pacientes/:id" element={<PacienteDetailPage />} />
          <Route path="/consultas/:consultaId/escriba" element={<EscribaPage />} />
        </Route>
      </Route>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
