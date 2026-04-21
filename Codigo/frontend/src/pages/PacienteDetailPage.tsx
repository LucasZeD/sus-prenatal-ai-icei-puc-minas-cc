import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.js'
import { isUuid } from '../lib/uuid.js'
import { LiviaAssistantPanel } from '../components/LiviaAssistantPanel.js'

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
  ig_inicial?: number | null
}

type ConsultaRow = {
  id: string
  gestacao_id: string
  data: string
  status: string
  validacao_medica?: boolean
  idade_gestacional?: number
}

export function PacienteDetailPage() {
  const { id } = useParams()
  const { authFetch } = useAuth()
  const [paciente, setPaciente] = useState<PacienteRow | null>(null)
  const [gestacoes, setGestacoes] = useState<GestacaoRow[]>([])
  const [selG, setSelG] = useState('')
  const [consultas, setConsultas] = useState<ConsultaRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  
  // Controle de estado do "Ver Mais" (accordion) das consultas
  const [expandedConsultas, setExpandedConsultas] = useState<Set<string>>(new Set())

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
          idade_gestacional: typeof c.idade_gestacional === 'number' ? c.idade_gestacional : undefined,
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
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900 m-8">
        <p className="font-bold">Identificador de paciente inválido no painel principal.</p>
        <Link to="/pacientes" className="mt-3 inline-block font-bold py-2 px-4 bg-white rounded-xl shadow-sm border border-red-200">
          Voltar à lista
        </Link>
      </div>
    )
  }

  // Mock data as requested for Gestacao and Consulta
  const MOCK_DATA_DUM = "10/01/2026"
  const MOCK_DATA_DPP = "17/10/2026"
  const MOCK_DATA_IG_INICIAL = 8
  
  const selectedGestacao = gestacoes.find(g => g.id === selG)

  const toggleConsulta = (cid: string) => {
    setExpandedConsultas(prev => {
      const next = new Set(prev)
      if (next.has(cid)) next.delete(cid)
      else next.add(cid)
      return next
    })
  }

  // Ordena a timeline cronologicamente (crescente)
  const cronologico = useMemo(() => {
    return [...consultas].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
  }, [consultas])

  return (
    <div className="flex relative items-start">
      {/* Container Principal */}
      <div className="flex-1 w-full lg:pr-[24rem]">
        <div className="space-y-8 max-w-4xl mx-auto px-6 py-8">
          
          {/* Cabeçalho */}
          <div className="flex items-center gap-4">
            <Link to="/pacientes" className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm border border-slate-200 text-slate-500 hover:text-brand-pink hover:border-brand-pink transition-colors">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-brand-navy">{paciente?.nome_mascarado ?? 'Carregando...'}</h1>
              <p className="mt-1 text-sm font-medium text-slate-500">Prontuário Longitudinal Gestante • LGPD Compliant</p>
            </div>
          </div>

          {err ? <p className="text-sm rounded-xl p-4 bg-red-50 text-red-700 font-bold border border-red-100">{err}</p> : null}

          {/* Cartão de Identidade Maior (Unified Identity Card) */}
          <section className="rounded-3xl border border-brand-pink/20 bg-white p-8 shadow-sm flex flex-col md:flex-row gap-8 items-start md:items-center justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-brand-pink rounded-full blur-[80px] opacity-15"></div>
            <div className="flex items-center gap-6 relative z-10 w-full md:w-auto">
               <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-brand-pink text-white text-3xl font-black border border-white shadow-sm">
                 {paciente?.nome_mascarado?.charAt(0) ?? 'P'}
               </div>
               <div className="space-y-1 w-full">
                 <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                   <h2 className="text-2xl font-black text-brand-navy">{paciente?.nome_mascarado ?? '—'}</h2>
                   {paciente?.nome_social && <span className="inline-flex items-center rounded-lg bg-slate-100 border border-slate-200 px-3 py-1 text-[11px] font-bold text-slate-600">Social: {paciente.nome_social}</span>}
                 </div>
                 
                 <div className="flex flex-col sm:flex-row gap-3 sm:gap-8 mt-4">
                   <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">CPF (últimos 4)</span>
                      <span className="text-sm font-black text-slate-700 tracking-wider mt-0.5">{paciente?.cpf_ultimos4 ?? '—'}</span>
                   </div>
                   <div className="hidden sm:block w-px h-8 bg-slate-200 my-auto"></div>
                   <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Cartão SUS (últimos 4)</span>
                      <span className="text-sm font-black text-slate-700 tracking-wider mt-0.5">{paciente?.cartao_sus_ultimos4 ?? '—'}</span>
                   </div>
                 </div>
               </div>
            </div>
          </section>

          {/* Dados Gestacionais e Resumo Clínico */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
             {/* Seletor de Perfil Ativo */}
             <div className="md:col-span-1 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
               <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Gestação Ativa</h2>
               {gestacoes.length === 0 ? (
                 <p className="text-sm text-slate-500 font-medium">Nenhuma gestação vinculada.</p>
               ) : (
                 <div className="space-y-4">
                   <select
                     value={selG}
                     onChange={(e) => setSelG(e.target.value)}
                     className="block w-full rounded-xl border-slate-200 bg-slate-50 py-3 pl-4 pr-10 text-slate-900 focus:ring-2 focus:ring-brand-pink focus:border-brand-pink font-bold text-sm shadow-sm transition-colors"
                   >
                     {gestacoes.map((g) => (
                       <option key={g.id} value={g.id}>
                         {g.id.slice(0, 8)}… — Risco {g.tipo_risco ?? 'NORMAL'}
                       </option>
                     ))}
                   </select>

                   <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex flex-col gap-1 items-center justify-center">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Risco Estratificado</span>
                      <span className={`mt-1 inline-flex items-center rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-widest ${
                         !selectedGestacao?.tipo_risco || selectedGestacao.tipo_risco === 'NORMAL' ? 'bg-emerald-100 text-emerald-800' :
                     selectedGestacao.tipo_risco === 'ALTO' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {selectedGestacao?.tipo_risco?.replace('_', ' ') ?? 'NORMAL'}
                      </span>
                   </div>
                 </div>
               )}
             </div>

             {/* Quadro Resumo Baseado no DER.md */}
             <div className="md:col-span-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-center">
               <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-5">Ciclo de Gestação Atual (DER)</h2>
               <dl className="grid grid-cols-3 gap-6">
                 <div className="flex flex-col gap-1" title="Aviso de MOCK DATA">
                   <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">DUM <span className="bg-amber-100 text-amber-800 px-1 py-0.5 rounded-[4px] ml-1">[⚠️ MOCK]</span></dt>
                   <dd className="text-xl font-black text-brand-navy mt-1">{selectedGestacao?.dum ?? MOCK_DATA_DUM}</dd>
                 </div>
                 <div className="flex flex-col gap-1 border-l border-slate-100 pl-6" title="Aviso de MOCK DATA">
                   <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">DPP <span className="bg-amber-100 text-amber-800 px-1 py-0.5 rounded-[4px] ml-1">[⚠️ MOCK]</span></dt>
                   <dd className="text-xl font-black text-brand-navy mt-1">{selectedGestacao?.dpp ?? MOCK_DATA_DPP}</dd>
                 </div>
                 <div className="flex flex-col gap-1 border-l border-slate-100 pl-6" title="Aviso de MOCK DATA">
                   <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">IG Inicial <span className="bg-amber-100 text-amber-800 px-1 py-0.5 rounded-[4px] ml-1">[⚠️ MOCK]</span></dt>
                   <dd className="text-xl font-black text-brand-navy mt-1">{selectedGestacao?.ig_inicial ?? MOCK_DATA_IG_INICIAL} sem</dd>
                 </div>
               </dl>
             </div>
          </section>

          {/* Timeline Expandida de Consultas */}
          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden mt-8">
            <div className="border-b border-brand-pink/10 bg-brand-pink/5 px-8 py-6">
               <h2 className="text-xl font-black text-brand-navy">Timeline de consultas</h2>
               <p className="text-sm font-medium text-slate-500 mt-1">Acompanhamento longitudinal dos eventos clínicos.</p>
            </div>
            
            <div className="p-8 space-y-6">
              {!selG ? <div className="text-center font-medium text-slate-500 py-10">Selecione uma gestação acima.</div> : null}
              {selG && cronologico.length === 0 ? (
                 <div className="text-center py-12">
                    <div className="mx-auto w-16 h-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center mb-5 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] text-2xl">🩺</div>
                    <p className="text-slate-600 font-bold text-lg">Nenhuma consulta iniciada para esta gestação.</p>
                 </div>
              ) : null}
              
              <div className="relative pl-6 border-l-[3px] border-brand-pink/20 space-y-8">
                {cronologico.map((c, idx) => {
                  const MOCK_PESO = "68.5"
                  const MOCK_PA = "120/80"
                  const MOCK_AU = "24"
                  const MOCK_BFC = "140"
                  const MOCK_EDEMA = false
                  const MOCK_APRESENTACAO = "Cefálica"
                  const MOCK_MOVIMENTACAO_FETAL = true
                  const MOCK_ENXATEMA = false
                  const MOCK_QUEIXA = "Dor lombar"
                  const MOCK_CONDUTA = "Evite carregar peso e diminua o serviço doméstico"
                  
                  const isLast = idx === cronologico.length - 1
                  const isFinalized = c.status === 'FINALIZADA' || c.status === 'CONFIRMADA'
                  const isExpanded = expandedConsultas.has(c.id)

                  return (
                    <div key={c.id} className="relative">
                      {/* O Bullet Point da Timeline */}
                      <div className="absolute -left-[35px] top-4 h-5 w-5 rounded-full bg-brand-pink/30 border-4 border-white shadow-sm flex items-center justify-center ring-1 ring-brand-pink/50">
                         {isLast && !isFinalized && <div className="h-2 w-2 rounded-full bg-brand-pink"></div>}
                         {isFinalized && <div className="h-2 w-2 rounded-full bg-emerald-500"></div>}
                      </div>
                      
                      <div className={`rounded-3xl border shadow-sm transition-all overflow-hidden ${isLast && !isFinalized ? 'border-brand-pink ring-4 ring-brand-pink/10' : 'border-slate-200'} ${isExpanded ? 'bg-slate-50/50' : 'bg-white'}`}>
                         <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 gap-4 bg-white">
                            <div>
                               <h3 className="text-lg font-black text-brand-navy flex items-center gap-3">
                                 Consulta {idx + 1}
                                 <span className="rounded-xl bg-white border border-slate-200 px-3 py-1 text-[10px] font-bold text-slate-600 tracking-widest uppercase shadow-sm">{c.status.replace('_', ' ')}</span>
                               </h3>
                               <p className="text-sm text-slate-500 mt-1.5 font-bold">{c.data}</p>
                               <p className="text-sm text-slate-500 mt-1.5 font-bold">Semana: {c.idade_gestacional}</p>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                              <button
                                onClick={() => toggleConsulta(c.id)}
                                className={`text-center rounded-xl border px-5 py-2.5 text-sm font-bold shadow-sm transition-all focus:ring-2 focus:ring-brand-pink focus:ring-offset-2 flex-1 sm:flex-none ${isExpanded ? 'bg-slate-100 border-slate-200 text-slate-600' : 'bg-white border-slate-300 text-brand-navy hover:bg-slate-50'}`}
                              >
                                {isExpanded ? 'Ocultar Detalhes' : 'Ver Mais'}
                              </button>
                              
                              {!isFinalized && (
                                <Link
                                  to={`/consultas/${c.id}/escriba`}
                                  className="text-center rounded-xl bg-brand-pink px-5 py-2.5 text-sm font-bold text-white shadow-md hover:bg-[#e88d94] transition-all focus:ring-2 focus:ring-brand-pink focus:ring-offset-2 flex-1 sm:flex-none"
                                >
                                  Iniciar Escriba
                                </Link>
                              )}
                            </div>
                         </div>
                         
                         {/* Seção Acordeão de Dados (Ver Mais) */}
                         {isExpanded && (
                           <div className="bg-slate-50/70 p-6 border-t border-slate-100 animate-in fade-in slide-in-from-top-2">
                              {/* Indicadores Numéricos */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                  <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col items-center relative">
                                      <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Peso</span>
                                      <span className="text-xl font-black text-brand-navy mt-1">{MOCK_PESO}<span className="text-[10px] font-bold text-slate-400 ml-1">kg</span></span>
                                      <div className="absolute top-2 right-2 text-[8px] font-black text-amber-500" title="Mock Data">[⚠️ MOCK]</div>
                                  </div>
                                  <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col items-center relative">
                                      <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">PA</span>
                                      <span className="text-xl font-black text-brand-navy mt-1">{MOCK_PA}<span className="text-[10px] font-bold text-slate-400 ml-1">mmHg</span></span>
                                      <div className="absolute top-2 right-2 text-[8px] font-black text-amber-500" title="Mock Data">[⚠️ MOCK]</div>
                                  </div>
                                  <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col items-center relative">
                                      <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">AU</span>
                                      <span className="text-xl font-black text-brand-navy mt-1">{MOCK_AU}<span className="text-[10px] font-bold text-slate-400 ml-1">cm</span></span>
                                      <div className="absolute top-2 right-2 text-[8px] font-black text-amber-500" title="Mock Data">[⚠️ MOCK]</div>
                                  </div>
                                  <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col items-center relative">
                                      <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">BFC</span>
                                      <span className="text-xl font-black text-brand-navy mt-1">{MOCK_BFC}<span className="text-[10px] font-bold text-slate-400 ml-1">bpm</span></span>
                                      <div className="absolute top-2 right-2 text-[8px] font-black text-amber-500" title="Mock Data">[⚠️ MOCK]</div>
                                  </div>
                              </div>

                              {/* Condicionais (Tags) */}
                              <div className="flex flex-wrap gap-3 mb-6 relative">
                                  <div className="absolute -top-3 left-1 text-[8px] font-black text-amber-500" title="Mock Data">[⚠️ MOCK]</div>
                                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 shadow-sm">
                                     Apresentação: <span className="text-brand-navy font-black">{MOCK_APRESENTACAO}</span>
                                  </span>
                                  {MOCK_EDEMA ? (
                                     <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 px-3 py-1.5 text-[11px] font-bold text-rose-700 shadow-sm">⚠️ Edema Presente</span>
                                  ) : (
                                     <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-500 shadow-sm">Sem Edema</span>
                                  )}
                                  {MOCK_MOVIMENTACAO_FETAL ? (
                                     <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-[11px] font-bold text-emerald-700 shadow-sm">👣 Mov. Fetal Preservada</span>
                                  ) : (
                                     <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 px-3 py-1.5 text-[11px] font-bold text-rose-700 shadow-sm">⚠️ Redução de Mov. Fetal</span>
                                  )}
                                  {MOCK_ENXATEMA && (
                                     <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 px-3 py-1.5 text-[11px] font-bold text-rose-700 shadow-sm">⚠️ Exantema Presente</span>
                                  )}
                              </div>

                              {/* Observações Livres */}
                              <div className="grid md:grid-cols-2 gap-4 relative">
                                  <div className="absolute -top-3 left-1 text-[8px] font-black text-amber-500" title="Mock Data">[⚠️ MOCK]</div>
                                  <div className="bg-white mt-1 rounded-2xl p-5 border border-slate-200 shadow-sm">
                                     <span className="text-[10px] uppercase font-bold tracking-widest text-brand-pink block mb-2">Queixa Principal / Evolução</span>
                                     <p className="text-sm font-medium text-slate-700 leading-relaxed">{MOCK_QUEIXA}</p>
                                  </div>
                                  <div className="bg-white mt-1 rounded-2xl p-5 border border-slate-200 shadow-sm">
                                     <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-600 block mb-2">Conduta Médica Adotada</span>
                                     <p className="text-sm font-medium text-slate-700 leading-relaxed">{MOCK_CONDUTA}</p>
                                  </div>
                              </div>

                              {/* Rodapé do card (Validação Medica) */}
                              <div className="mt-6 flex flex-wrap justify-between items-center gap-4 px-2 pt-4 border-t border-slate-200">
                                 <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wide">
                                   Dados estruturados via RAG (Mapeamento DER)
                                 </p>
                                 <p className="text-sm font-bold flex items-center gap-2">
                                   <span className="text-slate-500">Validação médica:</span>
                                   {c.validacao_medica ? (
                                     <span className="text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg">Concluída</span> 
                                   ) : (
                                     <span className="text-amber-700 bg-amber-100 px-2.5 py-1 rounded-lg">Pendente</span>
                                   )}
                                 </p>
                              </div>
                           </div>
                         )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Painel Lívia Side-by-side fixo de tela cheia (desktop) */}
      <aside className="fixed top-16 right-0 w-[24rem] h-[calc(100vh-4rem)] border-l border-brand-pink/30 bg-white hidden lg:flex flex-col z-30 shadow-[-4px_0_15px_rgba(251,160,167,0.05)]">
         <LiviaAssistantPanel />
      </aside>

      {/* Mobile-first: assistente Lívia expansível (mobile apenas) */}
      <div className="lg:hidden fixed bottom-4 right-4 z-40">
        <details className="rounded-2xl border border-brand-pink/50 bg-white shadow-[0_4px_25px_rgba(251,160,167,0.3)] w-[calc(100vw-2rem)] max-w-sm ml-auto origin-bottom-right group transition-all">
          <summary className="cursor-pointer list-none rounded-2xl px-5 py-4 text-sm font-bold text-brand-navy marker:content-none [&::-webkit-details-marker]:hidden bg-brand-pink/5 hover:bg-brand-pink/10 transition-colors">
            <span className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-3">
                 <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-pink text-white text-sm shadow-sm ring-2 ring-white">✨</span>
                 Conversar com LívIA
              </span>
              <span className="text-xs font-bold text-brand-pink/70 group-open:hidden">ABRIR</span>
              <span className="text-xs font-bold text-brand-pink/70 hidden group-open:block">FECHAR</span>
            </span>
          </summary>
          <div className="border-t border-brand-pink/20 bg-white rounded-b-2xl h-[60vh] overflow-hidden flex flex-col">
            <LiviaAssistantPanel />
          </div>
        </details>
      </div>

    </div>
  )
}
