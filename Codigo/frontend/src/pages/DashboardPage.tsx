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
  x.setDate(d.getDate() + n)
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
            onClick={() => void loadWorklist()}
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
              {worklist.map((w) => {
                const isFinalized = w.status === 'FINALIZADA' || w.status === 'CONFIRMADA';
                return (
                <tr key={w.id} className={`transition-colors group ${isFinalized ? 'bg-slate-50 opacity-75' : 'hover:bg-brand-pink/5'}`}>
                  <td className="px-8 py-4 whitespace-nowrap text-brand-navy font-bold text-sm">{w.data}</td>
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
                        w.tipo_risco_gestacao === 'NORMAL' ? 'bg-emerald-100 text-emerald-800' :
                        w.tipo_risco_gestacao === 'ALTO' ? 'bg-rose-200 text-rose-900' : 'bg-brand-pink text-white'
                     }`}>
                        {w.tipo_risco_gestacao.replace('_', ' ')}
                     </span>
                  </td>
                  <td className="px-8 py-4 text-center">
                     <span className="inline-flex items-center rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-[10px] font-bold text-slate-600 shadow-sm uppercase tracking-wider">
                       {w.status.replace('_', ' ')}
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
                  <button className="text-slate-400 hover:text-brand-pink transition-colors font-bold px-1">&lt;</button>
                  <span className="text-xs font-bold text-slate-600 tracking-wide">Semana Atual</span>
                  <button className="text-slate-400 hover:text-brand-pink transition-colors font-bold px-1">&gt;</button>
               </div>
             </div>
             <p className="text-sm text-slate-500 mt-1 font-medium">Visualize horários disponíveis e marque consultas futuras.</p>
           </div>
           <button
             type="button"
             className="hidden sm:flex rounded-xl bg-brand-navy px-5 py-2.5 text-sm font-bold text-white shadow-md hover:bg-[#2a4365] transition-colors focus:ring-2 focus:ring-brand-navy items-center gap-2"
           >
             <span className="text-lg leading-none">+</span> Nova Consulta
           </button>
        </div>

        <div className="overflow-x-auto">
           {/* Cabeçalho dos Dias da Semana */}
           <div className="grid grid-cols-[100px_repeat(7,minmax(140px,1fr))] border-b border-slate-200 bg-white">
              <div className="p-4 flex items-end justify-center border-r border-slate-100">
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">GMT-3</span>
              </div>
              {weekDays.map((d) => {
                const isToday = new Date().toDateString() === d.toDateString()
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

           {/* Corpo do Calendário (Mocks de Horários) */}
           <div className="grid grid-cols-[100px_repeat(7,minmax(140px,1fr))] bg-slate-50/50">
              {['00:00','01:00','02:00','03:00','04:00','05:00','06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'].map(hour => (
                 <div key={hour} className="contents group">
                    <div className="px-3 py-1 flex items-start justify-center border-r border-b border-slate-100 bg-white">
                       <span className="text-[10px] font-bold text-slate-400 mt-1">{hour}</span>
                    </div>
                    {/* 7 células para os dias da semana */}
                    {weekDays.map((d, colIndex) => {
                       const isToday = new Date().toDateString() === d.toDateString()
                       // Adicionar mock block aleatório apenas para compor o visual "Teams"
                       const hasEvent = (colIndex === 1 && hour === '09:00') || (colIndex === 3 && hour === '11:00') || (colIndex === 4 && hour === '14:00')
                       
                       const hourNum = parseInt(hour.split(':')[0], 10)
                       const isNightShift = hourNum >= 19 || hourNum <= 6
                       
                       return (
                          <div key={d.toISOString() + hour} className={`min-h-[1px] p-1 border-r border-b border-slate-100 transition-colors hover:bg-slate-100 cursor-pointer flex flex-col ${isToday ? 'bg-brand-pink/5' : (isNightShift ? 'bg-slate-50' : 'bg-white')}`}>
                             {hasEvent ? (
                                <div className="bg-brand-pink text-white text-[10px] font-bold p-2 my-0.5 rounded-lg shadow-sm border border-brand-pink/50 flex-1">
                                   <p className="truncate">Mariana S. (Retorno)</p>
                                   <p className="opacity-80 mt-0.5 font-medium">UBS Central</p>
                                </div>
                             ) : (
                                <div className="w-full h-full min-h-[32px] rounded-lg border-2 border-transparent hover:border-slate-300 border-dashed flex items-center justify-center opacity-0 hover:opacity-100 transition-all">
                                   <span className="text-2xl text-slate-300 pb-1">+</span>
                                </div>
                             )}
                          </div>
                       )
                    })}
                 </div>
              ))}
           </div>
        </div>
        <div className="p-4 bg-slate-50 border-t border-slate-200 text-center sm:hidden">
           <button type="button" className="w-full rounded-xl bg-brand-navy px-5 py-3 text-sm font-bold text-white shadow-sm">
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

    </div>
  )
}
