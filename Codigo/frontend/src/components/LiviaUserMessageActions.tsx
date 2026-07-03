type LiviaUserMessageActionsProps = {
  onEdit: () => void
  editDisabled?: boolean
}

const actionBtnClass =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40'

function IconPencil({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
      />
    </svg>
  )
}

export function LiviaUserMessageActions({ onEdit, editDisabled = false }: LiviaUserMessageActionsProps) {
  return (
    <div className="mt-2 flex items-center justify-end gap-1" role="toolbar" aria-label="A\u00e7\u00f5es da pergunta">
      <button
        type="button"
        onClick={onEdit}
        disabled={editDisabled}
        className={actionBtnClass}
        aria-label="Editar pergunta"
        title="Editar pergunta"
      >
        <IconPencil className="h-4 w-4" />
      </button>
    </div>
  )
}
