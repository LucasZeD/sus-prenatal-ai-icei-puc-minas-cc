import type { Hono } from "hono";
import { RiscoGestacional, StatusConsulta } from "../../lib/prismaBarrel.js";
import { AppError } from "../../core/errors.js";
import { extrairUltimos4CartaoSus, extrairUltimos4Cpf } from "../../lib/identificadores/pacienteUltimosDigitos.js";
import { isUuid } from "../../lib/validation/uuid.js";
import type { AuthVariables } from "../../middleware/requireAuth.js";
import { ConsultaRepository } from "../../repository/consultaRepository.js";
import { GestacaoRepository } from "../../repository/gestacaoRepository.js";
import { PacienteRepository } from "../../repository/pacienteRepository.js";
import { getPrisma } from "../../repository/prisma.js";
import { UnidadeRepository } from "../../repository/unidadeRepository.js";
import {
  cadastrarPacienteComHashesIds,
  verificarIdentificadoresPaciente,
} from "../../services/pacienteCadastroComIdsService.js";
import { buildConsultaPatchUpdate, type ConsultaPatchInput } from "../../services/consultaPatchService.js";

function parseIsoDateOnly(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const d = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function parseOptionalInt(value: unknown): number | undefined {
  const n = parseOptionalNumber(value);
  if (n === undefined) {
    return undefined;
  }
  const i = Math.trunc(n);
  return Number.isFinite(i) ? i : undefined;
}

function parseOptionalBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return undefined;
}

function parseOptionalString(value: unknown, max: number): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const t = value.trim();
  if (!t) {
    return undefined;
  }
  return t.length > max ? t.slice(0, max) : t;
}

/** Para PATCH: `null` limpa campo opcional; `undefined` omite. */
function parseOptionalStringNullable(value: unknown, max: number): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const t = value.trim();
  if (!t) {
    return null;
  }
  return t.length > max ? t.slice(0, max) : t;
}

function parseOptionalNumberNullable(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function registerClinicalV1Routes(secured: Hono<{ Variables: AuthVariables }>): void {
  const pacientes = new PacienteRepository();
  const gestacoes = new GestacaoRepository();
  const consultas = new ConsultaRepository();
  const unidades = new UnidadeRepository();

  secured.get("/pacientes", async (c) => {
    const list = await pacientes.findManyAssepsisado();
    return c.json(list);
  });

  /** Pré-cadastro: verifica se CPF/Cartão SUS já existem (via hash em `paciente_ids`). */
  secured.post("/pacientes/verificar-identificadores", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError("bad_request", "Corpo da requisição deve ser JSON.", 400);
    }
    if (!body || typeof body !== "object") {
      throw new AppError("validation_error", "Payload inválido.", 400);
    }
    const rec = body as Record<string, unknown>;
    const cpfBruto = parseOptionalString(rec.cpf, 20);
    const cartaoSusBruto = parseOptionalString(rec.cartao_sus, 22);
    if (!cpfBruto && !cartaoSusBruto) {
      throw new AppError("validation_error", "Informe cpf e/ou cartao_sus para verificação.", 400);
    }
    const prisma = getPrisma();
    const resultado = await verificarIdentificadoresPaciente(prisma, cpfBruto, cartaoSusBruto);
    return c.json(resultado);
  });

  secured.get("/pacientes/:id", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) {
      throw new AppError("validation_error", "Identificador de paciente inválido.", 400);
    }
    const row = await pacientes.findUniqueAssepsisado(id);
    if (!row) {
      throw new AppError("not_found", "Paciente não encontrado.", 404);
    }
    return c.json(row);
  });

  secured.post("/pacientes", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError("bad_request", "Corpo da requisição deve ser JSON.", 400);
    }
    if (!body || typeof body !== "object") {
      throw new AppError("validation_error", "Payload inválido.", 400);
    }
    const rec = body as Record<string, unknown>;
    const nome_mascarado = parseOptionalString(rec.nome_mascarado, 50);
    if (!nome_mascarado) {
      throw new AppError("validation_error", "Campo nome_mascarado é obrigatório.", 400);
    }
    const cpfBruto = parseOptionalString(rec.cpf, 20);
    const cartaoSusBruto = parseOptionalString(rec.cartao_sus, 22);
    if (!cpfBruto && !cartaoSusBruto) {
      throw new AppError(
        "validation_error",
        "Informe CPF e/ou Cartão SUS: os últimos dígitos aparecem na agenda; o documento completo vira hash em paciente_ids (com PACIENTE_IDS_PEPPER) para busca e anti-duplicidade.",
        400,
      );
    }
    const cpf_ultimos4 = cpfBruto ? extrairUltimos4Cpf(cpfBruto) : null;
    const cartao_sus_ultimos4 = cartaoSusBruto ? extrairUltimos4CartaoSus(cartaoSusBruto) : null;
    if (cpfBruto && !cpf_ultimos4) {
      throw new AppError("validation_error", "CPF inválido (esperado 11 dígitos).", 400);
    }
    if (cartaoSusBruto && !cartao_sus_ultimos4) {
      throw new AppError("validation_error", "Cartão SUS inválido (esperado ao menos 15 dígitos).", 400);
    }
    const data_nascimento = parseIsoDateOnly(rec.data_nascimento);

    const prisma = getPrisma();
    const created = await cadastrarPacienteComHashesIds(
      prisma,
      {
        nome_mascarado,
        cpf_ultimos4: cpf_ultimos4 ?? undefined,
        cartao_sus_ultimos4: cartao_sus_ultimos4 ?? undefined,
        nome_social: parseOptionalString(rec.nome_social, 50),
        data_nascimento: data_nascimento ?? undefined,
        etnia: parseOptionalString(rec.etnia, 50),
        escolaridade: parseOptionalString(rec.escolaridade, 50),
        estado_civil: parseOptionalString(rec.estado_civil, 50),
        ocupacao: parseOptionalString(rec.ocupacao, 50),
        altura: parseOptionalNumber(rec.altura),
        peso_pre_gestacional: parseOptionalNumber(rec.peso_pre_gestacional),
      },
      cpfBruto,
      cartaoSusBruto,
    );
    return c.json(created, 201);
  });

  secured.get("/gestacoes", async (c) => {
    const pacienteId = c.req.query("paciente_id");
    if (!pacienteId || !isUuid(pacienteId)) {
      throw new AppError("validation_error", "Query paciente_id (UUID) é obrigatória.", 400);
    }
    const list = await gestacoes.findByPacienteId(pacienteId);
    return c.json(list);
  });

  secured.get("/gestacoes/:id", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) {
      throw new AppError("validation_error", "Identificador de gestação inválido.", 400);
    }
    const row = await gestacoes.findById(id);
    if (!row) {
      throw new AppError("not_found", "Gestação não encontrada.", 404);
    }
    return c.json(row);
  });

  secured.post("/gestacoes", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError("bad_request", "Corpo da requisição deve ser JSON.", 400);
    }
    if (!body || typeof body !== "object") {
      throw new AppError("validation_error", "Payload inválido.", 400);
    }
    const rec = body as Record<string, unknown>;
    const paciente_id = typeof rec.paciente_id === "string" ? rec.paciente_id.trim() : "";
    if (!isUuid(paciente_id)) {
      throw new AppError("validation_error", "paciente_id deve ser um UUID válido.", 400);
    }

    let tipo_risco: RiscoGestacional | undefined;
    if (rec.tipo_risco !== undefined && rec.tipo_risco !== null) {
      if (typeof rec.tipo_risco !== "string" || !Object.values(RiscoGestacional).includes(rec.tipo_risco as RiscoGestacional)) {
        throw new AppError("validation_error", "tipo_risco inválido.", 400);
      }
      tipo_risco = rec.tipo_risco as RiscoGestacional;
    }

    const created = await gestacoes.create({
      paciente_id,
      dum: parseOptionalString(rec.dum, 8000),
      dpp: parseOptionalString(rec.dpp, 8000),
      ig_inicial: parseOptionalInt(rec.ig_inicial),
      tipo_risco,
      abo_rh: parseOptionalString(rec.abo_rh, 50),
      coombs: parseOptionalString(rec.coombs, 50),
      tipo_gravidez: parseOptionalString(rec.tipo_gravidez, 100),
      idade_gestac_confirmada: parseOptionalInt(rec.idade_gestac_confirmada),
      is_planejada: parseOptionalString(rec.is_planejada, 50),
    });
    return c.json(created, 201);
  });

  secured.get("/consultas", async (c) => {
    const gestacaoId = c.req.query("gestacao_id");
    if (!gestacaoId || !isUuid(gestacaoId)) {
      throw new AppError("validation_error", "Query gestacao_id (UUID) é obrigatória.", 400);
    }
    const list = await consultas.findByGestacaoId(gestacaoId);
    return c.json(list);
  });

  /** Worklist: consultas não confirmadas, com resumo de paciente/gestação (para escolher UUID e abrir o stream). */
  secured.get("/consultas/disponiveis-stream", async (c) => {
    const rows = await consultas.findDisponiveisParaAtendimento();
    return c.json(
      rows.map((r) => ({
        id: r.id,
        status: r.status,
        data: r.data.toISOString().slice(0, 10),
        gestacao_id: r.gestacao_id,
        unidade: r.unidade,
        paciente: {
          id: r.gestacao.paciente_id,
          nome_mascarado: r.gestacao.paciente.nome_mascarado,
          cpf_ultimos4: r.gestacao.paciente.cpf_ultimos4,
          cartao_sus_ultimos4: r.gestacao.paciente.cartao_sus_ultimos4,
        },
        tipo_risco_gestacao: r.gestacao.tipo_risco,
      })),
    );
  });

  secured.get("/unidades", async (c) => {
    const list = await unidades.findMany();
    return c.json(list);
  });

  secured.get("/consultas/:id", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) {
      throw new AppError("validation_error", "Identificador de consulta inválido.", 400);
    }
    const row = await consultas.findById(id);
    if (!row) {
      throw new AppError("not_found", "Consulta não encontrada.", 404);
    }
    return c.json(row);
  });

  /** Atualização parcial: sinais vitais/texto livre + `status` + `validacao_medica` (regras em `consultaPatchService`). */
  secured.patch("/consultas/:id", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) {
      throw new AppError("validation_error", "Identificador de consulta inválido.", 400);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError("bad_request", "Corpo da requisição deve ser JSON.", 400);
    }
    if (!body || typeof body !== "object") {
      throw new AppError("validation_error", "Payload inválido.", 400);
    }
    const rec = body as Record<string, unknown>;
    const current = await consultas.findById(id);
    if (!current) {
      throw new AppError("not_found", "Consulta não encontrada.", 404);
    }

    let status: StatusConsulta | undefined;
    if (rec.status !== undefined) {
      if (rec.status === null) {
        throw new AppError("validation_error", "status não pode ser nulo.", 400);
      }
      if (typeof rec.status !== "string" || !Object.values(StatusConsulta).includes(rec.status as StatusConsulta)) {
        throw new AppError("validation_error", "status inválido.", 400);
      }
      status = rec.status as StatusConsulta;
    }

    const patch: ConsultaPatchInput = {
      status,
      validacao_medica: parseOptionalBool(rec.validacao_medica),
      peso: parseOptionalNumberNullable(rec.peso),
      pa_sistolica: parseOptionalNumberNullable(rec.pa_sistolica),
      pa_diastolica: parseOptionalNumberNullable(rec.pa_diastolica),
      au: parseOptionalNumberNullable(rec.au),
      bfc: parseOptionalNumberNullable(rec.bfc),
      is_edema: parseOptionalBool(rec.is_edema),
      mov_fetal: parseOptionalStringNullable(rec.mov_fetal, 2000),
      apresentacao_fetal: parseOptionalStringNullable(rec.apresentacao_fetal, 2000),
      queixa: parseOptionalStringNullable(rec.queixa, 4000),
      enxantema: parseOptionalBool(rec.enxantema),
      is_visita_maternidade: parseOptionalBool(rec.is_visita_maternidade),
      is_particip_atvd_educativa: parseOptionalBool(rec.is_particip_atvd_educativa),
    };

    const hasAny =
      patch.status !== undefined ||
      patch.validacao_medica !== undefined ||
      patch.peso !== undefined ||
      patch.pa_sistolica !== undefined ||
      patch.pa_diastolica !== undefined ||
      patch.au !== undefined ||
      patch.bfc !== undefined ||
      patch.is_edema !== undefined ||
      patch.mov_fetal !== undefined ||
      patch.apresentacao_fetal !== undefined ||
      patch.queixa !== undefined ||
      patch.enxantema !== undefined ||
      patch.is_visita_maternidade !== undefined ||
      patch.is_particip_atvd_educativa !== undefined;
    if (!hasAny) {
      throw new AppError("validation_error", "Informe ao menos um campo para atualizar.", 400);
    }

    const data = buildConsultaPatchUpdate(current, patch);
    const updated = await consultas.updateById(id, data);
    return c.json(updated);
  });

  secured.post("/consultas", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError("bad_request", "Corpo da requisição deve ser JSON.", 400);
    }
    if (!body || typeof body !== "object") {
      throw new AppError("validation_error", "Payload inválido.", 400);
    }
    const rec = body as Record<string, unknown>;
    const gestacao_id = typeof rec.gestacao_id === "string" ? rec.gestacao_id.trim() : "";
    const unidade_id = typeof rec.unidade_id === "string" ? rec.unidade_id.trim() : "";
    if (!isUuid(gestacao_id) || !isUuid(unidade_id)) {
      throw new AppError("validation_error", "gestacao_id e unidade_id devem ser UUIDs válidos.", 400);
    }
    const data = parseIsoDateOnly(rec.data);
    if (!data) {
      throw new AppError("validation_error", "Campo data é obrigatório (formato YYYY-MM-DD).", 400);
    }

    const created = await consultas.create({
      gestacao_id,
      unidade_id,
      data,
      peso: parseOptionalNumber(rec.peso),
      pa_sistolica: parseOptionalNumber(rec.pa_sistolica),
      pa_diastolica: parseOptionalNumber(rec.pa_diastolica),
      au: parseOptionalNumber(rec.au),
      bfc: parseOptionalNumber(rec.bfc),
      is_edema: parseOptionalBool(rec.is_edema),
      mov_fetal: parseOptionalString(rec.mov_fetal, 2000),
      apresentacao_fetal: parseOptionalString(rec.apresentacao_fetal, 2000),
      queixa: parseOptionalString(rec.queixa, 4000),
      enxantema: parseOptionalBool(rec.enxantema),
      is_visita_maternidade: parseOptionalBool(rec.is_visita_maternidade),
      is_particip_atvd_educativa: parseOptionalBool(rec.is_particip_atvd_educativa),
    });
    return c.json(created, 201);
  });
}
