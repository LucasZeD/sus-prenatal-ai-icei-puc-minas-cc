import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.js'

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

type UnidadeRow = { id: string; nome: string }

type PacienteResumo = {
  id: string
  nome_mascarado: string
  cpf_ultimos4?: string | null
  cartao_sus_ultimos4?: string | null
  gestacao_ativa: { id: string; tipo_risco: string } | null
}

type AgendaConsultaRow = {
  id: string
  status: string
  data: string
  unidade: { id: string; nome: string }
  gestacao_id: string
  paciente: { id: string; nome_mascarado: string; cpf_ultimos4?: string | null; cartao_sus_ultimos4?: string | null }
}

function startOfWeekMondayLocal(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const x = new Date(d)
  x.setDate(d.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}

function addDaysLocal(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(d.getDate() + n)
  return x
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toDayKeyLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function parseDatetimeLocalAsLocal(value: string): Date | null {
  const t = value.trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(t)
  if (!m) return null
  const y = Number.parseInt(m[1], 10)
  const mo = Number.parseInt(m[2], 10) - 1
  const da = Number.parseInt(m[3], 10)
  const hh = Number.parseInt(m[4], 10)
  const mm = Number.parseInt(m[5], 10)
  const d = new Date(y, mo, da, hh, mm, 0, 0)
  return Number.isNaN(d.getTime()) ? null : d
}

function toDatetimeLocalValue(d: Date): string {
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function fmtDateTimePtBr(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function displayStatus(status: string): string {
  return status === 'RASCUNHO' ? 'PENDENTE' : status
}

export function DashboardPage() {
  const { authFetch } = useAuth()
  const [worklist, setWorklist] = useState<WorklistRow[]>([])
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [agenda, setAgenda] = useState<AgendaConsultaRow[]>([])
  const [agendaErr, setAgendaErr] = useState<string | null>(null)
  const [unidades, setUnidades] = useState<UnidadeRow[]>([])
  const [pacientes, setPacientes] = useState<PacienteResumo[]>([])

  const sortedWorklist = useMemo(() => {
    const rows = [...worklist]
    rows.sort((a, b) => {
      const at = new Date(a.data).getTime()
      const bt = new Date(b.data).getTime()
      if (!Number.isFinite(at) && !Number.isFinite(bt)) return 0
      if (!Number.isFinite(at)) return 1
      if (!Number.isFinite(bt)) return -1
      return at - bt
    })
    return rows
  }, [worklist])

  const [createOpen, setCreateOpen] = useState(false)
  const [createSlot, setCreateSlot] = useState<Date | null>(null)
  const [createPacienteId, setCreatePacienteId] = useState('')
  const [createUnidadeId, setCreateUnidadeId] = useState('')
  const [createWhenValue, setCreateWhenValue] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createMsg, setCreateMsg] = useState<string | null>(null)

  const [viewOpen, setViewOpen] = useState(false)
  const [viewRow, setViewRow] = useState<AgendaConsultaRow | null>(null)
  const [viewBusy, setViewBusy] = useState(false)
  const [viewMsg, setViewMsg] = useState<string | null>(null)
  const [reschedValue, setReschedValue] = useState('')

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

  const [weekStart, setWeekStart] = useState(() => startOfWeekMondayLocal(new Date()))
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysLocal(weekStart, i)), [weekStart])

  const loadAgendaWeek = useCallback(async () => {
    setAgendaErr(null)
    const start = new Date(weekStart)
    start.setHours(0, 0, 0, 0)
    const end = addDaysLocal(start, 6)
    end.setHours(23, 59, 59, 999)
    try {
      const qs = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() })
      const res = await authFetch(`/api/v1/consultas/calendario?${qs.toString()}`)
      if (!res.ok) {
        setAgendaErr(`Calendário: HTTP ${res.status}`)
        return
      }
      const json = (await res.json()) as AgendaConsultaRow[]
      setAgenda(Array.isArray(json) ? json : [])
    } catch {
      setAgendaErr('Falha ao carregar calendário.')
    }
  }, [authFetch, weekStart])

  const loadUnidades = useCallback(async () => {
    try {
      const res = await authFetch('/api/v1/unidades')
      if (!res.ok) return
      const json = (await res.json()) as UnidadeRow[]
      setUnidades(Array.isArray(json) ? json : [])
    } catch {
      // noop
    }
  }, [authFetch])

  const loadPacientes = useCallback(async () => {
    try {
      const res = await authFetch('/api/v1/pacientes')
      if (!res.ok) return
      const json = (await res.json()) as PacienteResumo[]
      setPacientes(Array.isArray(json) ? json : [])
    } catch {
      // noop
    }
  }, [authFetch])

  useEffect(() => {
    void loadWorklist()
  }, [loadWorklist])

  useEffect(() => {
    void loadAgendaWeek()
    void loadUnidades()
    void loadPacientes()
  }, [loadAgendaWeek, loadPacientes, loadUnidades])

  useEffect(() => {
    void loadAgendaWeek()
  }, [loadAgendaWeek])

  const altoRisco = useMemo(
    () => worklist.filter((w) => w.tipo_risco_gestacao === 'ALTO').length,
    [worklist],
  )

  const agendaByCell = useMemo(() => {
    const map = new Map<string, AgendaConsultaRow[]>()
    for (const a of agenda) {
      const d = new Date(a.data)
      if (Number.isNaN(d.getTime())) continue
      const key = `${toDayKeyLocal(d)}|${d.getHours()}`
      const arr = map.get(key) ?? []
      arr.push(a)
      map.set(key, arr)
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((x, y) => new Date(x.data).getTime() - new Date(y.data).getTime())
      map.set(k, arr)
    }
    return map
  }, [agenda])

  const openCreate = useCallback(
    (slot: Date | null) => {
      setCreateMsg(null)
      setCreateSlot(slot)
      setCreatePacienteId('')
      const defaultUnidade = unidades[0]?.id ?? ''
      setCreateUnidadeId(defaultUnidade)
      const base = slot ?? new Date()
      setCreateWhenValue(toDatetimeLocalValue(base))
      setCreateOpen(true)
    },
    [unidades],
  )

  const openView = useCallback((row: AgendaConsultaRow) => {
    setViewMsg(null)
    setViewRow(row)
    setReschedValue(() => {
      const d = new Date(row.data)
      if (Number.isNaN(d.getTime())) return ''
      return toDatetimeLocalValue(d)
    })
    setViewOpen(true)
  }, [])

  const reloadAll = useCallback(async () => {
    await loadWorklist()
    await loadAgendaWeek()
  }, [loadAgendaWeek, loadWorklist])

  const submitCreate = useCallback(async () => {
    setCreateBusy(true)
    setCreateMsg(null)
    try {
      const paciente = pacientes.find((p) => p.id === createPacienteId) ?? null
      const gestacaoId = paciente?.gestacao_ativa?.id ?? ''
      if (!gestacaoId) {
        setCreateMsg('Paciente selecionada não possui gestação ativa.')
        return
      }
      if (!createUnidadeId) {
        setCreateMsg('Selecione a unidade.')
        return
      }
      const chosen = createWhenValue.trim()
      const when = chosen ? parseDatetimeLocalAsLocal(chosen) : createSlot ?? new Date()
      if (!when) {
        setCreateMsg('Data/hora inválida.')
        return
      }
      const res = await authFetch('/api/v1/consultas', {
        method: 'POST',
        body: JSON.stringify({ gestacao_id: gestacaoId, unidade_id: createUnidadeId, data: when.toISOString() }),
      })
      const body = (await res.json()) as Record<string, unknown>
      if (!res.ok) {
        setCreateMsg(typeof body.message === 'string' ? body.message : `HTTP ${res.status}`)
        return
      }
      setCreateOpen(false)
      setCreateSlot(null)
      await reloadAll()
    } catch {
      setCreateMsg('Falha de rede ao criar consulta.')
    } finally {
      setCreateBusy(false)
    }
  }, [authFetch, createPacienteId, createSlot, createUnidadeId, createWhenValue, pacientes, reloadAll])

  const cancelConsulta = useCallback(async () => {
    if (!viewRow) return
    setViewBusy(true)
    setViewMsg(null)
    try {
      const res = await authFetch(`/api/v1/consultas/${viewRow.id}`, { method: 'DELETE' })
      const body = (await res.json()) as Record<string, unknown>
      if (!res.ok) {
        setViewMsg(typeof body.message === 'string' ? body.message : `HTTP ${res.status}`)
        return
      }
      setViewOpen(false)
      setViewRow(null)
      await reloadAll()
    } catch {
      setViewMsg('Falha de rede ao cancelar consulta.')
    } finally {
      setViewBusy(false)
    }
  }, [authFetch, reloadAll, viewRow])

  const remarcarConsulta = useCallback(async () => {
    if (!viewRow) return
    const next = reschedValue.trim()
    if (!next) {
      setViewMsg('Informe a nova data/horário.')
      return
    }
    const d = parseDatetimeLocalAsLocal(next)
    if (!d) {
      setViewMsg('Data/horário inválido.')
      return
    }
    setViewBusy(true)
    setViewMsg(null)
    try {
      const res = await authFetch(`/api/v1/consultas/${viewRow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: d.toISOString() }),
      })
      const body = (await res.json()) as Record<string, unknown>
      if (!res.ok) {
        setViewMsg(typeof body.message === 'string' ? body.message : `HTTP ${res.status}`)
        return
      }
      setViewRow((prev) => (prev ? { ...prev, data: d.toISOString() } : prev))
      setReschedValue(toDatetimeLocalValue(d))
      setViewOpen(true)
      setViewMsg(`Consulta remarcada para ${d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.`)
      await reloadAll()
    } catch {
      setViewMsg('Falha de rede ao remarcar consulta.')
    } finally {
      setViewBusy(false)
    }
  }, [authFetch, reloadAll, reschedValue, viewRow])

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-brand-navy">Agenda da Unidade</h1>
          <p className="mt-2 text-base text-slate-500 font-medium max-w-2xl">
            Visão operacional do dia e da semana; calendário de consultas mapeadas via agendamento.
          </p>
        </div>
        <Link to="/dev/sandbox" className="hidden sm:flex px-5 py-3 text-sm font-bold text-brand-navy bg-white border border-brand-pink/30 rounded-xl hover:bg-brand-pink/10 transition-colors shadow-sm items-center gap-2">
          <span className="text-xl">🛠️</span> Dev Sandbox
        </Link>
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-brand-pink/20 bg-white p-6 shadow-sm flex flex-col justify-center">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Atendimentos Pendentes (Hoje)</p>
          <div className="flex items-baseline gap-2 mt-2">
            <p className="text-5xl font-black text-brand-navy">{worklist.length}</p>
            <span className="text-sm font-bold text-slate-400">consultas</span>
          </div>
        </div>
        <div className="rounded-3xl border border-rose-200 bg-brand-pink/5 p-6 shadow-sm flex flex-col justify-center">
          <p className="text-[11px] font-bold uppercase tracking-widest text-rose-800">Atendimentos Alto Risco (Hoje)</p>
          <div className="flex items-baseline gap-2 mt-2">
             <p className="text-5xl font-black text-rose-600">{altoRisco}</p>
             <span className="text-sm font-bold text-rose-400">gestantes</span>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-brand-pink/30 bg-white shadow-md overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-brand-pink/10 bg-brand-pink/5 px-8 py-6">
           <div>
             <h2 className="text-xl font-black text-brand-navy">Próximas Consultas</h2>
             <p className="text-sm text-slate-500 mt-1 font-medium">Fila de consultas agendadas.</p>
           </div>
          <button
            type="button"
             onClick={() => void reloadAll()}
            className="rounded-xl border border-brand-pink/30 bg-white px-5 py-2.5 text-sm font-bold text-brand-navy shadow-sm hover:bg-brand-pink/10 transition-colors focus:ring-2 focus:ring-brand-pink"
          >
            Atualizar Grade
          </button>
        </div>
        
        {loadErr ? <div className="px-8 py-4 bg-red-50 text-sm font-medium text-red-700 border-b border-red-100">{loadErr}</div> : null}
        
        <div className="overflow-auto max-h-[600px]">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-white/95 backdrop-blur-md text-[11px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200">
              <tr>
                <th className="px-8 py-4">Data / Horário</th>
                <th className="px-8 py-4">Paciente</th>
                <th className="px-8 py-4 text-center">Protocolo de Risco</th>
                <th className="px-8 py-4 text-center">Status</th>
                <th className="px-8 py-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {worklist.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-8 py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <span className="text-4xl mb-3">🗓️</span>
                      <p className="text-base text-slate-600 font-bold">Sua agenda de pendentes está vazia no momento.</p>
                      <p className="text-slate-400 text-xs mt-2">Vá ao <Link to="/dev/sandbox" className="text-brand-pink font-bold hover:underline">/dev/sandbox</Link> para adicionar testes.</p>
                    </div>
                  </td>
                </tr>
              ) : null}
              {sortedWorklist.map((w) => {
                const isFinalized = w.status === 'FINALIZADA' || w.status === 'CONFIRMADA';
                return (
                <tr key={w.id} className={`transition-colors group ${isFinalized ? 'bg-slate-50 opacity-75' : 'hover:bg-brand-pink/5'}`}>
                  <td className="px-8 py-4 whitespace-nowrap text-brand-navy font-bold text-sm">{fmtDateTimePtBr(w.data)}</td>
                  <td className="px-8 py-4">
                    <div className="font-black text-brand-navy text-base">{w.paciente.nome_mascarado}</div>
                    <div className="text-[11px] font-bold text-slate-400 mt-0.5 uppercase tracking-widest">
                      {[w.paciente.cpf_ultimos4 ? `CPF …${w.paciente.cpf_ultimos4}` : null, w.paciente.cartao_sus_ultimos4 ? `SUS …${w.paciente.cartao_sus_ultimos4}` : null]
                        .filter(Boolean)
                        .join(' • ')}
                    </div>
                  </td>
                  <td className="px-8 py-4 text-center">
                     <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${
                        w.tipo_risco_gestacao === 'HABITUAL' ? 'bg-emerald-100 text-emerald-800' :
                        w.tipo_risco_gestacao === 'ALTO' ? 'bg-rose-200 text-rose-900' : 'bg-slate-100 text-slate-700'
                     }`}>
                        {w.tipo_risco_gestacao === 'ALTO' ? 'Alto risco' : 'Risco habitual'}
                     </span>
                  </td>
                  <td className="px-8 py-4 text-center">
                     <span className="inline-flex items-center rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-[10px] font-bold text-slate-600 shadow-sm uppercase tracking-wider">
                       {displayStatus(w.status).replace('_', ' ')}
                     </span>
                  </td>
                  <td className="px-8 py-4 text-right flex justify-end gap-3">
                    <Link
                      to={`/pacientes/${w.paciente.id}`}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-brand-navy shadow-sm hover:border-brand-pink hover:text-brand-pink transition-all"
                    >
                      Ver Prontuário
                    </Link>
                    {isFinalized ? (
                      <span className="inline-flex items-center justify-center rounded-xl bg-slate-100 px-4 py-2 text-[11px] font-bold text-slate-400 cursor-not-allowed border border-slate-200 uppercase tracking-widest">
                        Finalizada
                      </span>
                    ) : (
                      <Link
                        to={`/consultas/${w.id}/escriba`}
                        className="inline-flex items-center justify-center rounded-xl bg-brand-pink px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#e88d94] focus:ring-2 focus:ring-brand-pink focus:ring-offset-2 transition-all group-hover:scale-105"
                      >
                        Iniciar Atendimento
                      </Link>
                    )}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Calendário Teams-style para a Semana Inteira */}
      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden mt-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/50 px-8 py-6">
           <div>
             <div className="flex items-center gap-3">
               <h2 className="text-xl font-black text-brand-navy border-r border-slate-300 pr-4">Planejamento Semanal</h2>
               <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white border border-slate-200 shadow-sm">
                 <button
                   type="button"
                   onClick={() => setWeekStart((prev) => addDaysLocal(prev, -7))}
                   className="text-slate-400 hover:text-brand-pink transition-colors font-bold px-1"
                   title="Semana anterior"
                 >
                   &lt;
                 </button>
                 <div className="flex flex-col items-center leading-tight px-1">
                   <span className="text-[11px] font-black text-brand-navy tracking-wide">
                     {weekStart.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                   </span>
                   <span className="text-[10px] font-bold text-slate-500 tracking-wide">
                     {`${pad2(weekStart.getDate())}/${pad2(weekStart.getMonth() + 1)} — ${pad2(
                       addDaysLocal(weekStart, 6).getDate(),
                     )}/${pad2(addDaysLocal(weekStart, 6).getMonth() + 1)}`}
                   </span>
                 </div>
                 <button
                   type="button"
                   onClick={() => setWeekStart((prev) => addDaysLocal(prev, 7))}
                   className="text-slate-400 hover:text-brand-pink transition-colors font-bold px-1"
                   title="Próxima semana"
                 >
                   &gt;
                 </button>
                 <button
                   type="button"
                   onClick={() => setWeekStart(startOfWeekMondayLocal(new Date()))}
                   className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50 hover:text-brand-pink transition-colors"
                   title="Voltar para a semana de hoje"
                 >
                   Hoje
                 </button>
               </div>
             </div>
             <p className="text-sm text-slate-500 mt-1 font-medium">Visualize horários disponíveis e marque consultas futuras.</p>
           </div>
           <button
             type="button"
             onClick={() => openCreate(null)}
             className="hidden sm:flex rounded-xl bg-brand-navy px-5 py-2.5 text-sm font-bold text-white shadow-md hover:bg-[#2a4365] transition-colors focus:ring-2 focus:ring-brand-navy items-center gap-2"
           >
             <span className="text-lg leading-none">+</span> Nova Consulta
           </button>
        </div>

        {agendaErr ? (
          <div className="px-8 py-4 bg-amber-50 text-sm font-bold text-amber-800 border-b border-amber-100">
            {agendaErr}
          </div>
        ) : null}

        <div className="overflow-x-auto">
           {/* Cabeçalho dos Dias da Semana */}
           <div className="grid grid-cols-[100px_repeat(7,minmax(140px,1fr))] border-b border-slate-200 bg-white">
              <div className="p-4 flex items-end justify-center border-r border-slate-100">
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Local</span>
              </div>
              {weekDays.map((d) => {
                const now = new Date()
                const isToday =
                  now.getFullYear() === d.getFullYear() &&
                  now.getMonth() === d.getMonth() &&
                  now.getDate() === d.getDate()
                return (
                  <div key={d.toISOString()} className={`p-4 flex flex-col items-center justify-center border-r border-slate-100 ${isToday ? 'bg-brand-pink/5' : ''}`}>
                     <span className={`text-[10px] uppercase font-bold tracking-widest ${isToday ? 'text-brand-pink' : 'text-slate-500'}`}>
                       {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d.getDay()]}
                     </span>
                     <span className={`text-2xl font-black mt-0.5 ${isToday ? 'text-brand-navy' : 'text-slate-700'}`}>
                       {String(d.getDate()).padStart(2, '0')}
                     </span>
                  </div>
                )
              })}
           </div>

           {/* Corpo do Calendário */}
           <div className="grid grid-cols-[100px_repeat(7,minmax(140px,1fr))] bg-slate-50/50">
              {['00:00','01:00','02:00','03:00','04:00','05:00','06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'].map(hour => (
                 <div key={hour} className="contents group">
                    {(() => {
                      const now = new Date()
                      const hourNum = parseInt(hour.split(':')[0], 10)
                      const isCurrentHour = now.getHours() === hourNum
                      return (
                        <div
                          className={`px-3 py-1 flex items-start justify-center border-r border-b border-slate-100 ${
                            isCurrentHour ? 'bg-brand-pink/5' : 'bg-white'
                          }`}
                        >
                          <span className={`text-[10px] font-bold mt-1 ${isCurrentHour ? 'text-brand-pink' : 'text-slate-400'}`}>{hour}</span>
                        </div>
                      )
                    })()}
                    {/* 7 células para os dias da semana */}
                    {weekDays.map((d) => {
                       const now = new Date()
                       const isToday =
                         now.getFullYear() === d.getFullYear() &&
                         now.getMonth() === d.getMonth() &&
                         now.getDate() === d.getDate()
                       const hourNum = parseInt(hour.split(':')[0], 10)
                       const isNightShift = hourNum >= 19 || hourNum <= 6

                       const key = `${toDayKeyLocal(d)}|${hourNum}`
                       const events = agendaByCell.get(key) ?? []
                       const first = events[0] ?? null

                       const slot = new Date(d)
                       slot.setHours(hourNum, 0, 0, 0)
                       
                       return (
                          <button
                            type="button"
                            key={d.toISOString() + hour}
                            onClick={() => {
                              if (first) {
                                openView(first)
                              } else {
                                openCreate(slot)
                              }
                            }}
                            className={`min-h-[1px] p-1 border-r border-b border-slate-100 transition-colors hover:bg-slate-100 cursor-pointer flex flex-col text-left ${
                              isToday ? 'bg-brand-pink/5' : isNightShift ? 'bg-slate-50' : 'bg-white'
                            }`}
                          >
                            {first ? (
                              <div
                                className={`text-[10px] font-bold p-2 my-0.5 rounded-lg shadow-sm border flex-1 ${
                                  first.status === 'CONFIRMADA' || first.status === 'FINALIZADA'
                                    ? 'bg-slate-200 text-slate-800 border-slate-300'
                                    : 'bg-brand-pink text-white border-brand-pink/50'
                                }`}
                              >
                                <p className="truncate">{first.paciente.nome_mascarado}</p>
                                <p className="opacity-80 mt-0.5 font-medium truncate">{first.unidade.nome}</p>
                                <p className="opacity-80 mt-0.5 font-medium">
                                  {new Date(first.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                                <p className="opacity-90 mt-1 font-black">{displayStatus(first.status).replace('_', ' ')}</p>
                              </div>
                            ) : (
                              <div className="w-full h-full min-h-[32px] rounded-lg border-2 border-transparent hover:border-slate-300 border-dashed flex items-center justify-center opacity-0 hover:opacity-100 transition-all">
                                <span className="text-2xl text-slate-300 pb-1">+</span>
                              </div>
                            )}
                            {events.length > 1 ? (
                              <div className="mt-1 text-[10px] font-bold text-slate-400 px-1">{`+${events.length - 1} no mesmo horário`}</div>
                            ) : null}
                          </button>
                       )
                    })}
                 </div>
              ))}
           </div>
        </div>
        <div className="p-4 bg-slate-50 border-t border-slate-200 text-center sm:hidden">
           <button type="button" onClick={() => openCreate(null)} className="w-full rounded-xl bg-brand-navy px-5 py-3 text-sm font-bold text-white shadow-sm">
             + Nova Consulta
           </button>
        </div>
      </section>

      {/* Link de Sandbox para UI Mobile */}
      <div className="sm:hidden flex justify-center mt-6">
         <Link to="/dev/sandbox" className="w-full text-center px-5 py-4 text-sm font-bold text-brand-navy bg-white border border-brand-pink/30 rounded-xl shadow-sm">
           Acessar Painel de Testes (Dev Sandbox)
         </Link>
      </div>

      {/* Modal: Criar consulta */}
      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white shadow-xl overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-5">
              <h3 className="text-base font-black text-brand-navy">Nova consulta</h3>
              <p className="mt-1 text-xs font-bold text-slate-500">
                {createSlot ? `Horário selecionado: ${fmtDateTimePtBr(createSlot.toISOString())}` : 'Selecione paciente, unidade e confirme.'}
              </p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Data e hora</label>
                <input
                  type="datetime-local"
                  value={createWhenValue}
                  onChange={(e) => setCreateWhenValue(e.target.value)}
                  className="block w-full rounded-2xl border-slate-200 px-4 py-3 text-sm shadow-sm focus:border-brand-pink focus:ring-brand-pink bg-white font-bold text-slate-800"
                />
              </div>
              {createMsg ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">{createMsg}</div>
              ) : null}

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Paciente</label>
                <select
                  value={createPacienteId}
                  onChange={(e) => setCreatePacienteId(e.target.value)}
                  className="block w-full rounded-2xl border-slate-200 px-4 py-3 text-sm shadow-sm focus:border-brand-pink focus:ring-brand-pink bg-white font-bold text-slate-800"
                >
                  <option value="">Selecione…</option>
                  {pacientes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome_mascarado}
                      {p.cpf_ultimos4 ? ` — CPF …${p.cpf_ultimos4}` : ''}
                      {p.cartao_sus_ultimos4 ? ` — SUS …${p.cartao_sus_ultimos4}` : ''}
                      {p.gestacao_ativa ? '' : ' (sem gestação ativa)'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Unidade</label>
                <select
                  value={createUnidadeId}
                  onChange={(e) => setCreateUnidadeId(e.target.value)}
                  className="block w-full rounded-2xl border-slate-200 px-4 py-3 text-sm shadow-sm focus:border-brand-pink focus:ring-brand-pink bg-white font-bold text-slate-800"
                >
                  <option value="">Selecione…</option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold text-slate-600">
                  Dica: clique em um horário vago no calendário para pré-preencher. Você pode ajustar a data/hora aqui antes de criar.
                </p>
              </div>
            </div>
            <div className="border-t border-slate-100 bg-white px-6 py-5 flex flex-col sm:flex-row gap-3 justify-end">
              <button
                type="button"
                disabled={createBusy}
                onClick={() => {
                  setCreateOpen(false)
                  setCreateSlot(null)
                }}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Fechar
              </button>
              <button
                type="button"
                disabled={createBusy || !createPacienteId || !createUnidadeId}
                onClick={() => void submitCreate()}
                className="rounded-2xl bg-brand-navy px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-[#2a4365] disabled:opacity-50 focus:ring-2 focus:ring-brand-navy focus:ring-offset-2"
              >
                {createBusy ? 'Criando…' : 'Criar consulta'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal: Ver / cancelar / remarcar */}
      {viewOpen && viewRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white shadow-xl overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-5">
              <h3 className="text-base font-black text-brand-navy">Consulta</h3>
              <p className="mt-1 text-xs font-bold text-slate-500">{fmtDateTimePtBr(viewRow.data)}</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              {viewMsg ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">{viewMsg}</div>
              ) : null}

              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-1">
                <p className="text-sm font-black text-brand-navy">{viewRow.paciente.nome_mascarado}</p>
                <p className="text-xs font-bold text-slate-500">{viewRow.unidade.nome}</p>
                <p className="text-[11px] font-bold text-slate-400">Status: {displayStatus(viewRow.status).replace('_', ' ')}</p>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Remarcar (data/horário)</label>
                <input
                  type="datetime-local"
                  value={reschedValue}
                  onChange={(e) => setReschedValue(e.target.value)}
                  className="block w-full rounded-2xl border-slate-200 px-4 py-3 text-sm shadow-sm focus:border-brand-pink focus:ring-brand-pink bg-white font-bold text-slate-800"
                />
                <p className="mt-2 text-[11px] font-bold text-slate-400">
                  {viewRow.status === 'CONFIRMADA' ? 'Consultas confirmadas não podem ser remarcadas (regra de domínio).' : 'Isso atualiza o horário no banco.'}
                </p>
              </div>
            </div>
            <div className="border-t border-slate-100 bg-white px-6 py-5 flex flex-col sm:flex-row gap-3 justify-between">
              <button
                type="button"
                disabled={viewBusy}
                onClick={() => {
                  setViewOpen(false)
                  setViewRow(null)
                }}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Fechar
              </button>

              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <Link
                  to={`/consultas/${viewRow.id}/escriba`}
                  className="rounded-2xl bg-brand-pink px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-[#e88d94] focus:ring-2 focus:ring-brand-pink focus:ring-offset-2 text-center"
                >
                  Abrir no Escriba
                </Link>

                <button
                  type="button"
                  disabled={viewBusy || viewRow.status === 'CONFIRMADA'}
                  onClick={() => void remarcarConsulta()}
                  className="rounded-2xl bg-brand-navy px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-[#2a4365] disabled:opacity-50 focus:ring-2 focus:ring-brand-navy focus:ring-offset-2"
                >
                  {viewBusy ? 'Salvando…' : 'Remarcar'}
                </button>
                <button
                  type="button"
                  disabled={viewBusy}
                  onClick={() => void cancelConsulta()}
                  className="rounded-2xl bg-rose-600 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-rose-500 disabled:opacity-50 focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
                >
                  {viewBusy ? 'Cancelando…' : 'Cancelar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  )
}
