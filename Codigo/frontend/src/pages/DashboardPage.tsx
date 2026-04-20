import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConsultaStreamPanel } from '../components/ConsultaStreamPanel.js'
import { useAuth } from '../context/AuthContext.js'
import { getApiBaseUrl } from '../lib/apiBase.js'

type HealthPayload = {
  status: 'ok' | 'degraded' | 'fail'
  db: boolean
  mcpConfigured: boolean
  privacyGateway: 'noop' | 'remote'
  timestamp: string
}

type WorklistRow = {
  id: string
  status: string
  data: string
  gestacao_id: string
  unidade: { id: string; nome: string }
  paciente: {
    id: string
    nome_mascarado: string
    cpf_ultimos4?: string | null
    cartao_sus_ultimos4?: string | null
  }
  tipo_risco_gestacao: string
}

function startOfWeekMonday(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const x = new Date(d)
  x.setDate(d.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function DashboardPage() {
  const { authFetch } = useAuth()
  const apiBase = useMemo(() => getApiBaseUrl(), [])
  const [health, setHealth] = useState<HealthPayload | null>(null)
  const [worklist, setWorklist] = useState<WorklistRow[]>([])
  const [loadErr, setLoadErr] = useState<string | null>(null)

  const loadWorklist = useCallback(async () => {
    setLoadErr(null)
    try {
      const res = await authFetch('/api/v1/consultas/disponiveis-stream')
      if (!res.ok) {
        setLoadErr(`Worklist: HTTP ${res.status}`)
        return
      }
      const json = (await res.json()) as WorklistRow[]
      setWorklist(Array.isArray(json) ? json : [])
    } catch {
      setLoadErr('Falha ao carregar consultas do dia.')
    }
  }, [authFetch])

  useEffect(() => {
    void loadWorklist()
  }, [loadWorklist])

  useEffect(() => {
    const c = new AbortController()
    const t = window.setTimeout(() => c.abort(), 8000)
    void (async () => {
      try {
        const res = await fetch(`${apiBase}/health`, { signal: c.signal, headers: { Accept: 'application/json' } })
        const json = (await res.json()) as HealthPayload
        if (json && typeof json.status === 'string') {
          setHealth(json)
        }
      } catch {
        setHealth(null)
      } finally {
        window.clearTimeout(t)
      }
    })()
    return () => c.abort()
  }, [apiBase])

  const weekStart = useMemo(() => startOfWeekMonday(new Date()), [])
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  const countsByDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const w of worklist) {
      m.set(w.data, (m.get(w.data) ?? 0) + 1)
    }
    return m
  }, [worklist])

  const altoRisco = useMemo(
    () => worklist.filter((w) => w.tipo_risco_gestacao === 'ALTO' || w.tipo_risco_gestacao === 'MUITO_ALTO').length,
    [worklist],
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Agenda da unidade</h1>
        <p className="mt-1 text-sm text-slate-600">
          Visão operacional do dia e da semana; consultas em aberto para atendimento e escriba.
        </p>
      </div>

      {health ? (
        <div className="flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold text-white ${
              health.status === 'ok' ? 'bg-emerald-600' : health.status === 'degraded' ? 'bg-amber-600' : 'bg-rose-700'
            }`}
          >
            Sistema {health.status.toUpperCase()}
          </span>
          <span className="text-slate-600">
            Banco: {health.db ? 'ok' : 'indisponível'} · MCP: {health.mcpConfigured ? 'URL' : 'noop'}
          </span>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Consultas em aberto</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{worklist.length}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Alto risco (worklist)</p>
          <p className="mt-2 text-3xl font-semibold text-amber-950">{altoRisco}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Semana (abertas na lista)</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {weekDays.map((d) => {
              const key = isoDate(d)
              const n = countsByDay.get(key) ?? 0
              const label = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d.getDay()]
              return (
                <div
                  key={key}
                  title={key}
                  className={`flex min-w-[2.5rem] flex-col items-center rounded border px-1 py-1 text-center text-[10px] ${
                    n > 0 ? 'border-teal-300 bg-teal-50 font-medium text-teal-900' : 'border-slate-100 bg-slate-50 text-slate-500'
                  }`}
                >
                  <span>{label}</span>
                  <span className="text-sm">{n || '·'}</span>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">Consultas disponíveis para stream</h2>
          <button
            type="button"
            onClick={() => void loadWorklist()}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
          >
            Atualizar
          </button>
        </div>
        {loadErr ? <p className="px-4 py-2 text-sm text-rose-700">{loadErr}</p> : null}
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="px-4 py-2">Data</th>
                <th className="px-4 py-2">Paciente</th>
                <th className="px-4 py-2">Risco</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {worklist.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-slate-500">
                    Nenhuma consulta em aberto na worklist. Cadastre gestante e consulta na área técnica abaixo.
                  </td>
                </tr>
              ) : null}
              {worklist.map((w) => (
                <tr key={w.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 whitespace-nowrap text-slate-800">{w.data}</td>
                  <td className="px-4 py-2">
                    <div className="font-medium text-slate-900">{w.paciente.nome_mascarado}</div>
                    <div className="text-xs text-slate-500">
                      {[w.paciente.cpf_ultimos4 ? `CPF …${w.paciente.cpf_ultimos4}` : null, w.paciente.cartao_sus_ultimos4 ? `SUS …${w.paciente.cartao_sus_ultimos4}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs">{w.tipo_risco_gestacao}</td>
                  <td className="px-4 py-2 text-xs">{w.status}</td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      to={`/consultas/${w.id}/escriba`}
                      className="inline-flex rounded-md bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-600"
                    >
                      Escriba
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ConsultaStreamPanel variant="embedded" />
    </div>
  )
}
