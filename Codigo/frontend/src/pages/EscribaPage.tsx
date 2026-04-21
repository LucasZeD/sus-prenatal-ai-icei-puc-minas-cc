import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ConsultaStreamPanel } from '../components/ConsultaStreamPanel.js'
import { LiviaAssistantPanel } from '../components/LiviaAssistantPanel.js'
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
  const [tab, setTab] = useState<'transcricao' | 'prontuario'>('transcricao')
  const [mirrorStt, setMirrorStt] = useState('')
  const [mirrorIa, setMirrorIa] = useState('')
  const onStreamTexts = useCallback((stt: string, ia: string) => {
    setMirrorStt(stt)
    setMirrorIa(ia)
  }, [])

  const [row, setRow] = useState<ConsultaDetail | null>(null)
  
  // States clínicos parseados (mock local)
  const [queixa, setQueixa] = useState('')
  const [conduta, setConduta] = useState('')
  const [edema, setEdema] = useState(false)
  const [exantema, setExantema] = useState(false)
  const [movFetal, setMovFetal] = useState(true)
  const [apresentacao, setApresentacao] = useState('Cefálica')
  const [idadeG, setIdadeG] = useState('')
  const [peso, setPeso] = useState('')
  const [pa, setPa] = useState('')
  const [au, setAu] = useState('')
  const [bfc, setBfc] = useState('')

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
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-900 shadow-sm max-w-xl mx-auto m-8">
        <p className="font-bold">Identificador de consulta inválido.</p>
        <Link to="/dashboard" className="mt-4 inline-block rounded-lg bg-white px-5 py-2.5 font-bold border border-red-200 hover:bg-red-100 transition-colors">
          &larr; Voltar à agenda
        </Link>
      </div>
    )
  }

  const tabBtn = (k: 'transcricao' | 'prontuario', label: string) => (
    <button
      type="button"
      onClick={() => setTab(k)}
      className={`rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${
        tab === k ? 'bg-brand-pink text-white shadow-md border-none' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="flex relative items-start">
      {/* Container Principal */}
      <div className="flex-1 w-full lg:pr-[24rem]">
        <div className="max-w-5xl mx-auto space-y-8 px-6 py-8">
          {/* Cabeçalho */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex items-start gap-5">
               <div className="hidden sm:flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-pink/10 text-brand-pink text-2xl border border-brand-pink/20 shadow-sm">
                 🎙️
               </div>
               <div>
                 <div className="flex items-center gap-2">
                   <h1 className="text-2xl font-black text-brand-navy tracking-tight">Escriba Digital</h1>
                   <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600 tracking-wider uppercase border border-slate-200">Em Atendimento</span>
                 </div>
                 <p className="mt-1 font-mono text-xs text-slate-400 max-w-xs truncate">{id}</p>
                 {row && (
                    <div className="mt-2 flex items-center gap-2">
                       <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${row.status === 'CONFIRMADA' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-700 border border-slate-200'}`}>
                          <div className={`h-2 w-2 rounded-full ${row.status === 'CONFIRMADA' ? 'bg-emerald-500' : 'bg-slate-400'}`}></div>
                          {row.status.replace('_', ' ')}
                       </span>
                    </div>
                 )}
               </div>
            </div>
            <Link to="/dashboard" className="flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-brand-navy border border-slate-200 shadow-sm hover:bg-slate-50 hover:border-brand-pink transition-colors">
              &larr; Voltar
            </Link>
          </div>

          {msg ? <div className="rounded-2xl bg-emerald-50 p-5 text-emerald-800 border border-emerald-100 font-bold text-sm flex items-center justify-between shadow-sm">
               <span>{msg}</span>
               <button onClick={() => setMsg(null)} className="text-emerald-500 hover:text-emerald-700">✕</button>
          </div> : null}

          <div className="flex flex-wrap gap-3 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm w-fit">
            {tabBtn('transcricao', 'Transcrição ao Vivo')}
            {tabBtn('prontuario', 'Prontuário Estruturado (Revisão)')}
          </div>

          {tab === 'transcricao' ? (
            <ConsultaStreamPanel variant="streamOnly" initialConsultaId={id} onStreamTexts={onStreamTexts} />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Lado Esquerdo - STT e IA */}
              <div className="space-y-6">
                 <section className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col h-full">
                   <div className="border-b border-slate-100 bg-slate-50 px-6 py-5">
                     <h2 className="text-base font-black text-brand-navy flex items-center gap-2">
                        <span className="text-xl">📝</span> Notas Brutas da Sessão
                     </h2>
                     <p className="mt-1 text-xs text-slate-500 font-medium">Última captura parcial pelo Escriba.</p>
                   </div>
                   
                   <div className="p-6 flex-1 flex flex-col gap-6">
                     <div className="flex-1 flex flex-col">
                       <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">STT Bruto</h3>
                       <div className="flex-1 rounded-2xl bg-slate-50 border border-slate-100 p-5 overflow-y-auto min-h-[150px] shadow-inner">
                         <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">{mirrorStt || 'Nenhum áudio capturado na sessão atual.'}</p>
                       </div>
                     </div>
                     <div className="flex-1 flex flex-col">
                       <h3 className="text-xs font-bold uppercase tracking-widest text-brand-pink mb-3">Insight Clínico (IA)</h3>
                       <div className="flex-1 rounded-2xl bg-brand-pink/5 border border-brand-pink/20 p-5 overflow-y-auto min-h-[150px] shadow-inner">
                         <p className="text-sm text-brand-navy leading-relaxed whitespace-pre-wrap font-bold">{mirrorIa || 'Aguardando processamento de insights clínicos...'}</p>
                       </div>
                     </div>
                   </div>
                 </section>
              </div>

              {/* Lado Direito - Prontuário e Transições */}
              <div className="space-y-6">
                 <section className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="border-b border-slate-100 bg-slate-50 px-6 py-5">
                       <h2 className="text-base font-black text-brand-navy flex items-center gap-2">
                          <span className="text-xl">📋</span> Prontuário Clínico
                       </h2>
                    </div>
                    
                    <div className="p-6 space-y-6">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                         <div>
                           <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1" title="MOCK DATA">IG (Semanas) <span className="text-[9px] text-amber-500 bg-amber-50 px-1 rounded ml-1">[⚠️ MOCK]</span></label>
                           <input type="number" value={idadeG} onChange={e => setIdadeG(e.target.value)} placeholder="Ex: 24" className="block w-full rounded-xl border-slate-200 px-4 py-3 text-sm shadow-sm focus:border-brand-pink focus:ring-brand-pink bg-slate-50 font-medium text-slate-700" />
                         </div>
                         <div>
                           <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1" title="MOCK DATA">Peso (kg) <span className="text-[9px] text-amber-500 bg-amber-50 px-1 rounded ml-1">[⚠️ MOCK]</span></label>
                           <input type="number" value={peso} onChange={e => setPeso(e.target.value)} placeholder="Ex: 68.5" className="block w-full rounded-xl border-slate-200 px-4 py-3 text-sm shadow-sm focus:border-brand-pink focus:ring-brand-pink bg-slate-50 font-medium text-slate-700" />
                         </div>
                         <div>
                           <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1" title="MOCK DATA">PA (mmHg) <span className="text-[9px] text-amber-500 bg-amber-50 px-1 rounded ml-1">[⚠️ MOCK]</span></label>
                           <input type="text" value={pa} onChange={e => setPa(e.target.value)} placeholder="Ex: 120/80" className="block w-full rounded-xl border-slate-200 px-4 py-3 text-sm shadow-sm focus:border-brand-pink focus:ring-brand-pink bg-slate-50 font-medium text-slate-700" />
                         </div>
                         <div>
                           <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1" title="MOCK DATA">AU (cm) <span className="text-[9px] text-amber-500 bg-amber-50 px-1 rounded ml-1">[⚠️ MOCK]</span></label>
                           <input type="number" value={au} onChange={e => setAu(e.target.value)} placeholder="Ex: 24" className="block w-full rounded-xl border-slate-200 px-4 py-3 text-sm shadow-sm focus:border-brand-pink focus:ring-brand-pink bg-slate-50 font-medium text-slate-700" />
                         </div>
                      </div>

                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
                         <div>
                           <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1" title="MOCK DATA">BFC (bpm) <span className="text-[9px] text-amber-500 bg-amber-50 px-1 rounded ml-1">[⚠️ MOCK]</span></label>
                           <input type="number" value={bfc} onChange={e => setBfc(e.target.value)} placeholder="Ex: 140" className="block w-full rounded-xl border-slate-200 px-4 py-3 text-sm shadow-sm focus:border-brand-pink focus:ring-brand-pink bg-slate-50 font-medium text-slate-700" />
                         </div>
                         <div>
                           <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2" title="MOCK DATA">Edema <span className="text-[9px] text-amber-500 bg-amber-50 px-1 rounded ml-1">[⚠️ MOCK]</span></label>
                           <button type="button" onClick={() => setEdema(!edema)} className={`w-full py-2.5 rounded-xl border font-bold text-xs shadow-sm transition-all ${edema ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}>
                              {edema ? 'Presente' : 'Ausente'}
                           </button>
                         </div>
                         <div>
                           <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2" title="MOCK DATA">Mov. Fetal <span className="text-[9px] text-amber-500 bg-amber-50 px-1 rounded ml-1">[⚠️ MOCK]</span></label>
                           <button type="button" onClick={() => setMovFetal(!movFetal)} className={`w-full py-2.5 rounded-xl border font-bold text-xs shadow-sm transition-all ${movFetal ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                              {movFetal ? 'Preservado' : 'Reduzido'}
                           </button>
                         </div>
                         <div>
                           <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2" title="MOCK DATA">Exantema <span className="text-[9px] text-amber-500 bg-amber-50 px-1 rounded ml-1">[⚠️ MOCK]</span></label>
                           <button type="button" onClick={() => setExantema(!exantema)} className={`w-full py-2.5 rounded-xl border font-bold text-xs shadow-sm transition-all ${exantema ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}>
                              {exantema ? 'Presente' : 'Ausente'}
                           </button>
                         </div>
                      </div>
                      
                      <div className="pt-2">
                           <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1" title="MOCK DATA">Apresentação Fetal <span className="text-[9px] text-amber-500 bg-amber-50 px-1 rounded ml-1">[⚠️ MOCK]</span></label>
                           <input type="text" value={apresentacao} onChange={e => setApresentacao(e.target.value)} placeholder="Ex: Cefálica" className="block w-full rounded-xl border-slate-200 px-4 py-3 text-sm shadow-sm focus:border-brand-pink focus:ring-brand-pink bg-slate-50 font-medium text-slate-700" />
                      </div>

                      <div className="pt-4 border-t border-slate-100">
                        <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                           Queixa Livre
                        </label>
                        <textarea
                          value={queixa}
                          onChange={(e) => setQueixa(e.target.value)}
                          rows={4}
                          placeholder="Ex: Dor lombar..."
                          className="block w-full rounded-2xl border-slate-200 px-5 py-4 text-sm shadow-sm focus:border-brand-pink focus:ring-brand-pink resize-none mb-4 bg-slate-50 font-medium text-slate-700"
                        />
                        
                        <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                           Conduta Livre
                        </label>
                        <textarea
                          value={conduta}
                          onChange={(e) => setConduta(e.target.value)}
                          rows={4}
                          placeholder="Ex: Evite carregar peso..."
                          className="block w-full rounded-2xl border-slate-200 px-5 py-4 text-sm shadow-sm focus:border-brand-pink focus:ring-brand-pink resize-none bg-slate-50 font-medium text-slate-700"
                        />
                      </div>
                      
                      <div className="flex justify-end pt-2">
                        <button
                          type="button"
                          disabled={busy || row?.status === 'CONFIRMADA'}
                          onClick={() => void patch({ queixa })} // Real endpoint update mapped properly in next phase
                          className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-bold text-brand-navy shadow-sm hover:bg-slate-50 hover:text-brand-pink disabled:opacity-50 transition-colors"
                        >
                          Salvar Submissão Clínica
                        </button>
                      </div>
                    </div>
                 </section>

                 <section className="rounded-3xl border border-emerald-100 bg-emerald-50/50 shadow-sm overflow-hidden">
                    <div className="border-b border-emerald-100 bg-emerald-50 px-6 py-5">
                      <h3 className="text-base font-black text-emerald-900 flex items-center gap-2">
                        <span className="text-xl">✅</span> Conclusão da Consulta
                      </h3>
                    </div>
                    
                    <div className="p-6">
                      {row?.status !== 'AGUARDANDO_CONFIRMACAO' && row?.status !== 'CONFIRMADA' ? (
                        <div className="space-y-5">
                           <p className="text-sm font-medium text-slate-600">Avance o status da consulta para permitir a revisão médica.</p>
                           <div className="flex flex-wrap gap-3">
                              {row?.status === 'RASCUNHO' && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void patch({ status: 'EM_ANDAMENTO' })}
                                  className="rounded-xl bg-slate-800 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-slate-700 disabled:opacity-50 transition-colors"
                                >
                                  Registrar em Andamento
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void patch({ status: 'AGUARDANDO_CONFIRMACAO' })}
                                className="rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-amber-600 disabled:opacity-50 transition-colors"
                              >
                                Enviar p/ Confirmação
                              </button>
                           </div>
                        </div>
                      ) : null}

                      {row?.status === 'AGUARDANDO_CONFIRMACAO' ? (
                        <div className="flex flex-col gap-6">
                          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5 shadow-inner">
                             <label className="flex items-start gap-4 cursor-pointer">
                               <input type="checkbox" checked={vm} onChange={(e) => setVm(e.target.checked)} className="mt-1 h-5 w-5 rounded border-amber-300 text-emerald-600 focus:ring-emerald-600 cursor-pointer shadow-sm" />
                               <div className="flex flex-col text-sm">
                                 <span className="font-black text-amber-900">Validação Humana (Human-in-the-loop)</span>
                                 <span className="text-amber-700 mt-1 font-medium leading-relaxed">Confirmo que revisei os dados extraídos pela IA e atesto sua veracidade clínica.</span>
                               </div>
                             </label>
                          </div>
                          <button
                            type="button"
                            disabled={busy || !vm}
                            onClick={() => void patch({ validacao_medica: true, status: 'CONFIRMADA' })}
                            className="w-full rounded-2xl bg-emerald-600 px-6 py-4 text-sm font-black text-white shadow-[0_4px_14px_0_rgba(5,150,105,0.39)] hover:bg-emerald-500 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(5,150,105,0.23)] disabled:opacity-50 disabled:hover:translate-y-0 transition-all focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                          >
                            ✅ Confirmar e Assinar Consulta
                          </button>
                        </div>
                      ) : null}
                      
                      {row?.status === 'CONFIRMADA' && (
                         <div className="flex items-center gap-4 bg-white text-emerald-800 p-5 rounded-2xl border border-emerald-200 font-bold text-sm shadow-sm">
                            <span className="text-3xl">🎉</span>
                            <div className="flex flex-col">
                               <span className="text-base font-black">Consulta assinada e encerrada.</span>
                               <span className="text-emerald-600/80 font-medium text-xs mt-1">Nenhum dado adicional pode ser alterado por conformidade arquitetural.</span>
                            </div>
                         </div>
                      )}
                    </div>
                 </section>
              </div>
            </div>
          )}
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
