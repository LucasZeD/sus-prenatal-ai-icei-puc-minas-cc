import {
  CADERNETA_IMC_FAIXAS,
  type ImcClassificacaoId,
} from '../../data/cadernetaPesoGestacional.js'
import type { ClassificacaoImcResult } from '../../lib/ganhoPesoGestacional.js'

const CLASSIFICACAO_BADGE: Record<ImcClassificacaoId, string> = {
  baixo_peso: 'bg-amber-100 text-amber-900 border-amber-200',
  eutrofia: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  sobrepeso: 'bg-orange-100 text-orange-900 border-orange-200',
  obesidade: 'bg-rose-100 text-rose-900 border-rose-200',
}

type Props = {
  alturaM: number | null
  pesoPreKg: number | null
  imc: number | null
  classificacao: ClassificacaoImcResult | null
}

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm font-black text-brand-navy">{value}</dd>
    </div>
  )
}

export function ImcClassificacaoCard({ alturaM, pesoPreKg, imc, classificacao }: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
      <h3 className="text-sm font-black uppercase tracking-widest text-brand-navy">
        IMC pré-gestacional (Caderneta 2024)
      </h3>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricItem label="Altura" value={alturaM != null ? `${alturaM.toFixed(2)} m` : '—'} />
        <MetricItem label="Peso antes da gravidez" value={pesoPreKg != null ? `${pesoPreKg} kg` : '—'} />
        <MetricItem label="IMC" value={imc != null ? `${imc.toFixed(1)} kg/m²` : '—'} />
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Classificação</dt>
          <dd className="mt-1">
            {classificacao ? (
              <span
                className={`inline-flex rounded-lg border px-2.5 py-1 text-sm font-bold ${CLASSIFICACAO_BADGE[classificacao.id]}`}
              >
                {classificacao.label}
              </span>
            ) : (
              <span className="text-sm font-black text-brand-navy">—</span>
            )}
          </dd>
        </div>
      </dl>
      {classificacao ? (
        <p className="mt-4 text-sm font-medium text-slate-600">
          Ganho total recomendado até 40 semanas:{' '}
          <span className="font-bold text-brand-navy">
            {classificacao.faixaKg.min} – {classificacao.faixaKg.max} kg
          </span>
        </p>
      ) : null}
      <details className="mt-4">
        <summary className="cursor-pointer text-xs font-bold text-brand-pink hover:underline">
          Ver tabela resumida MS
        </summary>
        <table className="mt-3 w-full text-left text-xs text-slate-600">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-400">
              <th className="py-2 pr-2">IMC (kg/m²)</th>
              <th className="py-2 pr-2">Classificação</th>
              <th className="py-2">Ganho até 40 sem</th>
            </tr>
          </thead>
          <tbody>
            {CADERNETA_IMC_FAIXAS.map((f) => (
              <tr key={f.id} className="border-b border-slate-100">
                <td className="py-2 pr-2 font-medium">
                  {f.imcMinInclusive == null
                    ? `< ${f.imcMaxExclusive}`
                    : f.imcMaxExclusive == null
                      ? `≥ ${f.imcMinInclusive}`
                      : `${f.imcMinInclusive} – < ${f.imcMaxExclusive}`}
                </td>
                <td className="py-2 pr-2">{f.label}</td>
                <td className="py-2">
                  {f.faixaKg.min} – {f.faixaKg.max} kg
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
