import { useCallback, useEffect, useId, useRef, useState } from 'react'

export type LandingCarouselSlide = {
  id: string
  content: React.ReactNode
}

/**
 * Carrossel simples: setas, pontos, teclado (Home/End/setas), foco e reduced motion.
 */
export function LandingCarousel({
  ariaLabel,
  slides,
  className = '',
}: {
  ariaLabel: string
  slides: LandingCarouselSlide[]
  className?: string
}) {
  const rootId = useId()
  const [reducedMotion, setReducedMotion] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const fn = () => setReducedMotion(mq.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  const [index, setIndex] = useState(0)
  const n = slides.length
  const wrap = useCallback(
    (i: number) => {
      if (n === 0) return 0
      return ((i % n) + n) % n
    },
    [n],
  )

  const go = useCallback(
    (next: number) => {
      setIndex(wrap(next))
    },
    [wrap],
  )

  const regionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = regionRef.current
    if (!el) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        go(index - 1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        go(index + 1)
      } else if (e.key === 'Home') {
        e.preventDefault()
        go(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        go(n - 1)
      }
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [go, index, n])

  if (n === 0) return null

  return (
    <div className={`relative ${className}`}>
      <div
        ref={regionRef}
        role="region"
        aria-roledescription="carousel"
        aria-label={ariaLabel}
        tabIndex={0}
        className="rounded-3xl border border-slate-200/90 bg-white shadow-md outline-none ring-brand-navy/20 focus-visible:ring-2"
      >
        <div className="relative overflow-hidden rounded-3xl">
          <div
            className="flex touch-pan-y"
            style={{
              transform: `translateX(-${index * 100}%)`,
              transition: reducedMotion ? 'none' : 'transform 0.35s ease-out',
            }}
          >
            {slides.map((s, slideIdx) => (
              <div
                key={s.id}
                id={`${rootId}-slide-${s.id}`}
                role="group"
                aria-roledescription="slide"
                aria-label={`${slideIdx + 1} de ${n}`}
                className="w-full shrink-0 px-4 pb-14 pt-4 sm:px-8 sm:pb-16 sm:pt-8"
              >
                {s.content}
              </div>
            ))}
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between px-2 pb-3 sm:px-4">
          <button
            type="button"
            onClick={() => go(index - 1)}
            className="pointer-events-auto rounded-full border border-slate-200 bg-white/95 p-2.5 text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-brand-pink"
            aria-label="Slide anterior"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="pointer-events-auto flex gap-1.5 rounded-full border border-slate-200/80 bg-white/90 px-2 py-1.5 shadow-sm">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => go(i)}
                className={`h-2.5 w-2.5 rounded-full transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-brand-pink ${
                  i === index ? 'bg-brand-pink' : 'bg-slate-300 hover:bg-slate-400'
                }`}
                aria-label={`Ir para o slide ${i + 1}`}
                aria-current={i === index ? 'true' : undefined}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => go(index + 1)}
            className="pointer-events-auto rounded-full border border-slate-200 bg-white/95 p-2.5 text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-brand-pink"
            aria-label="Próximo slide"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-slate-500" aria-live="polite">
        Slide {index + 1} de {n}
      </p>
    </div>
  )
}
