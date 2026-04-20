import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.js'

type PacienteRow = {
  id: string
  nome_mascarado: string
  cpf_ultimos4?: string | null
  cartao_sus_ultimos4?: string | null
}

type GestacaoRow = { id: string; paciente_id: string; tipo_risco?: string; ig_inicial?: number | null }

export function PacientesPage() {
  const { authFetch } = useAuth()
  const [pacientes, setPacientes] = useState<PacienteRow[]>([])
  const [gestacoesPorPaciente, setGestacoesPorPaciente] = useState<Record<string, GestacaoRow[]>>({})
  const [q, setQ] = useState('')
  const [risco, setRisco] = useState<'todos' | 'NORMAL' | 'ALTO' | 'MUITO_ALTO'>('todos')
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setErr(null)
    try {
      const res = await authFetch('/api/v1/pacientes')
      if (!res.ok) {
        setErr(`HTTP ${res.status}`)
        return
      }
      const json = (await res.json()) as PacienteRow[]
      const list = Array.isArray(json) ? json : []
      setPacientes(list)

      const gestMap: Record<string, GestacaoRow[]> = {}
      await Promise.all(
        list.map(async (p) => {
          try {
            const gRes = await authFetch(`/api/v1/gestacoes?paciente_id=${encodeURIComponent(p.id)}`)
            if (!gRes.ok) return
            const gJson = (await gRes.json()) as GestacaoRow[]
            gestMap[p.id] = Array.isArray(gJson) ? gJson : []
          } catch {
            gestMap[p.id] = []
          }
        }),
      )
      setGestacoesPorPaciente(gestMap)
    } catch {
      setErr('Falha ao carregar gestantes.')
    }
  }, [authFetch])

  useEffect(() => {
    void load()
  }, [load])

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase()
    return pacientes.filter((p) => {
      const idf = [p.cpf_ultimos4, p.cartao_sus_ultimos4].filter(Boolean).join(' ')
      const matchQ =
        !t ||
        p.nome_mascarado.toLowerCase().includes(t) ||
        idf.includes(t.replace(/\D/g, '')) ||
        p.id.toLowerCase().includes(t)
      const gest = gestacoesPorPaciente[p.id] ?? []
      const matchR =
        risco === 'todos' ||
        gest.some((g) => (g.tipo_risco ?? 'NORMAL') === risco) ||
        (risco === 'NORMAL' && gest.length === 0)
      return matchQ && matchR
    })
  }, [pacientes, gestacoesPorPaciente, q, risco])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Gestantes</h1>
          <p className="mt-1 text-sm text-slate-600">
            Busca por nome mascarado ou últimos dígitos de CPF/Cartão. Filtro de risco usa a gestação vinculada.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
        >
          Atualizar
        </button>
      </div>

      <div className="flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <label className="flex min-w-[12rem] flex-1 flex-col text-xs font-medium text-slate-600">
          Busca rápida
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nome, SUS, CPF ou UUID"
            className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-600">
          Risco gestacional
          <select
            value={risco}
            onChange={(e) => setRisco(e.target.value as typeof risco)}
            className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="todos">Todos</option>
            <option value="NORMAL">Normal</option>
            <option value="ALTO">Alto</option>
            <option value="MUITO_ALTO">Muito alto</option>
          </select>
        </label>
      </div>

      {err ? <p className="text-sm text-rose-700">{err}</p> : null}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-600">
            <tr>
              <th className="px-4 py-3">Paciente</th>
              <th className="px-4 py-3">Identificadores (agenda)</th>
              <th className="px-4 py-3">Gestação (risco)</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  Nenhum registro encontrado.
                </td>
              </tr>
            ) : null}
            {filtrados.map((p) => {
              const gest = gestacoesPorPaciente[p.id] ?? []
              const riscoTxt = gest.map((g) => g.tipo_risco ?? 'NORMAL').join(', ') || '—'
              return (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{p.nome_mascarado}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {p.cpf_ultimos4 ? `CPF …${p.cpf_ultimos4}` : '—'} · {p.cartao_sus_ultimos4 ? `SUS …${p.cartao_sus_ultimos4}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs">{riscoTxt}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/pacientes/${p.id}`}
                      className="font-medium text-teal-800 underline decoration-teal-300 hover:text-teal-950"
                    >
                      Prontuário
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
