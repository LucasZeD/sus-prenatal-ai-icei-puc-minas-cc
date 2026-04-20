import type { PrismaClient } from "../lib/prismaBarrel.js";
import { AppError } from "../core/errors.js";
import { hashCartaoSus, hashCpf, hmacSha256Hex } from "../lib/identificadores/pacienteIdsHash.js";
import { getPacienteIdsPepperOrThrow } from "../config/envPacienteIds.js";
import { pacienteAssepsisadoSelect, type PacienteAssepsisado } from "../repository/pacienteRepository.js";

type PacienteCreateData = {
  nome_mascarado: string;
  cpf_ultimos4?: string | null;
  cartao_sus_ultimos4?: string | null;
  nome_social?: string | null;
  data_nascimento?: Date | null;
  etnia?: string | null;
  escolaridade?: string | null;
  estado_civil?: string | null;
  ocupacao?: string | null;
  altura?: number | null;
  peso_pre_gestacional?: number | null;
};

function hashCpfOuSentinelaSemCpf(pacienteId: string, cpfBruto: string | undefined, pepper: string): string {
  if (cpfBruto) {
    return hashCpf(cpfBruto, pepper);
  }
  return hmacSha256Hex(`__sem_cpf_v1__:${pacienteId}`, pepper);
}

function hashCartaoOuSentinelaSemCartao(pacienteId: string, cartaoBruto: string | undefined, pepper: string): string {
  if (cartaoBruto) {
    return hashCartaoSus(cartaoBruto, pepper);
  }
  return hmacSha256Hex(`__sem_cartao_sus_v1__:${pacienteId}`, pepper);
}

/**
 * Cria paciente + linha `paciente_ids` (hashes determinísticos) na mesma transação.
 * CPF/Cartão completos não são persistidos em claro; duplicidade é detectável por hash único.
 */
export async function cadastrarPacienteComHashesIds(
  prisma: PrismaClient,
  data: PacienteCreateData,
  cpfBruto: string | undefined,
  cartaoSusBruto: string | undefined,
): Promise<PacienteAssepsisado> {
  const pepper = getPacienteIdsPepperOrThrow();

  return prisma.$transaction(async (tx) => {
    if (cpfBruto) {
      const h = hashCpf(cpfBruto, pepper);
      const ex = await tx.pacienteIds.findUnique({ where: { cpf_hash: h } });
      if (ex) {
        throw new AppError("conflict", "Este CPF já está vinculado a outro cadastro de paciente.", 409);
      }
    }
    if (cartaoSusBruto) {
      const h = hashCartaoSus(cartaoSusBruto, pepper);
      const ex = await tx.pacienteIds.findUnique({ where: { cartao_sus_hash: h } });
      if (ex) {
        throw new AppError("conflict", "Este Cartão SUS já está vinculado a outro cadastro de paciente.", 409);
      }
    }

    const created = await tx.paciente.create({
      data,
      select: pacienteAssepsisadoSelect,
    });

    const cpf_hash = hashCpfOuSentinelaSemCpf(created.id, cpfBruto, pepper);
    const cartao_sus_hash = hashCartaoOuSentinelaSemCartao(created.id, cartaoSusBruto, pepper);

    await tx.pacienteIds.create({
      data: {
        paciente_id: created.id,
        cpf_hash,
        cartao_sus_hash,
      },
    });

    return created as PacienteAssepsisado;
  });
}

export type VerificacaoIdentificadores = {
  cpf_em_uso: boolean;
  cartao_em_uso: boolean;
  paciente_id_cpf?: string;
  paciente_id_cartao?: string;
};

export async function verificarIdentificadoresPaciente(
  prisma: PrismaClient,
  cpfBruto: string | undefined,
  cartaoSusBruto: string | undefined,
): Promise<VerificacaoIdentificadores> {
  const pepper = getPacienteIdsPepperOrThrow();
  let cpf_em_uso = false;
  let cartao_em_uso = false;
  let paciente_id_cpf: string | undefined;
  let paciente_id_cartao: string | undefined;

  try {
    if (cpfBruto) {
      const h = hashCpf(cpfBruto, pepper);
      const row = await prisma.pacienteIds.findUnique({ where: { cpf_hash: h } });
      if (row) {
        cpf_em_uso = true;
        paciente_id_cpf = row.paciente_id;
      }
    }
    if (cartaoSusBruto) {
      const h = hashCartaoSus(cartaoSusBruto, pepper);
      const row = await prisma.pacienteIds.findUnique({ where: { cartao_sus_hash: h } });
      if (row) {
        cartao_em_uso = true;
        paciente_id_cartao = row.paciente_id;
      }
    }
  } catch (e) {
    if (e instanceof Error && (e.message === "cpf_invalido" || e.message === "cartao_sus_invalido")) {
      throw new AppError("validation_error", "CPF ou Cartão SUS com formato inválido para verificação.", 400);
    }
    throw e;
  }

  return { cpf_em_uso, cartao_em_uso, paciente_id_cpf, paciente_id_cartao };
}
