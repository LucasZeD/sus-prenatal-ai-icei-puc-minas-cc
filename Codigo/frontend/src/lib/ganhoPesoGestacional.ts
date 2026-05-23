import {
  CADERNETA_IMC_FAIXAS,
  SEMANA_GESTACIONAL_EIXO_MAX,
  SEMANA_GESTACIONAL_EIXO_MIN,
  SEMANA_GESTACIONAL_MAX,
  SEMANA_GESTACIONAL_PLOT_MAX,
  SEMANA_GESTACIONAL_PLOT_MIN,
  type CadernetaImcFaixa,
  type FaixaGanhoKg,
  type ImcClassificacaoId,
} from '../data/cadernetaPesoGestacional.js'

export type GanhoPesoPonto = {
  semana: number
  ganhoKg: number
  pesoKg: number
  consultaId: string
  data: string
}

export type BandaSemana = {
  semana: number
  yMin: number
  yMax: number
}

export type ClassificacaoImcResult = {
  id: ImcClassificacaoId
  label: string
  faixaKg: FaixaGanhoKg
}

export type GanhoPesoChartWarning = {
  code: 'missing_baseline' | 'no_points' | 'ig_outside_axis'
  message: string
}

export type GanhoPesoSeriesInput = {
  altura?: number | null
  peso_pre_gestacional?: number | null
}

export type GanhoPesoConsultaInput = {
  id: string
  data: string
  idade_gestacional?: number | null
  peso?: number | null
}

export type GanhoPesoSeriesResult = {
  imc: number | null
  classificacao: ClassificacaoImcResult | null
  faixaKg: FaixaGanhoKg | null
  banda: BandaSemana[]
  pontos: GanhoPesoPonto[]
  avisos: GanhoPesoChartWarning[]
}

export function calcImc(alturaM: number | null | undefined, pesoKg: number | null | undefined): number | null {
  if (alturaM == null || pesoKg == null) return null
  if (alturaM <= 0 || pesoKg <= 0) return null
  return pesoKg / (alturaM * alturaM)
}

export function classificarImcPreGestacional(imc: number | null): ClassificacaoImcResult | null {
  if (imc == null || !Number.isFinite(imc)) return null
  const faixa = CADERNETA_IMC_FAIXAS.find((f) => matchesImcFaixa(imc, f))
  if (!faixa) return null
  return { id: faixa.id, label: faixa.label, faixaKg: { ...faixa.faixaKg } }
}

function matchesImcFaixa(imc: number, faixa: CadernetaImcFaixa): boolean {
  if (faixa.imcMinInclusive != null && imc < faixa.imcMinInclusive) return false
  if (faixa.imcMaxExclusive != null && imc >= faixa.imcMaxExclusive) return false
  return true
}

export function calcGanhoKg(
  pesoConsultaKg: number | null | undefined,
  pesoPreGestacionalKg: number | null | undefined,
): number | null {
  if (pesoConsultaKg == null || pesoPreGestacionalKg == null) return null
  return pesoConsultaKg - pesoPreGestacionalKg
}

export function buildBandaRecomendada(
  faixa: FaixaGanhoKg,
  semanaMin = SEMANA_GESTACIONAL_EIXO_MIN,
  semanaMax = SEMANA_GESTACIONAL_EIXO_MAX,
): BandaSemana[] {
  const out: BandaSemana[] = []
  for (let semana = semanaMin; semana <= semanaMax; semana++) {
    const t = semana / SEMANA_GESTACIONAL_MAX
    out.push({
      semana,
      yMin: faixa.min * t,
      yMax: faixa.max * t,
    })
  }
  return out
}

export function deriveChartWarnings(
  paciente: GanhoPesoSeriesInput,
  pontos: GanhoPesoPonto[],
): GanhoPesoChartWarning[] {
  const avisos: GanhoPesoChartWarning[] = []
  const hasBaseline =
    paciente.altura != null &&
    paciente.altura > 0 &&
    paciente.peso_pre_gestacional != null &&
    paciente.peso_pre_gestacional > 0

  if (!hasBaseline) {
    avisos.push({
      code: 'missing_baseline',
      message:
        'Preencha altura e peso antes da gravidez no prontuário para exibir o gráfico.',
    })
  }

  if (hasBaseline && pontos.length === 0) {
    avisos.push({
      code: 'no_points',
      message: 'Registre peso e idade gestacional (IG) nas consultas do Escriba.',
    })
  }

  const foraEixo = pontos.some(
    (p) => p.semana < SEMANA_GESTACIONAL_EIXO_MIN || p.semana > SEMANA_GESTACIONAL_EIXO_MAX,
  )
  if (foraEixo && pontos.length > 0) {
    avisos.push({
      code: 'ig_outside_axis',
      message: `Há consultas com IG fora da faixa usual do gráfico (${SEMANA_GESTACIONAL_EIXO_MIN}–${SEMANA_GESTACIONAL_EIXO_MAX} semanas).`,
    })
  }

  return avisos
}

export function buildGanhoPesoSeries(
  paciente: GanhoPesoSeriesInput,
  consultas: GanhoPesoConsultaInput[],
): GanhoPesoSeriesResult {
  const imc = calcImc(paciente.altura, paciente.peso_pre_gestacional)
  const classificacao = classificarImcPreGestacional(imc)
  const faixaKg = classificacao?.faixaKg ?? null
  const banda = faixaKg ? buildBandaRecomendada(faixaKg) : []

  const pesoPre = paciente.peso_pre_gestacional
  const candidatos = consultas
    .filter(
      (c) =>
        typeof c.idade_gestacional === 'number' &&
        Number.isFinite(c.idade_gestacional) &&
        typeof c.peso === 'number' &&
        Number.isFinite(c.peso) &&
        pesoPre != null &&
        pesoPre > 0,
    )
    .map((c) => {
      const semana = c.idade_gestacional as number
      const pesoKg = c.peso as number
      const ganhoKg = calcGanhoKg(pesoKg, pesoPre) as number
      return {
        semana,
        ganhoKg,
        pesoKg,
        consultaId: c.id,
        data: c.data,
      }
    })
    .filter(
      (p) =>
        p.semana >= SEMANA_GESTACIONAL_PLOT_MIN &&
        p.semana <= SEMANA_GESTACIONAL_PLOT_MAX,
    )
    .sort((a, b) => {
      if (a.semana !== b.semana) return a.semana - b.semana
      return a.data.localeCompare(b.data)
    })

  const avisos = deriveChartWarnings(paciente, candidatos)

  return {
    imc,
    classificacao,
    faixaKg,
    banda,
    pontos: candidatos,
    avisos,
  }
}
