export type ConsultaVitalsFormValues = {
  queixa: string
  conduta: string
  idadeG: string
  peso: string
  pa: string
  au: string
  bfc: string
  edema: boolean
  movFetal: boolean
  exantema: boolean
  apresentacao: string
}

type Props = {
  values: ConsultaVitalsFormValues
  sugestaoIa?: string | null
  disabled?: boolean
  onChange: (patch: Partial<ConsultaVitalsFormValues>) => void
  onSave: () => void
}

const inputCls =
  'block w-full rounded-xl border-slate-200 px-4 py-3 text-sm shadow-sm focus:border-brand-pink focus:ring-brand-pink bg-slate-50 font-medium text-slate-700'
const labelCls = 'block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1'

export function ConsultaVitalsForm({ values, sugestaoIa, disabled, onChange, onSave }: Props) {
  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-black text-brand-navy mb-4">Queixa e anamnese</h3>
        <label className={labelCls}>Queixa principal</label>
        <textarea
          value={values.queixa}
          onChange={(e) => onChange({ queixa: e.target.value })}
          rows={4}
          disabled={disabled}
          placeholder="Ex.: Dor lombar..."
          className={`${inputCls} resize-none rounded-2xl`}
        />
      </section>

      <section>
        <h3 className="text-sm font-black text-brand-navy mb-4">Sinais e exame</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>IG (semanas)</label>
            <input type="number" value={values.idadeG} onChange={(e) => onChange({ idadeG: e.target.value })} disabled={disabled} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Peso (kg)</label>
            <input type="number" value={values.peso} onChange={(e) => onChange({ peso: e.target.value })} disabled={disabled} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>PA (mmHg)</label>
            <input type="text" value={values.pa} onChange={(e) => onChange({ pa: e.target.value })} disabled={disabled} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>AU (cm)</label>
            <input type="number" value={values.au} onChange={(e) => onChange({ au: e.target.value })} disabled={disabled} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>BCF (bpm)</label>
            <input type="number" value={values.bfc} onChange={(e) => onChange({ bfc: e.target.value })} disabled={disabled} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Apresentacao fetal</label>
            <input type="text" value={values.apresentacao} onChange={(e) => onChange({ apresentacao: e.target.value })} disabled={disabled} className={inputCls} />
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-black text-brand-navy mb-4">Conduta e plano</h3>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <label className={labelCls}>Conduta</label>
            <textarea value={values.conduta} onChange={(e) => onChange({ conduta: e.target.value })} rows={5} disabled={disabled} className={`${inputCls} resize-none rounded-2xl`} />
          </div>
          <div>
            <label className={`${labelCls} text-brand-pink`}>Sugestao IA (rascunho)</label>
            <p className="text-[10px] text-slate-500 mb-1">
              Nao entra no prontuario oficial ate voce salvar a conduta manualmente.
            </p>
            <div className="min-h-[8rem] rounded-2xl border border-brand-pink/25 bg-brand-pink/5 p-4 text-sm text-brand-navy whitespace-pre-wrap">
              {sugestaoIa?.trim() || 'Sem sugestao ainda.'}
            </div>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <button type="button" disabled={disabled} onClick={onSave} className="rounded-xl bg-brand-pink px-6 py-3 text-sm font-bold text-white disabled:opacity-50">
          Salvar rascunho
        </button>
      </div>
    </div>
  )
}
