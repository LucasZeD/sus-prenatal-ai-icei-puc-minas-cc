export type RecordingPhase = 'idle' | 'recording' | 'paused'

type Props = {
  phase: RecordingPhase
  statusLabel: string
  disabled?: boolean
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onFinishSegment: () => void
}

export function EscribaRecordingBar({
  phase,
  statusLabel,
  disabled = false,
  onStart,
  onPause,
  onResume,
  onFinishSegment,
}: Props) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-4 shadow-[0_-8px_30px_rgba(0,0,0,0.06)] backdrop-blur-sm lg:right-[var(--livia-aside-width,0)]">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Gravação</p>
          <p className="text-sm font-black text-brand-navy">{statusLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {phase === 'idle' ? (
            <button type="button" disabled={disabled} onClick={onStart} className="rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-black text-white shadow-md hover:bg-emerald-500 disabled:opacity-50">
              Iniciar gravação
            </button>
          ) : null}
          {phase === 'recording' ? (
            <>
              <button type="button" disabled={disabled} onClick={onPause} className="rounded-2xl bg-amber-500 px-5 py-3 text-sm font-black text-white shadow-md hover:bg-amber-400 disabled:opacity-50">
                Pausar
              </button>
              <button type="button" disabled={disabled} onClick={onFinishSegment} className="rounded-2xl border border-brand-navy/20 bg-white px-5 py-3 text-sm font-bold text-brand-navy hover:bg-slate-50 disabled:opacity-50">
                Finalizar trecho
              </button>
            </>
          ) : null}
          {phase === 'paused' ? (
            <>
              <button type="button" disabled={disabled} onClick={onResume} className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-md hover:bg-emerald-500 disabled:opacity-50">
                Retomar
              </button>
              <button type="button" disabled={disabled} onClick={onFinishSegment} className="rounded-2xl border border-brand-navy/20 bg-white px-5 py-3 text-sm font-bold text-brand-navy hover:bg-slate-50 disabled:opacity-50">
                Finalizar trecho
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
