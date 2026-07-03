/**
 * Tabela de ganho de peso gestacional â Caderneta da Gestante 8Âª ed. rev. 2024 (MS), pÃ¡gs. 18â22.
 */

export type ImcClassificacaoId = 'baixo_peso' | 'eutrofia' | 'sobrepeso' | 'obesidade'

export type FaixaGanhoKg = {
  min: number
  max: number
}

export type CadernetaImcFaixa = {
  id: ImcClassificacaoId
  label: string
  imcMinInclusive: number | null
  imcMaxExclusive: number | null
  faixaKg: FaixaGanhoKg
}

export const CADERNETA_IMC_FAIXAS: readonly CadernetaImcFaixa[] = [
  {
    id: 'baixo_peso',
    label: 'Baixo peso',
    imcMinInclusive: null,
    imcMaxExclusive: 18.5,
    faixaKg: { min: 9.7, max: 12.2 },
  },
  {
    id: 'eutrofia',
    label: 'Eutrofia',
    imcMinInclusive: 18.5,
    imcMaxExclusive: 25,
    faixaKg: { min: 8, max: 12 },
  },
  {
    id: 'sobrepeso',
    label: 'Sobrepeso',
    imcMinInclusive: 25,
    imcMaxExclusive: 30,
    faixaKg: { min: 7, max: 9 },
  },
  {
    id: 'obesidade',
    label: 'Obesidade',
    imcMinInclusive: 30,
    imcMaxExclusive: null,
    faixaKg: { min: 5, max: 7.2 },
  },
] as const

export const SEMANA_GESTACIONAL_MAX = 40
export const SEMANA_GESTACIONAL_EIXO_MIN = 10
export const SEMANA_GESTACIONAL_EIXO_MAX = 40
export const SEMANA_GESTACIONAL_PLOT_MIN = 1
export const SEMANA_GESTACIONAL_PLOT_MAX = 42

export const RODAPE_FONTE_MS =
  'Baseado na Caderneta da Gestante (MS, 2024); curvas de percentil completas em trabalhos futuros.'
