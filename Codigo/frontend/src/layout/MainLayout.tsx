import { useMemo, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.js'

const navCls = ({ isActive }: { isActive: boolean }) =>
  `block rounded-xl px-4 py-3 text-sm font-bold transition-all ${isActive ? 'bg-brand-pink text-white shadow-md' : 'text-slate-600 hover:bg-brand-pink/20 hover:text-brand-navy'
  }`

export function MainLayout() {
  const { logout } = useAuth()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false)

  const isDesktop = useMemo(() => {
    if (typeof window === 'undefined') return true
    return window.matchMedia?.('(min-width: 1024px)')?.matches ?? true
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-[#F9FAFB] text-brand-navy">
      {/* Header Global */}
      <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center justify-between border-b border-brand-pink/30 bg-white px-4 shadow-sm sm:px-6 lg:px-8">
        <div className="flex items-center gap-x-8">
          <button
            type="button"
            onClick={() => {
              if (isDesktop) setDesktopSidebarCollapsed((v) => !v)
              else setMobileSidebarOpen(true)
            }}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:border-brand-pink/50 hover:text-brand-navy hover:bg-brand-pink/5 focus:outline-none focus:ring-2 focus:ring-brand-pink/30"
            aria-label="Abrir/ocultar menu lateral"
            title="Menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link to="/dashboard" className="flex items-center gap-2 text-xl font-bold tracking-tight text-brand-navy">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-pink text-white shadow-sm">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </span>
            Pré-natal Digital
          </Link>

          {/* Mock Global Search */}
          <div className="hidden lg:block lg:w-96 ml-8">
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <svg className="h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                </svg>
              </div>
              <input type="text" placeholder="Buscar gestante, consultas ou dados..." className="block w-full rounded-2xl border-0 py-1.5 pl-10 text-brand-navy ring-1 ring-inset ring-brand-pink/50 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-brand-pink focus:bg-brand-pink/5 transition-colors sm:text-sm sm:leading-6" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-3 sm:flex">
            <div className="flex flex-col items-end leading-tight">
              <span className="text-sm font-bold tracking-tight text-brand-navy">Psf. Rafael</span>
              <span className="text-[11px] font-medium text-slate-500">UBS Central</span>
            </div>
            <div className="h-9 w-9 flex-shrink-0 rounded-full bg-brand-pink/20 flex items-center justify-center text-brand-navy font-bold border border-brand-pink/50 shadow-sm cursor-pointer transition-all">
              PR
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-xl border border-brand-pink/40 bg-white px-4 py-2 text-sm font-bold text-brand-navy hover:bg-brand-pink/10 hover:border-brand-pink transition-colors shadow-sm ml-2"
          >
            Sair
          </button>
        </div>
      </header>

      {/* Sidebar fixa (desktop) + conteúdo rolável */}
      {!desktopSidebarCollapsed ? (
        <aside className="hidden lg:flex fixed top-16 left-0 z-40 w-64 h-[calc(100vh-4rem)] flex-col border-r border-brand-pink/20 bg-white px-4 py-8 shadow-[2px_0_10px_rgba(251,160,167,0.05)] overflow-y-auto">
          <p className="mb-4 px-2 text-xs font-bold uppercase tracking-widest text-brand-navy/60">Menu Principal</p>
          <nav className="flex flex-1 flex-col gap-2">
            <NavLink to="/dashboard" className={navCls} end>
              Agenda do Dia
            </NavLink>
            <NavLink to="/pacientes" className={navCls}>
              Gestantes
            </NavLink>
          </nav>
        </aside>
      ) : null}

      <div className={`flex-1 overflow-hidden h-[calc(100vh-4rem)] ${desktopSidebarCollapsed ? '' : 'lg:pl-64'}`}>
        <main className="h-full overflow-y-auto bg-slate-50 relative">
          <Outlet />
        </main>
      </div>

      {/* Mobile drawer do menu lateral */}
      {mobileSidebarOpen ? (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Fechar menu lateral"
          />
          <aside className="absolute left-0 top-0 h-full w-[18rem] bg-white border-r border-brand-pink/20 shadow-xl p-4">
            <div className="flex items-center justify-between px-1 py-2">
              <div className="text-sm font-black text-brand-navy">Menu</div>
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
                aria-label="Fechar"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mt-3">
              <p className="mb-3 px-2 text-xs font-bold uppercase tracking-widest text-brand-navy/60">Menu Principal</p>
              <nav className="flex flex-col gap-2">
                <NavLink to="/dashboard" className={navCls} end onClick={() => setMobileSidebarOpen(false)}>
                  Agenda do Dia
                </NavLink>
                <NavLink to="/pacientes" className={navCls} onClick={() => setMobileSidebarOpen(false)}>
                  Gestantes
                </NavLink>
              </nav>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  )
}
