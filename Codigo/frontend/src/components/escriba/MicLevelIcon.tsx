import { useId, useMemo } from 'react'
import { audioLevelHint, useAudioLevel } from '../../hooks/useAudioLevel.js'

type Props = {
  stream: MediaStream | null
  className?: string
}

const toneFill: Record<ReturnType<typeof audioLevelHint>['tone'], string> = {
  muted: '#cbd5e1',
  low: '#fbbf24',
  ok: '#10b981',
  hot: '#f43f5e',
}

const toneBg: Record<ReturnType<typeof audioLevelHint>['tone'], string> = {
  muted: 'bg-slate-100',
  low: 'bg-amber-50',
  ok: 'bg-emerald-50',
  hot: 'bg-rose-50',
}

export function MicLevelIcon({ stream, className = '' }: Props) {
  const clipId = useId()
  const level = useAudioLevel(stream)
  const hint = useMemo(() => audioLevelHint(level), [level])
  const fillPct = Math.max(4, level)
  const fillColor = toneFill[hint.tone]

  return (
    <div
      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 ${toneBg[hint.tone]} transition-colors duration-75 ${className}`}
      aria-label={`Microfone: ${level}%, ${hint.label}`}
      role="img"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <rect x="9" y="2" width="6" height="12" rx="3" fill="#e2e8f0" />
        <clipPath id={clipId}>
          <rect x="9" y={14 - (12 * fillPct) / 100} width="6" height={(12 * fillPct) / 100} />
        </clipPath>
        <rect
          x="9"
          y="2"
          width="6"
          height="12"
          rx="3"
          fill={fillColor}
          clipPath={`url(#${clipId})`}
          className="transition-[fill] duration-75"
        />
        <path
          d="M5 11a7 7 0 0 0 14 0"
          fill="none"
          stroke={hint.tone === 'muted' ? '#94a3b8' : fillColor}
          strokeWidth="1.75"
          strokeLinecap="round"
          className="transition-[stroke] duration-75"
        />
        <line
          x1="12"
          y1="18"
          x2="12"
          y2="21"
          stroke={hint.tone === 'muted' ? '#94a3b8' : fillColor}
          strokeWidth="1.75"
          strokeLinecap="round"
          className="transition-[stroke] duration-75"
        />
        <line
          x1="9"
          y1="21"
          x2="15"
          y2="21"
          stroke={hint.tone === 'muted' ? '#94a3b8' : fillColor}
          strokeWidth="1.75"
          strokeLinecap="round"
          className="transition-[stroke] duration-75"
        />
      </svg>
    </div>
  )
}
