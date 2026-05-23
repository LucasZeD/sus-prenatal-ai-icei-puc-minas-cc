import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext.js'
import {
  cutSttMediaRecorderSegment,
  pickWebmMimeType,
  startSttMediaRecorder,
  type SttRecorderSession,
} from '../../lib/sttMediaRecorder.js'
import { AudioLevelMeter } from '../escriba/AudioLevelMeter.js'

type AudioInputDevice = { deviceId: string; label: string }
type RecordingPhase = 'idle' | 'recording' | 'paused'
type SpeakerBlock = { id: number; label: string; text: string }
type SttResponse = {
  text: string
  segments: Array<{ start: number; end: number; text: string }>
  speakers: SpeakerBlock[]
  latencyMs: number
}

type SttErrorPayload = {
  code?: string
  message?: string
  debug?: {
    reason?: string
    httpStatus?: number | null
    upstreamError?: string | null
    upstreamBody?: string | null
    whisperUrl?: string | null
    audioBytes?: number
    uploadFilename?: string
    hint?: string | null
  }
}

type DebugLogEntry = {
  at: string
  level: 'info' | 'ok' | 'error'
  message: string
  detail?: string
}

type DevSttLabPanelProps = {
  whisperConfigured?: boolean
  whisperReachable?: boolean
}

const STT_CHUNK_MIN_MS = Number.parseInt(import.meta.env.VITE_STT_CHUNK_MIN_MS ?? '2500', 10)

function nowLabel(): string {
  return new Date().toISOString().slice(11, 19)
}

function formatDebugDetail(payload: SttErrorPayload): string {
  const d = payload.debug
  if (!d) return payload.message ?? ''
  const lines = [
    d.reason ? `reason: ${d.reason}` : null,
    d.httpStatus != null ? `httpStatus: ${d.httpStatus}` : null,
    d.upstreamError ? `upstreamError: ${d.upstreamError}` : null,
    d.audioBytes != null ? `audioBytes: ${d.audioBytes}` : null,
    d.uploadFilename ? `file: ${d.uploadFilename}` : null,
    d.whisperUrl ? `whisperUrl: ${d.whisperUrl}` : null,
    d.hint ? `hint: ${d.hint}` : null,
    d.upstreamBody ? `body: ${d.upstreamBody.slice(0, 400)}` : null,
  ].filter(Boolean)
  return lines.join('\n')
}

export function DevSttLabPanel({
  whisperConfigured = false,
  whisperReachable = false,
}: DevSttLabPanelProps) {
  const { token, authFetch } = useAuth()
  const [micDevices, setMicDevices] = useState<AudioInputDevice[]>([])
  const [micDeviceId, setMicDeviceId] = useState('')
  const [recordingPhase, setRecordingPhase] = useState<RecordingPhase>('idle')
  const [micBusy, setMicBusy] = useState(false)
  const [micMonitorActive, setMicMonitorActive] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [sttNow, setSttNow] = useState('')
  const [sttTranscript, setSttTranscript] = useState('')
  const [speakerSnapshots, setSpeakerSnapshots] = useState<Array<{ at: string; speakers: SpeakerBlock[] }>>([])
  const [chunkCount, setChunkCount] = useState(0)
  const [chunkBytes, setChunkBytes] = useState(0)
  const [lastChunkBytes, setLastChunkBytes] = useState(0)
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null)
  const [lastSentAt, setLastSentAt] = useState<string | null>(null)
  const [lastDebug, setLastDebug] = useState<SttErrorPayload['debug'] | null>(null)
  const [debugLog, setDebugLog] = useState<DebugLogEntry[]>([])

  const sttSessionRef = useRef<SttRecorderSession | null>(null)
  const recorderMimeRef = useRef('')
  const recordingPhaseRef = useRef<RecordingPhase>('idle')
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const previewStreamRef = useRef<MediaStream | null>(null)
  const [micStream, setMicStream] = useState<MediaStream | null>(null)
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null)
  const sendingRef = useRef(false)
  const pendingFlushRef = useRef(false)
  const levelStream = micStream ?? previewStream

  useEffect(() => {
    recordingPhaseRef.current = recordingPhase
  }, [recordingPhase])

  const pushLog = useCallback((level: DebugLogEntry['level'], message: string, detail?: string) => {
    setDebugLog((prev) =>
      [{ at: nowLabel(), level, message, detail }, ...prev].slice(0, 24),
    )
  }, [])

  const clearFlushInterval = useCallback(() => {
    if (flushIntervalRef.current) {
      clearInterval(flushIntervalRef.current)
      flushIntervalRef.current = null
    }
  }, [])

  const uploadSttBlob = useCallback(
    async (chunkBlob: Blob) => {
      const chunkSize = chunkBlob.size
      if (!token || chunkSize === 0) return

      sendingRef.current = true
      const sentAt = nowLabel()
      setLastSentAt(sentAt)
      setLastChunkBytes(chunkSize)
      setChunkCount((n) => n + 1)
      setChunkBytes((n) => n + chunkSize)
      const uploadName = `stt-lab-${Date.now()}.webm`
      pushLog('info', `POST chunk ${(chunkSize / 1024).toFixed(1)} KB`, uploadName)
      try {
        const form = new FormData()
        form.append('file', chunkBlob, uploadName)
        const res = await authFetch('/api/v1/dev/stt/transcribe', { method: 'POST', body: form })
        const bodyText = await res.text()
        if (!res.ok) {
          let msg = `Falha no STT (HTTP ${res.status}).`
          let parsed: SttErrorPayload = {}
          try {
            parsed = JSON.parse(bodyText) as SttErrorPayload
            if (typeof parsed.message === 'string' && parsed.message.trim()) msg = parsed.message
          } catch {
            if (bodyText.trim()) msg = bodyText.slice(0, 240)
          }
          setLastDebug(parsed.debug ?? null)
          setStreamError(msg)
          pushLog('error', msg, formatDebugDetail(parsed) || bodyText.slice(0, 400))
          return
        }
        const body = JSON.parse(bodyText) as SttResponse
        setStreamError(null)
        setLastDebug(null)
        setLastLatencyMs(typeof body.latencyMs === 'number' ? body.latencyMs : null)
        if (typeof body.text === 'string' && body.text.trim()) {
          setSttNow(body.text)
          setSttTranscript((prev) => (prev ? `${prev}\n${body.text}` : body.text))
          pushLog('ok', `STT OK (${body.latencyMs ?? '?'} ms)`, body.text.slice(0, 120))
        } else {
          pushLog('error', 'Resposta OK sem texto', bodyText.slice(0, 200))
        }
        if (Array.isArray(body.speakers) && body.speakers.length) {
          setSpeakerSnapshots((prev) => [{ at: sentAt, speakers: body.speakers }, ...prev].slice(0, 8))
        }
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : 'Falha de rede'
        setStreamError(`Falha de rede ao enviar chunk para o STT: ${errMsg}`)
        pushLog('error', 'Falha de rede', errMsg)
      } finally {
        sendingRef.current = false
        if (pendingFlushRef.current) {
          pendingFlushRef.current = false
          void flushSttSegment(true)
        }
      }
    },
    [authFetch, pushLog, token],
  )

  const flushSttSegment = useCallback(
    async (force = false) => {
      if (sendingRef.current) {
        if (force) pendingFlushRef.current = true
        return
      }
      const stream = micStreamRef.current
      const mime = recorderMimeRef.current
      if (!stream || !mime || !sttSessionRef.current) return

      const restart = recordingPhaseRef.current === 'recording'
      let chunkBlob: Blob | null = null
      try {
        const cut = await cutSttMediaRecorderSegment(stream, mime, sttSessionRef.current, restart)
        sttSessionRef.current = cut.session
        chunkBlob = cut.blob
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : 'cut failed'
        pushLog('error', 'Falha ao fechar segmento WebM', errMsg)
        return
      }

      if (!chunkBlob || chunkBlob.size === 0) {
        if (force && !restart) clearFlushInterval()
        return
      }
      await uploadSttBlob(chunkBlob)
    },
    [clearFlushInterval, pushLog, uploadSttBlob],
  )

  const getAudioConstraints = useCallback((deviceId?: string): MediaStreamConstraints => {
    const trimmed = deviceId?.trim() ?? ''
    return {
      audio: {
        ...(trimmed ? { deviceId: { exact: trimmed } } : {}),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    }
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
        .map((d, idx) => ({ deviceId: d.deviceId, label: d.label || `Microfone ${idx + 1}` }))
      setMicDevices(mics)
      setMicDeviceId((curr) => (curr && mics.some((m) => m.deviceId === curr) ? curr : ''))
    } catch {
      setMicDevices([])
    }
  }, [])

  const stopMonitor = useCallback(() => {
    previewStreamRef.current?.getTracks().forEach((t) => t.stop())
    previewStreamRef.current = null
    setPreviewStream(null)
    setMicMonitorActive(false)
  }, [])

  const startMonitor = useCallback(async () => {
    stopMonitor()
    try {
      const stream = await navigator.mediaDevices.getUserMedia(getAudioConstraints(micDeviceId || undefined))
      previewStreamRef.current = stream
      setPreviewStream(stream)
      setMicMonitorActive(true)
      setStreamError(null)
    } catch {
      setStreamError('Permissao de microfone negada ou indisponivel.')
    }
  }, [getAudioConstraints, micDeviceId, stopMonitor])

  const stopRecording = useCallback(() => {
    clearFlushInterval()
    recordingPhaseRef.current = 'idle'
    setRecordingPhase('idle')
    void (async () => {
      const stream = micStreamRef.current
      const mime = recorderMimeRef.current
      if (stream && mime && sttSessionRef.current) {
        try {
          const cut = await cutSttMediaRecorderSegment(stream, mime, sttSessionRef.current, false)
          sttSessionRef.current = null
          if (cut.blob?.size) await uploadSttBlob(cut.blob)
        } catch {
          /* ignore */
        }
      }
      micStreamRef.current?.getTracks().forEach((t) => t.stop())
      micStreamRef.current = null
      setMicStream(null)
    })()
  }, [clearFlushInterval, uploadSttBlob])

  const startRecording = useCallback(async () => {
    setMicBusy(true)
    try {
      stopMonitor()
      const stream = await navigator.mediaDevices.getUserMedia(getAudioConstraints(micDeviceId || undefined))
      const mime = pickWebmMimeType()
      if (!mime) {
        stream.getTracks().forEach((t) => t.stop())
        setStreamError('MediaRecorder WebM indisponivel neste navegador.')
        return
      }
      recorderMimeRef.current = mime
      sttSessionRef.current = startSttMediaRecorder(stream, mime)
      micStreamRef.current = stream
      setMicStream(stream)
      recordingPhaseRef.current = 'recording'
      setRecordingPhase('recording')
      clearFlushInterval()
      flushIntervalRef.current = setInterval(() => {
        void flushSttSegment()
      }, STT_CHUNK_MIN_MS)
      setStreamError(null)
    } catch {
      setStreamError('Permissao de microfone negada ou indisponivel.')
    } finally {
      setMicBusy(false)
    }
  }, [clearFlushInterval, flushSttSegment, getAudioConstraints, micDeviceId, stopMonitor])

  const pauseRecording = useCallback(() => {
    if (recordingPhaseRef.current !== 'recording') return
    clearFlushInterval()
    recordingPhaseRef.current = 'paused'
    setRecordingPhase('paused')
    void flushSttSegment(true)
  }, [clearFlushInterval, flushSttSegment])

  const resumeRecording = useCallback(() => {
    const stream = micStreamRef.current
    const mime = recorderMimeRef.current
    if (recordingPhaseRef.current !== 'paused' || !stream || !mime) return
    sttSessionRef.current = startSttMediaRecorder(stream, mime)
    recordingPhaseRef.current = 'recording'
    setRecordingPhase('recording')
    clearFlushInterval()
    flushIntervalRef.current = setInterval(() => {
      void flushSttSegment()
    }, STT_CHUNK_MIN_MS)
  }, [clearFlushInterval, flushSttSegment])

  useEffect(() => {
    void refreshMicDevices()
  }, [refreshMicDevices])

  useEffect(() => {
    return () => {
      stopRecording()
      stopMonitor()
    }
  }, [stopMonitor, stopRecording])

  const status = useMemo(() => {
    if (recordingPhase === 'recording') return 'Ouvindo e transcrevendo'
    if (recordingPhase === 'paused') return 'Pausado'
    return 'Pronto para iniciar'
  }, [recordingPhase])

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Lab STT isolado (faster-whisper)</h2>
          <p className="mt-1 text-xs font-medium text-slate-500">
            Teste de STT em tempo real sem UUID, sem consulta e sem historico persistido.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              whisperReachable
                ? 'bg-emerald-100 text-emerald-800'
                : whisperConfigured
                  ? 'bg-amber-100 text-amber-900'
                  : 'bg-rose-100 text-rose-800'
            }`}
          >
            STT {whisperReachable ? 'online' : whisperConfigured ? 'config / offline' : 'nao configurado'}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{status}</span>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Debug STT</p>
        {streamError ? (
          <p className="mt-2 text-sm font-bold text-rose-700">{streamError}</p>
        ) : (
          <p className="mt-2 text-xs text-slate-500">Sem erro na ultima requisicao.</p>
        )}
        {lastDebug ? (
          <pre className="mt-2 max-h-32 overflow-auto rounded-lg border border-rose-100 bg-white p-2 font-mono text-[10px] text-rose-950">
            {JSON.stringify(lastDebug, null, 2)}
          </pre>
        ) : null}
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-bold text-slate-600">Log de eventos ({debugLog.length})</summary>
          <ul className="mt-2 max-h-40 space-y-1 overflow-auto font-mono text-[10px]">
            {debugLog.length === 0 ? (
              <li className="text-slate-400">(vazio)</li>
            ) : (
              debugLog.map((e, i) => (
                <li
                  key={`${e.at}-${i}`}
                  className={
                    e.level === 'error'
                      ? 'text-rose-800'
                      : e.level === 'ok'
                        ? 'text-emerald-800'
                        : 'text-slate-600'
                  }
                >
                  [{e.at}] {e.message}
                  {e.detail ? (
                    <pre className="mt-0.5 whitespace-pre-wrap text-slate-500">{e.detail}</pre>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </details>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[auto_1fr]">
        <aside className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-4 lg:w-36">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-800">Nivel do mic</p>
          <AudioLevelMeter stream={levelStream} orientation="vertical" className="mt-3" />
        </aside>
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Microfone</label>
              <select
                value={micDeviceId}
                onChange={(e) => setMicDeviceId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              >
                <option value="">Automatico</option>
                {micDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => (micMonitorActive ? stopMonitor() : void startMonitor())}
              className={`rounded-xl border px-4 py-2 text-sm font-bold ${
                micMonitorActive
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {micMonitorActive ? 'Parar monitor' : 'Ligar monitor'}
            </button>
            <button
              type="button"
              disabled={micBusy}
              onClick={() => void refreshMicDevices()}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Atualizar mics
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {recordingPhase === 'idle' ? (
              <button
                type="button"
                onClick={() => void startRecording()}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-500"
              >
                Gravar
              </button>
            ) : null}
            {recordingPhase === 'recording' ? (
              <button
                type="button"
                onClick={pauseRecording}
                className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-black text-white hover:bg-amber-400"
              >
                Pausar
              </button>
            ) : null}
            {recordingPhase === 'paused' ? (
              <button
                type="button"
                onClick={resumeRecording}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-500"
              >
                Retomar
              </button>
            ) : null}
            {recordingPhase !== 'idle' ? (
              <button
                type="button"
                onClick={stopRecording}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Encerrar
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setSttNow('')
                setSttTranscript('')
                setSpeakerSnapshots([])
                setChunkCount(0)
                setChunkBytes(0)
                setLastChunkBytes(0)
                setLastLatencyMs(null)
                setLastSentAt(null)
                setStreamError(null)
                setLastDebug(null)
                setDebugLog([])
              }}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Limpar transcricao
            </button>
          </div>

          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs font-mono text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
            <span>Chunk min: {STT_CHUNK_MIN_MS} ms</span>
            <span>Envios: {chunkCount}</span>
            <span>Ultimo chunk: {(lastChunkBytes / 1024).toFixed(1)} KB</span>
            <span>Total enviado: {(chunkBytes / 1024).toFixed(1)} KB</span>
            <span>Latencia STT: {lastLatencyMs == null ? '-' : `${lastLatencyMs} ms`}</span>
            <span>Ultimo envio: {lastSentAt ?? '-'}</span>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-brand-navy/10 bg-white p-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-brand-navy">Ouvindo agora</h3>
          <p className="mt-2 min-h-[5rem] whitespace-pre-wrap text-sm text-slate-900">
            {sttNow || 'Aguardando audio...'}
          </p>
        </section>
        <section className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-rose-700">Diarizacao (ultimos chunks)</h3>
          <div className="mt-2 max-h-44 space-y-2 overflow-auto">
            {speakerSnapshots.length === 0 ? (
              <p className="text-sm text-slate-500">Aguardando identificacao de falantes...</p>
            ) : (
              speakerSnapshots.map((snap, idx) => (
                <div key={`${snap.at}-${idx}`} className="rounded-xl border border-rose-100 bg-white p-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{snap.at}</p>
                  {snap.speakers.map((speaker, speakerIdx) => (
                    <p key={`${snap.at}-${speaker.id}-${speakerIdx}`} className="mt-1 text-sm text-slate-800">
                      <span className="font-black text-rose-700">[{speaker.label}]</span> {speaker.text}
                    </p>
                  ))}
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600">Transcricao acumulada</h3>
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-800">
          {sttTranscript || '-'}
        </pre>
      </section>
    </section>
  )
}
