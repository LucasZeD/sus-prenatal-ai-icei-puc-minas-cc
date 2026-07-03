import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  buildGanhoPesoSeries,
  type GanhoPesoConsultaInput,
  type GanhoPesoSeriesInput,
} from '../../lib/ganhoPesoGestacional.js'
import { GanhoPesoGestacionalChart } from './GanhoPesoGestacionalChart.js'
import { ImcClassificacaoCard } from './ImcClassificacaoCard.js'

type Props = {
  pacienteId: string
  paciente: GanhoPesoSeriesInput | null
  consultas: GanhoPesoConsultaInput[]
}

export function GanhoPesoGestacionalPanel({ pacienteId, paciente, consultas }: Props) {
  const series = buildGanhoPesoSeries(paciente ?? {}, consultas)
  const missingBaseline = series.avisos.some((a) => a.code === 'missing_baseline')
  const noPoints = series.avisos.some((a) => a.code === 'no_points')
  const softWarnings = series.avisos.filter((a) => a.code === 'ig_outside_axis')

  const alturaM = paciente?.altura ?? null
  const pesoPreKg = paciente?.peso_pre_gestacional ?? null

  return (
    <div className="space-y-6">
      {missingBaseline ? (
        <EmptyNotice
          title="Dados antropométricos incompletos"
          message="Preencha altura e peso antes da gravidez no prontuário para exibir o gráfico."
          cta={
            <Link
              to={`/pacientes/${pacienteId}#perfil-antropometria`}
              className="mt-3 inline-flex text-sm font-bold text-brand-pink hover:underline"
            >
              Ir para altura e peso pré-gestacional
            </Link>
          }
        />
      ) : null}

      {!missingBaseline ? (
        <>
          <ImcClassificacaoCard
            alturaM={alturaM}
            pesoPreKg={pesoPreKg}
            imc={series.imc}
            classificacao={series.classificacao}
          />

          {noPoints ? (
            <EmptyNotice
              title="Sem medições na gestação"
              message="Registre peso e idade gestacional (IG) nas consultas do Escriba."
            />
          ) : (
            <GanhoPesoGestacionalChart banda={series.banda} pontos={series.pontos} />
          )}

          {softWarnings.map((w) => (
            <p
              key={w.code}
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              {w.message}
            </p>
          ))}
        </>
      ) : null}
    </div>
  )
}

function EmptyNotice({
  title,
  message,
  cta,
}: {
  title: string
  message: string
  cta?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-6 py-5 text-center">
      <p className="text-base font-bold text-brand-navy">{title}</p>
      <p className="mt-2 text-sm font-medium text-slate-600">{message}</p>
      {cta}
    </div>
  )
}
