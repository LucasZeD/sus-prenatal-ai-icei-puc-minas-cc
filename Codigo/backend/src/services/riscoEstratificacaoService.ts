import type { PrismaClient } from "../lib/prismaBarrel.js";
import {
  computeTipoRisco,
  type RiscoEstratificacaoAntecedentes,
  type RiscoEstratificacaoGestacao,
  type RiscoEstratificacaoInput,
  type RiscoEstratificacaoPaciente,
  type RiscoCriterioCodigo,
} from "../domain/riscoMs2024.js";
import type { Gestacao } from "../repository/gestacaoRepository.js";

type GestacaoComRisco = Gestacao & {
  paciente: RiscoEstratificacaoPaciente;
  antecedentes: RiscoEstratificacaoAntecedentes | null;
};

function mapRowToInput(row: GestacaoComRisco): RiscoEstratificacaoInput {
  const gestacao: RiscoEstratificacaoGestacao = {
    tipo_gravidez: row.tipo_gravidez,
    is_hipertensao_arterial: row.is_hipertensao_arterial,
    is_diabetes_gestacional: row.is_diabetes_gestacional,
    is_cardiopatia: row.is_cardiopatia,
    is_tromboembolismo: row.is_tromboembolismo,
    is_infeccao_urinaria: row.is_infeccao_urinaria,
    is_infertilidade: row.is_infertilidade,
    is_cirurgia_elvica_uterina: row.is_cirurgia_elvica_uterina,
    is_cirugia: row.is_cirugia,
    tratamento_sifilis_dose_1: row.tratamento_sifilis_dose_1,
    tratamento_sifilis_dose_2: row.tratamento_sifilis_dose_2,
    tratamento_sifilis_dose_3: row.tratamento_sifilis_dose_3,
  };
  const paciente: RiscoEstratificacaoPaciente = {
    idade: row.paciente.idade,
    altura: row.paciente.altura,
    peso_pre_gestacional: row.paciente.peso_pre_gestacional,
  };
  return { paciente, gestacao, antecedentes: row.antecedentes };
}

export type SyncTipoRiscoGestacaoResult = {
  gestacao: Gestacao;
  criterios: RiscoCriterioCodigo[];
  tipo_risco_alterado: boolean;
};

/**
 * Recalcula e persiste `tipo_risco` quando difere do valor atual.
 */
export async function syncTipoRiscoGestacao(prisma: PrismaClient, gestacaoId: string): Promise<SyncTipoRiscoGestacaoResult | null> {
  const row = await prisma.gestacao.findUnique({
    where: { id: gestacaoId },
    include: {
      paciente: {
        select: { idade: true, altura: true, peso_pre_gestacional: true },
      },
      antecedentes: true,
    },
  });
  if (!row) return null;

  const input = mapRowToInput(row as GestacaoComRisco);
  const { tipo_risco, criterios } = computeTipoRisco(input);
  let tipo_risco_alterado = false;
  if (row.tipo_risco !== tipo_risco) {
    await prisma.gestacao.update({
      where: { id: gestacaoId },
      data: { tipo_risco },
    });
    tipo_risco_alterado = true;
  }
  const gestacao = await prisma.gestacao.findUnique({ where: { id: gestacaoId } });
  if (!gestacao) return null;
  return { gestacao, criterios, tipo_risco_alterado };
}

/**
 * Recalcula risco para todas as gestaes ativas do paciente (normalmente uma).
 */
export async function syncTipoRiscoGestacoesAtivasDoPaciente(
  prisma: PrismaClient,
  pacienteId: string,
): Promise<SyncTipoRiscoGestacaoResult[]> {
  const ids = await prisma.gestacao.findMany({
    where: { paciente_id: pacienteId, is_ativa: true },
    select: { id: true },
  });
  const out: SyncTipoRiscoGestacaoResult[] = [];
  for (const { id } of ids) {
    const r = await syncTipoRiscoGestacao(prisma, id);
    if (r) out.push(r);
  }
  return out;
}
