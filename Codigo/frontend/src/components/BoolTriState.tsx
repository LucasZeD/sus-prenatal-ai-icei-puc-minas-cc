export type BoolTriValue = '' | 'true' | 'false'

/** Referencia estavel fora da pagina (evita remount a cada render e cliques mortos). */
export function BoolTriState({
  name,
  value,
  disabled,
  onChange,
}: {
  name: string
  value: BoolTriValue
  disabled?: boolean
  onChange: (next: BoolTriValue) => void
}) {
  const v: BoolTriValue = value === 'true' || value === 'false' || value === '' ? value : ''
  const base =
    'inline-flex min-h-[2.25rem] min-w-[2.75rem] items-center justify-center rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-black text-slate-700 shadow-sm transition-colors select-none'
  const active = 'border-brand-pink/50 ring-2 ring-brand-pink/20 text-brand-navy bg-brand-pink/5'
  const idle = 'hover:border-slate-300 hover:bg-slate-50'
  const btn = (id: BoolTriValue, label: string) => (
    <button
      type="button"
      key={`${name}-${id || 'unset'}`}
      disabled={disabled}
      aria-pressed={v === id}
      aria-label={`${name}: ${label}`}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!disabled) onChange(id)
      }}
      className={`${base} ${v === id ? active : idle} ${disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'}`}
    >
      {label}
    </button>
  )
  return (
    <div className="relative z-20 flex flex-wrap gap-1.5" role="group" aria-label={name}>
      {btn('', '\u2014')}
      {btn('true', 'Sim')}
      {btn('false', 'N\u00e3o')}
    </div>
  )
}
