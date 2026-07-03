import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AssistantMarkdown } from './AssistantMarkdown.js'
import { LiviaAssistantMessageActions } from './LiviaAssistantMessageActions.js'
import { LiviaUserMessageActions } from './LiviaUserMessageActions.js'
import { LiviaRagLivePreview, type RagChunkRow } from './LiviaRagSourcesPanel.js'
import { LiviaRagSourcesModal } from './LiviaRagSourcesModal.js'
import { LiviaSuggestionCollapsible } from './LiviaSuggestionCollapsible.js'
import { useAuth } from '../context/AuthContext.js'
import { getApiBaseUrl } from '../lib/apiBase.js'
import { readNdjsonStream } from '../lib/readNdjsonStream.js'
import { isUuid } from '../lib/uuid.js'

const SUGESTOES = [
  'Resumo do risco desta gestação',
  'Conduta para PA elevada (protocolo MS)',
  'Critérios de encaminhamento obstétrico',
]

type LlmProvider = 'ollama' | 'gemini'

function coerceLlmProvider(v: unknown): LlmProvider {
  if (v === 'gemini') return 'gemini'
  return 'ollama'
}

/** Persistência só no browser (mesma aba); sem backend. Sobrevive a F5; some ao fechar a aba ou ao sair. */
const LIVIA_SESSION_KEY = 'prenatal_livia_chat_v1'

const CONVERSATION_HISTORY_MAX_TURNS = 10
const CONVERSATION_HISTORY_MAX_CHARS = 4000

type ConversationTurnPayload = { role: 'user' | 'assistant'; content: string }

function defaultWelcomeMessages(): ChatMsg[] {
  return [
    {
      kind: 'assistant',
      content:
        'Olá! Sou a Lívia. Posso ajudar a buscar protocolos no Ministério da Saúde e sumarizar o risco gestacional com base nos dados que você coletar no prontuário.',
      chunks: [],
      thinkWasOn: false,
    },
  ]
}

function isChatMsg(x: unknown): x is ChatMsg {
  if (!x || typeof x !== 'object') return false
  const o = x as { kind?: unknown }
  if (o.kind === 'user') {
    return typeof (x as { text?: unknown }).text === 'string'
  }
  if (o.kind === 'assistant') {
    const a = x as { content?: unknown; chunks?: unknown; thinkWasOn?: unknown; thinking?: unknown }
    return (
      typeof a.content === 'string' &&
      Array.isArray(a.chunks) &&
      typeof a.thinkWasOn === 'boolean' &&
      (a.thinking === undefined || typeof a.thinking === 'string')
    )
  }
  return false
}

export type LiviaClinicalIds = {
  pacienteId?: string
  gestacaoId?: string
  consultaId?: string
}

function clinicalScopeKey(ids: LiviaClinicalIds): string {
  const { consultaId, gestacaoId, pacienteId } = ids
  if (consultaId && isUuid(consultaId)) return `consulta:${consultaId}`
  if (gestacaoId && isUuid(gestacaoId)) return `gestacao:${gestacaoId}`
  if (pacienteId && isUuid(pacienteId)) return `paciente:${pacienteId}`
  return 'global'
}

function sessionKeyForUser(emailBucket: string, clinicalScope: string): string {
  const b = emailBucket.trim().toLowerCase() || 'guest'
  return `${LIVIA_SESSION_KEY}::${b}::${clinicalScope}`
}

function loadLiviaSessionFromStorage(
  emailBucket: string,
  clinicalScope: string,
): { messages: ChatMsg[]; inputText: string; thinkOn: boolean; llmProvider: LlmProvider } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(sessionKeyForUser(emailBucket, clinicalScope))
    if (!raw) return null
    const data = JSON.parse(raw) as unknown
    if (!data || typeof data !== 'object') return null
    const rec = data as Record<string, unknown>
    if (!Array.isArray(rec.messages)) return null
    const messages = rec.messages.filter(isChatMsg)
    if (messages.length === 0) return null
    const inputText = typeof rec.inputText === 'string' ? rec.inputText : ''
    const thinkOn = typeof rec.thinkOn === 'boolean' ? rec.thinkOn : false
    const llmProvider = coerceLlmProvider(rec.llmProvider)
    return { messages, inputText, thinkOn, llmProvider }
  } catch {
    return null
  }
}

function persistLiviaSession(
  messages: ChatMsg[],
  inputText: string,
  thinkOn: boolean,
  llmProvider: LlmProvider,
  emailBucket: string,
  clinicalScope: string,
) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(
      sessionKeyForUser(emailBucket, clinicalScope),
      JSON.stringify({ messages, inputText, thinkOn, llmProvider }),
    )
  } catch {
    /* quota ou modo privado */
  }
}

function truncateHistoryText(s: string, max = CONVERSATION_HISTORY_MAX_CHARS): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

/** Turnos anteriores para o LLM (exclui boas-vindas e mensagens após `excludeFromEnd`). */
function deriveConversationHistory(messages: ChatMsg[], excludeFromEnd = 0): ConversationTurnPayload[] {
  const hasUser = messages.some((m) => m.kind === 'user')
  const filtered = messages.filter((m, i) => {
    if (!hasUser && i === 0 && m.kind === 'assistant') return false
    return true
  })
  const slice = excludeFromEnd > 0 ? filtered.slice(0, -excludeFromEnd) : filtered
  const turns: ConversationTurnPayload[] = []
  for (const m of slice) {
    if (m.kind === 'user') {
      turns.push({ role: 'user', content: truncateHistoryText(m.text) })
    } else {
      turns.push({ role: 'assistant', content: truncateHistoryText(m.content) })
    }
  }
  const maxMessages = CONVERSATION_HISTORY_MAX_TURNS * 2
  return turns.slice(-maxMessages)
}

function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

type ChatMsg =
  | { kind: 'user'; text: string }
  | {
      kind: 'assistant'
      content: string
      chunks: RagChunkRow[]
      thinking?: string
      thinkWasOn: boolean
    }

/** Evita vazar chaves de API em mensagens de erro (ex.: URL da Gemini no detalhe do httpx). */
function redactSecretsInClientMessage(s: string): string {
  return s
    .replace(/([?&])key=[^&\s#'"<>]+/gi, '$1key=(redacted)')
    .replace(/https:\/\/generativelanguage\.googleapis\.com[^\s]*/gi, '(URL da API Gemini omitida)')
}

/**
 * Mensagem padronizada quando o backend rejeita a chamada com 429 por saturação dos
 * semáforos do ConcurrencyLimiter (LLM/clinical-ai/STT/sanitize), tipicamente quando
 * duas pessoas dão "Enviar" ao mesmo tempo numa demo com GPU única.
 */
const AI_BUSY_MESSAGE = 'Estamos com a IA ocupada. Aguarde alguns segundos e tente novamente.'

const AI_BUSY_CODES = new Set([
  'llm_busy',
  'clinical_ai_proxy_busy',
  'sanitize_busy',
  'stt_busy',
])

function isAiBusyError(body: Record<string, unknown>, status: number): boolean {
  if (status !== 429) return false
  const code = typeof body.code === 'string' ? body.code : ''
  return AI_BUSY_CODES.has(code)
}

function errorTextFromBody(body: Record<string, unknown>, status: number): string {
  if (isAiBusyError(body, status)) return AI_BUSY_MESSAGE
  const detail = body.detail
  if (typeof detail === 'string') return redactSecretsInClientMessage(detail)
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0]
    if (first && typeof first === 'object' && 'msg' in first && typeof (first as { msg: unknown }).msg === 'string') {
      return redactSecretsInClientMessage((first as { msg: string }).msg)
    }
  }
  if (typeof body.message === 'string') return redactSecretsInClientMessage(body.message)
  if (typeof body.code === 'string') return `${body.code} (HTTP ${status})`
  return `HTTP ${status}`
}

function asRagChunks(v: unknown): RagChunkRow[] {
  if (!Array.isArray(v)) return []
  return v.filter((x) => x && typeof x === 'object') as RagChunkRow[]
}

export function LiviaAssistantPanel({
  className = '',
  pacienteId,
  gestacaoId,
  consultaId,
  onDesktopPanelHide,
}: LiviaClinicalIds & { className?: string; onDesktopPanelHide?: () => void }) {
  const { token, profissional, authFetch } = useAuth()
  const emailBucket = (profissional?.email ?? '').trim()
  const clinicalScope = useMemo(
    () => clinicalScopeKey({ pacienteId, gestacaoId, consultaId }),
    [pacienteId, gestacaoId, consultaId],
  )
  const [inputText, setInputText] = useState(
    () => loadLiviaSessionFromStorage(emailBucket, clinicalScope)?.inputText ?? '',
  )
  const [busy, setBusy] = useState(false)
  const [thinkOn, setThinkOn] = useState(
    () => loadLiviaSessionFromStorage(emailBucket, clinicalScope)?.thinkOn ?? false,
  )
  const [llmProvider, setLlmProvider] = useState<LlmProvider>(
    () => loadLiviaSessionFromStorage(emailBucket, clinicalScope)?.llmProvider ?? 'ollama',
  )
  const [phase, setPhase] = useState<string>('')
  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    const s = loadLiviaSessionFromStorage(emailBucket, clinicalScope)
    return s?.messages ?? defaultWelcomeMessages()
  })
  const [suggestionChips, setSuggestionChips] = useState<string[]>(SUGESTOES)
  const [geminiConfigured, setGeminiConfigured] = useState(false)
  const [infraHealthLoaded, setInfraHealthLoaded] = useState(false)

  /** Painel ao vivo: trechos das cartilhas, raciocínio interno (se ativo) e texto da resposta */
  const [live, setLive] = useState<{
    chunks: RagChunkRow[]
    thinking: string
    content: string
    thinkEnabled: boolean
    note?: string
  } | null>(null)
  /** Feedback curto após copiar texto para a área de transferência */
  const [copyFlashId, setCopyFlashId] = useState<string | null>(null)
  /** Modal de fontes RAG (não persiste em sessionStorage). */
  const [ragModal, setRagModal] = useState<{ open: boolean; chunks: RagChunkRow[] } | null>(null)
  /** Banner transitório quando o backend devolve 429 por saturação da IA (LLM/clinical-ai). */
  const [busyNotice, setBusyNotice] = useState<string | null>(null)
  const busyNoticeTimerRef = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const showBusyNotice = useCallback((msg: string) => {
    if (busyNoticeTimerRef.current !== null) {
      window.clearTimeout(busyNoticeTimerRef.current)
    }
    setBusyNotice(msg)
    busyNoticeTimerRef.current = window.setTimeout(() => {
      setBusyNotice(null)
      busyNoticeTimerRef.current = null
    }, 6000)
  }, [])
  useEffect(() => {
    return () => {
      if (busyNoticeTimerRef.current !== null) {
        window.clearTimeout(busyNoticeTimerRef.current)
        busyNoticeTimerRef.current = null
      }
    }
  }, [])

  const copyPlainText = useCallback(async (text: string, flashId: string): Promise<boolean> => {
    const t = text.trim()
    if (!t) return false
    try {
      await navigator.clipboard.writeText(t)
      setCopyFlashId(flashId)
      window.setTimeout(() => setCopyFlashId((cur) => (cur === flashId ? null : cur)), 2000)
      return true
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = t
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        setCopyFlashId(flashId)
        window.setTimeout(() => setCopyFlashId((cur) => (cur === flashId ? null : cur)), 2000)
        return true
      } catch {
        return false
      }
    }
  }, [])

  const clearChat = useCallback(() => {
    if (busy) return
    setMessages(defaultWelcomeMessages())
    setInputText('')
    setLive(null)
    setPhase('')
    setRagModal(null)
  }, [busy])

  const cancelPendingQuestion = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const openRagModal = useCallback((chunks: RagChunkRow[]) => {
    if (chunks.length === 0) return
    setRagModal({ open: true, chunks })
  }, [])

  const closeRagModal = useCallback(() => {
    setRagModal(null)
  }, [])

  const lastAssistantIndex = useMemo(
    () => messages.reduce((acc, m, i) => (m.kind === 'assistant' ? i : acc), -1),
    [messages],
  )

  const lastUserIndex = useMemo(
    () => messages.reduce((acc, m, i) => (m.kind === 'user' ? i : acc), -1),
    [messages],
  )

  const isWelcomeMessage = useCallback(
    (i: number) => i === 0 && messages[0]?.kind === 'assistant' && !messages.some((m) => m.kind === 'user'),
    [messages],
  )

  const isLastAssistant = useCallback(
    (i: number) => i === lastAssistantIndex && !live,
    [lastAssistantIndex, live],
  )

  const isLastUser = useCallback(
    (i: number) => i === lastUserIndex && !live && !busy,
    [lastUserIndex, live, busy],
  )

  const prevTokenRef = useRef(token)
  useEffect(() => {
    persistLiviaSession(messages, inputText, thinkOn, llmProvider, emailBucket, clinicalScope)
  }, [messages, inputText, thinkOn, llmProvider, emailBucket, clinicalScope])

  useEffect(() => {
    const base = getApiBaseUrl()
    const url = `${base || ''}/health`
    const c = new AbortController()
    void (async () => {
      try {
        const res = await fetch(url, { signal: c.signal, headers: { Accept: 'application/json' } })
        if (!res.ok) {
          setGeminiConfigured(false)
          return
        }
        const j = (await res.json()) as { clinicalAiGeminiConfigured?: unknown }
        setGeminiConfigured(Boolean(j.clinicalAiGeminiConfigured))
      } catch {
        setGeminiConfigured(false)
      } finally {
        if (!c.signal.aborted) setInfraHealthLoaded(true)
      }
    })()
    return () => c.abort()
  }, [])

  useEffect(() => {
    if (!infraHealthLoaded) return
    if (!geminiConfigured && llmProvider === 'gemini') {
      setLlmProvider('ollama')
    }
  }, [infraHealthLoaded, geminiConfigured, llmProvider])

  useEffect(() => {
    const hasScope =
      Boolean(token.trim()) &&
      ((gestacaoId && isUuid(gestacaoId)) || (consultaId && isUuid(consultaId)))
    if (!hasScope) {
      setSuggestionChips(SUGESTOES)
      return
    }
    const ac = new AbortController()
    void (async () => {
      try {
        const res = await authFetch('/api/v1/clinical/livia/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ac.signal,
          body: JSON.stringify({
            ...(pacienteId && isUuid(pacienteId) ? { paciente_id: pacienteId } : {}),
            ...(gestacaoId && isUuid(gestacaoId) ? { gestacao_id: gestacaoId } : {}),
            ...(consultaId && isUuid(consultaId) ? { consulta_id: consultaId } : {}),
          }),
        })
        if (!res.ok) {
          setSuggestionChips(SUGESTOES)
          return
        }
        const j = (await res.json()) as { suggestions?: unknown }
        const list = Array.isArray(j.suggestions)
          ? j.suggestions.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
          : []
        setSuggestionChips(list.length > 0 ? list : SUGESTOES)
      } catch {
        if (!ac.signal.aborted) setSuggestionChips(SUGESTOES)
      }
    })()
    return () => ac.abort()
  }, [token, authFetch, pacienteId, gestacaoId, consultaId])

  useEffect(() => {
    const prev = prevTokenRef.current
    prevTokenRef.current = token
    if (prev.trim() && !token.trim()) {
      try {
        const keys = Object.keys(sessionStorage).filter((k) => k.startsWith(`${LIVIA_SESSION_KEY}::`))
        for (const k of keys) sessionStorage.removeItem(k)
      } catch {
        sessionStorage.removeItem(sessionKeyForUser(emailBucket, clinicalScope))
      }
      setMessages(defaultWelcomeMessages())
      setInputText('')
      setThinkOn(false)
      setLlmProvider('ollama')
      setLive(null)
      setPhase('')
    }
  }, [token, emailBucket, clinicalScope])

  const prevEmailBucketRef = useRef<string | null>(null)
  useEffect(() => {
    if (prevEmailBucketRef.current === null) {
      prevEmailBucketRef.current = emailBucket
      return
    }
    if (prevEmailBucketRef.current === emailBucket) return
    prevEmailBucketRef.current = emailBucket
    const s = loadLiviaSessionFromStorage(emailBucket, clinicalScope)
    setMessages(s?.messages ?? defaultWelcomeMessages())
    setInputText(s?.inputText ?? '')
    setThinkOn(s?.thinkOn ?? false)
    setLlmProvider(s?.llmProvider ?? 'ollama')
    setLive(null)
    setPhase('')
  }, [emailBucket, clinicalScope])

  const prevClinicalScopeRef = useRef<string | null>(null)
  useEffect(() => {
    if (prevClinicalScopeRef.current === null) {
      prevClinicalScopeRef.current = clinicalScope
      return
    }
    if (prevClinicalScopeRef.current === clinicalScope) return
    prevClinicalScopeRef.current = clinicalScope
    const s = loadLiviaSessionFromStorage(emailBucket, clinicalScope)
    setMessages(s?.messages ?? defaultWelcomeMessages())
    setInputText(s?.inputText ?? '')
    setThinkOn(s?.thinkOn ?? false)
    setLlmProvider(s?.llmProvider ?? 'ollama')
    setLive(null)
    setPhase('')
    setRagModal(null)
  }, [clinicalScope, emailBucket])

  const sendQuestion = useCallback(
    async (q: string, opts?: { historyFromMessages?: ChatMsg[] }) => {
      const trimmed = q.trim()
      if (!trimmed || busy) return
      if (!token.trim()) {
        setMessages((m) => [
          ...m,
          { kind: 'assistant', content: 'Faça login para usar o assistente.', chunks: [], thinkWasOn: false },
        ])
        return
      }

      const historyBase = opts?.historyFromMessages ?? messages
      const conversationHistory = deriveConversationHistory(historyBase)
      const ac = new AbortController()
      abortRef.current = ac
      let gotFinalResponse = false
      let wasCancelled = false

      setBusy(true)
      setPhase('Enviando pergunta…')
      setLive(null)
      setRagModal(null)
      setMessages((m) => [...m, { kind: 'user', text: trimmed }])

      let thinkingAcc = ''
      let contentAcc = ''
      let chunksAcc: RagChunkRow[] = []
      let thinkEff = false
      let streamNote = ''

      try {
        const streamBody: Record<string, unknown> = {
          question: trimmed,
          think: thinkOn,
          llm_provider: llmProvider,
        }
        if (conversationHistory.length > 0) {
          streamBody.conversation_history = conversationHistory
        }
        const canClinicalContext =
          (consultaId && isUuid(consultaId)) || (gestacaoId && isUuid(gestacaoId))
        if (canClinicalContext) {
          setPhase('Montando contexto clínico…')
          try {
            const ctxRes = await authFetch('/api/v1/clinical/livia/context', {
              method: 'POST',
              signal: ac.signal,
              body: JSON.stringify({
                question: trimmed,
                ...(pacienteId && isUuid(pacienteId) ? { paciente_id: pacienteId } : {}),
                ...(gestacaoId && isUuid(gestacaoId) ? { gestacao_id: gestacaoId } : {}),
                ...(consultaId && isUuid(consultaId) ? { consulta_id: consultaId } : {}),
              }),
            })
            if (ctxRes.ok) {
              const ctx = (await ctxRes.json()) as Record<string, unknown>
              const gc = ctx.gestacao_context
              const ecc = ctx.consulta_escriba_context
              if (typeof gc === 'string' && gc.trim()) streamBody.gestacao_context = gc
              if (typeof ecc === 'string' && ecc.trim()) streamBody.consulta_escriba_context = ecc
            } else {
              let ctxBody: Record<string, unknown> = {}
              try {
                ctxBody = (await ctxRes.json()) as Record<string, unknown>
              } catch {
                ctxBody = {}
              }
              if (isAiBusyError(ctxBody, ctxRes.status)) {
                showBusyNotice(AI_BUSY_MESSAGE)
                setPhase('IA ocupada — seguindo só com cartilhas de referência.')
              } else {
                setPhase('Prontuário indisponível; segue só com cartilhas de referência.')
              }
            }
          } catch (e) {
            if (isAbortError(e)) throw e
            setPhase('Falha ao carregar o prontuário; segue só com cartilhas de referência.')
          }
        }

        const res = await authFetch('/api/v1/dev/mcp/test/direct-question-stream', {
          method: 'POST',
          headers: { Accept: 'application/x-ndjson' },
          signal: ac.signal,
          body: JSON.stringify(streamBody),
        })

        if (!res.ok) {
          let body: Record<string, unknown> = {}
          try {
            body = (await res.json()) as Record<string, unknown>
          } catch {
            body = {}
          }
          const errMsg = errorTextFromBody(body, res.status)
          if (isAiBusyError(body, res.status)) {
            showBusyNotice(AI_BUSY_MESSAGE)
            setMessages((m) => [
              ...m,
              { kind: 'assistant', content: AI_BUSY_MESSAGE, chunks: [], thinkWasOn: thinkOn },
            ])
            gotFinalResponse = true
            return
          }
          setMessages((m) => [
            ...m,
            { kind: 'assistant', content: `Erro: ${errMsg}`, chunks: [], thinkWasOn: thinkOn },
          ])
          gotFinalResponse = true
          return
        }

        setLive({ chunks: [], thinking: '', content: '', thinkEnabled: thinkOn })
        setPhase('Consultando cartilhas e preparando a resposta…')

        await readNdjsonStream(
          res,
          (row) => {
            const t = row.type
            if (t === 'pipeline') {
              chunksAcc = asRagChunks(row.rag_chunks)
              thinkEff = Boolean(row.think_enabled)
              streamNote = typeof row.stream_note_pt === 'string' ? row.stream_note_pt : ''
              const rt = row.rag_timing_ms
              let tempoBusca = ''
              if (rt && typeof rt === 'object') {
                const o = rt as Record<string, unknown>
                const tot = typeof o.retrieve_total_ms === 'number' ? o.retrieve_total_ms : null
                if (tot != null && tot > 0) tempoBusca += ` · busca ~${Math.round(tot / 100) / 10}s`
              }
              const nTrechos = typeof row.n_rag_chunks === 'number' ? row.n_rag_chunks : chunksAcc.length
              setPhase(
                `${nTrechos} trecho(s) das cartilhas selecionado(s) · raciocínio aprofundado ${thinkEff ? 'ligado' : 'desligado'}${tempoBusca}`,
              )
              setLive({
                chunks: chunksAcc,
                thinking: thinkingAcc,
                content: contentAcc,
                thinkEnabled: thinkEff,
                note: streamNote,
              })
              return
            }
            if (t === 'ollama') {
              setPhase('Redigindo resposta…')
              if (typeof row.thinking === 'string' && row.thinking) thinkingAcc += row.thinking
              if (typeof row.content === 'string' && row.content) {
                const rep = row.content_replace === true
                if (rep) contentAcc = row.content
                else contentAcc += row.content
              }
              setLive({
                chunks: chunksAcc,
                thinking: thinkingAcc,
                content: contentAcc,
                thinkEnabled: thinkEff,
                note: streamNote,
              })
              return
            }
            if (t === 'error') {
              const dRaw = typeof row.detail === 'string' ? row.detail : 'Falha na geração da resposta'
              const d = redactSecretsInClientMessage(dRaw)
              setPhase(`Erro: ${d}`)
              setMessages((m) => [
                ...m,
                {
                  kind: 'assistant',
                  content: `Não foi possível concluir a resposta: ${d}`,
                  chunks: chunksAcc,
                  thinkWasOn: thinkEff,
                },
              ])
              setLive(null)
              gotFinalResponse = true
              return
            }
            if (t === 'done') {
              setPhase('Concluído')
              const emptyVisible =
                !contentAcc.trim() &&
                thinkEff &&
                thinkingAcc.trim().length > 400
                  ? 'Não foi possível exibir a resposta escrita: com **raciocínio aprofundado** ligado, o assistente dedicou todo o espaço à análise interna e não chegou a redigir o texto clínico. Desative **raciocínio aprofundado** no cabeçalho e envie a pergunta de novo, de preferência de forma mais objetiva.'
                  : !contentAcc.trim()
                    ? 'Não houve texto de resposta. Reformule a pergunta ou tente novamente.'
                    : contentAcc.trim()
              setMessages((m) => [
                ...m,
                {
                  kind: 'assistant',
                  content: emptyVisible,
                  chunks: chunksAcc,
                  thinking: thinkingAcc.trim() || undefined,
                  thinkWasOn: thinkEff,
                },
              ])
              setLive(null)
              gotFinalResponse = true
            }
          },
          undefined,
          ac.signal,
        )
      } catch (e) {
        if (isAbortError(e)) {
          wasCancelled = true
          setMessages((m) => {
            const last = m[m.length - 1]
            if (!gotFinalResponse && last?.kind === 'user' && last.text === trimmed) {
              return m.slice(0, -1)
            }
            return m
          })
          setInputText(trimmed)
          setLive(null)
          setPhase('')
          return
        }
        setMessages((m) => [
          ...m,
          {
            kind: 'assistant',
            content: 'Falha de comunicação com o assistente. Verifique a conexão e tente novamente.',
            chunks: [],
            thinkWasOn: thinkOn,
          },
        ])
        setPhase('')
        setLive(null)
      } finally {
        abortRef.current = null
        setBusy(false)
        if (!wasCancelled) setPhase('')
      }
    },
    [
      busy,
      thinkOn,
      llmProvider,
      token,
      authFetch,
      pacienteId,
      gestacaoId,
      consultaId,
      messages,
      showBusyNotice,
    ],
  )

  const handleRegenerate = useCallback(() => {
    if (busy) return
    const lastAsstIdx = messages.map((m) => m.kind).lastIndexOf('assistant')
    if (lastAsstIdx < 0) return
    let userIdx = -1
    for (let j = lastAsstIdx - 1; j >= 0; j--) {
      if (messages[j].kind === 'user') {
        userIdx = j
        break
      }
    }
    if (userIdx < 0) return
    const userMsg = messages[userIdx]
    if (userMsg.kind !== 'user') return
    const q = userMsg.text
    const historyBase = messages.slice(0, userIdx)
    setMessages(historyBase)
    void sendQuestion(q, { historyFromMessages: historyBase })
  }, [busy, messages, sendQuestion])

  const handleEditQuestion = useCallback(
    (userIdx: number) => {
      if (busy) return
      const msg = messages[userIdx]
      if (msg.kind !== 'user') return
      setMessages((m) => m.slice(0, userIdx))
      setInputText(msg.text)
      setLive(null)
      setPhase('')
      setRagModal(null)
      window.requestAnimationFrame(() => inputRef.current?.focus())
    },
    [busy, messages],
  )

  function handleSend(e: FormEvent) {
    e.preventDefault()
    const q = inputText.trim()
    if (!q || busy) return
    void sendQuestion(q).finally(() => setInputText(''))
  }

  return (
    <div className={`flex h-full flex-col ${className}`}>
      <div className="flex shrink-0 flex-col gap-2 border-b border-rose-100 bg-rose-50/30 px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-400 to-rose-600 text-white shadow-sm shadow-rose-200">
            ✨
          </div>
          <h2 className="min-w-0 flex-1 text-sm font-bold leading-snug text-slate-900 sm:text-base">
            Assistente Lívia
          </h2>
          {onDesktopPanelHide ? (
            <button
              type="button"
              onClick={onDesktopPanelHide}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/80 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 focus-visible:ring-offset-rose-50/50 lg:inline-flex"
              aria-label="Recolher painel do assistente"
              title="Recolher painel"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-rose-100/80 pt-2 sm:gap-2">
          <div
            className="flex shrink-0 items-center gap-0.5 rounded-full border border-slate-200 bg-white p-0.5"
            title="Modelo local (Ollama) ou Gemini na nuvem. RAG/embeddings continuam no Ollama. Gemini exige GEMINI_API_KEY no clinical-ai."
          >
            <button
              type="button"
              disabled={busy}
              onClick={() => setLlmProvider('ollama')}
              className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition-colors ${
                llmProvider === 'ollama'
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-rose-50 hover:text-rose-800'
              } disabled:cursor-not-allowed disabled:opacity-35`}
            >
              Local
            </button>
            <button
              type="button"
              disabled={busy || !geminiConfigured}
              onClick={() => setLlmProvider('gemini')}
              className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition-colors ${
                llmProvider === 'gemini'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-violet-50 hover:text-violet-900'
              } disabled:cursor-not-allowed disabled:opacity-35`}
              title={geminiConfigured ? 'Usar Gemini' : 'Gemini indisponível (sem chave no clinical-ai)'}
            >
              Gemini
            </button>
          </div>
          <span className="hidden h-4 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />
          <button
            type="button"
            disabled={busy}
            onClick={clearChat}
            title="Apaga o histórico desta conversa e volta à mensagem inicial"
            className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600 transition-colors hover:bg-rose-50 hover:border-rose-200 hover:text-rose-900 disabled:opacity-40"
          >
            Limpar chat
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setThinkOn((v) => !v)}
            title="Análise passo a passo antes da resposta (mais lento). Desligue para resposta direta."
            className={`min-w-0 max-w-full shrink rounded-full border px-2.5 py-1 text-[10px] font-black uppercase leading-tight tracking-wider transition-colors sm:text-center ${
              thinkOn
                ? 'border-rose-500 bg-rose-600 text-white shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            } disabled:opacity-40`}
          >
            Raciocínio aprofundado
          </button>
        </div>
      </div>

      {busyNotice ? (
        <div
          role="status"
          aria-live="polite"
          className="shrink-0 border-b border-amber-300 bg-amber-100 px-4 py-2 text-[12px] font-bold text-amber-950 sm:px-6"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-600 align-middle" />
              {busyNotice}
            </span>
            <button
              type="button"
              onClick={() => setBusyNotice(null)}
              className="rounded-md border border-amber-400/80 bg-white/70 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-900 hover:bg-white"
              aria-label="Fechar aviso"
            >
              Fechar
            </button>
          </div>
        </div>
      ) : null}

      {busy && phase ? (
        <div className="shrink-0 border-b border-rose-100 bg-amber-50/80 px-4 py-2 text-[11px] font-bold text-amber-950 sm:px-6">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500 align-middle mr-2" />
          {phase}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col bg-gradient-to-b from-transparent to-rose-50/20">
        <div className="mt-auto space-y-3">
          {messages.map((b, i) =>
            b.kind === 'user' ? (
              <div key={i} className="max-w-[95%] ml-auto">
                <div className="rounded-2xl rounded-tr-sm bg-rose-600 px-4 py-3 text-sm leading-relaxed text-white shadow-sm">
                  <p className="whitespace-pre-wrap">{b.text}</p>
                </div>
                {isLastUser(i) ? (
                  <LiviaUserMessageActions
                    onEdit={() => handleEditQuestion(i)}
                    editDisabled={busy}
                  />
                ) : null}
              </div>
            ) : (
              <div key={i} className="max-w-[95%] mr-auto">
                <div className="rounded-2xl rounded-tl-sm border border-slate-100 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 shadow-sm">
                  <AssistantMarkdown markdown={b.content} className="text-[15px] font-medium" />
                  {b.thinkWasOn && b.thinking ? (
                    <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
                      <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-slate-500">
                        Raciocínio interno do assistente (opcional)
                      </summary>
                      <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-slate-600">
                        {b.thinking}
                      </pre>
                    </details>
                  ) : null}
                </div>
                <LiviaAssistantMessageActions
                  content={b.content}
                  onCopy={() => void copyPlainText(b.content, `asst-${i}`)}
                  onShowSources={
                    isLastAssistant(i) && b.chunks.length > 0
                      ? () => openRagModal(b.chunks)
                      : undefined
                  }
                  onRegenerate={
                    isLastAssistant(i) && !isWelcomeMessage(i) ? handleRegenerate : undefined
                  }
                  copyFlashActive={copyFlashId === `asst-${i}`}
                  showRegenerate={isLastAssistant(i) && !isWelcomeMessage(i)}
                  showSources={isLastAssistant(i) && b.chunks.length > 0}
                  regenerateDisabled={busy}
                />
              </div>
            ),
          )}

          {live ? (
            <div className="max-w-[95%] mr-auto">
              <div className="rounded-2xl border-2 border-dashed border-rose-200 bg-rose-50/40 p-3 text-sm shadow-inner">
                <p className="text-[10px] font-black uppercase tracking-widest text-rose-700">Em elaboração…</p>
                {live.note ? (
                  <p className="mt-1 text-[10px] text-amber-800/90" title={live.note}>
                    {live.thinkEnabled
                      ? 'Com raciocínio aprofundado ativado, o assistente pode demorar mais antes de exibir o texto clínico.'
                      : 'Elaborando resposta com base nas cartilhas e no prontuário, quando disponível.'}
                  </p>
                ) : null}
                <LiviaRagLivePreview chunks={live.chunks} />
                <div className="mt-2 max-h-[min(28rem,50vh)] overflow-y-auto rounded-lg border border-rose-100/80 bg-white/90 p-2">
                  {live.content.trim() ? (
                    <AssistantMarkdown markdown={live.content} className="text-sm font-semibold text-slate-900" />
                  ) : (
                    <span className="text-sm font-semibold text-slate-400">…</span>
                  )}
                </div>
                {live.thinkEnabled ? (
                  <div className="mt-2">
                    <p className="text-[10px] font-bold uppercase text-slate-500">Raciocínio interno (em elaboração)</p>
                    <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-slate-900/90 p-2 font-mono text-[10px] text-slate-100">
                      {live.thinking || '…'}
                    </pre>
                  </div>
                ) : null}
              </div>
              <LiviaAssistantMessageActions
                content={live.content}
                onCopy={() => void copyPlainText(live.content, 'live')}
                onShowSources={
                  live.chunks.length > 0 ? () => openRagModal(live.chunks) : undefined
                }
                copyFlashActive={copyFlashId === 'live'}
                showRegenerate={false}
                regenerateDisabled
                showSources={live.chunks.length > 0}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 space-y-3 border-t border-rose-100 bg-white p-4">
        <LiviaSuggestionCollapsible
          chips={suggestionChips}
          busy={busy}
          onSelect={(s) => setInputText(s)}
        />
        <form className="relative" onSubmit={(e) => void handleSend(e)}>
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Pergunte algo à Lívia…"
            disabled={busy}
            className="block w-full rounded-2xl border-0 py-3 pl-4 pr-12 text-slate-900 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-rose-500 disabled:bg-slate-50 sm:text-sm sm:leading-6"
          />
          {busy ? (
            <button
              type="button"
              onClick={cancelPendingQuestion}
              className="absolute right-2 top-2 rounded-xl bg-slate-700 p-1.5 text-white shadow-sm hover:bg-slate-800"
              aria-label="Parar geração"
              title="Parar"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path fillRule="evenodd" d="M5.25 4.5A1.75 1.75 0 007 2.75h6a1.75 1.75 0 011.75 1.75v10.5A1.75 1.75 0 0113 16.25H7A1.75 1.75 0 005.25 14.5V4.5z" clipRule="evenodd" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="absolute right-2 top-2 rounded-xl bg-rose-500 p-1.5 text-white shadow-sm hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
              title="Enviar"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
              </svg>
            </button>
          )}
        </form>
      </div>

      <LiviaRagSourcesModal
        open={ragModal?.open ?? false}
        onClose={closeRagModal}
        chunks={ragModal?.chunks ?? []}
      />
    </div>
  )
}
