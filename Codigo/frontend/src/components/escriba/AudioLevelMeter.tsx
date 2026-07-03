import { useMemo } from 'react'
import { audioLevelHint, useAudioLevel } from '../../hooks/useAudioLevel.js'

type Props = {
  stream: MediaStream | null
  className?: string
  /** `vertical`: barra de altura do áudio (teste de microfone). */
  orientation?: 'horizontal' | 'vertical'
  showLabel?: boolean
}

const toneBar: Record<ReturnType<typeof audioLevelHint>['tone'], string> = {
  muted: 'bg-slate-400',
  low: 'bg-amber-400',
  ok: 'bg-emerald-500',
  hot: 'bg-rose-500',
}

export function AudioLevelMeter({
  stream,
  className = '',
  orientation = 'horizontal',
  showLabel = true,
}: Props) {
  const level = useAudioLevel(stream)
  const hint = useMemo(() => audioLevelHint(level), [level])
  const barClass = toneBar[hint.tone]
  const heightPct = Math.max(4, level)

  if (orientation === 'vertical') {
    return (
      <div
        className={`flex flex-col items-center gap-2 ${className}`}
        aria-label={`Nível de áudio: ${level} por cento, ${hint.label}`}
      >
        <div className="relative flex h-52 w-10 items-end justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-inner">
          <div
            className={`w-full rounded-t-xl transition-[height] duration-75 ${barClass}`}
            style={{ height: `${heightPct}%` }}
          />
          {[25, 50, 75].map((tick) => (
            <span
              key={tick}
              className="pointer-events-none absolute left-0 right-0 border-t border-slate-300/60"
              style={{ bottom: `${tick}%` }}
            />
          ))}
        </div>
        {showLabel ? (
          <>
            <span className="text-sm font-black tabular-nums text-brand-navy">{level}%</span>
            <span
              className={`text-[10px] font-bold uppercase tracking-widest ${
                hint.tone === 'ok' ? 'text-emerald-700' : hint.tone === 'muted' ? 'text-slate-500' : 'text-amber-700'
              }`}
            >
              {hint.label}
            </span>
          </>
        ) : null}
      </div>
    )
  }

  return (
    <div className={className} aria-label={`Nível de áudio: ${level} por cento`}>
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full transition-[width] duration-75 ${barClass}`}
            style={{ width: `${heightPct}%` }}
          />
        </div>
        {showLabel ? (
          <span className="w-10 text-right text-xs font-mono font-bold text-slate-600 tabular-nums">{level}</span>
        ) : null}
      </div>
      {showLabel ? (
        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">{hint.label}</p>
      ) : null}
    </div>
  )
}
