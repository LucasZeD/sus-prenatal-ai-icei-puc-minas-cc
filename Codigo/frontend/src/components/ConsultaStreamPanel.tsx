import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.js'
import { getWsBaseUrl } from '../lib/apiBase.js'
import {
  openConsultationSocket,
  type ConsultaClinicalFieldsPatch,
  type ConsultationServerMessage,
  type ConsultationSocketHandle,
  type DiarizedSegment,
  type StreamHistoryItem,
} from '../lib/consultationSocket.js'
import {
  cutSttMediaRecorderSegment,
  pickWebmMimeType,
  startSttMediaRecorder,
  type SttRecorderSession,
} from '../lib/sttMediaRecorder.js'
import { EscribaStreamDiagnostics } from './escriba/EscribaStreamDiagnostics.js'
import type { RecordingPhase } from './escriba/EscribaRecordingBar.js'
import { MicLevelIcon } from './escriba/MicLevelIcon.js'
import { AssistantMarkdown } from './AssistantMarkdown.js'

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STT_CHUNK_MIN_MS = Number.parseInt(import.meta.env.VITE_STT_CHUNK_MIN_MS ?? '2500', 10)

type AudioInputDevice = { deviceId: string; label: string }

async function readJsonBody(res: Response): Promise<Record<string, unknown>> {
  const raw = await res.text()
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return { message: raw.slice(0, 400) }
  }
}

function apiErrorMessage(body: Record<string, unknown>, status: number): string {
  const msg = typeof body.message === 'string' ? body.message : ''
  const code = typeof body.code === 'string' ? body.code : ''
  if (msg && code) return `${msg} (${code})`
  if (msg) return msg
  if (code) return code
  return `HTTP ${status}`
}

type StreamStatus = 'desconectado' | 'conectando' | 'conectado' | 'erro'

export type ConsultaStreamPanelProps = {
  /** `embedded`: worklist + cadastro + stream (área técnica na agenda). `streamOnly`: só captura WS/mic. */
  variant?: 'embedded' | 'streamOnly'
  /** Em `streamOnly`, UUID da consulta vindo da rota. */
  initialConsultaId?: string
  /** Espelha STT/IA para a aba de revisão da escriba. */
  onStreamTexts?: (stt: string, ia: string) => void
  /** Pré-preenchimento estruturado da ficha (RF04). */
  onFormPatch?: (patch: Partial<ConsultaClinicalFieldsPatch>) => void
  /** Snapshot do prontuário em edição (rascunho não salvo) para o agente de sugestões. */
  prontuarioDraft?: Partial<ConsultaClinicalFieldsPatch>
}

type PacienteRow = {
  id: string
  nome_mascarado: string
  cpf_ultimos4?: string | null
  cartao_sus_ultimos4?: string | null
}

type GestacaoRow = { id: string; paciente_id: string; tipo_risco?: string }

type UnidadeRow = { id: string; nome: string }

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

function todayIsoDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function ConsultaStreamPanel({
  variant = 'embedded',
  initialConsultaId = '',
  onStreamTexts,
  onFormPatch,
  prontuarioDraft,
}: ConsultaStreamPanelProps) {
  const wsBase = getWsBaseUrl()
  const { token, authFetch } = useAuth()

  const [consultaId, setConsultaId] = useState(() => (variant === 'streamOnly' ? initialConsultaId : ''))
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('desconectado')
  const [streamError, setStreamError] = useState<string | null>(null)
  const [sttText, setSttText] = useState('')
  const [iaText, setIaText] = useState('')
  // Blocos de fala rotulados (diarização). Rótulo editável pelo profissional (human-in-the-loop).
  const [diarized, setDiarized] = useState<DiarizedSegment[]>([])
  // Disponibilidade (serviço no deploy) e opt-in da sessão (toggle do profissional).
  const [diarizationAvailable, setDiarizationAvailable] = useState(false)
  const [diarizationEnabled, setDiarizationEnabled] = useState(false)
  const [history, setHistory] = useState<StreamHistoryItem[]>([])
  const [logLines, setLogLines] = useState<string[]>([])

  const [micDevices, setMicDevices] = useState<AudioInputDevice[]>([])
  const [micDeviceId, setMicDeviceId] = useState<string>('')
  const [micBusy, setMicBusy] = useState(false)

  const [worklist, setWorklist] = useState<WorklistRow[]>([])
  const [unidades, setUnidades] = useState<UnidadeRow[]>([])
  const [pacientes, setPacientes] = useState<PacienteRow[]>([])
  const [gestacoes, setGestacoes] = useState<GestacaoRow[]>([])
  const [selPacienteId, setSelPacienteId] = useState('')
  const [selGestacaoId, setSelGestacaoId] = useState('')
  const [selUnidadeId, setSelUnidadeId] = useState('')
  const [dataConsulta, setDataConsulta] = useState(todayIsoDate)
  const [novoPacienteNome, setNovoPacienteNome] = useState('')
  const [novoPacienteCpf, setNovoPacienteCpf] = useState('')
  const [novoPacienteCartaoSus, setNovoPacienteCartaoSus] = useState('')
  const [clinicalBusy, setClinicalBusy] = useState(false)
  const [clinicalNote, setClinicalNote] = useState<string | null>(null)
  const [verificacaoMsg, setVerificacaoMsg] = useState<string | null>(null)

  const socketRef = useRef<ConsultationSocketHandle | null>(null)
  const sttSessionRef = useRef<SttRecorderSession | null>(null)
  const recorderMimeRef = useRef('')
  const sttRotateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const micPreviewRef = useRef<MediaStream | null>(null)
  const [recordingPhase, setRecordingPhase] = useState<RecordingPhase>('idle')
  const [micStream, setMicStream] = useState<MediaStream | null>(null)
  const [micPreviewStream, setMicPreviewStream] = useState<MediaStream | null>(null)
  const [micMonitorActive, setMicMonitorActive] = useState(false)
  const [audioChunksSent, setAudioChunksSent] = useState(0)
  const [audioBytesSent, setAudioBytesSent] = useState(0)
  const [lastSttAt, setLastSttAt] = useState<number | null>(null)
  const [sttLatencyMs, setSttLatencyMs] = useState<number | null>(null)
  const sttRequestStarted = useRef<number>(0)

  const isStreamOnly = variant === 'streamOnly'
  const showDevMetrics = import.meta.env.DEV || import.meta.env.VITE_DEV_STREAM_METRICS === '1'
  const showEscribaDiagnostics = isStreamOnly && showDevMetrics
  const levelStream = micStream ?? micPreviewStream
  const micCapturing = recordingPhase === 'recording' || recordingPhase === 'paused'

  useEffect(() => {
    if (variant === 'streamOnly' && initialConsultaId && initialConsultaId !== consultaId) {
      setConsultaId(initialConsultaId)
    }
  }, [variant, initialConsultaId, consultaId])

  useEffect(() => {
    onStreamTexts?.(sttText, iaText)
  }, [sttText, iaText, onStreamTexts])

  useEffect(() => {
    if (!isStreamOnly || streamStatus !== 'conectado') return
    const timer = window.setTimeout(() => {
      socketRef.current?.sendProntuarioDraft(prontuarioDraft ?? {})
    }, 400)
    return () => window.clearTimeout(timer)
  }, [isStreamOnly, streamStatus, prontuarioDraft])

  const pushLog = useCallback((line: string) => {
    setLogLines((prev) => [...prev.slice(-80), `${new Date().toISOString().slice(11, 19)} ${line}`])
  }, [])

  const refreshMicDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setMicDevices([])
      return
    }
    try {
      const list = await navigator.mediaDevices.enumerateDevices()
      const mics = list
        .filter((d) => d.kind === 'audioinput')
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label || `Microfone ${idx + 1}`,
        }))
      setMicDevices(mics)
      setMicDeviceId((curr) => (curr && mics.some((m) => m.deviceId === curr) ? curr : ''))
    } catch {
      setMicDevices([])
    }
  }, [])

  const requestMicPermissionAndRefresh = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return
    setMicBusy(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
      await refreshMicDevices()
      pushLog('Permissão de microfone OK; lista atualizada.')
      setStreamError(null)
    } catch {
      setStreamError('Permissão de microfone negada ou indisponível.')
    } finally {
      setMicBusy(false)
    }
  }, [pushLog, refreshMicDevices])

  useEffect(() => {
    void refreshMicDevices()
  }, [refreshMicDevices])

  useEffect(() => {
    if (isStreamOnly && token) {
      void requestMicPermissionAndRefresh()
    }
  }, [isStreamOnly, token, requestMicPermissionAndRefresh])

  const loadWorklist = useCallback(async () => {
    if (!token) return
    try {
      const res = await authFetch('/api/v1/consultas/disponiveis-stream')
      if (!res.ok) {
        setClinicalNote(`Worklist: HTTP ${res.status}`)
        return
      }
      const json = (await res.json()) as WorklistRow[]
      setWorklist(Array.isArray(json) ? json : [])
      setClinicalNote(null)
    } catch {
      setClinicalNote('Falha ao carregar consultas disponíveis.')
    }
  }, [authFetch, token])

  const loadUnidades = useCallback(async () => {
    if (!token) return
    try {
      const res = await authFetch('/api/v1/unidades')
      if (!res.ok) return
      const json = (await res.json()) as UnidadeRow[]
      if (Array.isArray(json) && json.length > 0) {
        setUnidades(json)
        setSelUnidadeId((u) => u || json[0].id)
      }
    } catch {
      /* noop */
    }
  }, [authFetch, token])

  const loadPacientes = useCallback(async () => {
    if (!token) return
    try {
      const res = await authFetch('/api/v1/pacientes')
      if (!res.ok) return
      const json = (await res.json()) as PacienteRow[]
      setPacientes(Array.isArray(json) ? json : [])
    } catch {
      /* noop */
    }
  }, [authFetch, token])

  const loadGestacoes = useCallback(
    async (pacienteId: string) => {
      if (!token || !pacienteId) {
        setGestacoes([])
        return
      }
      try {
        const res = await authFetch(`/api/v1/gestacoes?paciente_id=${encodeURIComponent(pacienteId)}`)
        if (!res.ok) {
          setGestacoes([])
          return
        }
        const json = (await res.json()) as GestacaoRow[]
        setGestacoes(Array.isArray(json) ? json : [])
        setSelGestacaoId('')
      } catch {
        setGestacoes([])
      }
    },
    [authFetch, token],
  )

  useEffect(() => {
    if (!token || variant === 'streamOnly') {
      setWorklist([])
      if (!token) {
        setUnidades([])
        setPacientes([])
        setGestacoes([])
      }
      return
    }
    void loadUnidades()
    void loadPacientes()
    void loadWorklist()
  }, [token, variant, loadUnidades, loadPacientes, loadWorklist])

  useEffect(() => {
    if (selPacienteId) {
      void loadGestacoes(selPacienteId)
    } else {
      setGestacoes([])
      setSelGestacaoId('')
    }
  }, [selPacienteId, loadGestacoes])

  const disconnect = useCallback(() => {
    if (sttRotateTimerRef.current) {
      clearInterval(sttRotateTimerRef.current)
      sttRotateTimerRef.current = null
    }
    if (sttSessionRef.current?.recorder.state !== 'inactive') {
      try {
        sttSessionRef.current?.recorder.stop()
      } catch {
        /* noop */
      }
    }
    sttSessionRef.current = null
    micStreamRef.current?.getTracks().forEach((t) => t.stop())
    micStreamRef.current = null
    setMicStream(null)
    micPreviewRef.current?.getTracks().forEach((t) => t.stop())
    micPreviewRef.current = null
    setMicPreviewStream(null)
    setMicMonitorActive(false)
    setRecordingPhase('idle')
    socketRef.current?.close()
    socketRef.current = null
    setStreamStatus('desconectado')
    pushLog('WebSocket fechado.')
  }, [pushLog])

  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  const onServerEvent = useCallback(
    (msg: ConsultationServerMessage) => {
      switch (msg.type) {
        case 'ready':
          pushLog(`ready consulta=${msg.consultaId} diarizacao=${msg.diarizationAvailable ? 'disponível' : 'indisponível'}`)
          setStreamStatus('conectado')
          setStreamError(null)
          setDiarizationAvailable(msg.diarizationAvailable)
          setDiarizationEnabled(false)
          socketRef.current?.sendDiarizationState(false)
          break
        case 'history':
          setHistory(msg.eventos)
          pushLog(`history: ${msg.eventos.length} evento(s)`)
          break
        case 'stt_partial':
          setSttText(msg.text)
          setLastSttAt(Date.now())
          if (showDevMetrics && sttRequestStarted.current > 0) {
            setSttLatencyMs(Date.now() - sttRequestStarted.current)
            sttRequestStarted.current = 0
          }
          break
        case 'stt_diarized':
          setDiarized((prev) => [...prev, ...msg.segments])
          pushLog(`stt_diarized: ${msg.segments.length} bloco(s)`)
          break
        case 'ia_reset':
          setIaText('')
          break
        case 'ia_token':
          setIaText((t) => t + msg.token)
          break
        case 'ia_done':
          pushLog('ia_done')
          break
        case 'form_patch':
          onFormPatch?.(msg.patch)
          pushLog(`form_patch: ${Object.keys(msg.patch).join(', ') || '(vazio)'}`)
          break
        case 'error':
          setStreamError(msg.message)
          pushLog(`error: ${msg.message}`)
          break
        default:
          break
      }
    },
    [pushLog, showDevMetrics, onFormPatch],
  )

  const connect = useCallback(() => {
    if (!token.trim()) {
      setStreamError('Faça login para obter o token.')
      return
    }
    const id = consultaId.trim()
    if (!uuidRe.test(id)) {
      setStreamError('Informe um UUID de consulta válido.')
      return
    }

    disconnect()
    setStreamStatus('conectando')
    setStreamError(null)
    setSttText('')
    setIaText('')
    setDiarized([])
    setDiarizationAvailable(false)
    setDiarizationEnabled(false)
    setHistory([])
    setAudioChunksSent(0)
    setAudioBytesSent(0)
    setLastSttAt(null)
    setSttLatencyMs(null)
    pushLog(`Conectando… ${wsBase}/ws/consultation/…`)

    const handle = openConsultationSocket(id, token, {
      onOpen: () => pushLog('socket open'),
      onClose: (ev: CloseEvent) => {
        pushLog(`socket close code=${ev.code}`)
        setStreamStatus((s) => (s === 'conectando' ? 'erro' : 'desconectado'))
        socketRef.current = null
      },
      onSocketError: () => {
        setStreamError('Erro de transporte no WebSocket.')
        setStreamStatus('erro')
      },
      onEvent: onServerEvent,
    })
    socketRef.current = handle
  }, [consultaId, disconnect, onServerEvent, pushLog, token, wsBase])

  useEffect(() => {
    if (!isStreamOnly || !token || !uuidRe.test(consultaId.trim())) return
    if (streamStatus === 'desconectado') {
      connect()
    }
  }, [isStreamOnly, token, consultaId, streamStatus, connect])

  const sendVad = useCallback(() => {
    socketRef.current?.sendVadPause()
    pushLog('vad_pause enviado')
  }, [pushLog])

  const setDiarizedRole = useCallback((index: number, role: string) => {
    setDiarized((prev) => prev.map((seg, i) => (i === index ? { ...seg, role } : seg)))
  }, [])

  const toggleDiarization = useCallback(
    (enabled: boolean) => {
      setDiarizationEnabled(enabled)
      socketRef.current?.sendDiarizationState(enabled)
      pushLog(`diarização ${enabled ? 'ligada' : 'desligada'}`)
    },
    [pushLog],
  )

  const renderDiarizationToggle = () => (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/50 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span aria-hidden>🗣️</span>
        <span className="text-xs font-bold text-indigo-900">Diarização (quem falou)</span>
        {!diarizationAvailable ? (
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">
            indisponível neste servidor
          </span>
        ) : null}
      </div>
      <label className="inline-flex cursor-pointer items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-700">
          {diarizationEnabled && diarizationAvailable ? 'Ligada' : 'Desligada'}
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={diarizationEnabled && diarizationAvailable}
          disabled={!diarizationAvailable}
          onChange={(e) => toggleDiarization(e.target.checked)}
          className="h-5 w-5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-40"
          aria-label="Ligar ou desligar a diarização de locutores"
        />
      </label>
    </div>
  )

  const roleBadgeClass = (role: string): string => {
    if (role === 'profissional') return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    if (role === 'gestante') return 'bg-brand-pink/15 text-brand-pink border-brand-pink/30'
    return 'bg-slate-100 text-slate-600 border-slate-200'
  }

  const roleDisplayLabel = (seg: DiarizedSegment): string => {
    if (seg.role === 'profissional') return 'Profissional'
    if (seg.role === 'gestante') return 'Gestante'
    return seg.speaker || 'Desconhecido'
  }

  const showDiarizedTranscription =
    diarizationEnabled && diarizationAvailable && diarized.length > 0

  const renderTranscriptionContent = () => {
    if (showDiarizedTranscription) {
      return (
        <ul className="space-y-2">
          {diarized.map((seg, i) => (
            <li key={`${seg.speaker}-${i}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${roleBadgeClass(seg.role)}`}>
                {roleDisplayLabel(seg)}:
              </span>
              <select
                value={['profissional', 'gestante'].includes(seg.role) ? seg.role : 'desconhecido'}
                onChange={(e) => setDiarizedRole(i, e.target.value)}
                className="shrink-0 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600"
                aria-label={`Papel do locutor ${seg.speaker}`}
              >
                <option value="profissional">Profissional</option>
                <option value="gestante">Gestante</option>
                <option value="desconhecido">Desconhecido</option>
              </select>
              <span className="min-w-0 flex-1 text-slate-800">{seg.text}</span>
            </li>
          ))}
        </ul>
      )
    }
    return (
      <p className="whitespace-pre-wrap text-slate-800">
        {sttText || 'Aguardando fala…'}
      </p>
    )
  }

  const renderCompactDiarizationToggle = () => (
    <button
      type="button"
      disabled={!diarizationAvailable}
      onClick={() => toggleDiarization(!diarizationEnabled)}
      className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40 ${
        diarizationEnabled && diarizationAvailable
          ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
          : 'border-slate-200 bg-slate-50 text-slate-600'
      }`}
      aria-pressed={diarizationEnabled && diarizationAvailable}
      aria-label="Ligar ou desligar diarização"
    >
      {diarizationEnabled && diarizationAvailable ? 'Diarização ON' : 'Diarização'}
    </button>
  )

  const escribaControlBtnClass =
    'rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-40'

  const renderListenButton = () => {
    const disabled = streamStatus !== 'conectado'
    if (recordingPhase === 'idle') {
      return (
        <button
          type="button"
          disabled={disabled}
          onClick={() => void startMic({ deviceId: micDeviceId || undefined })}
          className={`${escribaControlBtnClass} border-slate-200 bg-white text-slate-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-900`}
        >
          Clique para ouvir
        </button>
      )
    }
    if (recordingPhase === 'recording') {
      return (
        <button
          type="button"
          disabled={disabled}
          onClick={pauseMic}
          className={`${escribaControlBtnClass} border-rose-400 bg-rose-50 text-rose-800 hover:bg-rose-100`}
          aria-pressed
        >
          Ouvindo
        </button>
      )
    }
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={resumeMic}
        className={`${escribaControlBtnClass} border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100`}
      >
        Pausado
      </button>
    )
  }

  const renderDiarizedPanel = () =>
    diarized.length > 0 ? (
      <section className="rounded-3xl border border-indigo-200 bg-indigo-50/40 p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-indigo-900 flex items-center gap-2">
            <span aria-hidden>🗣️</span> Por locutor (diarização)
          </h3>
          <span className="text-[10px] font-medium text-indigo-700/80">Rótulo editável</span>
        </div>
        <p className="mt-1 text-[10px] text-indigo-700/80">
          Atribuição automática (heurística). Ajuste o papel se a identificação estiver trocada.
        </p>
        <ul className="mt-3 space-y-2">
          {diarized.map((seg, i) => (
            <li
              key={`${seg.speaker}-${i}`}
              className="flex flex-col gap-1.5 rounded-2xl border border-indigo-100 bg-white p-3 sm:flex-row sm:items-start sm:gap-3"
            >
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${roleBadgeClass(seg.role)}`}
                  title={seg.speaker}
                >
                  {seg.speaker}
                </span>
                <select
                  value={['profissional', 'gestante'].includes(seg.role) ? seg.role : 'desconhecido'}
                  onChange={(e) => setDiarizedRole(i, e.target.value)}
                  className="rounded-lg border border-indigo-200 bg-white px-2 py-1 text-xs font-semibold text-indigo-900"
                  aria-label={`Papel do locutor ${seg.speaker}`}
                >
                  <option value="profissional">Profissional</option>
                  <option value="gestante">Gestante</option>
                  <option value="desconhecido">Desconhecido</option>
                </select>
              </div>
              <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{seg.text}</p>
            </li>
          ))}
        </ul>
      </section>
    ) : null

  const getAudioConstraints = useCallback(
    (opts?: { deviceId?: string; forceBrowserPrompt?: boolean }): MediaStreamConstraints => {
      const deviceId = opts?.deviceId?.trim() || ''
      const forceBrowserPrompt = opts?.forceBrowserPrompt === true
      const devicePart: MediaTrackConstraints =
        !forceBrowserPrompt && deviceId ? { deviceId: { exact: deviceId } } : {}
      return {
        audio: {
          ...devicePart,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      }
    },
    [],
  )

  const stopMicPreview = useCallback(() => {
    micPreviewRef.current?.getTracks().forEach((t) => t.stop())
    micPreviewRef.current = null
    setMicPreviewStream(null)
    setMicMonitorActive(false)
  }, [])

  const startMicMonitor = useCallback(async () => {
    if (recordingPhase !== 'idle') return
    stopMicPreview()
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        getAudioConstraints({ deviceId: micDeviceId || undefined }),
      )
      micPreviewRef.current = stream
      setMicPreviewStream(stream)
      setMicMonitorActive(true)
      pushLog('Monitor de microfone ativo (sem gravar).')
      setStreamError(null)
    } catch {
      setStreamError('Permissão de microfone negada ou indisponível.')
    }
  }, [getAudioConstraints, micDeviceId, pushLog, recordingPhase, stopMicPreview])

  useEffect(() => {
    if (!isStreamOnly || streamStatus !== 'conectado') return
    if (recordingPhase !== 'idle' || micMonitorActive || micStream) return
    void startMicMonitor()
  }, [isStreamOnly, streamStatus, recordingPhase, micMonitorActive, micStream, startMicMonitor])

  const clearSttRotateTimer = useCallback(() => {
    if (sttRotateTimerRef.current) {
      clearInterval(sttRotateTimerRef.current)
      sttRotateTimerRef.current = null
    }
  }, [])

  const sendMicBlob = useCallback((blob: Blob) => {
    if (!blob.size) return
    socketRef.current?.sendBinary(blob)
    setAudioChunksSent((n) => n + 1)
    setAudioBytesSent((n) => n + blob.size)
  }, [])

  const flushMicSegment = useCallback(
    async (restart: boolean) => {
      const stream = micStreamRef.current
      const mime = recorderMimeRef.current
      if (!stream || !mime || !sttSessionRef.current) return
      try {
        const cut = await cutSttMediaRecorderSegment(stream, mime, sttSessionRef.current, restart)
        sttSessionRef.current = cut.session
        if (cut.blob?.size) sendMicBlob(cut.blob)
      } catch {
        pushLog('Falha ao cortar segmento WebM para STT.')
      }
    },
    [pushLog, sendMicBlob],
  )

  const startMic = useCallback(async (opts?: { deviceId?: string; forceBrowserPrompt?: boolean }) => {
    if (!socketRef.current || socketRef.current.readyState() !== WebSocket.OPEN) {
      setStreamError('Conecte o stream antes de capturar áudio.')
      return
    }
    try {
      stopMicPreview()
      const stream = await navigator.mediaDevices.getUserMedia(getAudioConstraints(opts))
      micStreamRef.current = stream
      setMicStream(stream)
      setAudioChunksSent(0)
      setAudioBytesSent(0)
      socketRef.current?.sendMicState(true)
      const mime = pickWebmMimeType()
      if (!mime) {
        setStreamError('MediaRecorder WebM indisponível neste navegador.')
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      recorderMimeRef.current = mime
      clearSttRotateTimer()
      sttSessionRef.current = startSttMediaRecorder(stream, mime)
      sttRotateTimerRef.current = setInterval(() => {
        void flushMicSegment(true)
      }, STT_CHUNK_MIN_MS)
      setRecordingPhase('recording')
      sttRequestStarted.current = Date.now()
      pushLog(`Gravação iniciada (${mime}); segmento ${STT_CHUNK_MIN_MS} ms (stop-and-send).`)
    } catch {
      setStreamError('Permissão de microfone negada ou indisponível.')
    }
  }, [clearSttRotateTimer, flushMicSegment, getAudioConstraints, pushLog, stopMicPreview])

  const pauseMic = useCallback(() => {
    if (recordingPhase !== 'recording') return
    clearSttRotateTimer()
    setRecordingPhase('paused')
    void flushMicSegment(false)
    pushLog('Gravação pausada.')
  }, [clearSttRotateTimer, flushMicSegment, pushLog, recordingPhase])

  const resumeMic = useCallback(() => {
    const stream = micStreamRef.current
    const mime = recorderMimeRef.current
    if (recordingPhase !== 'paused' || !stream || !mime) return
    sttSessionRef.current = startSttMediaRecorder(stream, mime)
    clearSttRotateTimer()
    sttRotateTimerRef.current = setInterval(() => {
      void flushMicSegment(true)
    }, STT_CHUNK_MIN_MS)
    setRecordingPhase('recording')
    pushLog('Gravação retomada.')
  }, [clearSttRotateTimer, flushMicSegment, pushLog, recordingPhase])

  const stopMic = useCallback(() => {
    clearSttRotateTimer()
    void flushMicSegment(false)
    micStreamRef.current?.getTracks().forEach((t) => t.stop())
    micStreamRef.current = null
    setMicStream(null)
    socketRef.current?.sendMicState(false)
    sttSessionRef.current = null
    setRecordingPhase('idle')
    pushLog('Gravação parada.')
  }, [clearSttRotateTimer, flushMicSegment, pushLog])

  const verificarIdentificadores = useCallback(async () => {
    const cpf = novoPacienteCpf.trim()
    const cartao = novoPacienteCartaoSus.trim()
    if (!token || (!cpf && !cartao)) {
      setVerificacaoMsg('Informe CPF e/ou Cartão SUS para verificar duplicidade.')
      return
    }
    setVerificacaoMsg(null)
    try {
      const res = await authFetch('/api/v1/pacientes/verificar-identificadores', {
        method: 'POST',
        body: JSON.stringify({ ...(cpf ? { cpf } : {}), ...(cartao ? { cartao_sus: cartao } : {}) }),
      })
      const body = await readJsonBody(res)
      if (!res.ok) {
        setVerificacaoMsg(apiErrorMessage(body, res.status))
        return
      }
      const parts: string[] = []
      if (body.cpf_em_uso === true) {
        parts.push(`CPF já cadastrado (paciente_id ${String(body.paciente_id_cpf ?? '?')})`)
      }
      if (body.cartao_em_uso === true) {
        parts.push(`Cartão SUS já cadastrado (paciente_id ${String(body.paciente_id_cartao ?? '?')})`)
      }
      setVerificacaoMsg(parts.length ? parts.join(' · ') : 'Nenhum conflito: CPF/Cartão ainda não vistos na base.')
    } catch {
      setVerificacaoMsg('Falha ao verificar identificadores.')
    }
  }, [authFetch, novoPacienteCartaoSus, novoPacienteCpf, token])

  const criarPaciente = useCallback(async () => {
    const nome = novoPacienteNome.trim()
    const cpf = novoPacienteCpf.trim()
    const cartao = novoPacienteCartaoSus.trim()
    if (!token || !nome) {
      setClinicalNote('Informe um nome mascarado para o novo paciente.')
      return
    }
    if (!cpf && !cartao) {
      setClinicalNote('Informe CPF e/ou Cartão SUS (só os últimos 4 dígitos ficam gravados).')
      return
    }
    setClinicalBusy(true)
    setClinicalNote(null)
    try {
      const res = await authFetch('/api/v1/pacientes', {
        method: 'POST',
        body: JSON.stringify({
          nome_mascarado: nome,
          ...(cpf ? { cpf } : {}),
          ...(cartao ? { cartao_sus: cartao } : {}),
        }),
      })
      const body = await readJsonBody(res)
      if (!res.ok) {
        setClinicalNote(apiErrorMessage(body, res.status))
        return
      }
      const id = typeof body.id === 'string' ? body.id : ''
      const nomeResp = typeof body.nome_mascarado === 'string' ? body.nome_mascarado : nome
      if (!id) {
        setClinicalNote('Resposta inesperada do servidor (sem id do paciente).')
        return
      }
      setNovoPacienteNome('')
      setNovoPacienteCpf('')
      setNovoPacienteCartaoSus('')
      await loadPacientes()
      setSelPacienteId(id)
      setClinicalNote(`Paciente criado: ${nomeResp} (${id}).`)
      pushLog(`paciente criado id=${id}`)
    } catch {
      setClinicalNote('Falha ao criar paciente.')
    } finally {
      setClinicalBusy(false)
    }
  }, [authFetch, loadPacientes, novoPacienteCartaoSus, novoPacienteCpf, novoPacienteNome, pushLog, token])

  const criarGestacaoVazia = useCallback(async () => {
    if (!token || !selPacienteId) {
      setClinicalNote('Selecione um paciente antes de criar a gestação.')
      return
    }
    setClinicalBusy(true)
    setClinicalNote(null)
    try {
      const res = await authFetch('/api/v1/gestacoes', {
        method: 'POST',
        body: JSON.stringify({ paciente_id: selPacienteId }),
      })
      const body = await readJsonBody(res)
      if (!res.ok) {
        setClinicalNote(apiErrorMessage(body, res.status))
        return
      }
      const gid = typeof body.id === 'string' ? body.id : ''
      if (!gid) {
        setClinicalNote('Resposta inesperada do servidor (sem id da gestação).')
        return
      }
      await loadGestacoes(selPacienteId)
      setSelGestacaoId(gid)
      setClinicalNote(`Gestação (perfil) criada: ${gid}`)
      pushLog(`gestacao criada id=${gid}`)
    } catch {
      setClinicalNote('Falha ao criar gestação.')
    } finally {
      setClinicalBusy(false)
    }
  }, [authFetch, loadGestacoes, selPacienteId, pushLog, token])

  const criarConsulta = useCallback(async () => {
    if (!token || !selGestacaoId || !selUnidadeId) {
      setClinicalNote('Selecione gestação e unidade.')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataConsulta)) {
      setClinicalNote('Data da consulta inválida (use AAAA-MM-DD).')
      return
    }
    setClinicalBusy(true)
    setClinicalNote(null)
    try {
      const res = await authFetch('/api/v1/consultas', {
        method: 'POST',
        body: JSON.stringify({
          gestacao_id: selGestacaoId,
          unidade_id: selUnidadeId,
          data: dataConsulta,
        }),
      })
      const body = await readJsonBody(res)
      if (!res.ok) {
        setClinicalNote(apiErrorMessage(body, res.status))
        return
      }
      const cid = typeof body.id === 'string' ? body.id : ''
      if (!cid) {
        setClinicalNote(apiErrorMessage(body, res.status))
        return
      }
      setConsultaId(cid)
      await loadWorklist()
      setClinicalNote(`Consulta criada. UUID (campo id): ${cid} — já preenchido abaixo para o stream.`)
      pushLog(`consulta criada id=${cid}`)
    } catch {
      setClinicalNote('Falha ao criar consulta.')
    } finally {
      setClinicalBusy(false)
    }
  }, [authFetch, dataConsulta, loadWorklist, selGestacaoId, selUnidadeId, pushLog, token])

  const showClinicalChrome = token && variant !== 'streamOnly'

  return (
    <section
      className={
        isStreamOnly
          ? 'space-y-4'
          : 'rounded-lg border border-slate-200 bg-white p-6 shadow-sm'
      }
    >
      {!isStreamOnly ? (
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Área técnica — stream e cadastro rápido
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            UUID da consulta no <code className="rounded bg-slate-100 px-1">POST /api/v1/consultas</code> ou na
            worklist. WebSocket: <span className="font-mono text-xs">{wsBase}/ws/consultation/:id</span>.
          </p>
        </div>
      </div>
      ) : null}

      <div className={isStreamOnly ? 'space-y-4' : 'mt-6 grid gap-6 border-t border-slate-100 pt-6'}>
        {variant !== 'streamOnly' && !token ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            Sessão necessária para carregar dados clínicos.{' '}
            <Link className="font-medium underline" to="/login">
              Ir para login
            </Link>
            .
          </div>
        ) : null}

        {showClinicalChrome && clinicalNote ? (
          <div className="rounded-md border border-amber-200 bg-amber-50/90 px-3 py-2 text-sm text-amber-950">
            {clinicalNote}
          </div>
        ) : null}

        {showClinicalChrome ? (
          <div className="rounded-md border border-rose-100 bg-rose-50/50 p-4">
            <h3 className="text-sm font-semibold text-slate-800">Consultas disponíveis (worklist)</h3>
            <p className="mt-1 text-xs text-slate-600">
              Consultas com status diferente de <code className="rounded bg-white px-1">CONFIRMADA</code>. Clique em
              &quot;Usar&quot; para copiar o UUID no campo do stream.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={clinicalBusy}
                onClick={() => void loadWorklist()}
                className="rounded-md border border-rose-200 bg-white px-3 py-1.5 text-sm text-rose-900 hover:bg-rose-50 disabled:opacity-50"
              >
                Atualizar lista
              </button>
            </div>
            <div className="mt-3 max-h-56 overflow-auto rounded-md border border-rose-100 bg-white">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-rose-100/80 text-rose-950">
                  <tr>
                    <th className="px-2 py-2">Data</th>
                    <th className="px-2 py-2">Paciente / id</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">UUID consulta</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {worklist.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-2 py-3 text-slate-500">
                        Nenhuma consulta aberta. Crie paciente → gestação → consulta na seção seguinte.
                      </td>
                    </tr>
                  ) : null}
                  {worklist.map((w) => {
                    const idLine = [
                      w.paciente.cpf_ultimos4 ? `CPF …${w.paciente.cpf_ultimos4}` : null,
                      w.paciente.cartao_sus_ultimos4 ? `SUS …${w.paciente.cartao_sus_ultimos4}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                    return (
                    <tr key={w.id} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 whitespace-nowrap">{w.data}</td>
                      <td className="px-2 py-1.5">
                        <div className="font-medium">{w.paciente.nome_mascarado}</div>
                        {idLine ? <div className="text-[10px] text-slate-500">{idLine}</div> : null}
                      </td>
                      <td className="px-2 py-1.5">{w.status}</td>
                      <td className="px-2 py-1.5 font-mono text-[10px] text-slate-700">{w.id}</td>
                      <td className="px-2 py-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setConsultaId(w.id)
                            pushLog(`UUID selecionado: ${w.id}`)
                          }}
                          className="rounded bg-rose-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-rose-500"
                        >
                          Usar
                        </button>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {showClinicalChrome ? (
          <div className="rounded-md border border-slate-200 bg-slate-50/80 p-4">
            <h3 className="text-sm font-semibold text-slate-800">Criar perfil (gestação vazia) e nova consulta</h3>
            <p className="mt-1 text-xs text-slate-600">
              A gestação liga-se ao paciente (a gestante). CPF/Cartão ficam como hash em{' '}
              <code className="rounded bg-white px-1">paciente_ids</code> (mesmo pepper do backend) para evitar
              homônimos; só os últimos 4 dígitos ficam em <code className="rounded bg-white px-1">paciente</code> para
              leitura rápida na agenda.
            </p>
            <div className="mt-3 grid max-w-2xl gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2 flex flex-wrap items-end gap-2">
                <div className="min-w-[12rem] flex-1">
                  <label className="text-xs font-medium text-slate-500">Novo paciente (nome mascarado)</label>
                  <input
                    value={novoPacienteNome}
                    onChange={(e) => setNovoPacienteNome(e.target.value)}
                    placeholder="ex.: Maria S***"
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="min-w-[10rem] flex-1">
                  <label className="text-xs font-medium text-slate-500">CPF (completo na digitação; só ***4 gravado)</label>
                  <input
                    value={novoPacienteCpf}
                    onChange={(e) => setNovoPacienteCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    autoComplete="off"
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="min-w-[10rem] flex-1">
                  <label className="text-xs font-medium text-slate-500">Cartão SUS (completo; só ***4 gravado)</label>
                  <input
                    value={novoPacienteCartaoSus}
                    onChange={(e) => setNovoPacienteCartaoSus(e.target.value)}
                    placeholder="15+ dígitos"
                    autoComplete="off"
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <button
                  type="button"
                  disabled={clinicalBusy}
                  onClick={() => void verificarIdentificadores()}
                  className="rounded-md border border-slate-400 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                >
                  Verificar CPF/SUS
                </button>
                <button
                  type="button"
                  disabled={clinicalBusy}
                  onClick={() => void criarPaciente()}
                  className="rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  Criar paciente
                </button>
              </div>
              {verificacaoMsg ? <p className="text-sm text-rose-900">{verificacaoMsg}</p> : null}
              <div>
                <label className="text-xs font-medium text-slate-500">Paciente</label>
                <select
                  value={selPacienteId}
                  onChange={(e) => setSelPacienteId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value="">— selecione —</option>
                  {pacientes.map((p) => {
                    const idf = [p.cpf_ultimos4 ? `CPF …${p.cpf_ultimos4}` : null, p.cartao_sus_ultimos4 ? `SUS …${p.cartao_sus_ultimos4}` : null]
                      .filter(Boolean)
                      .join(' · ')
                    return (
                      <option key={p.id} value={p.id}>
                        {p.nome_mascarado}
                        {idf ? ` (${idf})` : ''}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label className="text-xs font-medium text-slate-500">Gestação (perfil)</label>
                  <select
                    value={selGestacaoId}
                    onChange={(e) => setSelGestacaoId(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">— selecione ou crie —</option>
                    {gestacoes.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.id.slice(0, 8)}… (risco {g.tipo_risco ?? '—'})
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  disabled={clinicalBusy || !selPacienteId}
                  onClick={() => void criarGestacaoVazia()}
                  className="shrink-0 rounded-md border border-slate-400 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                >
                  + Gestação vazia
                </button>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Unidade</label>
                <select
                  value={selUnidadeId}
                  onChange={(e) => setSelUnidadeId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value="">— sem unidade no banco —</option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Data da consulta</label>
                <input
                  type="date"
                  value={dataConsulta}
                  onChange={(e) => setDataConsulta(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  disabled={clinicalBusy || !selGestacaoId || !selUnidadeId}
                  onClick={() => void criarConsulta()}
                  className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  Criar consulta (sessão) e preencher UUID
                </button>
              </div>
            </div>
          </div>
        ) : null}


        {isStreamOnly ? (
          <div className="space-y-4">
            <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <MicLevelIcon stream={levelStream} />
                <h2 className="text-lg font-black text-brand-navy">Escriba</h2>
                {streamStatus === 'conectado' ? (
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700">
                    Em atendimento
                  </span>
                ) : null}
                <Link
                  to="/dashboard"
                  className="ml-auto shrink-0 text-xs font-semibold text-slate-500 hover:text-brand-navy hover:underline"
                  aria-label="Voltar à agenda"
                  title="Voltar à agenda"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                </Link>
              </div>
              {streamStatus === 'conectado' ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  {renderListenButton()}
                  {renderCompactDiarizationToggle()}
                  <select
                    value={micDeviceId}
                    onChange={(e) => setMicDeviceId(e.target.value)}
                    className="min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-semibold text-slate-700 sm:max-w-[14rem] sm:flex-none"
                    aria-label="Selecionar microfone"
                  >
                    <option value="">Selecionar microfone</option>
                    {micDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  <select
                    value={micDeviceId}
                    onChange={(e) => setMicDeviceId(e.target.value)}
                    className="min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-semibold text-slate-700 sm:max-w-[14rem]"
                    aria-label="Selecionar microfone"
                  >
                    <option value="">Selecionar microfone</option>
                    {micDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </header>

            {streamError ? <p className="text-sm font-bold text-rose-700">{streamError}</p> : null}

            <div className="grid gap-4 md:grid-cols-2">
              <section className="flex min-h-[10rem] max-h-[14rem] flex-col overflow-hidden rounded-2xl border border-brand-navy/15 bg-slate-50 p-4">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-brand-navy">Transcrição</h3>
                <div className="flex-1 overflow-y-auto text-sm leading-relaxed">{renderTranscriptionContent()}</div>
              </section>
              <section className="flex min-h-[10rem] max-h-[14rem] flex-col overflow-hidden rounded-2xl border border-brand-pink/30 bg-brand-pink/5 p-4">
                <h3 className="mb-1 text-xs font-bold uppercase tracking-widest text-brand-pink">Sugestões Lívia</h3>
                <p className="mb-2 text-[10px] text-brand-pink/80">Rascunho — não salva automaticamente.</p>
                <div className="flex-1 overflow-y-auto text-sm leading-relaxed">
                  {iaText.trim() ? (
                    <AssistantMarkdown markdown={iaText} className="text-brand-navy" />
                  ) : (
                    <p className="text-brand-navy">
                      Insight após um trecho com conteúdo clínico (queixa, sinais, conduta).
                    </p>
                  )}
                </div>
              </section>
            </div>

            {showEscribaDiagnostics ? (
              <details className="rounded-2xl border border-slate-200 bg-white">
                <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-600">Avançado</summary>
                <div className="border-t border-slate-100 p-4">
                  <EscribaStreamDiagnostics
                    streamStatus={streamStatus}
                    recordingPhase={recordingPhase}
                    micMonitorActive={micMonitorActive}
                    micCapturing={micCapturing}
                    audioChunksSent={audioChunksSent}
                    audioBytesSent={audioBytesSent}
                    lastSttAt={lastSttAt}
                    sttText={sttText}
                    sttLatencyMs={sttLatencyMs}
                    streamError={streamError}
                    logLines={logLines}
                    wsUrl={`${wsBase}/ws/consultation/${consultaId.trim() || '…'}`}
                    onReconnect={connect}
                    onDisconnect={disconnect}
                    onFinishSegment={sendVad}
                    defaultOpen={import.meta.env.DEV}
                  />
                </div>
              </details>
            ) : (
              <details className="rounded-2xl border border-slate-200 bg-white">
                <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-600">Avançado</summary>
                <div className="border-t border-slate-100 space-y-3 p-4 text-xs text-slate-600">
                  <p className="leading-relaxed text-slate-500">
                    A sugestão da IA dispara automaticamente após pausa na fala ou fim de frase.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={streamStatus !== 'conectado' || recordingPhase === 'idle'}
                      onClick={sendVad}
                      className="rounded-lg border border-brand-navy/20 px-2 py-1 font-bold text-brand-navy hover:bg-slate-50 disabled:opacity-50"
                    >
                      Finalizar trecho (forçar)
                    </button>
                    <button
                      type="button"
                      disabled={micBusy}
                      onClick={() => void requestMicPermissionAndRefresh()}
                      className="rounded-lg border border-slate-200 px-2 py-1 font-bold hover:bg-slate-50 disabled:opacity-50"
                    >
                      Atualizar mics
                    </button>
                    {micMonitorActive ? (
                      <button
                        type="button"
                        disabled={micCapturing}
                        onClick={stopMicPreview}
                        className="rounded-lg border border-slate-200 px-2 py-1 font-bold hover:bg-slate-50 disabled:opacity-50"
                      >
                        Parar monitor
                      </button>
                    ) : null}
                    <button type="button" onClick={disconnect} className="rounded-lg border px-2 py-1 font-mono">
                      Desconectar
                    </button>
                  </div>
                  {showDevMetrics ? (
                    <p className="font-mono text-[10px] text-slate-500">
                      WS: {streamStatus}
                      {audioChunksSent > 0 ? ` · ${audioChunksSent} chunks · ${(audioBytesSent / 1024).toFixed(1)} KB` : ''}
                      {sttLatencyMs != null ? ` · STT ~${sttLatencyMs} ms` : ''}
                    </p>
                  ) : null}
                  <pre className="max-h-24 overflow-auto rounded bg-slate-900 p-2 font-mono text-slate-100">
                    {logLines.slice(-15).join('\n') || '—'}
                  </pre>
                </div>
              </details>
            )}
          </div>
        ) : (
        <>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎙️</span>
              <h3 className="text-sm font-black text-slate-800">Stream</h3>
              <span className="text-xs text-slate-500">
                status <span className="font-bold text-slate-800">{streamStatus}</span>
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={connect}
                disabled={!token || streamStatus === 'conectando'}
                className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-black text-white shadow-sm hover:bg-rose-500 disabled:opacity-50"
                title="Conectar WebSocket"
              >
                🔌 {streamStatus === 'conectando' ? 'Conectando…' : 'Conectar'}
              </button>
              <button
                type="button"
                onClick={disconnect}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-black text-slate-800 shadow-sm hover:bg-slate-50"
                title="Desconectar"
              >
                ⛔ Desconectar
              </button>
              <button
                type="button"
                onClick={sendVad}
                className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-black text-amber-950 shadow-sm hover:bg-amber-100"
                title="Pausa VAD"
              >
                ⏸️ VAD
              </button>
              <button
                type="button"
                onClick={() => void startMic({ deviceId: micDeviceId || undefined, forceBrowserPrompt: !micDeviceId })}
                className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-950 shadow-sm hover:bg-emerald-100"
                title="Iniciar microfone"
              >
                🎙️ Iniciar
              </button>
              <button
                type="button"
                onClick={stopMic}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-black text-slate-800 shadow-sm hover:bg-slate-50"
                title="Parar microfone"
              >
                ⏹️ Parar
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">UUID</label>
                <input
                  placeholder="550e8400-e29b-41d4-a716-446655440000"
                  value={consultaId}
                  onChange={(e) => setConsultaId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm bg-white shadow-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => void requestMicPermissionAndRefresh()}
                disabled={micBusy}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-black text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                title="Permitir/atualizar microfones"
              >
                🔄 Atualizar mics
              </button>
            </div>

            <div className="grid gap-2 md:grid-cols-[1fr_auto] items-end">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Microfone</label>
                <select
                  value={micDeviceId}
                  onChange={(e) => setMicDeviceId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white shadow-sm"
                  title="Selecionar microfone"
                >
                  <option value="">Automático (navegador)</option>
                  {micDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMicDeviceId('')
                  void startMic({ forceBrowserPrompt: true })
                }}
                className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm font-black text-emerald-800 shadow-sm hover:bg-emerald-50"
                title="Usar escolha do navegador"
              >
                🧭 Usar navegador
              </button>
            </div>

            {streamError ? <p className="text-sm font-bold text-rose-700">{streamError}</p> : null}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border border-slate-100 bg-slate-50 p-4">
            <h4 className="text-xs font-semibold uppercase text-slate-500">Histórico persistido</h4>
            <ul className="mt-2 max-h-40 overflow-auto font-mono text-xs text-slate-800">
              {history.length === 0 ? <li className="text-slate-500">(vazio até o servidor enviar history)</li> : null}
              {history.map((h, i) => (
                <li key={`${h.createdAt}-${h.tipo}-${i}`} className="border-b border-slate-200 py-1">
                  <span className="text-slate-500">{h.tipo}</span> · {h.payload.slice(0, 120)}
                  {h.payload.length > 120 ? '…' : ''}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border border-slate-100 bg-slate-50 p-4">
            <h4 className="text-xs font-semibold uppercase text-slate-500">STT parcial (efêmero)</h4>
            <p className="mt-2 min-h-[3rem] whitespace-pre-wrap text-sm text-slate-900">{sttText || '—'}</p>
            <h4 className="mt-4 text-xs font-semibold uppercase text-slate-500">Insight IA (stream)</h4>
            <div className="mt-2 max-h-40 overflow-auto">
              {iaText.trim() ? (
                <AssistantMarkdown markdown={iaText} className="text-sm text-rose-950" />
              ) : (
                <p className="text-sm text-rose-950">—</p>
              )}
            </div>
          </div>
        </div>

        {streamStatus === 'conectado' ? renderDiarizationToggle() : null}
        {renderDiarizedPanel()}

        <div>
          <h4 className="text-xs font-semibold uppercase text-slate-500">Log</h4>
          <pre className="mt-2 max-h-36 overflow-auto rounded-md bg-slate-900 p-3 font-mono text-[11px] text-slate-100">
            {logLines.length ? logLines.join('\n') : '—'}
          </pre>
        </div>
        </>
        )}

      </div>
    </section>
  )
}
