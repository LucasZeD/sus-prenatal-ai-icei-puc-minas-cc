import type { Hono } from "hono";
import {
  AboRh,
  RiscoGestacional,
  StatusConsulta,
  Etnia,
  Escolaridade,
  EstadoCivil,
  type Prisma,
} from "../../lib/prismaBarrel.js";
import { AppError } from "../../core/errors.js";
import { extrairUltimos4CartaoSus, extrairUltimos4Cpf } from "../../lib/identificadores/pacienteUltimosDigitos.js";
import { isUuid } from "../../lib/validation/uuid.js";
import type { AuthVariables } from "../../middleware/requireAuth.js";
import { ConsultaRepository } from "../../repository/consultaRepository.js";
import { GestacaoRepository } from "../../repository/gestacaoRepository.js";
import { PacienteRepository, pacienteAssepsisadoSelect } from "../../repository/pacienteRepository.js";
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

function parseIsoDateTime(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }
  const t = value.trim();
  if (!t) {
    return null;
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseOptionalIsoDateTime(value: unknown, fieldName: string): Date | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const parsed = parseIsoDateTime(value);
  if (!parsed) {
    throw new AppError(
      "validation_error",
      `${fieldName} deve estar no formato ISO DateTime (ex.: 2026-04-21T14:30:00.000Z).`,
      400,
    );
  }
  return parsed;
}

function parseOptionalIsoDateOnly(value: unknown, fieldName: string): Date | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const parsed = parseIsoDateOnly(value);
  if (!parsed) {
    throw new AppError("validation_error", `${fieldName} deve estar no formato YYYY-MM-DD.`, 400);
  }
  return parsed;
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

function parseOptionalIntNullable(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const n = parseOptionalNumberNullable(value);
  if (n === undefined) {
    return undefined;
  }
  if (n === null) {
    return null;
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

function parseOptionalEnum<T extends Record<string, string>>(
  enumObj: T,
  value: unknown,
  fieldName: string,
): T[keyof T] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string" || !(Object.values(enumObj) as string[]).includes(value)) {
    throw new AppError("validation_error", `${fieldName} inválido.`, 400);
  }
  return value as T[keyof T];
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

function calcIdadeEmAnos(dataNascimento: Date, now = new Date()): number {
  const y = now.getUTCFullYear() - dataNascimento.getUTCFullYear();
  const m = now.getUTCMonth() - dataNascimento.getUTCMonth();
  const d = now.getUTCDate() - dataNascimento.getUTCDate();
  const hasHadBirthdayThisYear = m > 0 || (m === 0 && d >= 0);
  return Math.max(0, hasHadBirthdayThisYear ? y : y - 1);
}

export function registerClinicalV1Routes(secured: Hono<{ Variables: AuthVariables }>): void {
  const pacientes = new PacienteRepository();
  const gestacoes = new GestacaoRepository();
  const consultas = new ConsultaRepository();
  const unidades = new UnidadeRepository();

  secured.get("/pacientes", async (c) => {
    const list = await pacientes.findManyAssepsisadoResumo();
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

  /**
   * Atualização parcial do perfil do paciente (DER `PACIENTE`).
   * - `undefined`: omite (não altera)
   * - `null`: limpa campo opcional
   */
  secured.patch("/pacientes/:id", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) {
      throw new AppError("validation_error", "Identificador de paciente inválido.", 400);
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

    const data_nascimento_raw = rec.data_nascimento;
    const data_nascimento =
      data_nascimento_raw === undefined
        ? undefined
        : data_nascimento_raw === null
          ? null
          : (() => {
              const parsed = parseIsoDateOnly(data_nascimento_raw);
              if (!parsed) {
                throw new AppError("validation_error", "data_nascimento deve estar no formato YYYY-MM-DD.", 400);
              }
              return parsed;
            })();

    const patch = {
      nome_social: parseOptionalStringNullable(rec.nome_social, 50),
      data_nascimento,
      idade:
        data_nascimento === undefined ? undefined : data_nascimento === null ? null : calcIdadeEmAnos(data_nascimento),
      etnia: parseOptionalEnum(Etnia as any, rec.etnia, "etnia"),
      escolaridade: parseOptionalEnum(Escolaridade as any, rec.escolaridade, "escolaridade"),
      estado_civil: parseOptionalEnum(EstadoCivil as any, rec.estado_civil, "estado_civil"),
      ocupacao: parseOptionalStringNullable(rec.ocupacao, 50),
      abo_rh: parseOptionalEnum(AboRh as any, rec.abo_rh, "abo_rh"),
      telefone: parseOptionalStringNullable(rec.telefone, 40),
      email: parseOptionalStringNullable(rec.email, 255),
      localizacao: parseOptionalStringNullable(rec.localizacao, 120),
      altura: parseOptionalNumberNullable(rec.altura),
      peso_pre_gestacional: parseOptionalNumberNullable(rec.peso_pre_gestacional),
      is_particip_atvd_educativa: parseOptionalBool(rec.is_particip_atvd_educativa),
    } as const;

    const hasAny =
      Object.values(patch).some((v) => v !== undefined) ||
      data_nascimento !== undefined;
    if (!hasAny) {
      throw new AppError("validation_error", "Informe ao menos um campo para atualização.", 400);
    }

    const prisma = getPrisma();
    const updated = await prisma.paciente.update({
      where: { id },
      data: patch as any,
      select: pacienteAssepsisadoSelect,
    });
    return c.json(updated);
  });

  /** Paciente "full": usado pelo prontuário longitudinal (sem mocks). */
  secured.get("/pacientes/:id/full", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) {
      throw new AppError("validation_error", "Identificador de paciente inválido.", 400);
    }
    const prisma = getPrisma();
    const row = await prisma.paciente.findUnique({
      where: { id },
      include: {
        parceiro: true,
        vacinas: { orderBy: { data: "desc" } },
        exames: { orderBy: { data_coleta: "desc" } },
        gestacoes: {
          orderBy: { id: "desc" },
          include: {
            antecedentes: true,
            avaliacao_odonto: true,
            plano_parto: true,
            usgs: true,
            desfecho: true,
            consultas_pos_parto: { orderBy: { data: "desc" } },
          },
        },
      },
    });
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
        etnia: parseOptionalEnum(Etnia as any, rec.etnia, "etnia") ?? undefined,
        escolaridade: parseOptionalEnum(Escolaridade as any, rec.escolaridade, "escolaridade") ?? undefined,
        estado_civil: parseOptionalEnum(EstadoCivil as any, rec.estado_civil, "estado_civil") ?? undefined,
        ocupacao: parseOptionalString(rec.ocupacao, 50),
        abo_rh: parseOptionalEnum(AboRh as any, rec.abo_rh, "abo_rh"),
        telefone: parseOptionalString(rec.telefone, 40),
        email: parseOptionalString(rec.email, 255),
        localizacao: parseOptionalString(rec.localizacao, 120),
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
      dum: parseOptionalIsoDateOnly(rec.dum, "dum"),
      dpp: parseOptionalIsoDateOnly(rec.dpp, "dpp"),
      dpp_eco: parseOptionalIsoDateOnly(rec.dpp_eco, "dpp_eco"),
      ig_inicial: parseOptionalInt(rec.ig_inicial),
      tipo_risco,
      coombs: parseOptionalString(rec.coombs, 50),
      tipo_gravidez: parseOptionalString(rec.tipo_gravidez, 100),
      idade_gestac_confirmada: parseOptionalInt(rec.idade_gestac_confirmada),
      is_planejada: parseOptionalBool(rec.is_planejada),
      is_visita_maternidade: parseOptionalBool(rec.is_visita_maternidade),
      is_ativa: parseOptionalBool(rec.is_ativa),
      is_colocar_diu: parseOptionalBool(rec.is_colocar_diu),
      is_did_consulta_odontologica: parseOptionalBool(rec.is_did_consulta_odontologica),
      is_diabetes_gestacional: parseOptionalBool(rec.is_diabetes_gestacional),
      is_infeccao_urinaria: parseOptionalBool(rec.is_infeccao_urinaria),
      is_infertilidade: parseOptionalBool(rec.is_infertilidade),
      is_dificuldade_alimentar: parseOptionalBool(rec.is_dificuldade_alimentar),
      is_cardiopatia: parseOptionalBool(rec.is_cardiopatia),
      is_tromboembolismo: parseOptionalBool(rec.is_tromboembolismo),
      is_hipertensao_arterial: parseOptionalBool(rec.is_hipertensao_arterial),
      is_cirurgia_elvica_uterina: parseOptionalBool(rec.is_cirurgia_elvica_uterina),
      is_cirugia: parseOptionalBool(rec.is_cirugia),
      tratamento_sifilis_dose_1: parseOptionalIsoDateOnly(rec.tratamento_sifilis_dose_1, "tratamento_sifilis_dose_1"),
      tratamento_sifilis_dose_2: parseOptionalIsoDateOnly(rec.tratamento_sifilis_dose_2, "tratamento_sifilis_dose_2"),
      tratamento_sifilis_dose_3: parseOptionalIsoDateOnly(rec.tratamento_sifilis_dose_3, "tratamento_sifilis_dose_3"),
      suplementacao_ferro: parseOptionalBool(rec.suplementacao_ferro),
      suplementacao_acido_folico: parseOptionalBool(rec.suplementacao_acido_folico),
    });
    return c.json(created, 201);
  });

  /**
   * Atualização parcial da gestação (DER `GESTACAO`).
   * - `undefined`: omite (não altera)
   * - `null`: limpa campo opcional (datas/campos texto)
   */
  secured.patch("/gestacoes/:id", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) {
      throw new AppError("validation_error", "Identificador de gestação inválido.", 400);
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

    const dum = parseOptionalIsoDateOnly(rec.dum, "dum");
    const dpp = parseOptionalIsoDateOnly(rec.dpp, "dpp");
    const dpp_eco = parseOptionalIsoDateOnly(rec.dpp_eco, "dpp_eco");

    let tipo_risco: RiscoGestacional | undefined;
    if (rec.tipo_risco !== undefined && rec.tipo_risco !== null) {
      if (typeof rec.tipo_risco !== "string" || !Object.values(RiscoGestacional).includes(rec.tipo_risco as RiscoGestacional)) {
        throw new AppError("validation_error", "tipo_risco inválido.", 400);
      }
      tipo_risco = rec.tipo_risco as RiscoGestacional;
    }

    const patch = {
      dum,
      dpp,
      dpp_eco,
      ig_inicial: parseOptionalInt(rec.ig_inicial),
      tipo_risco,
      coombs: parseOptionalString(rec.coombs, 50),
      tipo_gravidez: parseOptionalString(rec.tipo_gravidez, 100),
      idade_gestac_confirmada: parseOptionalInt(rec.idade_gestac_confirmada),
      is_planejada: parseOptionalBool(rec.is_planejada),
      is_visita_maternidade: parseOptionalBool(rec.is_visita_maternidade),
      is_ativa: parseOptionalBool(rec.is_ativa),
      is_colocar_diu: parseOptionalBool(rec.is_colocar_diu),
      is_did_consulta_odontologica: parseOptionalBool(rec.is_did_consulta_odontologica),
      is_diabetes_gestacional: parseOptionalBool(rec.is_diabetes_gestacional),
      is_infeccao_urinaria: parseOptionalBool(rec.is_infeccao_urinaria),
      is_infertilidade: parseOptionalBool(rec.is_infertilidade),
      is_dificuldade_alimentar: parseOptionalBool(rec.is_dificuldade_alimentar),
      is_cardiopatia: parseOptionalBool(rec.is_cardiopatia),
      is_tromboembolismo: parseOptionalBool(rec.is_tromboembolismo),
      is_hipertensao_arterial: parseOptionalBool(rec.is_hipertensao_arterial),
      is_cirurgia_elvica_uterina: parseOptionalBool(rec.is_cirurgia_elvica_uterina),
      is_cirugia: parseOptionalBool(rec.is_cirugia),
      tratamento_sifilis_dose_1: parseOptionalIsoDateOnly(rec.tratamento_sifilis_dose_1, "tratamento_sifilis_dose_1"),
      tratamento_sifilis_dose_2: parseOptionalIsoDateOnly(rec.tratamento_sifilis_dose_2, "tratamento_sifilis_dose_2"),
      tratamento_sifilis_dose_3: parseOptionalIsoDateOnly(rec.tratamento_sifilis_dose_3, "tratamento_sifilis_dose_3"),
      suplementacao_ferro: parseOptionalBool(rec.suplementacao_ferro),
      suplementacao_acido_folico: parseOptionalBool(rec.suplementacao_acido_folico),
    } as const;

    const hasAny = Object.values(patch).some((v) => v !== undefined);
    if (!hasAny) {
      throw new AppError("validation_error", "Informe ao menos um campo para atualização.", 400);
    }

    const updated = await gestacoes.updateById(id, patch as Prisma.GestacaoUpdateInput);
    return c.json(updated);
  });

  /**
   * Antecedentes (DER `ANTECEDENTES`) — edição via prontuário.
   * Usa upsert: cria se não existir para a gestação.
   */
  secured.patch("/gestacoes/:id/antecedentes", async (c) => {
    const gestacao_id = c.req.param("id");
    if (!isUuid(gestacao_id)) {
      throw new AppError("validation_error", "Identificador de gestação inválido.", 400);
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

    const patch = {
      n_gestas_anteriores: parseOptionalIntNullable(rec.n_gestas_anteriores),
      n_partos: parseOptionalIntNullable(rec.n_partos),
      n_abortos: parseOptionalIntNullable(rec.n_abortos),
      n_nascidos_vivos: parseOptionalIntNullable(rec.n_nascidos_vivos),
      n_vivem: parseOptionalIntNullable(rec.n_vivem),
      n_mortos_primeira_semana: parseOptionalIntNullable(rec.n_mortos_primeira_semana),
      n_mortos_apos_primeira_semana: parseOptionalIntNullable(rec.n_mortos_apos_primeira_semana),
      n_nascidos_mortos: parseOptionalIntNullable(rec.n_nascidos_mortos),
      n_cesarea: parseOptionalIntNullable(rec.n_cesarea),
      n_parto_normal: parseOptionalIntNullable(rec.n_parto_normal),
      n_parto_prematuro: parseOptionalIntNullable(rec.n_parto_prematuro),
      n_bebe_menos_dois_kilos_e_meio: parseOptionalIntNullable(rec.n_bebe_menos_dois_kilos_e_meio),
      n_bebe_mais_quatro_kilos_e_meio: parseOptionalIntNullable(rec.n_bebe_mais_quatro_kilos_e_meio),
      is_gesta_ectopica: parseOptionalBool(rec.is_gesta_ectopica),
      is_gesta_molar: parseOptionalBool(rec.is_gesta_molar),
      is_hipertensao_familiar: parseOptionalBool(rec.is_hipertensao_familiar),
      is_gravidez_gemelar_familiar: parseOptionalBool(rec.is_gravidez_gemelar_familiar),
      is_diabetes_familiar: parseOptionalBool(rec.is_diabetes_familiar),
      is_fumo: parseOptionalBool(rec.is_fumo),
      is_alcool: parseOptionalBool(rec.is_alcool),
      is_drogas: parseOptionalBool(rec.is_drogas),
      is_cardiopatia: parseOptionalBool(rec.is_cardiopatia),
      is_tromboembolismo: parseOptionalBool(rec.is_tromboembolismo),
      is_infertilidade: parseOptionalBool(rec.is_infertilidade),
      is_isoimunizacao_rh: parseOptionalBool(rec.is_isoimunizacao_rh),
      is_cirurgia_pelvica_uterina: parseOptionalBool(rec.is_cirurgia_pelvica_uterina),
      is_final_gestacao_anterior_1_ano: parseOptionalBool(rec.is_final_gestacao_anterior_1_ano),
      is_sifilis: parseOptionalBool(rec.is_sifilis),
    } as const;

    const hasAny = Object.values(patch as any).some((v: unknown) => v !== undefined);
    if (!hasAny) {
      throw new AppError("validation_error", "Informe ao menos um campo para atualização.", 400);
    }

    const prisma = getPrisma();
    const updated = await prisma.antecedentes.upsert({
      where: { gestacao_id },
      update: patch as any,
      create: { gestacao_id, ...(patch as any) },
    });
    return c.json(updated);
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
        data: r.data.toISOString(),
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

  /**
   * Calendário (agenda) por intervalo.
   * Retorna consultas no range, com projeção segura de paciente/unidade.
   */
  secured.get("/consultas/calendario", async (c) => {
    const startRaw = c.req.query("start");
    const endRaw = c.req.query("end");
    const unidadeId = c.req.query("unidade_id");

    const start = parseIsoDateTime(startRaw);
    const end = parseIsoDateTime(endRaw);
    if (!start || !end) {
      throw new AppError(
        "validation_error",
        "Queries start e end são obrigatórias (ISO DateTime).",
        400,
      );
    }
    if (end.getTime() < start.getTime()) {
      throw new AppError("validation_error", "end deve ser maior/igual a start.", 400);
    }
    if (unidadeId && !isUuid(unidadeId)) {
      throw new AppError("validation_error", "unidade_id inválido (esperado UUID).", 400);
    }

    const prisma = getPrisma();
    const rows = await prisma.consulta.findMany({
      where: {
        ...(unidadeId ? { unidade_id: unidadeId } : null),
        data: { gte: start, lte: end },
      },
      orderBy: [{ data: "asc" }, { id: "asc" }],
      include: {
        unidade: { select: { id: true, nome: true } },
        gestacao: {
          select: {
            id: true,
            paciente_id: true,
            tipo_risco: true,
            paciente: {
              select: {
                nome_mascarado: true,
                cpf_ultimos4: true,
                cartao_sus_ultimos4: true,
              },
            },
          },
        },
      },
    });

    return c.json(
      rows.map((r) => ({
        id: r.id,
        status: r.status,
        data: r.data.toISOString(),
        unidade: r.unidade,
        gestacao_id: r.gestacao_id,
        gestacao: {
          id: r.gestacao.id,
          tipo_risco: r.gestacao.tipo_risco,
        },
        paciente: {
          id: r.gestacao.paciente_id,
          nome_mascarado: r.gestacao.paciente.nome_mascarado,
          cpf_ultimos4: r.gestacao.paciente.cpf_ultimos4,
          cartao_sus_ultimos4: r.gestacao.paciente.cartao_sus_ultimos4,
        },
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
      data: parseOptionalIsoDateTime(rec.data, "data"),
      idade_gestacional: parseOptionalNumberNullable(rec.idade_gestacional),
      peso: parseOptionalNumberNullable(rec.peso),
      pa_sistolica: parseOptionalNumberNullable(rec.pa_sistolica),
      pa_diastolica: parseOptionalNumberNullable(rec.pa_diastolica),
      au: parseOptionalNumberNullable(rec.au),
      bfc: parseOptionalNumberNullable(rec.bfc),
      is_edema: parseOptionalBool(rec.is_edema),
      mov_fetal: parseOptionalStringNullable(rec.mov_fetal, 2000),
      apresentacao_fetal: parseOptionalStringNullable(rec.apresentacao_fetal, 2000),
      queixa: parseOptionalStringNullable(rec.queixa, 4000),
      is_exantema: parseOptionalBool(rec.is_exantema),
    };
    const conduta = parseOptionalStringNullable(rec.conduta, 6000);
    const sugestao_conduta = parseOptionalStringNullable(rec.sugestao_conduta, 6000);

    const hasAny =
      patch.status !== undefined ||
      patch.validacao_medica !== undefined ||
      patch.data !== undefined ||
      patch.idade_gestacional !== undefined ||
      patch.peso !== undefined ||
      patch.pa_sistolica !== undefined ||
      patch.pa_diastolica !== undefined ||
      patch.au !== undefined ||
      patch.bfc !== undefined ||
      patch.is_edema !== undefined ||
      patch.mov_fetal !== undefined ||
      patch.apresentacao_fetal !== undefined ||
      patch.queixa !== undefined ||
      patch.is_exantema !== undefined ||
      conduta !== undefined ||
      sugestao_conduta !== undefined;
    if (!hasAny) {
      throw new AppError("validation_error", "Informe ao menos um campo para atualizar.", 400);
    }

    const prisma = getPrisma();
    const data = buildConsultaPatchUpdate(current, patch);
    const updated = await consultas.updateById(id, {
      ...data,
      ...(conduta !== undefined ? ({ conduta } as const) : null),
    });

    if (sugestao_conduta !== undefined) {
      await prisma.consultaIa.upsert({
        where: { consulta_id: id },
        create: { consulta_id: id, sugestao_conduta },
        update: { sugestao_conduta },
      });
    }

    const reloaded = await consultas.findById(id);
    return c.json(reloaded ?? updated);
  });

  /**
   * Fluxo excepcional (Escriba):
   * - Consulta CONFIRMADA não pode gravar novamente.
   * - Para regravar, cria-se uma NOVA consulta com pré-preenchimento (cópia de campos clínicos),
   *   e apaga-se a gravação anterior (eventos de stream) da consulta confirmada.
   */
  secured.post("/consultas/:id/recriar-para-escriba", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) {
      throw new AppError("validation_error", "Identificador de consulta inválido.", 400);
    }
    const current = await consultas.findById(id);
    if (!current) {
      throw new AppError("not_found", "Consulta não encontrada.", 404);
    }
    if (current.status !== StatusConsulta.CONFIRMADA) {
      throw new AppError("validation_error", "A consulta ainda não está confirmada; não é necessário recriar.", 400);
    }

    const prisma = getPrisma();
    const now = new Date();
    // Tipos do Prisma Client podem variar entre migrações locais; aqui precisamos copiar campos
    // clínicos existentes mesmo se o TS não enxergar todos (mantendo runtime correto).
    const cur = current as unknown as Record<string, unknown>;

    const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Apaga a "gravação" (histórico de stream) da consulta confirmada.
      await tx.consultaStreamEvento.deleteMany({ where: { consulta_id: id } });

      // Mantém sugestão/saída IA da consulta anterior para pré-preenchimento,
      // mas zera qualquer referência efêmera de transcrição.
      const iaPrev = await tx.consultaIa.findUnique({ where: { consulta_id: id } });
      if (iaPrev?.transcricao_efemera_id) {
        await tx.consultaIa.update({ where: { consulta_id: id }, data: { transcricao_efemera_id: null } });
      }

      const nova = await tx.consulta.create({
        data: {
          gestacao_id: current.gestacao_id,
          unidade_id: current.unidade_id,
          data: now,
          ...(cur.idade_gestacional !== undefined ? { idade_gestacional: cur.idade_gestacional } : null),
          ...(cur.peso !== undefined ? { peso: cur.peso } : null),
          ...(cur.pa_sistolica !== undefined ? { pa_sistolica: cur.pa_sistolica } : null),
          ...(cur.pa_diastolica !== undefined ? { pa_diastolica: cur.pa_diastolica } : null),
          ...(cur.au !== undefined ? { au: cur.au } : null),
          ...(cur.bfc !== undefined ? { bfc: cur.bfc } : null),
          ...(cur.is_edema !== undefined ? { is_edema: cur.is_edema } : null),
          ...(cur.mov_fetal !== undefined ? { mov_fetal: cur.mov_fetal } : null),
          ...(cur.apresentacao_fetal !== undefined ? { apresentacao_fetal: cur.apresentacao_fetal } : null),
          ...(cur.queixa !== undefined ? { queixa: cur.queixa } : null),
          ...(cur.conduta !== undefined ? { conduta: cur.conduta } : null),
          ...(cur.is_exantema !== undefined ? { is_exantema: cur.is_exantema } : null),
          validacao_medica: false,
          status: StatusConsulta.RASCUNHO,
        } as any,
      });

      // Pré-preenchimento de sugestão de conduta (quando houver) no registro IA da nova consulta.
      if (iaPrev?.sugestao_conduta != null) {
        await tx.consultaIa.upsert({
          where: { consulta_id: nova.id },
          create: { consulta_id: nova.id, sugestao_conduta: iaPrev.sugestao_conduta },
          update: { sugestao_conduta: iaPrev.sugestao_conduta },
        });
      }

      return nova;
    });

    return c.json({ new_consulta_id: created.id }, 201);
  });

  secured.delete("/consultas/:id", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) {
      throw new AppError("validation_error", "Identificador de consulta inválido.", 400);
    }
    const current = await consultas.findById(id);
    if (!current) {
      throw new AppError("not_found", "Consulta não encontrada.", 404);
    }
    await consultas.deleteById(id);
    return c.json({ ok: true });
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
    const data = parseIsoDateTime(rec.data);
    if (!data) {
      throw new AppError(
        "validation_error",
        "Campo data é obrigatório (formato ISO DateTime, ex.: 2026-04-21T14:30:00.000Z).",
        400,
      );
    }

    const created = await consultas.create({
      gestacao_id,
      unidade_id,
      data,
      idade_gestacional: parseOptionalInt(rec.idade_gestacional),
      peso: parseOptionalNumber(rec.peso),
      pa_sistolica: parseOptionalNumber(rec.pa_sistolica),
      pa_diastolica: parseOptionalNumber(rec.pa_diastolica),
      au: parseOptionalNumber(rec.au),
      bfc: parseOptionalNumber(rec.bfc),
      is_edema: parseOptionalBool(rec.is_edema),
      mov_fetal: parseOptionalString(rec.mov_fetal, 2000),
      apresentacao_fetal: parseOptionalString(rec.apresentacao_fetal, 2000),
      queixa: parseOptionalString(rec.queixa, 4000),
      is_exantema: parseOptionalBool(rec.is_exantema),
    });
    return c.json(created, 201);
  });
}
