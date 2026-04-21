import type { Prisma } from "../lib/prismaBarrel.js";
import { StatusConsulta } from "../lib/prismaBarrel.js";
import { AppError } from "../core/errors.js";
import type { Consulta } from "../repository/consultaRepository.js";

function assertStatusTransition(from: StatusConsulta, to: StatusConsulta): void {
  if (from === to) {
    return;
  }
  if (from === StatusConsulta.CONFIRMADA && to !== StatusConsulta.CONFIRMADA) {
    throw new AppError("validation_error", "Consulta confirmada não admite mudança de status.", 400);
  }
  const next: Partial<Record<StatusConsulta, StatusConsulta[]>> = {
    [StatusConsulta.RASCUNHO]: [StatusConsulta.EM_ANDAMENTO, StatusConsulta.AGUARDANDO_CONFIRMACAO],
    [StatusConsulta.EM_ANDAMENTO]: [StatusConsulta.AGUARDANDO_CONFIRMACAO],
    [StatusConsulta.AGUARDANDO_CONFIRMACAO]: [StatusConsulta.CONFIRMADA],
    [StatusConsulta.CONFIRMADA]: [],
  };
  const allowed = next[from] ?? [];
  if (!allowed.includes(to)) {
    throw new AppError(
      "validation_error",
      `Transição de status inválida (${from} → ${to}). Esperado: RASCUNHO→EM_ANDAMENTO|AGUARDANDO_CONFIRMACAO; EM_ANDAMENTO→AGUARDANDO_CONFIRMACAO; AGUARDANDO_CONFIRMACAO→CONFIRMADA.`,
      400,
    );
  }
}

export type ConsultaPatchInput = {
  status?: StatusConsulta;
  validacao_medica?: boolean;
  /** Remarcação (apenas enquanto NÃO confirmada). */
  data?: Date;
  idade_gestacional?: number | null;
  peso?: number | null;
  pa_sistolica?: number | null;
  pa_diastolica?: number | null;
  au?: number | null;
  bfc?: number | null;
  is_edema?: boolean;
  mov_fetal?: string | null;
  apresentacao_fetal?: string | null;
  queixa?: string | null;
  is_exantema?: boolean;
};

/**
 * Monta o `data` do Prisma para `consulta.update`, aplicando regras de domínio em status e validação médica.
 */
export function buildConsultaPatchUpdate(current: Consulta, patch: ConsultaPatchInput): Prisma.ConsultaUpdateInput {
  if (current.status === StatusConsulta.CONFIRMADA && patch.validacao_medica === false) {
    throw new AppError("validation_error", "Consulta confirmada: validação médica não pode ser desmarcada.", 400);
  }
  if (current.status === StatusConsulta.CONFIRMADA && patch.data !== undefined) {
    throw new AppError("validation_error", "Consulta confirmada não admite remarcação de data/horário.", 400);
  }

  const data: Prisma.ConsultaUpdateInput = {};

  if (patch.data !== undefined) {
    data.data = patch.data;
  }

  if (patch.validacao_medica !== undefined) {
    data.validacao_medica = patch.validacao_medica;
  }

  if (patch.status !== undefined) {
    assertStatusTransition(current.status, patch.status);
    data.status = patch.status;
  }

  const mergedValidacao =
    patch.validacao_medica !== undefined ? patch.validacao_medica : current.validacao_medica;

  const nextStatus = patch.status !== undefined ? patch.status : current.status;
  if (nextStatus === StatusConsulta.CONFIRMADA && !mergedValidacao) {
    throw new AppError(
      "validation_error",
      "Somente consultas com validação médica (validacao_medica: true) podem ir para CONFIRMADA.",
      400,
    );
  }

  if (patch.idade_gestacional !== undefined) {
    data.idade_gestacional = patch.idade_gestacional;
  }

  if (patch.peso !== undefined) {
    data.peso = patch.peso;
  }
  if (patch.pa_sistolica !== undefined) {
    data.pa_sistolica = patch.pa_sistolica;
  }
  if (patch.pa_diastolica !== undefined) {
    data.pa_diastolica = patch.pa_diastolica;
  }
  if (patch.au !== undefined) {
    data.au = patch.au;
  }
  if (patch.bfc !== undefined) {
    data.bfc = patch.bfc;
  }
  if (patch.is_edema !== undefined) {
    data.is_edema = patch.is_edema;
  }
  if (patch.mov_fetal !== undefined) {
    data.mov_fetal = patch.mov_fetal;
  }
  if (patch.apresentacao_fetal !== undefined) {
    data.apresentacao_fetal = patch.apresentacao_fetal;
  }
  if (patch.queixa !== undefined) {
    data.queixa = patch.queixa;
  }
  if (patch.is_exantema !== undefined) {
    data.is_exantema = patch.is_exantema;
  }

  if (Object.keys(data).length === 0) {
    throw new AppError("validation_error", "Nenhum campo válido para atualização.", 400);
  }

  return data;
}
