type LandingPdfEmbedProps = {
  pdfUrl: string
  title: string
  openLabel?: string
  className?: string
}

/** Inline PDF on desktop; mobile-friendly open link below md (iOS/Android lack embedded PDF). */
export function LandingPdfEmbed({
  pdfUrl,
  title,
  openLabel = 'Abrir PDF',
  className = 'h-[min(22rem,55vh)] w-full',
}: LandingPdfEmbedProps) {
  const objectFallback = (
    <div className="flex flex-col items-center justify-center gap-4 px-4 py-14 text-center">
      <p className="text-sm font-medium text-slate-600">
        O navegador nao mostrou o PDF aqui. Abra numa nova pagina para ler ou baixar.
      </p>
      <a
        href={pdfUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-xl bg-brand-pink px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-400"
      >
        {openLabel}
      </a>
    </div>
  )

  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
        <object data={pdfUrl} type="application/pdf" title={title} className={className}>
          {objectFallback}
        </object>
      </div>
      <div
        className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 md:hidden ${className}`}
        aria-label={title}
      >
        <p className="max-w-xs px-4 text-center text-sm font-medium text-slate-600">
          Pre-visualizacao inline no computador. No celular, abra o PDF no visualizador do sistema.
        </p>
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 rounded-xl bg-brand-pink px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-400"
        >
          {openLabel}
        </a>
      </div>
    </>
  )
}
