import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.js'
import { getApiBaseUrl } from '../lib/apiBase.js'

export function LoginPage() {
  const { login, loginState } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const apiBase = getApiBaseUrl()

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await login(email, password)
    if (ok) {
      navigate(from, { replace: true })
    }
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-teal-950 via-teal-900 to-slate-900 text-white">
      <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-6 py-16">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Prenatal Digital</h1>
          <p className="mt-3 text-sm text-teal-100/90">
            Pré-natal com apoio de IA local, privacidade por desenho e registro clínico alinhado ao SUS.
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-8 shadow-xl backdrop-blur">
          <h2 className="text-lg font-medium text-white">Acesso profissional</h2>
          <p className="mt-1 text-xs text-teal-100/80">Use as credenciais criadas via seed (`npm run db:seed`).</p>

          <form className="mt-6 flex flex-col gap-3" onSubmit={(e) => void onSubmit(e)}>
            <label className="text-xs font-medium text-teal-100/90">
              E-mail
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-white/20 bg-teal-950/40 px-3 py-2 text-sm text-white placeholder:text-teal-300/50"
                placeholder="profissional@unidade.gov.br"
                required
              />
            </label>
            <label className="text-xs font-medium text-teal-100/90">
              Senha
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-white/20 bg-teal-950/40 px-3 py-2 text-sm text-white"
                required
              />
            </label>
            <button
              type="submit"
              disabled={loginState.kind === 'loading'}
              className="mt-2 rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-teal-950 hover:bg-teal-50 disabled:opacity-60"
            >
              {loginState.kind === 'loading' ? 'Entrando…' : 'Entrar'}
            </button>
            {loginState.kind === 'error' ? (
              <p className="text-sm text-rose-200">{loginState.message}</p>
            ) : null}
          </form>
        </div>

        <p className="mt-8 text-center text-xs text-teal-200/70">
          API: <span className="font-mono text-teal-100">{apiBase}</span>
        </p>
        <p className="mt-4 text-center text-xs text-teal-200/50">
          <Link to="/dashboard" className="underline hover:text-white">
            Ir para agenda (requer sessão)
          </Link>
        </p>
      </div>
    </div>
  )
}
