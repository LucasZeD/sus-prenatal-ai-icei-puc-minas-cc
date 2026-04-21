import { useEffect, useMemo, useState } from 'react'
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

export function DevSandboxPage() {
  const { authFetch } = useAuth()
  const apiBase = useMemo(() => getApiBaseUrl(), [])
  const [health, setHealth] = useState<HealthPayload | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)

  // MCP State
  const [mcpInput, setMcpInput] = useState('A paciente Maria de Souza, CPF 123.456.789-00 relatou...')
  const [mcpOutput, setMcpOutput] = useState('')
  const [mcpBusy, setMcpBusy] = useState(false)

  // LLM State
  const [llmInput, setLlmInput] = useState('Extrair informações clínicas: A paciente está com 38 semanas, PA 12/8 e BCF 150')
  const [llmOutput, setLlmOutput] = useState('')
  const [llmBusy, setLlmBusy] = useState(false)

  useEffect(() => {
    const c = new AbortController()
    void (async () => {
      try {
        setHealthLoading(true)
        const res = await fetch(`${apiBase}/health`, { signal: c.signal, headers: { Accept: 'application/json' } })
        const json = (await res.json()) as HealthPayload
        if (json && typeof json.status === 'string') {
          setHealth(json)
        }
      } catch {
        setHealth(null)
      } finally {
        setHealthLoading(false)
      }
    })()
    return () => c.abort()
  }, [apiBase])

  const handleTestMcp = async () => {
    setMcpBusy(true)
    setMcpOutput('Processando com Privacy Gateway (Placeholder para /api/v1/mcp)...')
    setTimeout(() => {
       setMcpOutput('A paciente [NOME MASCARADO], CPF [CPF MASCARADO] relatou...')
       setMcpBusy(false)
    }, 1000)
  }

  const handleTestLlm = async () => {
    setLlmBusy(true)
    setLlmOutput('Iniciando inferência com Ollama (Cold start pode demorar)...')
    setTimeout(() => {
       setLlmOutput('{\n  "idade_gestacional": 38,\n  "pa": "120/80",\n  "bcf": 150\n}')
       setLlmBusy(false)
    }, 2000)
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
             <span className="text-4xl">🛠️</span> Dev Sandbox
          </h1>
          <p className="mt-2 text-sm text-slate-500 font-medium">Ambiente isolado para testes rápidos dos microserviços e componentes de infraestrutura.</p>
        </div>
        <Link to="/dashboard" className="px-4 py-2 font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-all">
          ← Sair para o App
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Painel 1: Status de Infraestrutura */}
        <div className="lg:col-span-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-6">
           <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Painel de Status de Infra</h2>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                   <span className={`h-3 w-3 rounded-full ${health?.db ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}`}></span>
                   <span className="text-sm font-semibold text-slate-700">PostgreSQL {health?.db ? '(Online)' : '(Offline)'}</span>
                </div>
                <div className="w-px h-5 bg-slate-200 hidden sm:block"></div>
                <div className="flex items-center gap-2">
                   <span className={`h-3 w-3 rounded-full ${health?.mcpConfigured ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-300'}`}></span>
                   <span className="text-sm font-semibold text-slate-700">MCP Gateway {health?.mcpConfigured ? '(Ativo)' : '(Mock/Noop)'}</span>
                </div>
                <div className="w-px h-5 bg-slate-200 hidden sm:block"></div>
                <div className="flex items-center gap-2">
                   <span className="h-3 w-3 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]"></span>
                   <span className="text-sm font-semibold text-slate-700">Ollama / RAG (Standby)</span>
                </div>
                <div className="w-px h-5 bg-slate-200 hidden sm:block"></div>
                <div className="flex items-center gap-2">
                   <span className="h-3 w-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                   <span className="text-sm font-semibold text-slate-700">Faster-Whisper (WS)</span>
                </div>
              </div>
           </div>
           
           <div className={`px-4 py-3 rounded-xl border ${health?.status === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
              <span className="text-xs font-bold uppercase tracking-wider block mb-1">Status Global</span>
              {healthLoading ? 'Verificando...' : (health?.status ? `SISTEMA ${health.status.toUpperCase()}` : 'FALHA DE REDE')}
           </div>
        </div>

        {/* Painel 2: Escriba & Worklist (ConsultaStreamPanel original) */}
        <div className="lg:col-span-4 mt-4">
           {/* Re-usando o container complexo original que já faz cadastro e WS. Passamos variant=embedded e ele fará sua própria box. 
               Ele já tem seu próprio look and feel refatorado na task anterior se foi alterado, 
               mas aqui ele atua inteiramente isolado. */}
           <ConsultaStreamPanel variant="embedded" />
        </div>

        {/* Painel 3: Teste MCP API */}
        <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col">
           <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-2">
              <span className="text-xl">🛡️</span> Painel do MCP (Privacy Gateway)
           </h2>
           <p className="text-xs text-slate-500 mb-6 font-medium">Testar sanitização de PII antes de enviar ao LLM via pipeline.</p>
           
           <div className="flex flex-col gap-4 flex-1">
             <div>
               <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Texto Sujo (Input)</label>
               <textarea 
                 value={mcpInput}
                 onChange={e => setMcpInput(e.target.value)}
                 className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-emerald-500 focus:ring-emerald-500 transition-colors shadow-sm bg-slate-50"
                 rows={3}
               />
             </div>
             <button
               onClick={handleTestMcp}
               disabled={mcpBusy}
               className="w-full sm:w-auto self-end rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-slate-700 disabled:opacity-50 transition-all"
             >
               Sanitizar Texto
             </button>
             <div className="flex-1 mt-2">
               <label className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Texto Sanitizado (Output Seguro)</label>
               <div className="mt-1.5 h-24 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-sm font-mono text-emerald-900 overflow-y-auto">
                 {mcpOutput}
               </div>
             </div>
           </div>
        </div>

        {/* Painel 4: Teste Ollama / Inferência */}
        <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col">
           <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-2">
              <span className="text-xl">🧠</span> Painel LLM (Inferência Direta)
           </h2>
           <p className="text-xs text-slate-500 mb-6 font-medium">Testar modelos locais (Ollama) para RAG e extração JSON.</p>
           
           <div className="flex flex-col gap-4 flex-1">
             <div>
               <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Prompt Mestre / Contexto</label>
               <textarea 
                 value={llmInput}
                 onChange={e => setLlmInput(e.target.value)}
                 className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-rose-500 focus:ring-rose-500 transition-colors shadow-sm bg-slate-50"
                 rows={3}
               />
             </div>
             <button
               onClick={handleTestLlm}
               disabled={llmBusy}
               className="w-full sm:w-auto self-end rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:from-rose-600 hover:to-rose-700 disabled:opacity-50 transition-all"
             >
               Executar LLM 
             </button>
             <div className="flex-1 mt-2">
               <label className="text-[11px] font-bold uppercase tracking-wider text-rose-500">JSON de Retorno</label>
               <pre className="mt-1.5 h-24 rounded-xl border border-rose-200 bg-rose-50/50 p-3 text-xs font-mono text-rose-900 overflow-y-auto">
                 {llmOutput}
               </pre>
             </div>
           </div>
        </div>

      </div>
    </div>
  )
}
