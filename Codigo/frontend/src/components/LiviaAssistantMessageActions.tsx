type LiviaAssistantMessageActionsProps = {
  content: string
  onCopy: () => void
  onShowSources?: () => void
  onRegenerate?: () => void
  copyFlashActive: boolean
  regenerateDisabled?: boolean
  showRegenerate?: boolean
  showSources?: boolean
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

function IconArrowPath({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
  )
}

function IconBookOpen({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
      />
    </svg>
  )
}

const actionBtnClass =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40'

export function LiviaAssistantMessageActions({
  content,
  onCopy,
  onShowSources,
  onRegenerate,
  copyFlashActive,
  regenerateDisabled = false,
  showRegenerate = false,
  showSources = false,
}: LiviaAssistantMessageActionsProps) {
  const canCopy = content.trim().length > 0

  return (
    <div className="mt-2 flex items-center gap-1" role="toolbar" aria-label="A\u00e7\u00f5es da resposta">
      <button
        type="button"
        onClick={onCopy}
        disabled={!canCopy}
        className={actionBtnClass}
        aria-label={copyFlashActive ? 'Copiado!' : 'Copiar markdown'}
        title={copyFlashActive ? 'Copiado!' : 'Copiar markdown'}
      >
        <IconClipboard className="h-4 w-4" />
      </button>

      {showRegenerate && onRegenerate ? (
        <button
          type="button"
          onClick={onRegenerate}
          disabled={regenerateDisabled}
          className={actionBtnClass}
          aria-label="Gerar novamente"
          title="Gerar novamente"
        >
          <IconArrowPath className="h-4 w-4" />
        </button>
      ) : null}

      {showSources && onShowSources ? (
        <button
          type="button"
          onClick={onShowSources}
          className={actionBtnClass}
          aria-label="Mostrar fontes"
          title="Mostrar fontes"
        >
          <IconBookOpen className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  )
}
