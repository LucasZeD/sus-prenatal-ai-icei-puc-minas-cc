import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.js'

type PacienteRow = {
  id: string
  nome_mascarado: string
  cpf_ultimos4?: string | null
  cartao_sus_ultimos4?: string | null
  apelido?: string | null
}

type GestacaoRow = {
  id: string
  paciente_id: string
  tipo_risco?: string
  ig_inicial?: number | null
  idade_gestac_confirmada?: number | null
}

function riscoBadgeClass(r: string | undefined): string {
  const v = r ?? 'NORMAL'
  if (v === 'MUITO_ALTO') return 'bg-rose-200 text-rose-900 border-rose-300'
  if (v === 'ALTO') return 'bg-amber-100 text-amber-800 border-amber-300'
  return 'bg-emerald-100 text-emerald-800 border-emerald-300'
}

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
    <div className="space-y-8 max-w-5xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-brand-navy">Gestantes</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Selecione uma paciente para iniciar ou revisar consultas.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-brand-pink/30 bg-white px-5 py-2.5 text-sm font-bold text-brand-navy shadow-sm hover:bg-brand-pink/10 focus:outline-none focus:ring-2 focus:ring-brand-pink transition-colors"
        >
          Atualizar Lista
        </button>
      </div>

      {/* Controladores de Filtro */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
         <div className="flex flex-wrap items-center gap-3">
           <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">Filtrar por Risco:</span>
           {(['todos', 'NORMAL', 'ALTO', 'MUITO_ALTO'] as const).map((k) => (
             <button
               key={k}
               type="button"
               onClick={() => setRisco(k)}
               className={`rounded-xl px-4 py-2 text-[13px] font-bold transition-all ${
                 risco === k ? 'bg-brand-pink text-white shadow-md' : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
               }`}
             >
               {k === 'todos' ? 'Todos' : k.replace('_', ' ')}
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
            const gest = gestacoesPorPaciente[p.id] ?? []
            const primaryRisco = gest[0]?.tipo_risco ?? 'NORMAL'
            const igSemanas = gest[0]?.idade_gestac_confirmada ?? gest[0]?.ig_inicial

            // Mock Data Tags explícitos conforme plano de implementação
            const MOCK_DATA_AGE = "28 anos"
            const MOCK_DATA_LAST_VISIT = "12/04/2026"
            const MOCK_DATA_NEXT_VISIT = "26/04/2026"
            const MOCK_TELEFONE = "(31) 99999-9999"
            const MOCK_LOCALIZACAO = "Belo Horizonte, MG"

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
                    <h2 className="text-xl font-black text-brand-navy mb-1">{p.nome_mascarado} {p.apelido}</h2>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold text-slate-500">
                      <span className="flex items-center gap-1.5" title="Aviso MOCK DATA"><span className="text-slate-400">Idade <span className="text-[9px] text-amber-500 bg-amber-50 px-1 rounded">[⚠️ MOCK]</span>:</span> <span className="text-slate-700">{MOCK_DATA_AGE}</span></span>
                      
                      <span className="text-slate-300">•</span>
                      <span className="flex items-center gap-1.5"><span className="text-slate-400">IG Atual:</span> <span className="text-brand-pink font-black">{igSemanas != null ? `${igSemanas} sem` : 'ND'}</span></span>
                      
                      <span className="text-slate-300">•</span>
                      <span className="flex items-center gap-1.5" title="Aviso MOCK DATA"><span className="text-slate-400">Última Visita <span className="text-[9px] text-amber-500 bg-amber-50 px-1 rounded">[⚠️ MOCK]</span>:</span> <span className="text-slate-700">{MOCK_DATA_LAST_VISIT}</span></span>                    
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold text-slate-500">
                       <span className="flex items-center gap-1.5" title="Aviso MOCK DATA"><span className="text-slate-400">Telefone <span className="text-[9px] text-amber-500 bg-amber-50 px-1 rounded">[⚠️ MOCK]</span>:</span> <span className="text-slate-700">{MOCK_TELEFONE}</span></span>
                       <span className="flex items-center gap-1.5" title="Aviso MOCK DATA"><span className="text-slate-400">Localização <span className="text-[9px] text-amber-500 bg-amber-50 px-1 rounded">[⚠️ MOCK]</span>:</span> <span className="text-slate-700">{MOCK_LOCALIZACAO}</span></span>
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
                    Risco {primaryRisco.replace('_', ' ')}
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
