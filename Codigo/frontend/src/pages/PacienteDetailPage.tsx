import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.js'
import { isUuid } from '../lib/uuid.js'

type PacienteRow = {
  id: string
  nome_mascarado: string
  nome_social?: string | null
  cpf_ultimos4?: string | null
  cartao_sus_ultimos4?: string | null
}

type GestacaoRow = {
  id: string
  paciente_id: string
  tipo_risco?: string
  dum?: string | null
  dpp?: string | null
}

type ConsultaRow = {
  id: string
  gestacao_id: string
  data: string
  status: string
  validacao_medica?: boolean
}

export function PacienteDetailPage() {
  const { id } = useParams()
  const { authFetch } = useAuth()
  const [paciente, setPaciente] = useState<PacienteRow | null>(null)
  const [gestacoes, setGestacoes] = useState<GestacaoRow[]>([])
  const [selG, setSelG] = useState('')
  const [consultas, setConsultas] = useState<ConsultaRow[]>([])
  const [err, setErr] = useState<string | null>(null)

  const validId = useMemo(() => (id && isUuid(id) ? id : null), [id])

  const loadPaciente = useCallback(async () => {
    if (!validId) return
    setErr(null)
    try {
      const res = await authFetch(`/api/v1/pacientes/${validId}`)
      if (!res.ok) {
        setErr(`Paciente: HTTP ${res.status}`)
        setPaciente(null)
        return
      }
      setPaciente((await res.json()) as PacienteRow)
    } catch {
      setErr('Falha ao carregar paciente.')
    }
  }, [authFetch, validId])

  const loadGestacoes = useCallback(async () => {
    if (!validId) return
    try {
      const res = await authFetch(`/api/v1/gestacoes?paciente_id=${encodeURIComponent(validId)}`)
      if (!res.ok) {
        setGestacoes([])
        return
      }
      const json = (await res.json()) as GestacaoRow[]
      const list = Array.isArray(json) ? json : []
      setGestacoes(list)
      setSelG((prev) => prev || list[0]?.id || '')
    } catch {
      setGestacoes([])
    }
  }, [authFetch, validId])

  const loadConsultas = useCallback(
    async (gestacaoId: string) => {
      if (!gestacaoId) {
        setConsultas([])
        return
      }
      try {
        const res = await authFetch(`/api/v1/consultas?gestacao_id=${encodeURIComponent(gestacaoId)}`)
        if (!res.ok) {
          setConsultas([])
          return
        }
        const raw = (await res.json()) as Record<string, unknown>[]
        const mapped: ConsultaRow[] = (Array.isArray(raw) ? raw : []).map((c) => ({
          id: String(c.id),
          gestacao_id: String(c.gestacao_id),
          data: typeof c.data === 'string' ? c.data.slice(0, 10) : String(c.data ?? ''),
          status: String(c.status ?? ''),
          validacao_medica: typeof c.validacao_medica === 'boolean' ? c.validacao_medica : undefined,
        }))
        setConsultas(mapped)
      } catch {
        setConsultas([])
      }
    },
    [authFetch],
  )

  useEffect(() => {
    void loadPaciente()
    void loadGestacoes()
  }, [loadPaciente, loadGestacoes])

  useEffect(() => {
    if (selG) void loadConsultas(selG)
    else setConsultas([])
  }, [selG, loadConsultas])

  if (!validId) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-rose-900">
        <p>Identificador inválido.</p>
        <Link to="/pacientes" className="mt-2 inline-block font-medium underline">
          Voltar à lista
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Prontuário (LGPD)</p>
          <h1 className="text-2xl font-semibold text-slate-900">{paciente?.nome_mascarado ?? 'Carregando…'}</h1>
          {paciente?.nome_social ? <p className="text-sm text-slate-600">Nome social: {paciente.nome_social}</p> : null}
        </div>
        <Link to="/pacientes" className="text-sm font-medium text-teal-800 underline">
          ← Lista de gestantes
        </Link>
      </div>

      {err ? <p className="text-sm text-rose-700">{err}</p> : null}

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Identificação na agenda</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">CPF (últimos 4)</dt>
            <dd>{paciente?.cpf_ultimos4 ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Cartão SUS (últimos 4)</dt>
            <dd>{paciente?.cartao_sus_ultimos4 ?? '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Gestação</h2>
        <div className="mt-3 max-w-md">
          <label className="text-xs font-medium text-slate-500">Perfil ativo</label>
          <select
            value={selG}
            onChange={(e) => setSelG(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">— selecione —</option>
            {gestacoes.map((g) => (
              <option key={g.id} value={g.id}>
                {g.id.slice(0, 8)}… · risco {g.tipo_risco ?? 'NORMAL'}
              </option>
            ))}
          </select>
        </div>
        {gestacoes.length === 0 ? <p className="mt-2 text-sm text-slate-500">Nenhuma gestação cadastrada.</p> : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Histórico de consultas</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="py-2 pr-4">Data</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Validação médica</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {!selG ? (
                <tr>
                  <td colSpan={4} className="py-6 text-slate-500">
                    Selecione uma gestação.
                  </td>
                </tr>
              ) : null}
              {selG && consultas.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-slate-500">
                    Nenhuma consulta nesta gestação.
                  </td>
                </tr>
              ) : null}
              {consultas.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="py-2 pr-4 whitespace-nowrap">{c.data}</td>
                  <td className="py-2 pr-4">{c.status}</td>
                  <td className="py-2 pr-4">{c.validacao_medica ? 'Sim' : 'Não'}</td>
                  <td className="py-2 text-right">
                    <Link
                      to={`/consultas/${c.id}/escriba`}
                      className="font-medium text-teal-800 underline"
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
    </div>
  )
}
