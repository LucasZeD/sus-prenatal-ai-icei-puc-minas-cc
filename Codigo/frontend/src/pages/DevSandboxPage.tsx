import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { AssistantMarkdown } from '../components/AssistantMarkdown.js'
import { DevSttLabPanel } from '../components/dev/DevSttLabPanel.js'
import { useAuth } from '../context/AuthContext.js'
import { getApiBaseUrl } from '../lib/apiBase.js'
import { readNdjsonStream } from '../lib/readNdjsonStream.js'
import { isUuid } from '../lib/uuid.js'

type HealthPayload = {
  status: 'ok' | 'degraded' | 'fail'
  db: boolean
  mcpConfigured: boolean
  privacyGateway: 'noop' | 'remote'
  ollamaConfigured: boolean
  ollamaReachable?: boolean
  clinicalAiConfigured?: boolean
  clinicalAiReachable?: boolean
  clinicalAiGeminiConfigured?: boolean
  whisperConfigured?: boolean
  whisperReachable?: boolean
  timestamp: string
}

function statusDot(ok: boolean, partial: boolean) {
  if (ok) return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
  if (partial) return 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.4)]'
  return 'bg-slate-300'
}

export function DevSandboxPage() {
  const apiBase = useMemo(() => getApiBaseUrl(), [])
  const [health, setHealth] = useState<HealthPayload | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)

  const { token, login, loginState, logout, authFetch } = useAuth()

  // Manual Auth (Dev Sandbox)
  const [loginEmail, setLoginEmail] = useState('admin@local')
  const [loginPassword, setLoginPassword] = useState('admin')

  // Dev API tests
  const [mcpInput, setMcpInput] = useState('A paciente Maria de Souza, CPF 123.456.789-00 relatou...')
  const [mcpOutput, setMcpOutput] = useState('')
  const [mcpBusy, setMcpBusy] = useState(false)

  const [llmInput, setLlmInput] = useState('Extrair informações clínicas: A paciente está com 38 semanas, PA 12/8 e BCF 150')
  const [llmOutput, setLlmOutput] = useState('')
  const [llmBusy, setLlmBusy] = useState(false)

  /** DevTools: mesmo fluxo da Lívia (NDJSON) — etapas MCP/RAG/thinking/resposta */
  const [pqQuestion, setPqQuestion] = useState('Critérios de encaminhamento obstétrico')
  const [pqThink, setPqThink] = useState(false)
  const [pqBusy, setPqBusy] = useState(false)
  const [pqPhase, setPqPhase] = useState('')
  const [pqSteps, setPqSteps] = useState<string[]>([])
  const [pqSanitized, setPqSanitized] = useState('')
  const [pqRagLines, setPqRagLines] = useState<string[]>([])
  const [pqThinking, setPqThinking] = useState('')
  const [pqAnswer, setPqAnswer] = useState('')
  const [pqRawNdjson, setPqRawNdjson] = useState<string[]>([])
  const [pqUseClinicalContext, setPqUseClinicalContext] = useState(false)
  const [pqPacienteId, setPqPacienteId] = useState('')
  const [pqGestacaoId, setPqGestacaoId] = useState('')
  const [pqConsultaId, setPqConsultaId] = useState('')
  /** RAG retrieve: inherit env / force LLM expansion on / off */
  const [devRagExpandMode, setDevRagExpandMode] = useState<'inherit' | 'on' | 'off'>('inherit')
  const [pqRagRetrievalInfo, setPqRagRetrievalInfo] = useState('')

  /** Teste isolado POST /dev/rag/test/query (sem Ollama chat, só embeddings + trechos) */
  const [ragProbeQuery, setRagProbeQuery] = useState('Critérios de hipertensão e pré-eclâmpsia no pré-natal')
  const [ragProbeTopK, setRagProbeTopK] = useState(8)
  const [ragProbeBusy, setRagProbeBusy] = useState(false)
  const [ragProbeOutput, setRagProbeOutput] = useState('')
  const [ragRebuildBusy, setRagRebuildBusy] = useState(false)

  const [apiTestOutput, setApiTestOutput] = useState('')
  const [apiTestBusy, setApiTestBusy] = useState(false)

  type DevProfEligibility = { createEnabled: boolean; callerIsAdmin: boolean }
  const [profElig, setProfElig] = useState<DevProfEligibility | null>(null)
  /** Inicia true com sessão ativa para não exibir “acesso restrito” antes do GET /dev/profissionais/eligibility. */
  const [profEligLoading, setProfEligLoading] = useState(() => Boolean(token))
  const [newProfEmail, setNewProfEmail] = useState('')
  const [newProfNome, setNewProfNome] = useState('')
  const [newProfRegistro, setNewProfRegistro] = useState('')
  const [newProfPassword, setNewProfPassword] = useState('')
  const [newProfBusy, setNewProfBusy] = useState(false)
  const [newProfMsg, setNewProfMsg] = useState('')

  type DevDeleteElig = { deleteEnabled: boolean; callerIsAdmin: boolean }
  const [delElig, setDelElig] = useState<DevDeleteElig | null>(null)
  const [delEligLoading, setDelEligLoading] = useState(false)
  type SandboxP = { id: string; nome_mascarado: string }
  type SandboxG = { id: string; dum: string | null; is_ativa: boolean }
  const [sandboxPatients, setSandboxPatients] = useState<SandboxP[]>([])
  const [sandboxPatientsLoading, setSandboxPatientsLoading] = useState(false)
  const [gestByPatient, setGestByPatient] = useState<Record<string, SandboxG[]>>({})
  const [expandedPatientId, setExpandedPatientId] = useState<string | null>(null)
  const [deleteBusyKey, setDeleteBusyKey] = useState<string | null>(null)
  const [deleteDataMsg, setDeleteDataMsg] = useState('')

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

  useEffect(() => {
    if (!token) {
      setProfElig(null)
      setProfEligLoading(false)
      return
    }
    const c = new AbortController()
    setProfEligLoading(true)
    void (async () => {
      try {
        const res = await authFetch('/api/v1/dev/profissionais/eligibility', { signal: c.signal })
        const j = (await res.json()) as { createEnabled?: boolean; callerIsAdmin?: boolean }
        if (c.signal.aborted) return
        if (typeof j.createEnabled === 'boolean' && typeof j.callerIsAdmin === 'boolean') {
          setProfElig({ createEnabled: j.createEnabled, callerIsAdmin: j.callerIsAdmin })
        } else {
          setProfElig(null)
        }
      } catch {
        if (!c.signal.aborted) setProfElig(null)
      } finally {
        if (!c.signal.aborted) setProfEligLoading(false)
      }
    })()
    return () => c.abort()
  }, [token, authFetch])

  useEffect(() => {
    if (!token) {
      setDelElig(null)
      return
    }
    const c = new AbortController()
    setDelEligLoading(true)
    void (async () => {
      try {
        const res = await authFetch('/api/v1/dev/sandbox/db-delete-eligibility', { signal: c.signal })
        const j = (await res.json()) as { deleteEnabled?: boolean; callerIsAdmin?: boolean }
        if (c.signal.aborted) return
        if (typeof j.deleteEnabled === 'boolean' && typeof j.callerIsAdmin === 'boolean') {
          setDelElig({ deleteEnabled: j.deleteEnabled, callerIsAdmin: j.callerIsAdmin })
        } else {
          setDelElig(null)
        }
      } catch {
        if (!c.signal.aborted) setDelElig(null)
      } finally {
        if (!c.signal.aborted) setDelEligLoading(false)
      }
    })()
    return () => c.abort()
  }, [token, authFetch])

  const loadSandboxPatientList = async () => {
    if (!token) return
    setSandboxPatientsLoading(true)
    setDeleteDataMsg('')
    try {
      const res = await authFetch('/api/v1/pacientes')
      if (!res.ok) {
        setDeleteDataMsg(`Não foi possível carregar a lista (HTTP ${res.status}).`)
        return
      }
      const json = (await res.json()) as unknown
      const list = Array.isArray(json) ? json : []
      setSandboxPatients(
        list
          .filter((r): r is Record<string, unknown> => r && typeof r === 'object')
          .map((r) => ({
            id: String(r.id ?? ''),
            nome_mascarado: String(r.nome_mascarado ?? '(sem nome)'),
          }))
          .filter((r) => isUuid(r.id)),
      )
    } catch {
      setDeleteDataMsg('Falha de rede ao carregar gestantes.')
    } finally {
      setSandboxPatientsLoading(false)
    }
  }

  const toggleExpandPatient = async (pid: string) => {
    if (expandedPatientId === pid) {
      setExpandedPatientId(null)
      return
    }
    setExpandedPatientId(pid)
    if (gestByPatient[pid]) return
    try {
      const res = await authFetch(`/api/v1/gestacoes?paciente_id=${encodeURIComponent(pid)}`)
      if (!res.ok) return
      const json = (await res.json()) as unknown
      const raw = Array.isArray(json) ? json : []
      const mapped: SandboxG[] = raw
        .filter((g): g is Record<string, unknown> => g && typeof g === 'object')
        .map((g) => ({
          id: String(g.id ?? ''),
          dum: typeof g.dum === 'string' ? g.dum : null,
          is_ativa: g.is_ativa === true,
        }))
        .filter((g) => isUuid(g.id))
      setGestByPatient((prev) => ({ ...prev, [pid]: mapped }))
    } catch {
      setGestByPatient((prev) => ({ ...prev, [pid]: [] }))
    }
  }

  const handleDeleteGestacao = async (gid: string, pid: string) => {
    if (!window.confirm('Remover esta gestação e todos os dados ligados a ela (consultas, etc.)? Esta ação não pode ser desfeita.')) return
    setDeleteBusyKey(`g:${gid}`)
    setDeleteDataMsg('')
    try {
      const res = await authFetch(`/api/v1/dev/gestacoes/${encodeURIComponent(gid)}`, { method: 'DELETE' })
      if (res.status === 204) {
        setDeleteDataMsg('Gestação removida.')
        setGestByPatient((prev) => {
          const cur = prev[pid] ?? []
          return { ...prev, [pid]: cur.filter((x) => x.id !== gid) }
        })
        void loadSandboxPatientList()
      } else {
        let msg = `HTTP ${res.status}`
        try {
          const j = (await res.json()) as { message?: string }
          if (typeof j.message === 'string') msg = j.message
        } catch {
          /* ignore */
        }
        setDeleteDataMsg(msg)
      }
    } catch {
      setDeleteDataMsg('Falha de rede ao remover gestação.')
    } finally {
      setDeleteBusyKey(null)
    }
  }

  const handleDeletePaciente = async (pid: string, nome: string) => {
    if (
      !window.confirm(
        `Remover completamente o cadastro de "${nome}" (todas as gestações, consultas e dados vinculados)? Esta ação não pode ser desfeita.`,
      )
    )
      return
    setDeleteBusyKey(`p:${pid}`)
    setDeleteDataMsg('')
    try {
      const res = await authFetch(`/api/v1/dev/pacientes/${encodeURIComponent(pid)}`, { method: 'DELETE' })
      if (res.status === 204) {
        setDeleteDataMsg('Cadastro da gestante removido.')
        setGestByPatient((prev) => {
          const next = { ...prev }
          delete next[pid]
          return next
        })
        if (expandedPatientId === pid) setExpandedPatientId(null)
        void loadSandboxPatientList()
      } else {
        let msg = `HTTP ${res.status}`
        try {
          const j = (await res.json()) as { message?: string }
          if (typeof j.message === 'string') msg = j.message
        } catch {
          /* ignore */
        }
        setDeleteDataMsg(msg)
      }
    } catch {
      setDeleteDataMsg('Falha de rede ao remover cadastro.')
    } finally {
      setDeleteBusyKey(null)
    }
  }

  const handleCreateProfissional = async () => {
    setNewProfBusy(true)
    setNewProfMsg('')
    try {
      const res = await authFetch('/api/v1/dev/profissionais', {
        method: 'POST',
        body: JSON.stringify({
          email: newProfEmail.trim(),
          nome: newProfNome.trim(),
          password: newProfPassword,
          registro: newProfRegistro.trim() || undefined,
        }),
      })
      const j = (await res.json()) as { message?: string; code?: string; email?: string; id?: string }
      if (!res.ok) {
        const msg = typeof j.message === 'string' ? j.message : j.code ?? `HTTP ${res.status}`
        setNewProfMsg(`Erro: ${msg}`)
        return
      }
      setNewProfMsg(`Criado: ${j.email ?? newProfEmail} (id ${j.id ?? '?'})`)
      setNewProfEmail('')
      setNewProfNome('')
      setNewProfRegistro('')
      setNewProfPassword('')
    } catch {
      setNewProfMsg('Falha de rede ao criar profissional.')
    } finally {
      setNewProfBusy(false)
    }
  }

  const handleTestMcp = async () => {
    setMcpBusy(true)
    setMcpOutput('')
    try {
      const res = await authFetch('/api/v1/dev/sanitize', {
        method: 'POST',
        body: JSON.stringify({ input: mcpInput }),
      })
      const json = (await res.json()) as { output?: string; code?: string; message?: string }
      if (!res.ok) {
        const msg = typeof json.message === 'string' ? json.message : json.code ?? `HTTP ${res.status}`
        setMcpOutput(`Erro: ${msg}`)
        return
      }
      setMcpOutput(typeof json.output === 'string' ? json.output : '(sem output)')
    } catch {
      setMcpOutput('Falha de rede ao chamar /api/v1/dev/sanitize')
    } finally {
      setMcpBusy(false)
    }
  }

  const handleTestLlm = async () => {
    setLlmBusy(true)
    setLlmOutput('')
    try {
      const res = await authFetch('/api/v1/dev/ollama/insight', {
        method: 'POST',
        body: JSON.stringify({ input: llmInput, maxChars: 1500 }),
      })
      const json = (await res.json()) as { output?: string; code?: string; message?: string }
      if (!res.ok) {
        const msg = typeof json.message === 'string' ? json.message : json.code ?? `HTTP ${res.status}`
        setLlmOutput(`Erro: ${msg}`)
        return
      }
      const out = typeof json.output === 'string' ? json.output : ''
      setLlmOutput(out || '(sem output — confira OLLAMA_HTTP_URL no backend; vazio = modelo não chamado)')
    } catch {
      setLlmOutput('Falha de rede ao chamar /api/v1/dev/ollama/insight')
    } finally {
      setLlmBusy(false)
    }
  }

  const handlePipelineTrace = async () => {
    const q = pqQuestion.trim()
    if (!q || pqBusy || !token) return
    setPqBusy(true)
    setPqPhase('POST /api/v1/dev/mcp/test/direct-question-stream …')
    setPqSteps([])
    setPqSanitized('')
    setPqRagLines([])
    setPqRagRetrievalInfo('')
    setPqThinking('')
    setPqAnswer('')
    setPqRawNdjson([])
    let th = ''
    let ans = ''
    const pushStep = (s: string) => setPqSteps((prev) => [...prev, `${new Date().toISOString().slice(11, 23)} ${s}`])
    try {
      const streamPayload: Record<string, unknown> = { question: q, think: pqThink }
      if (devRagExpandMode === 'on') streamPayload.rag_expand_query = true
      if (devRagExpandMode === 'off') streamPayload.rag_expand_query = false
      const canCtx =
        pqUseClinicalContext &&
        ((pqConsultaId.trim() && isUuid(pqConsultaId.trim())) || (pqGestacaoId.trim() && isUuid(pqGestacaoId.trim())))
      if (canCtx) {
        setPqPhase('POST /api/v1/clinical/livia/context …')
        pushStep('clinical/livia/context …')
        try {
          const ctxRes = await authFetch('/api/v1/clinical/livia/context', {
            method: 'POST',
            body: JSON.stringify({
              question: q,
              ...(pqPacienteId.trim() && isUuid(pqPacienteId.trim()) ? { paciente_id: pqPacienteId.trim() } : {}),
              ...(pqGestacaoId.trim() && isUuid(pqGestacaoId.trim()) ? { gestacao_id: pqGestacaoId.trim() } : {}),
              ...(pqConsultaId.trim() && isUuid(pqConsultaId.trim()) ? { consulta_id: pqConsultaId.trim() } : {}),
            }),
          })
          if (ctxRes.ok) {
            const ctx = (await ctxRes.json()) as Record<string, unknown>
            const gc = ctx.gestacao_context
            const ecc = ctx.consulta_escriba_context
            if (typeof gc === 'string' && gc.trim()) streamPayload.gestacao_context = gc
            if (typeof ecc === 'string' && ecc.trim()) streamPayload.consulta_escriba_context = ecc
            pushStep('clinical/livia/context OK')
          } else {
            pushStep(`clinical/livia/context HTTP ${String(ctxRes.status)}`)
          }
        } catch {
          pushStep('clinical/livia/context rede/erro')
        }
      }

      const res = await authFetch('/api/v1/dev/mcp/test/direct-question-stream', {
        method: 'POST',
        headers: { Accept: 'application/x-ndjson' },
        body: JSON.stringify(streamPayload),
      })
      if (!res.ok) {
        let body: Record<string, unknown> = {}
        try {
          body = (await res.json()) as Record<string, unknown>
        } catch {
          body = {}
        }
        const msg = typeof body.message === 'string' ? body.message : `HTTP ${res.status}`
        pushStep(`HTTP erro: ${msg}`)
        setPqPhase('Falhou antes do stream')
        return
      }
      await readNdjsonStream(
        res,
        (row) => {
          const typ = row.type
          if (typ === 'pipeline') {
            const sb = row.sanitized_blocks
            const qSan =
              sb && typeof sb === 'object' && typeof (sb as { question?: string }).question === 'string'
                ? (sb as { question: string }).question
                : ''
            setPqSanitized(qSan)
            const rawS = typeof row.rag_retrieval_query_raw === 'string' ? row.rag_retrieval_query_raw.trim() : ''
            const effS = typeof row.rag_retrieval_query_effective === 'string' ? row.rag_retrieval_query_effective.trim() : ''
            const expS = typeof row.rag_retrieval_expansion === 'string' ? row.rag_retrieval_expansion.trim() : ''
            const infoBits: string[] = []
            if (rawS) infoBits.push(`Entrada retrieve (sanitizada): ${rawS}`)
            if (expS) infoBits.push(`Expansão LLM (termos): ${expS}`)
            if (effS && effS !== rawS) infoBits.push(`Texto efetivo no embedding / lexical: ${effS}`)
            else if (effS && expS) infoBits.push(`Texto efetivo no embedding / lexical: ${effS}`)
            setPqRagRetrievalInfo(infoBits.length ? infoBits.join('\n\n') : '')
            const chunks = Array.isArray(row.rag_chunks) ? row.rag_chunks : []
            const lines = chunks.map((c, i) => {
              const o = c && typeof c === 'object' ? (c as Record<string, unknown>) : {}
              const cite =
                typeof o.citation_line === 'string' && o.citation_line.trim()
                  ? o.citation_line.trim()
                  : typeof o.source_file === 'string' && o.source_file.trim()
                    ? o.source_file.trim()
                    : typeof o.source_citation === 'string' && o.source_citation.trim()
                      ? o.source_citation.trim()
                      : '(?)'
              const tx = typeof o.text === 'string' ? o.text.slice(0, 400) : ''
              return `[${i + 1}] ${cite}\n\n${tx}${typeof o.text === 'string' && o.text.length > 400 ? '…' : ''}`
            })
            setPqRagLines(lines)
            pushStep(
              `pipeline: think_enabled=${String(row.think_enabled)} n_rag_chunks=${String(row.n_rag_chunks ?? chunks.length)} context_chars=${String(row.context_chars ?? '')} rag_timing_ms=${typeof row.rag_timing_ms === 'object' ? JSON.stringify(row.rag_timing_ms) : ''}`,
            )
            if (typeof row.stream_note_pt === 'string') pushStep(`nota: ${row.stream_note_pt}`)
            setPqPhase('Stream Ollama (thinking + content)…')
            return
          }
          if (typ === 'ollama') {
            if (typeof row.thinking === 'string' && row.thinking) th += row.thinking
            if (typeof row.content === 'string' && row.content) {
              if (row.content_replace === true) ans = row.content
              else ans += row.content
            }
            setPqThinking(th)
            setPqAnswer(ans)
            if (row.done) pushStep(`ollama: done=true métricas=${JSON.stringify(row.metrics ?? {})}`)
            return
          }
          if (typ === 'error') {
            pushStep(`erro stream: ${String(row.detail ?? '')}`)
            setPqPhase('Erro no stream')
            return
          }
          if (typ === 'done') {
            pushStep('done: stream NDJSON concluído')
            setPqPhase('Concluído')
          }
        },
        (raw) => setPqRawNdjson((lines) => [...lines, raw].slice(-400)),
      )
    } catch {
      pushStep('exceção: falha de rede ou corpo inválido')
      setPqPhase('Erro')
    } finally {
      setPqBusy(false)
    }
  }

  const handleRagProbeQuery = async () => {
    const q = ragProbeQuery.trim()
    if (!q || ragProbeBusy || !token) return
    setRagProbeBusy(true)
    setRagProbeOutput('')
    try {
      const body: Record<string, unknown> = { query: q, top_k: Math.min(32, Math.max(1, ragProbeTopK)) }
      if (devRagExpandMode === 'on') body.expand_query = true
      if (devRagExpandMode === 'off') body.expand_query = false
      const res = await authFetch('/api/v1/dev/rag/test/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      })
      const txt = await res.text()
      try {
        const json = JSON.parse(txt) as unknown
        setRagProbeOutput(JSON.stringify(json, null, 2))
      } catch {
        setRagProbeOutput(`HTTP ${res.status}\n\n${txt}`)
      }
    } catch {
      setRagProbeOutput('Falha de rede ao chamar /api/v1/dev/rag/test/query')
    } finally {
      setRagProbeBusy(false)
    }
  }

  const handleRagRebuildIndex = async () => {
    if (ragRebuildBusy || !token) return
    setRagRebuildBusy(true)
    try {
      const res = await authFetch('/api/v1/dev/rag/test/rebuild?force=true', {
        method: 'POST',
        headers: { Accept: 'application/json' },
      })
      const txt = await res.text()
      try {
        const json = JSON.parse(txt) as unknown
        setRagProbeOutput(`Rebuild (force=true) OK — resumo:\n${JSON.stringify(json, null, 2)}`)
      } catch {
        setRagProbeOutput(`Rebuild HTTP ${res.status}\n\n${txt}`)
      }
    } catch {
      setRagProbeOutput('Falha de rede ao chamar /api/v1/dev/rag/test/rebuild')
    } finally {
      setRagRebuildBusy(false)
    }
  }

  if (!token) {
    return <Navigate to="/" replace />
  }

  if (profEligLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-6">
        <p className="text-sm font-semibold text-slate-600">Verificando permissões…</p>
      </div>
    )
  }

  if (!profElig?.callerIsAdmin) {
    return (
      <div className="mx-auto max-w-lg space-y-6 px-6 py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
          <h1 className="text-xl font-black text-brand-navy">Acesso restrito</h1>
          <p className="mt-3 text-sm text-slate-600">
            O Dev Sandbox está disponível apenas para a conta administradora configurada no servidor (por exemplo{' '}
            <span className="font-mono text-xs">DEV_ADMIN_EMAILS</span>).
          </p>
          <Link
            to="/dashboard"
            className="mt-6 inline-flex rounded-xl bg-brand-navy px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:opacity-95"
          >
            Voltar à agenda
          </Link>
        </div>
      </div>
    )
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
                   <span
                     className={`h-3 w-3 rounded-full ${
                       health ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500'
                     }`}
                   ></span>
                   <span className="text-sm font-semibold text-slate-700">Backend API {health ? '(Online)' : '(Offline)'}</span>
                </div>
                <div className="w-px h-5 bg-slate-200 hidden sm:block"></div>
                <div className="flex items-center gap-2">
                   <span className={`h-3 w-3 rounded-full ${health?.db ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}`}></span>
                   <span className="text-sm font-semibold text-slate-700">PostgreSQL {health?.db ? '(Online)' : '(Offline)'}</span>
                </div>
                <div className="w-px h-5 bg-slate-200 hidden sm:block"></div>
                <div className="flex items-center gap-2">
                   <span
                     className={`h-3 w-3 rounded-full ${statusDot(
                       Boolean(health?.clinicalAiReachable),
                       Boolean(health?.clinicalAiConfigured) && !health?.clinicalAiReachable,
                     )}`}
                   ></span>
                   <span className="text-sm font-semibold text-slate-700">
                     clinical-ai{' '}
                     {health?.clinicalAiReachable
                       ? '(OK)'
                       : health?.clinicalAiConfigured
                         ? '(/health falhou)'
                         : '(sem CLINICAL_AI_URL)'}
                   </span>
                </div>
                <div className="w-px h-5 bg-slate-200 hidden sm:block"></div>
                <div className="flex items-center gap-2">
                  <span
                    className={`h-3 w-3 rounded-full ${statusDot(
                      Boolean(health?.clinicalAiGeminiConfigured),
                      Boolean(health?.clinicalAiReachable) && !health?.clinicalAiGeminiConfigured,
                    )}`}
                  ></span>
                  <span className="text-sm font-semibold text-slate-700">
                    Gemini (clinical-ai){' '}
                    {health?.clinicalAiGeminiConfigured ? '(chave configurada)' : '(sem GEMINI_API_KEY)'}
                  </span>
                </div>
                <div className="w-px h-5 bg-slate-200 hidden sm:block"></div>
                <div className="flex items-center gap-2">
                   <span
                     className={`h-3 w-3 rounded-full ${statusDot(
                       Boolean(health?.privacyGateway === 'remote'),
                       Boolean(health?.mcpConfigured) && health?.privacyGateway !== 'remote',
                     )}`}
                   ></span>
                   <span className="text-sm font-semibold text-slate-700">
                     Sanitize (MCP / CLINICAL_AI){' '}
                     {health?.privacyGateway === 'remote'
                       ? '(HTTP ativo)'
                       : health?.mcpConfigured
                         ? '(URL setada mas noop)'
                         : '(sem URL)'}
                   </span>
                </div>
                <div className="w-px h-5 bg-slate-200 hidden sm:block"></div>
                <div className="flex items-center gap-2">
                   <span
                     className={`h-3 w-3 rounded-full ${statusDot(
                       Boolean(health?.ollamaReachable),
                       Boolean(health?.ollamaConfigured) && !health?.ollamaReachable,
                     )}`}
                   ></span>
                   <span className="text-sm font-semibold text-slate-700">
                     Ollama{' '}
                     {health?.ollamaReachable
                       ? '(/api/tags OK)'
                       : health?.ollamaConfigured
                         ? '(URL setada; use http://... No Docker host: host.docker.internal)'
                         : '(sem OLLAMA_HTTP_URL)'}
                   </span>
                </div>
                <div className="w-px h-5 bg-slate-200 hidden sm:block"></div>
                <div className="flex items-center gap-2">
                   <span
                     className={`h-3 w-3 rounded-full ${statusDot(
                       Boolean(health?.whisperReachable),
                       Boolean(health?.whisperConfigured) && !health?.whisperReachable,
                     )}`}
                   ></span>
                   <span className="text-sm font-semibold text-slate-700">
                     Escriba STT (faster-whisper){' '}
                     {health?.whisperReachable
                       ? '(/health OK)'
                       : health?.whisperConfigured
                         ? '(/health falhou — veja logs: docker compose logs stt)'
                         : '(sem WHISPER_HTTP_URL)'}
                   </span>
                </div>
                <div className="w-px h-5 bg-slate-200 hidden sm:block"></div>
                <div className="flex items-center gap-2">
                   <span className={`h-3 w-3 rounded-full ${token ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-300'}`}></span>
                   <span className="text-sm font-semibold text-slate-700">Auth Token {token ? '(OK)' : '(Faça login)'}</span>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href={`${apiBase}/swagger`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-all text-sm"
                >
                  Abrir Swagger
                </a>
                <a
                  href={`${apiBase}/openapi.json`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-all text-sm"
                >
                  Ver OpenAPI JSON
                </a>
              </div>
           </div>
           
           <div
             className={`px-4 py-3 rounded-xl border ${
               health?.status === 'ok'
                 ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                 : health?.status === 'degraded'
                   ? 'bg-amber-50 border-amber-200 text-amber-900'
                   : 'bg-rose-50 border-rose-200 text-rose-800'
             }`}
           >
              <span className="text-xs font-bold uppercase tracking-wider block mb-1">Status Global</span>
              {healthLoading ? 'Verificando...' : (health?.status ? `SISTEMA ${health.status.toUpperCase()}` : 'FALHA DE REDE')}
           </div>
        </div>

        {/* Painel 1b: Testes manuais rápidos (HTTP) */}
        <div className="lg:col-span-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col gap-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Testes manuais (HTTP)</h2>
              <p className="text-xs text-slate-500 font-medium">
                Fluxo recomendado: login → validar lista de pacientes/worklist → testar sanitize/Ollama.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => logout()}
                disabled={!token}
                className="rounded-xl bg-white border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 shadow-sm transition-all"
              >
                Logout
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Login</div>
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">E-mail</label>
                  <input
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 p-2.5 text-sm shadow-sm bg-white"
                    placeholder="admin@local"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Senha</label>
                  <input
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    type="password"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 p-2.5 text-sm shadow-sm bg-white"
                    placeholder="admin"
                  />
                </div>
                <button
                  onClick={() => void login(loginEmail, loginPassword)}
                  disabled={loginState.kind === 'loading'}
                  className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-all"
                >
                  {loginState.kind === 'loading' ? 'Autenticando...' : 'Entrar'}
                </button>
                {loginState.kind === 'error' && (
                  <div className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5">
                    {loginState.message}
                  </div>
                )}
                <div className="text-[11px] text-slate-600 font-mono break-all">
                  {token ? `Token: ${token.slice(0, 28)}…` : 'Sem token ainda.'}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Chamadas protegidas</div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={async () => {
                    setApiTestBusy(true)
                    setApiTestOutput('')
                    try {
                      const res = await authFetch('/api/v1/pacientes')
                      const txt = await res.text()
                      setApiTestOutput(`GET /api/v1/pacientes\nHTTP ${res.status}\n\n${txt}`)
                    } catch {
                      setApiTestOutput('Falha de rede ao chamar /api/v1/pacientes')
                    } finally {
                      setApiTestBusy(false)
                    }
                  }}
                  disabled={!token || apiTestBusy}
                  className="rounded-xl bg-white border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 shadow-sm transition-all text-left"
                >
                  GET /pacientes
                </button>
                <button
                  onClick={async () => {
                    setApiTestBusy(true)
                    setApiTestOutput('')
                    try {
                      const res = await authFetch('/api/v1/consultas/disponiveis-stream')
                      const txt = await res.text()
                      setApiTestOutput(`GET /api/v1/consultas/disponiveis-stream\nHTTP ${res.status}\n\n${txt}`)
                    } catch {
                      setApiTestOutput('Falha de rede ao chamar /api/v1/consultas/disponiveis-stream')
                    } finally {
                      setApiTestBusy(false)
                    }
                  }}
                  disabled={!token || apiTestBusy}
                  className="rounded-xl bg-white border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 shadow-sm transition-all text-left"
                >
                  GET /consultas/disponiveis-stream
                </button>
                <div className="text-[11px] text-slate-500 font-medium">
                  Dica: no Swagger, clique em “Authorize” e cole o JWT.
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Saída</div>
              <pre className="h-56 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 whitespace-pre-wrap">
                {apiTestOutput || 'Execute uma chamada para ver o retorno aqui.'}
              </pre>
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-5">
            <h3 className="text-sm font-bold text-slate-900">Profissionais adicionais (somente dev / admin)</h3>
            <p className="mt-1 text-xs text-slate-600">
              Backend: <span className="font-mono">DEV_ALLOW_PROFISSIONAL_CREATE=1</span> e o seu JWT deve ser um e-mail em{' '}
              <span className="font-mono">DEV_ADMIN_EMAILS</span> (ou o e-mail do seed se a lista estiver vazia). Senhas são armazenadas com hash
              (bcrypt).
            </p>
            {!token && <p className="mt-3 text-xs font-semibold text-slate-500">Faça login para ver elegibilidade e o formulário.</p>}
            {token && profEligLoading && <p className="mt-3 text-xs text-slate-500">Carregando elegibilidade…</p>}
            {token && !profEligLoading && profElig && !profElig.createEnabled && (
              <p className="mt-3 text-xs font-semibold text-amber-800">
                Criação via API está desligada no servidor (<span className="font-mono">DEV_ALLOW_PROFISSIONAL_CREATE</span>).
              </p>
            )}
            {token && !profEligLoading && profElig && profElig.createEnabled && !profElig.callerIsAdmin && (
              <p className="mt-3 text-xs font-semibold text-rose-800">
                Seu usuário não é administrador dev para esta operação (configure <span className="font-mono">DEV_ADMIN_EMAILS</span> ou use o
                e-mail do seed).
              </p>
            )}
            {token && !profEligLoading && profElig && profElig.createEnabled && profElig.callerIsAdmin && (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">E-mail (login)</label>
                  <input
                    value={newProfEmail}
                    onChange={(e) => setNewProfEmail(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-2 text-sm shadow-sm"
                    placeholder="colega@local.dev"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Nome</label>
                  <input
                    value={newProfNome}
                    onChange={(e) => setNewProfNome(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-2 text-sm shadow-sm"
                    placeholder="Nome completo"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Registro (opcional)</label>
                  <input
                    value={newProfRegistro}
                    onChange={(e) => setNewProfRegistro(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-2 text-sm shadow-sm"
                    placeholder="CRM / COREN"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Senha inicial (mín. 8)</label>
                  <input
                    type="password"
                    value={newProfPassword}
                    onChange={(e) => setNewProfPassword(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-2 text-sm shadow-sm"
                    placeholder="********"
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={newProfBusy || newProfPassword.length < 8 || newProfNome.trim().length < 2 || !newProfEmail.trim()}
                    onClick={() => void handleCreateProfissional()}
                    className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {newProfBusy ? 'Criando…' : 'Criar profissional'}
                  </button>
                </div>
              </div>
            )}
            {newProfMsg && <p className="mt-3 text-xs font-medium text-slate-800 whitespace-pre-wrap">{newProfMsg}</p>}
          </div>

          <div className="rounded-2xl border border-dashed border-rose-200 bg-rose-50/40 p-5">
            <h3 className="text-sm font-bold text-slate-900">Limpar dados de teste no banco</h3>
            <p className="mt-1 text-xs text-slate-600">
              Uso apenas em ambiente de desenvolvimento. No arquivo <span className="font-mono">Codigo/.env</span> do backend defina{' '}
              <span className="font-mono">DEV_ALLOW_SANDBOX_DB_DELETE=1</span> e mantenha o mesmo e-mail administrador de{' '}
              <span className="font-mono">DEV_ADMIN_EMAILS</span> que você usa no login.
            </p>
            {!token && <p className="mt-3 text-xs font-semibold text-slate-500">Faça login para ver se a exclusão está liberada.</p>}
            {token && delEligLoading && <p className="mt-3 text-xs text-slate-500">Carregando permissões…</p>}
            {token && !delEligLoading && delElig && !delElig.deleteEnabled && (
              <p className="mt-3 text-xs font-semibold text-amber-800">
                Exclusão pelo sandbox está desligada no servidor (<span className="font-mono">DEV_ALLOW_SANDBOX_DB_DELETE</span>).
              </p>
            )}
            {token && !delEligLoading && delElig && delElig.deleteEnabled && !delElig.callerIsAdmin && (
              <p className="mt-3 text-xs font-semibold text-rose-800">
                Sua conta não é administradora de desenvolvimento para esta operação.
              </p>
            )}
            {token && !delEligLoading && delElig && delElig.deleteEnabled && delElig.callerIsAdmin && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={sandboxPatientsLoading}
                    onClick={() => void loadSandboxPatientList()}
                    className="rounded-xl bg-white border border-rose-200 px-4 py-2 text-sm font-bold text-rose-900 shadow-sm hover:bg-rose-50 disabled:opacity-50"
                  >
                    {sandboxPatientsLoading ? 'Carregando…' : 'Carregar gestantes cadastradas'}
                  </button>
                </div>
                {sandboxPatients.length > 0 ? (
                  <ul className="space-y-2 rounded-xl border border-rose-100 bg-white p-3 max-h-80 overflow-auto text-sm">
                    {sandboxPatients.map((p) => (
                      <li key={p.id} className="rounded-lg border border-slate-100 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-slate-800">{p.nome_mascarado}</span>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={deleteBusyKey !== null}
                              onClick={() => void toggleExpandPatient(p.id)}
                              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                            >
                              {expandedPatientId === p.id ? 'Ocultar gestações' : 'Ver gestações'}
                            </button>
                            <button
                              type="button"
                              disabled={deleteBusyKey !== null}
                              onClick={() => void handleDeletePaciente(p.id, p.nome_mascarado)}
                              className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-800 disabled:opacity-50"
                            >
                              {deleteBusyKey === `p:${p.id}` ? 'Removendo…' : 'Remover cadastro inteiro'}
                            </button>
                          </div>
                        </div>
                        {expandedPatientId === p.id ? (
                          <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
                            {(gestByPatient[p.id] ?? []).length === 0 ? (
                              <p className="text-xs text-slate-500">Nenhuma gestação listada (carregue de novo com “Ver gestações”).</p>
                            ) : (
                              (gestByPatient[p.id] ?? []).map((g) => (
                                <div
                                  key={g.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-2 text-xs"
                                >
                                  <span className="text-slate-700">
                                    Gestação {g.is_ativa ? '(acompanhamento atual)' : '(encerrada ou arquivo)'} — DUM:{' '}
                                    {g.dum ? g.dum.slice(0, 10) : '—'}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={deleteBusyKey !== null}
                                    onClick={() => void handleDeleteGestacao(g.id, p.id)}
                                    className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                                  >
                                    {deleteBusyKey === `g:${g.id}` ? '…' : 'Remover só esta gestação'}
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {deleteDataMsg ? <p className="text-xs font-medium text-slate-800">{deleteDataMsg}</p> : null}
              </div>
            )}
          </div>
        </div>

        {/* Painel 2: STT isolado (sem UUID/consulta) */}
        <div className="lg:col-span-4 mt-4">
          <DevSttLabPanel
            whisperConfigured={Boolean(health?.whisperConfigured)}
            whisperReachable={Boolean(health?.whisperReachable)}
          />
        </div>

        {/* Painel 3: Teste MCP API */}
        <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col">
           <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-2">
              <span className="text-xl">🛡️</span> Painel do MCP (Privacy Gateway)
           </h2>
           <p className="text-xs text-slate-500 mb-6 font-medium">
             Teste real via <span className="font-mono">POST /api/v1/dev/sanitize</span> (usa o gateway configurado/noop).
           </p>
           
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
               disabled={mcpBusy || !token}
               className="w-full sm:w-auto self-end rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-slate-700 disabled:opacity-50 transition-all"
             >
               {mcpBusy ? 'Sanitizando…' : 'Sanitizar Texto'}
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
           <p className="text-xs text-slate-500 mb-6 font-medium">
             Teste real via <span className="font-mono">POST /api/v1/dev/ollama/insight</span> (agregado, sem stream).
           </p>
           
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
               disabled={llmBusy || !token}
               className="w-full sm:w-auto self-end rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:from-rose-600 hover:to-rose-700 disabled:opacity-50 transition-all"
             >
               {llmBusy ? 'Executando LLM…' : 'Executar LLM'}
             </button>
             <div className="flex-1 mt-2">
               <label className="text-[11px] font-bold uppercase tracking-wider text-rose-500">JSON de Retorno</label>
               <pre className="mt-1.5 h-24 rounded-xl border border-rose-200 bg-rose-50/50 p-3 text-xs font-mono text-rose-900 overflow-y-auto">
                 {llmOutput}
               </pre>
             </div>
           </div>
        </div>

        {/* Painel 4b: teste RAG isolado (retrieve, sem chat) */}
        <div className="lg:col-span-4 rounded-3xl border border-teal-200 bg-teal-50/30 p-6 shadow-sm">
          <h2 className="text-base font-bold text-teal-950 flex items-center gap-2">
            <span className="text-xl">📚</span> Teste RAG (só recuperação de trechos)
          </h2>
          <p className="mt-1 text-xs font-medium text-teal-900/85 max-w-3xl">
            <span className="font-mono">POST /api/v1/dev/rag/test/query</span> — igual ao <span className="font-mono">/rag/test/query</span> do clinical-ai.
            Útil para ver <strong>scores</strong>, <strong>citation_line</strong> e texto completo enviado ao modelo, sem chamar Ollama chat. Se alterou{' '}
            <span className="font-mono">RAG_CHUNK_MAX_CHARS</span>, use rebuild com <span className="font-mono">force=true</span> abaixo.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[12rem] flex-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-teal-800">Query</label>
              <textarea
                value={ragProbeQuery}
                onChange={(e) => setRagProbeQuery(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl border border-teal-200 bg-white p-2.5 text-sm text-slate-900 shadow-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-teal-800">top_k</label>
              <input
                type="number"
                min={1}
                max={32}
                value={ragProbeTopK}
                onChange={(e) => setRagProbeTopK(Number(e.target.value))}
                className="mt-1 w-20 rounded-xl border border-teal-200 bg-white px-2 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-teal-800">Expansão query (LLM)</label>
              <select
                value={devRagExpandMode}
                onChange={(e) => setDevRagExpandMode(e.target.value as 'inherit' | 'on' | 'off')}
                className="mt-1 block w-full min-w-[14rem] rounded-xl border border-teal-200 bg-white px-2 py-2 text-xs font-semibold text-teal-950"
              >
                <option value="inherit">Seguir env (RAG_QUERY_EXPAND_ENABLED)</option>
                <option value="on">Forçar ON (termos antes do embedding)</option>
                <option value="off">Forçar OFF</option>
              </select>
            </div>
            <button
              type="button"
              disabled={!token || ragProbeBusy || !ragProbeQuery.trim()}
              onClick={() => void handleRagProbeQuery()}
              className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-teal-800 disabled:opacity-50"
            >
              {ragProbeBusy ? 'Consultando…' : 'Consultar RAG'}
            </button>
            <button
              type="button"
              disabled={!token || ragRebuildBusy}
              onClick={() => void handleRagRebuildIndex()}
              title="Re-incorpora corpus e embeddings (lento). Necessário após mudar RAG_CHUNK_MAX_CHARS."
              className="rounded-xl border border-amber-400 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-950 shadow-sm hover:bg-amber-100 disabled:opacity-50"
            >
              {ragRebuildBusy ? 'Rebuild…' : 'Rebuild índice (force)'}
            </button>
          </div>
          <pre className="mt-4 max-h-[min(28rem,55vh)] overflow-auto whitespace-pre-wrap rounded-xl border border-teal-100 bg-white p-3 font-mono text-[11px] text-slate-800">
            {ragProbeOutput || '—'}
          </pre>
        </div>

        {/* Painel 5: DevTools — pipeline Lívia (NDJSON): MCP → RAG → thinking → resposta */}
        <div className="lg:col-span-4 rounded-3xl border border-indigo-200 bg-indigo-50/40 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-indigo-950 flex items-center gap-2">
                <span className="text-xl">🔬</span> DevTools — pipeline (MCP / RAG / Think / Ollama)
              </h2>
              <p className="mt-1 text-xs font-medium text-indigo-900/80 max-w-3xl">
                Mesmo contrato da Lívia: <span className="font-mono">POST /api/v1/dev/mcp/test/direct-question-stream</span>.
                Primeira linha <span className="font-mono">type=pipeline</span> (sanitização PII + trechos RAG); depois{' '}
                <span className="font-mono">type=ollama</span> (deltas de <span className="font-mono">thinking</span> e{' '}
                <span className="font-mono">content</span>); <span className="font-mono">type=done</span> fecha o fluxo.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <select
                value={devRagExpandMode}
                onChange={(e) => setDevRagExpandMode(e.target.value as 'inherit' | 'on' | 'off')}
                className="rounded-full border border-indigo-300 bg-white px-2 py-1 text-[10px] font-bold text-indigo-900"
                title="Controla rag_expand_query no JSON (retrieve)"
              >
                <option value="inherit">RAG expand: env</option>
                <option value="on">RAG expand: on</option>
                <option value="off">RAG expand: off</option>
              </select>
              <button
                type="button"
                disabled={pqBusy}
                onClick={() => setPqThink((v) => !v)}
                className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${
                  pqThink ? 'border-amber-500 bg-amber-100 text-amber-950' : 'border-indigo-300 bg-white text-indigo-800'
                } disabled:opacity-40`}
              >
                Think {pqThink ? 'on' : 'off'}
              </button>
            </div>
          </div>

          {pqBusy && pqPhase ? (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-900">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
              {pqPhase}
            </div>
          ) : null}

          <div className="mt-4 grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-5 space-y-3">
              <label className="text-[11px] font-bold uppercase tracking-wider text-indigo-800">Pergunta (JSON question)</label>
              <textarea
                value={pqQuestion}
                onChange={(e) => setPqQuestion(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-indigo-200 bg-white p-3 text-sm text-slate-900 shadow-sm"
              />
              <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-indigo-900">
                <input
                  type="checkbox"
                  checked={pqUseClinicalContext}
                  onChange={(e) => setPqUseClinicalContext(e.target.checked)}
                  className="rounded border-indigo-400 text-indigo-700"
                />
                Usar contexto clínico (POST /api/v1/clinical/livia/context antes do stream)
              </label>
              {pqUseClinicalContext ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-indigo-600">consulta_id</span>
                    <input
                      value={pqConsultaId}
                      onChange={(e) => setPqConsultaId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-indigo-200 bg-white px-2 py-1.5 font-mono text-[11px]"
                      placeholder="UUID (opcional)"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-indigo-600">gestacao_id</span>
                    <input
                      value={pqGestacaoId}
                      onChange={(e) => setPqGestacaoId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-indigo-200 bg-white px-2 py-1.5 font-mono text-[11px]"
                      placeholder="UUID se sem consulta"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-indigo-600">paciente_id</span>
                    <input
                      value={pqPacienteId}
                      onChange={(e) => setPqPacienteId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-indigo-200 bg-white px-2 py-1.5 font-mono text-[11px]"
                      placeholder="UUID (opcional)"
                    />
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                disabled={pqBusy || !token || !pqQuestion.trim()}
                onClick={() => void handlePipelineTrace()}
                className="rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-800 disabled:opacity-50"
              >
                {pqBusy ? 'Stream em andamento…' : 'Rodar trace NDJSON'}
              </button>
              <p className="text-[10px] font-medium text-indigo-800/90">
                Linha do tempo (cada evento recebido):
              </p>
              <ul className="max-h-40 overflow-auto rounded-xl border border-indigo-100 bg-white p-2 font-mono text-[10px] text-indigo-950">
                {pqSteps.length === 0 ? <li className="text-slate-400">(aguardando execução)</li> : null}
                {pqSteps.map((s, i) => (
                  <li key={i} className="border-b border-indigo-50 py-1 last:border-0">
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="lg:col-span-7 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/80 bg-white p-3 shadow-sm">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">1 · MCP / PII (pergunta sanitizada)</h3>
                <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 font-mono text-[10px] text-slate-800">
                  {pqSanitized || '—'}
                </pre>
              </div>
              <div className="rounded-xl border border-white/80 bg-white p-3 shadow-sm">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-emerald-700">2 · RAG (trechos recuperados)</h3>
                {pqRagRetrievalInfo ? (
                  <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded border border-emerald-100 bg-emerald-50/80 p-2 font-mono text-[9px] text-emerald-950">
                    {pqRagRetrievalInfo}
                  </pre>
                ) : null}
                <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-emerald-50/50 p-2 font-mono text-[10px] text-emerald-950">
                  {pqRagLines.length ? pqRagLines.join('\n\n---\n\n') : '—'}
                </pre>
              </div>
              <div className="rounded-xl border border-white/80 bg-white p-3 shadow-sm sm:col-span-2">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-amber-800">3 · Thinking (stream Ollama)</h3>
                <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-slate-900 p-2 font-mono text-[10px] text-amber-100">
                  {pqThinking || '—'}
                </pre>
              </div>
              <div className="rounded-xl border border-white/80 bg-white p-3 shadow-sm sm:col-span-2">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-rose-700">4 · Resposta (content acumulado)</h3>
                <div className="mt-2 max-h-36 overflow-y-auto rounded border border-rose-100/80 bg-rose-50/80 p-2 text-sm">
                  {pqAnswer.trim() ? (
                    <AssistantMarkdown markdown={pqAnswer} className="font-medium" />
                  ) : (
                    <span className="font-medium text-slate-500">—</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <details className="mt-4 rounded-xl border border-indigo-200 bg-white">
            <summary className="cursor-pointer px-4 py-2 text-xs font-black uppercase tracking-wider text-indigo-800">
              NDJSON bruto (últimas linhas)
            </summary>
            <pre className="max-h-56 overflow-auto border-t border-indigo-100 p-3 font-mono text-[9px] leading-tight text-slate-800">
              {pqRawNdjson.length ? pqRawNdjson.join('\n') : '(vazio)'}
            </pre>
          </details>
        </div>

      </div>
    </div>
  )
}
