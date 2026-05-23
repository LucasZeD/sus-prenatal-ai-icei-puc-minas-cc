type StreamStatus = 'desconectado' | 'conectando' | 'conectado' | 'erro'
type RecordingPhase = 'idle' | 'recording' | 'paused'

type Props = {
  streamStatus: StreamStatus
  recordingPhase: RecordingPhase
  micMonitorActive: boolean
  micCapturing: boolean
  audioChunksSent: number
  audioBytesSent: number
  lastSttAt: number | null
  sttText: string
  sttLatencyMs: number | null
  streamError: string | null
  logLines: string[]
  wsUrl: string
  onReconnect: () => void
  onDisconnect: () => void
  defaultOpen?: boolean
}

function CheckRow({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <li className="flex gap-2 text-xs">
      <span className={ok ? 'text-emerald-600' : 'text-rose-500'} aria-hidden>
        {ok ? '✓' : '○'}
      </span>
      <span className="min-w-0">
        <span className={`font-bold ${ok ? 'text-emerald-900' : 'text-slate-700'}`}>{label}</span>
        {detail ? <span className="block font-mono text-[10px] text-slate-500 mt-0.5">{detail}</span> : null}
      </span>
    </li>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatAgo(ts: number | null): string {
  if (ts == null) return 'nunca'
  const sec = Math.round((Date.now() - ts) / 1000)
  if (sec < 5) return 'agora'
  if (sec < 60) return `há ${sec}s`
  return `há ${Math.floor(sec / 60)} min`
}

export function EscribaStreamDiagnostics({
  streamStatus,
  recordingPhase,
  micMonitorActive,
  micCapturing,
  audioChunksSent,
  audioBytesSent,
  lastSttAt,
  sttText,
  sttLatencyMs,
  streamError,
  logLines,
  wsUrl,
  onReconnect,
  onDisconnect,
  defaultOpen = false,
}: Props) {
  const wsOk = streamStatus === 'conectado'
  const sendingAudio = audioChunksSent > 0
  const gotStt = Boolean(sttText.trim()) || lastSttAt != null

  return (
    <details
      className="rounded-2xl border border-amber-200/80 bg-amber-50/40 shadow-sm"
      open={defaultOpen}
    >
      <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-amber-950">
        Diagnóstico do pipeline (dev)
      </summary>
      <div className="border-t border-amber-100 px-4 py-4 space-y-4">
        <ul className="space-y-2">
          <CheckRow ok={wsOk} label="WebSocket conectado" detail={wsOk ? wsUrl : streamStatus} />
          <CheckRow
            ok={micCapturing || micMonitorActive}
            label="Microfone ativo no navegador"
            detail={
              recordingPhase === 'recording'
                ? 'Gravando e enviando chunks'
                : micMonitorActive
                  ? 'Só monitor (pré-visualização)'
                  : 'Ligue o monitor ou inicie a gravação'
            }
          />
          <CheckRow
            ok={sendingAudio}
            label="Chunks de áudio enviados ao servidor"
            detail={`${audioChunksSent} chunks · ${formatBytes(audioBytesSent)}`}
          />
          <CheckRow
            ok={gotStt}
            label="STT retornou texto"
            detail={
              lastSttAt != null
                ? `${formatAgo(lastSttAt)}${sttLatencyMs != null ? ` · latência ~${sttLatencyMs} ms` : ''}`
                : 'Aguardando transcrição'
            }
          />
        </ul>

        <div className="rounded-xl border border-amber-200 bg-white/80 p-3 text-xs text-amber-950 leading-relaxed">
          <p className="font-black mb-1">Como testar STT</p>
          <ol className="list-decimal list-inside space-y-1 font-medium text-amber-900/90">
            <li>Ligue o monitor do microfone e fale — a barra vertical deve subir.</li>
            <li>Inicie a gravação e fale por pelo menos <strong>3 segundos</strong> (o servidor acumula ~2,5 s antes do STT).</li>
            <li>Use <strong>Finalizar trecho</strong> para forçar o envio do buffer restante e disparar a IA.</li>
            <li>Se os chunks sobem mas o STT não aparece, verifique o serviço STT/GPU no Docker.</li>
          </ol>
        </div>

        {streamError ? (
          <p className="text-xs font-bold text-rose-700 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2">
            {streamError}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onReconnect}
            className="rounded-lg border border-brand-navy/20 bg-white px-3 py-1.5 text-xs font-bold text-brand-navy hover:bg-slate-50"
          >
            Reconectar WS
          </button>
          <button
            type="button"
            onClick={onDisconnect}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            Desconectar
          </button>
        </div>

        <pre className="max-h-32 overflow-auto rounded-lg bg-slate-900 text-slate-100 p-2 text-[10px] leading-relaxed">
          {logLines.slice(-20).join('\n') || '—'}
        </pre>
      </div>
    </details>
  )
}
