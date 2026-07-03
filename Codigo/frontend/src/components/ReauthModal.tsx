import { useEffect, useState } from 'react'

type ReauthModalProps = {
  open: boolean
  email: string
  onConfirm: (password: string) => Promise<boolean>
  onCancel: () => void
}

export function ReauthModal({ open, email, onConfirm, onCancel }: ReauthModalProps) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setPassword('')
      setError(null)
      setBusy(false)
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reauth-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h2 id="reauth-title" className="text-lg font-bold text-slate-900">
          {'Sess\u00e3o expirada'}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Digite sua senha novamente para continuar. Conta:{' '}
          <span className="font-mono font-semibold text-slate-800">{email}</span>
        </p>
        <div className="mt-4">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Senha</label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-300 p-2.5 text-sm shadow-sm"
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && password && !busy) {
                e.preventDefault()
                void (async () => {
                  setBusy(true)
                  setError(null)
                  const ok = await onConfirm(password)
                  setBusy(false)
                  if (!ok) setError('Senha incorreta ou falha ao autenticar.')
                })()
              }
            }}
          />
        </div>
        {error && <p className="mt-2 text-sm font-medium text-rose-700">{error}</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onCancel()}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Sair
          </button>
          <button
            type="button"
            disabled={busy || !password}
            onClick={() => {
              void (async () => {
                setBusy(true)
                setError(null)
                const ok = await onConfirm(password)
                setBusy(false)
                if (!ok) setError('Senha incorreta ou falha ao autenticar.')
              })()
            }}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? 'Validando...' : 'Continuar'}
          </button>
        </div>
      </div>
    </div>
  )
}
