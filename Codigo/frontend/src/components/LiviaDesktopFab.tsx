type LiviaDesktopFabProps = {
  onClick: () => void
  /** e.g. bottom-28 on Escriba to clear the recording bar */
  bottomOffsetClass?: string
}

/** Floating orb (lg+) to reopen Livia when the aside is collapsed. */
export function LiviaDesktopFab({ onClick, bottomOffsetClass = 'bottom-6' }: LiviaDesktopFabProps) {
  const sparkle = '\u2728'

  return (
    <div className={`fixed right-6 z-40 hidden lg:block ${bottomOffsetClass}`}>
      <div className="group relative ml-auto">
        <div
          className="pointer-events-none absolute bottom-[calc(100%+0.75rem)] right-0 z-10 w-52 origin-bottom-right scale-95 opacity-0 transition-all duration-300 ease-out group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100"
          aria-hidden
        >
          <div className="rounded-2xl border border-brand-pink/40 bg-white px-3 py-2.5 shadow-lg">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-rose-600 text-lg text-white shadow-inner ring-2 ring-white animate-pulse">
                {sparkle}
              </span>
              <p className="text-xs font-bold leading-snug text-brand-navy">Conversar com a Livia</p>
            </div>
          </div>
          <span className="absolute -bottom-1.5 right-5 h-3 w-3 rotate-45 border-b border-r border-brand-pink/40 bg-white" />
        </div>

        <span
          className="pointer-events-none absolute inset-0 rounded-full bg-brand-pink/25 opacity-0 animate-ping group-hover:opacity-100"
          aria-hidden
        />

        <button
          type="button"
          onClick={onClick}
          className="relative flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full border border-rose-200/90 bg-white text-2xl shadow-lg transition-[box-shadow,transform] duration-300 hover:scale-110 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 active:scale-95"
          aria-label="Conversar com a Livia"
          title="Conversar com a Livia"
        >
          <span className="flex h-[3.35rem] w-[3.35rem] items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-rose-600 text-xl text-white shadow-inner transition-transform duration-300 group-hover:rotate-12">
            {sparkle}
          </span>
        </button>
      </div>
    </div>
  )
}
