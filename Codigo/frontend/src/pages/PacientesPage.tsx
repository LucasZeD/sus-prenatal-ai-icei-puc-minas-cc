import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.js'
import {
  formatApiDateOnlyPtBr,
  formatLocalDatePtBr,
  parseApiDateOnlyToLocalDate,
  primaryDppFromDumAndEco,
} from '../lib/gestacaoDpp.js'

type PacienteRow = {
  id: string
  nome_mascarado: string
  cpf_ultimos4?: string | null
  cartao_sus_ultimos4?: string | null
  telefone?: string | null
  email?: string | null
  localizacao?: string | null
  gestacao_ativa?: {
    id: string
    tipo_risco: string
    ig_inicial: number | null
    idade_gestac_confirmada: number | null
    dum?: string | null
    dpp?: string | null
    dpp_eco?: string | null
  } | null
  ultima_visita_em?: string | null
}

function riscoBadgeClass(r: string | undefined): string {
  const v = r ?? 'HABITUAL'
  if (v === 'ALTO') return 'bg-red-100 text-red-700 border-red-300'
  return 'bg-emerald-100 text-emerald-800 border-emerald-300'
}

function onlyDigits(s: string): string {
  return s.replace(/\D/g, '')
}

export function PacientesPage() {
  const navigate = useNavigate()
  const { authFetch } = useAuth()
  const [pacientes, setPacientes] = useState<PacienteRow[]>([])
  const [q, setQ] = useState('')
  const [risco, setRisco] = useState<'todos' | 'HABITUAL' | 'ALTO'>('todos')
  const [err, setErr] = useState<string | null>(null)

  const [cadastroOpen, setCadastroOpen] = useState(false)
  const [cadastroStep, setCadastroStep] = useState<1 | 2>(1)
  const [cadastroNome, setCadastroNome] = useState('')
  const [cadastroCpf, setCadastroCpf] = useState('')
  const [cadastroSus, setCadastroSus] = useState('')
  const [cadastroNasc, setCadastroNasc] = useState('')
  const [cadastroTel, setCadastroTel] = useState('')
  const [cadastroDum, setCadastroDum] = useState('')
  const [cadastroSemanas, setCadastroSemanas] = useState('')
  const [cadastroBusy, setCadastroBusy] = useState(false)
  const [cadastroMsg, setCadastroMsg] = useState<string | null>(null)
  const [novoPacienteId, setNovoPacienteId] = useState<string | null>(null)
  const [verifMsg, setVerifMsg] = useState<string | null>(null)

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
      const matchR =
        risco === 'todos' ||
        (p.gestacao_ativa?.tipo_risco ?? 'HABITUAL') === risco ||
        (risco === 'HABITUAL' && !p.gestacao_ativa)
      return matchQ && matchR
    })
  }, [pacientes, q, risco])

  const resetCadastroForm = () => {
    setCadastroStep(1)
    setCadastroNome('')
    setCadastroCpf('')
    setCadastroSus('')
    setCadastroNasc('')
    setCadastroTel('')
    setCadastroDum('')
    setCadastroSemanas('')
    setCadastroMsg(null)
    setNovoPacienteId(null)
    setVerifMsg(null)
  }

  const openCadastro = () => {
    resetCadastroForm()
    setCadastroOpen(true)
  }

  const verificarDocumentos = async () => {
    const cpf = onlyDigits(cadastroCpf)
    const sus = onlyDigits(cadastroSus)
    if (!cpf && !sus) {
      setVerifMsg('Preencha o CPF ou o Cartão do SUS para verificar.')
      return
    }
    setVerifMsg(null)
    try {
      const res = await authFetch('/api/v1/pacientes/verificar-identificadores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(cpf ? { cpf: cpf } : {}),
          ...(sus ? { cartao_sus: sus } : {}),
        }),
      })
      const j = (await res.json()) as { cpf_em_uso?: boolean; cartao_em_uso?: boolean; message?: string }
      if (!res.ok) {
        setVerifMsg(typeof j.message === 'string' ? j.message : 'Não foi possível verificar agora.')
        return
      }
      if (j.cpf_em_uso || j.cartao_em_uso) {
        setVerifMsg(
          'Já existe cadastro com este CPF ou este Cartão do SUS. Abra o prontuário existente em vez de criar outro.',
        )
      } else {
        setVerifMsg('Nenhum cadastro encontrado com estes documentos — pode seguir com o cadastro.')
      }
    } catch {
      setVerifMsg('Falha de rede ao verificar documentos.')
    }
  }

  const submitCadastroPasso1 = async () => {
    const nome = cadastroNome.trim()
    const cpf = onlyDigits(cadastroCpf)
    const sus = onlyDigits(cadastroSus)
    if (nome.length < 2) {
      setCadastroMsg('Informe como a gestante será chamada na lista (pelo menos 2 letras).')
      return
    }
    if (!cpf && !sus) {
      setCadastroMsg('Informe o CPF e/ou o número do Cartão do SUS (pelo menos um dos dois).')
      return
    }
    setCadastroBusy(true)
    setCadastroMsg(null)
    const body: Record<string, unknown> = {
      nome_mascarado: nome.slice(0, 50),
      ...(cpf ? { cpf } : {}),
      ...(sus ? { cartao_sus: sus } : {}),
    }
    if (cadastroNasc.trim() && /^\d{4}-\d{2}-\d{2}$/.test(cadastroNasc.trim())) {
      body.data_nascimento = cadastroNasc.trim()
    }
    if (cadastroTel.trim()) body.telefone = cadastroTel.trim().slice(0, 40)
    try {
      const res = await authFetch('/api/v1/pacientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = (await res.json()) as { id?: string; message?: string }
      if (!res.ok) {
        setCadastroMsg(typeof j.message === 'string' ? j.message : `Não foi possível salvar (código ${res.status}).`)
        return
      }
      const id = typeof j.id === 'string' ? j.id : ''
      if (!id) {
        setCadastroMsg('Resposta inesperada do servidor.')
        return
      }
      setNovoPacienteId(id)
      setCadastroStep(2)
    } catch {
      setCadastroMsg('Falha de rede ao cadastrar.')
    } finally {
      setCadastroBusy(false)
    }
  }

  const submitCadastroPasso2 = async () => {
    if (!novoPacienteId) return
    setCadastroBusy(true)
    setCadastroMsg(null)
    const body: Record<string, unknown> = { paciente_id: novoPacienteId }
    if (cadastroDum.trim() && /^\d{4}-\d{2}-\d{2}$/.test(cadastroDum.trim())) {
      body.dum = cadastroDum.trim()
    }
    const sem = cadastroSemanas.trim() ? Number.parseInt(cadastroSemanas.trim(), 10) : NaN
    if (Number.isFinite(sem) && sem >= 0 && sem <= 45) {
      body.idade_gestac_confirmada = sem
    }
    try {
      const res = await authFetch('/api/v1/gestacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = (await res.json()) as { message?: string }
      if (!res.ok) {
        setCadastroMsg(typeof j.message === 'string' ? j.message : `Não foi possível abrir a gestação (${res.status}).`)
        return
      }
      setCadastroOpen(false)
      resetCadastroForm()
      void load()
      void navigate(`/pacientes/${novoPacienteId}`)
    } catch {
      setCadastroMsg('Falha de rede ao registrar a gestação.')
    } finally {
      setCadastroBusy(false)
    }
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto px-4 py-8">
      {cadastroOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cadastro-gestante-titulo"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-brand-pink/20 bg-white p-6 shadow-xl">
            <h2 id="cadastro-gestante-titulo" className="text-xl font-black text-brand-navy">
              {cadastroStep === 1 ? 'Nova gestante' : 'Início do acompanhamento'}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {cadastroStep === 1
                ? 'Dados básicos para identificação na unidade. Os documentos ajudam a evitar cadastro em duplicidade.'
                : 'Opcional: data da última menstruação e idade gestacional atual em semanas. Você pode preencher depois no prontuário.'}
            </p>

            {cadastroStep === 1 ? (
              <div className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600">Nome na lista da equipe</label>
                  <input
                    value={cadastroNome}
                    onChange={(e) => setCadastroNome(e.target.value)}
                    placeholder="Ex.: Maria S. ou iniciais acordadas com a gestante"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm focus:border-brand-pink focus:ring-brand-pink"
                    maxLength={50}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-600">CPF (opcional se tiver Cartão SUS)</label>
                    <input
                      value={cadastroCpf}
                      onChange={(e) => setCadastroCpf(e.target.value)}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="Somente números"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm focus:border-brand-pink focus:ring-brand-pink"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600">Cartão do SUS (opcional se tiver CPF)</label>
                    <input
                      value={cadastroSus}
                      onChange={(e) => setCadastroSus(e.target.value)}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="Somente números"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm focus:border-brand-pink focus:ring-brand-pink"
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-500">É obrigatório informar pelo menos um dos dois documentos acima.</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void verificarDocumentos()}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
                  >
                    Conferir se já existe cadastro
                  </button>
                </div>
                {verifMsg ? <p className="text-xs font-medium text-slate-700 bg-slate-50 rounded-lg p-3 border border-slate-100">{verifMsg}</p> : null}
                <div>
                  <label className="block text-xs font-bold text-slate-600">Data de nascimento (opcional)</label>
                  <input
                    type="date"
                    value={cadastroNasc}
                    onChange={(e) => setCadastroNasc(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm focus:border-brand-pink focus:ring-brand-pink"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600">Telefone para contato (opcional)</label>
                  <input
                    value={cadastroTel}
                    onChange={(e) => setCadastroTel(e.target.value)}
                    placeholder="Com DDD"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm focus:border-brand-pink focus:ring-brand-pink"
                  />
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600">Data da última menstruação — DUM (opcional)</label>
                  <input
                    type="date"
                    value={cadastroDum}
                    onChange={(e) => setCadastroDum(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm focus:border-brand-pink focus:ring-brand-pink"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600">Idade gestacional hoje, em semanas (opcional)</label>
                  <input
                    value={cadastroSemanas}
                    onChange={(e) => setCadastroSemanas(e.target.value.replace(/\D/g, ''))}
                    inputMode="numeric"
                    placeholder="Ex.: 12"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm focus:border-brand-pink focus:ring-brand-pink"
                  />
                  <p className="mt-1 text-xs text-slate-500">Deixe em branco se ainda não souber; pode atualizar no prontuário.</p>
                </div>
              </div>
            )}

            {cadastroMsg ? <p className="mt-4 text-sm font-medium text-rose-700">{cadastroMsg}</p> : null}

            <div className="mt-8 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={cadastroBusy}
                onClick={() => {
                  setCadastroOpen(false)
                  resetCadastroForm()
                }}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              {cadastroStep === 1 ? (
                <button
                  type="button"
                  disabled={cadastroBusy}
                  onClick={() => void submitCadastroPasso1()}
                  className="rounded-xl bg-brand-pink px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
                >
                  {cadastroBusy ? 'Salvando…' : 'Salvar e continuar'}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={cadastroBusy}
                    onClick={() => {
                      setCadastroStep(1)
                      setCadastroMsg(null)
                    }}
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    disabled={cadastroBusy}
                    onClick={() => void submitCadastroPasso2()}
                    className="rounded-xl bg-brand-navy px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
                  >
                    {cadastroBusy ? 'Abrindo…' : 'Abrir prontuário'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-brand-navy">Gestantes</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Selecione uma paciente para iniciar ou revisar consultas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openCadastro()}
            className="rounded-xl bg-brand-pink px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-brand-pink transition-colors"
          >
            Nova gestante
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl border border-brand-pink/30 bg-white px-5 py-2.5 text-sm font-bold text-brand-navy shadow-sm hover:bg-brand-pink/10 focus:outline-none focus:ring-2 focus:ring-brand-pink transition-colors"
          >
            Atualizar lista
          </button>
        </div>
      </div>

      {/* Controladores de Filtro */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
         <div className="flex-1">
           <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Buscar</label>
           <input
             value={q}
             onChange={(e) => setQ(e.target.value)}
             placeholder="Nome na lista ou últimos dígitos do CPF / Cartão SUS"
             className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 shadow-sm focus:border-brand-pink focus:ring-brand-pink"
           />
         </div>
         <div className="flex flex-wrap items-center gap-3">
           <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">Filtrar por Risco:</span>
           {(['todos', 'HABITUAL', 'ALTO'] as const).map((k) => (
             <button
               key={k}
               type="button"
               onClick={() => setRisco(k)}
               className={`rounded-xl px-4 py-2 text-[13px] font-bold transition-all ${
                 risco === k ? 'bg-brand-pink text-white shadow-md' : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
               }`}
             >
               {k === 'todos' ? 'Todos' : k === 'HABITUAL' ? 'Habitual' : 'Alto risco'}
             </button>
           ))}
         </div>
      </div>

      {err ? <p className="text-center text-sm font-medium text-red-600 bg-red-50 p-4 rounded-xl">{err}</p> : null}

      <div className="space-y-4">
        {filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 py-20 text-center">
            <div className="h-12 w-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-400 mb-4">🔍</div>
            <p className="text-slate-500 font-medium">Nenhuma paciente encontrada com os filtros atuais.</p>
          </div>
        ) : null}
        
        <div className="grid grid-cols-1 gap-4">
          {filtrados.map((p) => {
            const primaryRisco = p.gestacao_ativa?.tipo_risco ?? 'HABITUAL'
            const igSemanas = p.gestacao_ativa?.idade_gestac_confirmada ?? p.gestacao_ativa?.ig_inicial
            const dumDate = parseApiDateOnlyToLocalDate(p.gestacao_ativa?.dum ?? null)
            const ecoDate = parseApiDateOnlyToLocalDate(p.gestacao_ativa?.dpp_eco ?? null)
            const primaryDpp = primaryDppFromDumAndEco(dumDate, ecoDate)
            const dumCard = formatApiDateOnlyPtBr(p.gestacao_ativa?.dum ?? null)
            const dppCard = primaryDpp ? formatLocalDatePtBr(primaryDpp) : '—'
            const ultima =
              typeof p.ultima_visita_em === 'string' && p.ultima_visita_em
                ? new Date(p.ultima_visita_em).toLocaleDateString('pt-BR')
                : '—'

            return (
              <article
                key={p.id}
                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-brand-pink/50 hover:shadow-md"
              >
                <div className="flex items-center gap-5">
                  <div className="hidden sm:flex h-14 w-14 items-center justify-center rounded-full bg-brand-pink/10 border border-brand-pink/30 text-brand-pink font-black text-xl group-hover:bg-brand-pink/20 transition-colors">
                    {p.nome_mascarado.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-brand-navy mb-1">{p.nome_mascarado}</h2>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold text-slate-500">
                      <span className="flex items-center gap-1.5"><span className="text-slate-400">IG Atual:</span> <span className="text-brand-pink font-black">{igSemanas != null ? `${igSemanas} sem` : 'ND'}</span></span>
                      <span className="text-slate-300">•</span>
                      <span className="flex items-center gap-1.5"><span className="text-slate-400">Última consulta:</span> <span className="text-slate-700">{ultima}</span></span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <span className="text-slate-400">DUM:</span>
                        <span className="text-slate-700">{dumCard !== '' ? dumCard : '—'}</span>
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="flex items-center gap-1.5">
                        <span className="text-slate-400">DPP:</span>
                        <span className="text-slate-700">{dppCard}</span>
                        {ecoDate ? (
                          <span className="text-[10px] font-black uppercase tracking-wide text-emerald-600">USG</span>
                        ) : null}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold text-slate-500">
                       <span className="flex items-center gap-1.5"><span className="text-slate-400">Telefone:</span> <span className="text-slate-700">{p.telefone ?? '—'}</span></span>
                       <span className="flex items-center gap-1.5"><span className="text-slate-400">E-mail:</span> <span className="text-slate-700">{p.email ?? '—'}</span></span>
                       <span className="flex items-center gap-1.5"><span className="text-slate-400">Localização:</span> <span className="text-slate-700">{p.localizacao ?? '—'}</span></span>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                       <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600">
                         CPF: {p.cpf_ultimos4 ? `***.***.***-${p.cpf_ultimos4}` : 'Não inf.'}
                       </span>
                       <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600">
                         SUS: {p.cartao_sus_ultimos4 ? `*** ${p.cartao_sus_ultimos4}` : 'Não inf.'}
                       </span>
                    </div>

                  </div>
                </div>

                <div className="flex flex-row sm:flex-col items-center justify-between sm:items-end gap-3 mt-4 sm:mt-0">
                  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-widest ${riscoBadgeClass(primaryRisco)}`}>
                    {primaryRisco === 'ALTO' ? 'Alto risco' : 'Risco habitual'}
                  </span>
                  <Link
                    to={`/pacientes/${p.id}`}
                    className="flex w-full sm:w-auto items-center justify-center rounded-xl bg-white px-5 py-2.5 text-xs font-bold text-brand-navy border border-slate-200 shadow-sm hover:bg-slate-50 hover:border-brand-pink transition-all"
                  >
                    Ver Prontuário
                  </Link>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}
