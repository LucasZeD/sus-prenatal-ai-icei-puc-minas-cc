import type { ReactNode } from 'react'

type LiviaMobileFabProps = {
  children: ReactNode
}

/** Livia assistant expandable panel below lg breakpoint. */
export function LiviaMobileFab({ children }: LiviaMobileFabProps) {
  return (
    <div className="fixed bottom-4 right-4 z-40 lg:hidden">
      <details className="group ml-auto w-[calc(100vw-2rem)] max-w-sm origin-bottom-right rounded-2xl border border-brand-pink/50 bg-white shadow-[0_4px_25px_rgba(251,160,167,0.3)] transition-all">
        <summary className="cursor-pointer list-none rounded-2xl bg-brand-pink/5 px-5 py-4 text-sm font-bold text-brand-navy transition-colors marker:content-none hover:bg-brand-pink/10 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-pink text-sm text-white shadow-sm ring-2 ring-white">
                {'\u2728'}
              </span>
              Conversar com L{'\u00ed'}vIA
            </span>
            <span className="text-xs font-bold text-brand-pink/70 group-open:hidden">ABRIR</span>
            <span className="hidden text-xs font-bold text-brand-pink/70 group-open:block">FECHAR</span>
          </span>
        </summary>
        <div className="flex h-[min(65vh,36rem)] flex-col overflow-hidden rounded-b-2xl border-t border-brand-pink/20 bg-white">
          {children}
        </div>
      </details>
    </div>
  )
}
