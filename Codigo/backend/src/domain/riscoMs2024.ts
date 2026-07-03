/**
 * Estratificao de risco obsttrico (regras determinsticas) alinhada ao
 * Guia de Ateno  Sade da Gestante  Critrios para estratificao de risco
 * e acompanhamento da gestante (Ministrio da Sade, 2024).
 *
 * O guia prev trs nveis (habitual, intermedirio, alto). O produto persiste
 * apenas `HABITUAL` | `ALTO`; critrios do guia em **intermedirio** so
 * mapeados para `ALTO` (deciso de produto: fila conservadora).
 *
 * Lacunas do DER em relao ao guia (no computveis sem novos campos/API):
 * - Escores de tabagismo (ex.: Fagerstrm) e de lcool (ex.: T-ACE).
 * - Classificao fina de sfilis (terciria / resistncia) e estgio clnico.
 * - Muitos achados de exames laboratoriais (HIV, VDRL quantitativo, Hb, glicemia)
 *   enquanto no houver escrita estruturada na API clnica.
 * - Condies descritas s em texto livre de consulta.
 *
 * Reviso clnica: conferir quadros do PDF e ajustar limiares/cdigos conforme
 * verso institucional em uso.
 */

import { RiscoGestacional } from "../lib/prismaBarrel.js";

/** Cdigos estveis para testes, auditoria e futura UI (tooltip). */
export type RiscoCriterioCodigo =
  // --- Alto risco (guia / manual de referncia) ---
  | "ALTO_HAS_GESTACAO_ATUAL"
  | "ALTO_DIABETES_GESTACIONAL"
  | "ALTO_CARDIOPATIA"
  | "ALTO_TROMBOEMBOLISMO"
  | "ALTO_GESTACAO_MULTIPLA"
  | "ALTO_ISOIMUNIZACAO_RH"
  | "ALTO_HISTORICO_GESTACAO_ECTOPICA"
  | "ALTO_HISTORICO_GESTACAO_MOLAR"
  | "ALTO_OBITO_FETAL_OU_NEONATAL_PREVIO"
  | "ALTO_PARTO_PREMATURO_PREVIO"
  | "ALTO_USO_DROGAS"
  | "ALTO_IMC_40_OU_MAIS"
  | "ALTO_IDADE_MENOR_15"
  | "ALTO_IDADE_40_OU_MAIS"
  | "ALTO_SIFILIS_ANTECEDENTE"
  | "ALTO_SIFILIS_TRATAMENTO_NA_GESTACAO"
  // --- Intermedirio no guia → persistido como ALTO ---
  | "INT_IDADE_15_A_17"
  | "INT_IDADE_35_A_39"
  | "INT_IMC_30_A_39_9"
  | "INT_TABAGISMO"
  | "INT_ETILISMO"
  | "INT_HAS_FAMILIAR"
  | "INT_DIABETES_FAMILIAR"
  | "INT_GEMELAR_FAMILIAR"
  | "INT_INTERVALO_INTERGESTACIONAL_CURTO"
  | "INT_ABORTOS_RECORRENTES"
  | "INT_INFERTILIDADE"
  | "INT_CIRURGIA_PELVICA_UTERINA"
  | "INT_INFECCAO_URINARIA_GESTACAO"
  | "INT_RN_PESO_MENOR_2500G_PREVIO"
  | "INT_RN_MACROSSOMIA_PREVIA";

export type RiscoEstratificacaoPaciente = {
  idade: number | null;
  altura: number | null;
  peso_pre_gestacional: number | null;
};

export type RiscoEstratificacaoGestacao = {
  tipo_gravidez: string | null;
  is_hipertensao_arterial: boolean;
  is_diabetes_gestacional: boolean;
  is_cardiopatia: boolean;
  is_tromboembolismo: boolean;
  is_infeccao_urinaria: boolean;
  is_infertilidade: boolean;
  is_cirurgia_elvica_uterina: boolean;
  is_cirugia: boolean;
  tratamento_sifilis_dose_1: Date | null;
  tratamento_sifilis_dose_2: Date | null;
  tratamento_sifilis_dose_3: Date | null;
};

export type RiscoEstratificacaoAntecedentes = {
  n_mortos_primeira_semana: number | null;
  n_mortos_apos_primeira_semana: number | null;
  n_nascidos_mortos: number | null;
  n_parto_prematuro: number | null;
  n_abortos: number | null;
  n_bebe_menos_dois_kilos_e_meio: number | null;
  n_bebe_mais_quatro_kilos_e_meio: number | null;
  is_gesta_ectopica: boolean;
  is_gesta_molar: boolean;
  is_hipertensao_familiar: boolean;
  is_gravidez_gemelar_familiar: boolean;
  is_diabetes_familiar: boolean;
  is_fumo: boolean;
  is_alcool: boolean;
  is_drogas: boolean;
  is_cardiopatia: boolean;
  is_tromboembolismo: boolean;
  is_infertilidade: boolean;
  is_isoimunizacao_rh: boolean;
  is_cirurgia_pelvica_uterina: boolean;
  is_final_gestacao_anterior_1_ano: boolean;
  is_sifilis: boolean;
};

export type RiscoEstratificacaoInput = {
  paciente: RiscoEstratificacaoPaciente;
  gestacao: RiscoEstratificacaoGestacao;
  antecedentes: RiscoEstratificacaoAntecedentes | null;
};

export type ComputeTipoRiscoResult = {
  tipo_risco: RiscoGestacional;
  criterios: RiscoCriterioCodigo[];
};

function imcKgM2(alturaM: number | null, pesoKg: number | null): number | null {
  if (alturaM == null || pesoKg == null) return null;
  if (alturaM <= 0 || pesoKg <= 0) return null;
  return pesoKg / (alturaM * alturaM);
}

function isGestacaoMultipla(tipoGravidez: string | null | undefined): boolean {
  if (!tipoGravidez?.trim()) return false;
  const t = tipoGravidez.trim().toLowerCase();
  return t.includes("gemel") || t.includes("tripla") || t.includes("mltipl") || t.includes("multipl");
}

function hasSifilisTratamentoGestacao(g: RiscoEstratificacaoGestacao): boolean {
  return !!(g.tratamento_sifilis_dose_1 || g.tratamento_sifilis_dose_2 || g.tratamento_sifilis_dose_3);
}

function sumObitosNeonatais(a: RiscoEstratificacaoAntecedentes): number {
  return (a.n_mortos_primeira_semana ?? 0) + (a.n_mortos_apos_primeira_semana ?? 0) + (a.n_nascidos_mortos ?? 0);
}

function collectAlto(input: RiscoEstratificacaoInput): RiscoCriterioCodigo[] {
  const out: RiscoCriterioCodigo[] = [];
  const { paciente, gestacao, antecedentes } = input;

  if (gestacao.is_hipertensao_arterial) out.push("ALTO_HAS_GESTACAO_ATUAL");
  if (gestacao.is_diabetes_gestacional) out.push("ALTO_DIABETES_GESTACIONAL");
  if (gestacao.is_cardiopatia || antecedentes?.is_cardiopatia) out.push("ALTO_CARDIOPATIA");
  if (gestacao.is_tromboembolismo || antecedentes?.is_tromboembolismo) out.push("ALTO_TROMBOEMBOLISMO");
  if (isGestacaoMultipla(gestacao.tipo_gravidez)) out.push("ALTO_GESTACAO_MULTIPLA");
  if (antecedentes?.is_isoimunizacao_rh) out.push("ALTO_ISOIMUNIZACAO_RH");
  if (antecedentes?.is_gesta_ectopica) out.push("ALTO_HISTORICO_GESTACAO_ECTOPICA");
  if (antecedentes?.is_gesta_molar) out.push("ALTO_HISTORICO_GESTACAO_MOLAR");
  if (antecedentes && sumObitosNeonatais(antecedentes) > 0) out.push("ALTO_OBITO_FETAL_OU_NEONATAL_PREVIO");
  if (antecedentes != null && (antecedentes.n_parto_prematuro ?? 0) > 0) out.push("ALTO_PARTO_PREMATURO_PREVIO");
  if (antecedentes?.is_drogas) out.push("ALTO_USO_DROGAS");

  const imc = imcKgM2(paciente.altura, paciente.peso_pre_gestacional);
  if (imc != null && imc >= 40) out.push("ALTO_IMC_40_OU_MAIS");

  const idade = paciente.idade;
  if (idade != null && idade < 15) out.push("ALTO_IDADE_MENOR_15");
  if (idade != null && idade >= 40) out.push("ALTO_IDADE_40_OU_MAIS");

  if (antecedentes?.is_sifilis) out.push("ALTO_SIFILIS_ANTECEDENTE");
  if (hasSifilisTratamentoGestacao(gestacao)) out.push("ALTO_SIFILIS_TRATAMENTO_NA_GESTACAO");

  return out;
}

function collectIntermediario(input: RiscoEstratificacaoInput): RiscoCriterioCodigo[] {
  const out: RiscoCriterioCodigo[] = [];
  const { paciente, gestacao, antecedentes } = input;
  const idade = paciente.idade;

  if (idade != null && idade >= 15 && idade <= 17) out.push("INT_IDADE_15_A_17");
  if (idade != null && idade >= 35 && idade <= 39) out.push("INT_IDADE_35_A_39");

  const imc = imcKgM2(paciente.altura, paciente.peso_pre_gestacional);
  if (imc != null && imc >= 30 && imc < 40) out.push("INT_IMC_30_A_39_9");

  if (antecedentes?.is_fumo) out.push("INT_TABAGISMO");
  if (antecedentes?.is_alcool) out.push("INT_ETILISMO");
  if (antecedentes?.is_hipertensao_familiar) out.push("INT_HAS_FAMILIAR");
  if (antecedentes?.is_diabetes_familiar) out.push("INT_DIABETES_FAMILIAR");
  if (antecedentes?.is_gravidez_gemelar_familiar) out.push("INT_GEMELAR_FAMILIAR");
  if (antecedentes?.is_final_gestacao_anterior_1_ano) out.push("INT_INTERVALO_INTERGESTACIONAL_CURTO");
  if (antecedentes != null && (antecedentes.n_abortos ?? 0) >= 3) out.push("INT_ABORTOS_RECORRENTES");
  if (gestacao.is_infertilidade || antecedentes?.is_infertilidade) out.push("INT_INFERTILIDADE");
  if (gestacao.is_cirurgia_elvica_uterina || gestacao.is_cirugia || antecedentes?.is_cirurgia_pelvica_uterina) {
    out.push("INT_CIRURGIA_PELVICA_UTERINA");
  }
  if (gestacao.is_infeccao_urinaria) out.push("INT_INFECCAO_URINARIA_GESTACAO");
  if (antecedentes != null && (antecedentes.n_bebe_menos_dois_kilos_e_meio ?? 0) > 0) out.push("INT_RN_PESO_MENOR_2500G_PREVIO");
  if (antecedentes != null && (antecedentes.n_bebe_mais_quatro_kilos_e_meio ?? 0) > 0) out.push("INT_RN_MACROSSOMIA_PREVIA");

  return dedupe(out);
}

function dedupe<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/**
 * Calcula `tipo_risco` e a lista de critrios disparados (alto antes de intermedirio).
 */
export function computeTipoRisco(input: RiscoEstratificacaoInput): ComputeTipoRiscoResult {
  const alto = dedupe(collectAlto(input));
  if (alto.length > 0) {
    return { tipo_risco: RiscoGestacional.ALTO, criterios: alto };
  }
  const intermediario = collectIntermediario(input);
  if (intermediario.length > 0) {
    return { tipo_risco: RiscoGestacional.ALTO, criterios: intermediario };
  }
  return { tipo_risco: RiscoGestacional.HABITUAL, criterios: [] };
}
