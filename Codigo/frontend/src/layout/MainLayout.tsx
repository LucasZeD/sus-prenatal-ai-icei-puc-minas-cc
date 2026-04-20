import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.js'

const navCls = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-teal-800 text-white' : 'text-teal-100 hover:bg-teal-800/60'}`

export function MainLayout() {
  const { logout } = useAuth()

  return (
    <div className="min-h-full bg-slate-100 text-slate-900">
      <header className="border-b border-teal-900/20 bg-teal-900 text-white shadow">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/dashboard" className="text-lg font-semibold tracking-tight">
            Prenatal Digital
          </Link>
          <nav className="flex flex-wrap items-center gap-1">
            <NavLink to="/dashboard" className={navCls}>
              Agenda
            </NavLink>
            <NavLink to="/pacientes" className={navCls}>
              Gestantes
            </NavLink>
            <button
              type="button"
              onClick={logout}
              className="ml-2 rounded-md border border-teal-600/80 px-3 py-2 text-sm text-teal-50 hover:bg-teal-800"
            >
              Sair
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
