import { useState } from 'react'

type LiviaSuggestionCollapsibleProps = {
  chips: string[]
  busy: boolean
  onSelect: (text: string) => void
}

export function LiviaSuggestionCollapsible({ chips, busy, onSelect }: LiviaSuggestionCollapsibleProps) {
  const [open, setOpen] = useState(false)

  if (chips.length === 0) return null

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-expanded={open}
        className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-2.5 text-left text-[13px] font-medium text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {open ? 'Ocultar sugest\u00f5es de pergunta' : 'Clique para ver sugest\u00f5es de pergunta'}
      </button>

      {open ? (
        <ul className="mt-2 flex flex-wrap gap-2" role="list">
          {chips.map((s, idx) => (
            <li key={`${idx}-${s.slice(0, 48)}`}>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  onSelect(s)
                  setOpen(false)
                }}
                className="rounded-full border border-rose-200 bg-white px-4 py-2 text-[13px] font-medium text-rose-700 shadow-sm transition-colors hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 disabled:opacity-50"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
