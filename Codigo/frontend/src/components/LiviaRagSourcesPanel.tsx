export type RagChunkRow = {
  id?: string
  title?: string
  text?: string
  source_file?: string
  /** Provenance from clinical-ai retrieve(): id | file | collection (JSONL rows share one filename). */
  source_citation?: string
  /** Citation line: arquivo (Autor, ano) — definido pelo clinical-ai. */
  citation_line?: string
  retrieval_rank?: number
  score?: number
}

export function citationForChunk(c: RagChunkRow): string | null {
  return (
    (typeof c.citation_line === 'string' && c.citation_line.trim() ? c.citation_line.trim() : null) ??
    (typeof c.source_file === 'string' && c.source_file.trim() ? c.source_file.trim() : null) ??
    (typeof c.source_citation === 'string' && c.source_citation.trim() ? c.source_citation.trim() : null)
  )
}

export function formatRagChunksForCopy(chunks: RagChunkRow[]): string {
  return chunks
    .map((c, j) => {
      const cite = citationForChunk(c)
      const header = cite ? `[${j + 1}] ${cite}` : `[${j + 1}]`
      const body = (c.text ?? '').trim()
      return body ? `${header}\n${body}` : header
    })
    .filter(Boolean)
    .join('\n\n')
}

type LiviaRagLivePreviewProps = {
  chunks: RagChunkRow[]
  className?: string
}

/** Preview compacto inline no topo da bolha live durante streaming. */
export function LiviaRagLivePreview({ chunks, className = '' }: LiviaRagLivePreviewProps) {
  if (chunks.length === 0) return null

  return (
    <div
      className={`mt-2 rounded-lg border border-sky-200 bg-sky-50/60 p-2 ${className}`}
    >
      <p className="text-[10px] font-bold uppercase text-sky-800">
        Documentos de referência
      </p>
      <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto text-[10px] text-sky-950">
        {chunks.map((c, j) => {
          const cite = citationForChunk(c)
          const text = c.text ?? ''
          return (
            <li key={`${String(c.id)}-${j}`} className="border-b border-sky-100/80 py-1.5 last:border-0">
              <div className="flex flex-wrap items-baseline gap-x-1.5 text-[9px] font-semibold leading-snug text-sky-950">
                <span>[{j + 1}]</span>
                {cite ? <span className="font-medium">{cite}</span> : null}
              </div>
              <p className="mt-1 line-clamp-4 font-sans text-[9px] leading-relaxed text-sky-950/95">
                {text.slice(0, 280)}
                {text.length > 280 ? '\u2026' : ''}
              </p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
