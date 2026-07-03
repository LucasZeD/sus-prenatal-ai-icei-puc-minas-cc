import { useCallback, useEffect, useRef, useState } from 'react'
import {
  citationForChunk,
  formatRagChunksForCopy,
  type RagChunkRow,
} from './LiviaRagSourcesPanel.js'

type LiviaRagSourcesModalProps = {
  open: boolean
  onClose: () => void
  chunks: RagChunkRow[]
}

function IconClipboard({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
      />
    </svg>
  )
}

async function copyToClipboard(text: string): Promise<boolean> {
  const t = text.trim()
  if (!t) return false
  try {
    await navigator.clipboard.writeText(t)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = t
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      return false
    }
  }
}

export function LiviaRagSourcesModal({ open, onClose, chunks }: LiviaRagSourcesModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [copyFlashId, setCopyFlashId] = useState<string | null>(null)

  const flashCopy = useCallback((flashId: string) => {
    setCopyFlashId(flashId)
    window.setTimeout(() => setCopyFlashId((cur) => (cur === flashId ? null : cur)), 2000)
  }, [])

  const handleCopyAll = useCallback(async () => {
    const ok = await copyToClipboard(formatRagChunksForCopy(chunks))
    if (ok) flashCopy('all')
  }, [chunks, flashCopy])

  const handleCopyChunk = useCallback(
    async (index: number) => {
      const c = chunks[index]
      if (!c) return
      const cite = citationForChunk(c)
      const header = cite ? `[${index + 1}] ${cite}` : `[${index + 1}]`
      const body = (c.text ?? '').trim()
      const text = body ? `${header}\n${body}` : header
      const ok = await copyToClipboard(text)
      if (ok) flashCopy(`chunk-${index}`)
    },
    [chunks, flashCopy],
  )

  useEffect(() => {
    if (!open) {
      setCopyFlashId(null)
      return
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    const t = window.setTimeout(() => dialogRef.current?.focus(), 0)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.clearTimeout(t)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/60 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="livia-rag-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="flex max-h-[min(85vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div>
            <h2 id="livia-rag-modal-title" className="text-base font-bold text-slate-900 sm:text-lg">
              Fontes usadas nesta resposta
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {chunks.length} trecho{chunks.length === 1 ? '' : 's'} das cartilhas de referência
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            aria-label="Fechar"
            title="Fechar"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          <ul className="space-y-3">
            {chunks.map((c, j) => {
              const cite = citationForChunk(c)
              const text = c.text ?? ''
              const rank = typeof c.retrieval_rank === 'number' ? c.retrieval_rank : null
              const score = typeof c.score === 'number' ? c.score : null
              return (
                <li
                  key={`${String(c.id)}-${j}`}
                  className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-emerald-950">
                        [{j + 1}]
                        {cite ? (
                          <span className="ml-1.5 font-semibold text-emerald-900">{cite}</span>
                        ) : null}
                      </p>
                      {(rank != null || score != null) && (
                        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700/80">
                          {rank != null ? `Rank ${rank}` : null}
                          {rank != null && score != null ? ' \u00b7 ' : null}
                          {score != null ? `Score ${score.toFixed(3)}` : null}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleCopyChunk(j)}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
                      aria-label={copyFlashId === `chunk-${j}` ? 'Copiado!' : `Copiar trecho ${j + 1}`}
                      title={copyFlashId === `chunk-${j}` ? 'Copiado!' : `Copiar trecho ${j + 1}`}
                    >
                      <IconClipboard className="h-4 w-4" />
                    </button>
                  </div>
                  {text.trim() ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{text}</p>
                  ) : (
                    <p className="mt-2 text-sm italic text-slate-400">Sem texto do trecho.</p>
                  )}
                </li>
              )
            })}
          </ul>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={() => void handleCopyAll()}
            disabled={chunks.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            <IconClipboard className="h-4 w-4" />
            {copyFlashId === 'all' ? 'Copiado!' : 'Copiar tudo'}
          </button>
        </div>
      </div>
    </div>
  )
}
