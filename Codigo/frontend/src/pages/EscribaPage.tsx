import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ConsultaStreamPanel } from '../components/ConsultaStreamPanel.js'
import { useAuth } from '../context/AuthContext.js'
import { isUuid } from '../lib/uuid.js'

type ConsultaDetail = {
  id: string
  status: string
  validacao_medica: boolean
  queixa: string | null
}

export function EscribaPage() {
  const { consultaId } = useParams()
  const id = consultaId ?? ''
  const { authFetch } = useAuth()
  const [tab, setTab] = useState<'inicio' | 'fim'>('inicio')
  const [mirrorStt, setMirrorStt] = useState('')
  const [mirrorIa, setMirrorIa] = useState('')
  const onStreamTexts = useCallback((stt: string, ia: string) => {
    setMirrorStt(stt)
    setMirrorIa(ia)
  }, [])

  const [row, setRow] = useState<ConsultaDetail | null>(null)
  const [queixa, setQueixa] = useState('')
  const [vm, setVm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const valid = useMemo(() => isUuid(id), [id])

  const load = useCallback(async () => {
    if (!valid) return
    setMsg(null)
    try {
      const res = await authFetch(`/api/v1/consultas/${id}`)
      const body = (await res.json()) as Record<string, unknown>
      if (!res.ok) {
        setRow(null)
        setMsg(typeof body.message === 'string' ? body.message : `HTTP ${res.status}`)
        return
      }
      const detail: ConsultaDetail = {
        id: String(body.id),
        status: String(body.status),
        validacao_medica: Boolean(body.validacao_medica),
        queixa: typeof body.queixa === 'string' ? body.queixa : null,
      }
      setRow(detail)
      setQueixa(detail.queixa ?? '')
      setVm(detail.validacao_medica)
    } catch {
      setMsg('Falha ao carregar consulta.')
    }
  }, [authFetch, id, valid])

  useEffect(() => {
    void load()
  }, [load])

  const patch = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!valid) return
      setBusy(true)
      setMsg(null)
      try {
        const res = await authFetch(`/api/v1/consultas/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        const body = (await res.json()) as { message?: string }
        if (!res.ok) {
          setMsg(typeof body.message === 'string' ? body.message : `HTTP ${res.status}`)
          return
        }
        await load()
        setMsg('Registro atualizado.')
      } catch {
        setMsg('Erro de rede ao salvar.')
      } finally {
        setBusy(false)
      }
    },
    [authFetch, id, load, valid],
  )

  if (!valid) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-rose-900">
        <p>Identificador de consulta inválido.</p>
        <Link to="/dashboard" className="mt-2 inline-block font-medium underline">
          Voltar à agenda
        </Link>
      </div>
    )
  }

  const tabBtn = (k: 'inicio' | 'fim', label: string) => (
    <button
      type="button"
      onClick={() => setTab(k)}
      className={`rounded-md px-4 py-2 text-sm font-medium ${
        tab === k ? 'bg-teal-800 text-white' : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Escriba</p>
          <h1 className="text-2xl font-semibold text-slate-900">Consulta em atendimento</h1>
          <p className="mt-1 font-mono text-xs text-slate-600">{id}</p>
          {row ? (
            <p className="mt-2 text-sm text-slate-700">
              Status: <span className="font-semibold">{row.status}</span>
              {row.status === 'CONFIRMADA' ? (
                <span className="ml-2 text-emerald-700">· consulta encerrada</span>
              ) : null}
            </p>
          ) : null}
        </div>
        <Link to="/dashboard" className="text-sm font-medium text-teal-800 underline">
          ← Agenda
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabBtn('inicio', 'Início — captura (áudio)')}
        {tabBtn('fim', 'Fim — revisão e confirmação')}
      </div>

      {msg ? <p className="text-sm text-slate-700">{msg}</p> : null}

      {tab === 'inicio' ? (
        <ConsultaStreamPanel variant="streamOnly" initialConsultaId={id} onStreamTexts={onStreamTexts} />
      ) : (
        <div className="space-y-6">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-800">Texto da sessão (não persistido automaticamente)</h2>
            <p className="mt-1 text-xs text-slate-500">
              Copie trechos para a queixa se desejar; a transcrição definitiva depende dos eventos persistidos no
              backend.
            </p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold uppercase text-slate-500">STT parcial (última sessão)</h3>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-xs text-slate-900">
                  {mirrorStt || '—'}
                </pre>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase text-slate-500">Insight IA (stream)</h3>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-indigo-50 p-3 text-xs text-indigo-950">
                  {mirrorIa || '—'}
                </pre>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-800">Registro clínico e ciclo da consulta</h2>
            <label className="mt-4 block text-xs font-medium text-slate-600">
              Queixa / evolução (texto livre)
              <textarea
                value={queixa}
                onChange={(e) => setQueixa(e.target.value)}
                rows={5}
                className="mt-1 w-full max-w-3xl rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || row?.status === 'CONFIRMADA'}
                onClick={() => void patch({ queixa })}
                className="rounded-md border border-slate-400 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                Salvar queixa
              </button>
            </div>

            <div className="mt-8 border-t border-slate-100 pt-6">
              <h3 className="text-sm font-semibold text-slate-800">Transições de status</h3>
              <p className="mt-1 text-xs text-slate-500">
                RASCUNHO → EM_ANDAMENTO → AGUARDANDO_CONFIRMACAO → CONFIRMADA (exige validação médica).
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {row?.status === 'RASCUNHO' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void patch({ status: 'EM_ANDAMENTO' })}
                    className="rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    Marcar em andamento
                  </button>
                ) : null}
                {row?.status === 'RASCUNHO' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void patch({ status: 'AGUARDANDO_CONFIRMACAO' })}
                    className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-50"
                  >
                    Pular para aguardando confirmação
                  </button>
                ) : null}
                {row?.status === 'EM_ANDAMENTO' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void patch({ status: 'AGUARDANDO_CONFIRMACAO' })}
                    className="rounded-md bg-amber-700 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                  >
                    Enviar para confirmação médica
                  </button>
                ) : null}
                {row?.status === 'AGUARDANDO_CONFIRMACAO' ? (
                  <div className="flex w-full max-w-xl flex-col gap-3">
                    <label className="flex items-center gap-2 text-sm text-slate-800">
                      <input type="checkbox" checked={vm} onChange={(e) => setVm(e.target.checked)} />
                      Validação médica (confirmação explícita)
                    </label>
                    <button
                      type="button"
                      disabled={busy || !vm}
                      onClick={() => void patch({ validacao_medica: true, status: 'CONFIRMADA' })}
                      className="w-fit rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                    >
                      Confirmar consulta
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
