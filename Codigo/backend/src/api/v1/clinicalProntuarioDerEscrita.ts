/**
 * Rotas de escrita do prontuario longitudinal (DER): parceiro, vacinas, exames, USG, odonto,
 * plano de parto, desfecho, consultas pos-parto.
 */
import type { Hono } from "hono";
import { ExameTipo, VacinaTipo, type Prisma } from "../../lib/prismaBarrel.js";
import { AppError } from "../../core/errors.js";
import { isUuid } from "../../lib/validation/uuid.js";
import type { AuthVariables } from "../../middleware/requireAuth.js";
import { getPrisma } from "../../repository/prisma.js";
import { syncTipoRiscoGestacao, syncTipoRiscoGestacoesAtivasDoPaciente } from "../../services/riscoEstratificacaoService.js";

function parseIsoDateOnly(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const d = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseOptionalIsoDateOnlyNullable(value: unknown, fieldName: string): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const parsed = parseIsoDateOnly(value);
  if (!parsed) {
    throw new AppError("validation_error", `${fieldName} deve estar no formato YYYY-MM-DD ou ser null.`, 400);
  }
  return parsed;
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

function parseOptionalInt(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function parseOptionalIntNullable(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return parseOptionalInt(value);
}

function parseEnumRequired<T extends Record<string, string>>(
  enumObj: T,
  value: unknown,
  fieldName: string,
): T[keyof T] {
  if (typeof value !== "string" || !(Object.values(enumObj) as string[]).includes(value)) {
    throw new AppError("validation_error", `${fieldName} invalido ou ausente.`, 400);
  }
  return value as T[keyof T];
}

async function requirePaciente(prisma: ReturnType<typeof getPrisma>, id: string) {
  const p = await prisma.paciente.findUnique({ where: { id }, select: { id: true } });
  if (!p) {
    throw new AppError("not_found", "Paciente nao encontrado.", 404);
  }
}

async function requireGestacao(prisma: ReturnType<typeof getPrisma>, id: string) {
  const g = await prisma.gestacao.findUnique({ where: { id }, select: { id: true, paciente_id: true } });
  if (!g) {
    throw new AppError("not_found", "Gestacao nao encontrada.", 404);
  }
  return g;
}

export function registerProntuarioDerEscritaRoutes(secured: Hono<{ Variables: AuthVariables }>): void {
  secured.patch("/pacientes/:id/parceiro", async (c) => {
    const paciente_id = c.req.param("id");
    if (!isUuid(paciente_id)) {
      throw new AppError("validation_error", "paciente_id invalido.", 400);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError("bad_request", "JSON obrigatorio.", 400);
    }
    if (!body || typeof body !== "object") {
      throw new AppError("validation_error", "Payload invalido.", 400);
    }
    const rec = body as Record<string, unknown>;
    const nome = parseOptionalString(rec.nome, 120);
    const vdrl = parseOptionalStringNullable(rec.vdrl, 50);
    const hiv = parseOptionalStringNullable(rec.hiv, 50);

    const prisma = getPrisma();
    await requirePaciente(prisma, paciente_id);

    const existing = await prisma.parceiro.findUnique({ where: { paciente_id } });
    if (!existing) {
      if (!nome) {
        throw new AppError("validation_error", "nome obrigatorio ao criar parceiro.", 400);
      }
      const created = await prisma.parceiro.create({
        data: { paciente_id, nome, vdrl: vdrl ?? null, hiv: hiv ?? null },
      });
      await syncTipoRiscoGestacoesAtivasDoPaciente(prisma, paciente_id);
      return c.json(created, 201);
    }

    const hasAny = nome !== undefined || vdrl !== undefined || hiv !== undefined;
    if (!hasAny) {
      throw new AppError("validation_error", "Informe ao menos um campo.", 400);
    }

    const updated = await prisma.parceiro.update({
      where: { paciente_id },
      data: {
        ...(nome !== undefined ? { nome } : null),
        ...(vdrl !== undefined ? { vdrl } : null),
        ...(hiv !== undefined ? { hiv } : null),
      },
    });
    await syncTipoRiscoGestacoesAtivasDoPaciente(prisma, paciente_id);
    return c.json(updated);
  });

  secured.post("/pacientes/:id/vacinas", async (c) => {
    const paciente_id = c.req.param("id");
    if (!isUuid(paciente_id)) {
      throw new AppError("validation_error", "paciente_id invalido.", 400);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError("bad_request", "JSON obrigatorio.", 400);
    }
    if (!body || typeof body !== "object") {
      throw new AppError("validation_error", "Payload invalido.", 400);
    }
    const rec = body as Record<string, unknown>;
    const tipo = parseEnumRequired(VacinaTipo as any, rec.tipo, "tipo");
    const data = parseOptionalIsoDateOnlyNullable(rec.data, "data");
    const data_aprazada = parseOptionalIsoDateOnlyNullable(rec.data_aprazada, "data_aprazada");

    const prisma = getPrisma();
    await requirePaciente(prisma, paciente_id);

    const created = await prisma.vacina.create({
      data: {
        paciente_id,
        tipo,
        data: data === undefined ? null : data,
        data_aprazada: data_aprazada === undefined ? null : data_aprazada,
      },
    });
    await syncTipoRiscoGestacoesAtivasDoPaciente(prisma, paciente_id);
    return c.json(created, 201);
  });

  secured.patch("/vacinas/:id", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) {
      throw new AppError("validation_error", "id invalido.", 400);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError("bad_request", "JSON obrigatorio.", 400);
    }
    if (!body || typeof body !== "object") {
      throw new AppError("validation_error", "Payload invalido.", 400);
    }
    const rec = body as Record<string, unknown>;
    const tipo =
      rec.tipo === undefined ? undefined : parseEnumRequired(VacinaTipo as any, rec.tipo, "tipo");
    const data = parseOptionalIsoDateOnlyNullable(rec.data, "data");
    const data_aprazada = parseOptionalIsoDateOnlyNullable(rec.data_aprazada, "data_aprazada");

    const prisma = getPrisma();
    const cur = await prisma.vacina.findUnique({ where: { id } });
    if (!cur) {
      throw new AppError("not_found", "Vacina nao encontrada.", 404);
    }

    const patch: Prisma.VacinaUpdateInput = {};
    if (tipo !== undefined) {
      patch.tipo = tipo;
    }
    if (data !== undefined) {
      patch.data = data;
    }
    if (data_aprazada !== undefined) {
      patch.data_aprazada = data_aprazada;
    }
    if (Object.keys(patch).length === 0) {
      throw new AppError("validation_error", "Informe ao menos um campo.", 400);
    }

    const updated = await prisma.vacina.update({ where: { id }, data: patch });
    await syncTipoRiscoGestacoesAtivasDoPaciente(prisma, cur.paciente_id);
    return c.json(updated);
  });

  secured.delete("/vacinas/:id", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) {
      throw new AppError("validation_error", "id invalido.", 400);
    }
    const prisma = getPrisma();
    const cur = await prisma.vacina.findUnique({ where: { id } });
    if (!cur) {
      throw new AppError("not_found", "Vacina nao encontrada.", 404);
    }
    await prisma.vacina.delete({ where: { id } });
    await syncTipoRiscoGestacoesAtivasDoPaciente(prisma, cur.paciente_id);
    return c.json({ ok: true });
  });

  secured.post("/pacientes/:id/exames", async (c) => {
    const paciente_id = c.req.param("id");
    if (!isUuid(paciente_id)) {
      throw new AppError("validation_error", "paciente_id invalido.", 400);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError("bad_request", "JSON obrigatorio.", 400);
    }
    if (!body || typeof body !== "object") {
      throw new AppError("validation_error", "Payload invalido.", 400);
    }
    const rec = body as Record<string, unknown>;
    const tipo = parseEnumRequired(ExameTipo as any, rec.tipo, "tipo");
    const trimestre = parseOptionalIntNullable(rec.trimestre);
    const valor = parseOptionalStringNullable(rec.valor, 8000);
    const is_alterado = parseOptionalBool(rec.is_alterado);
    const data_coleta = parseOptionalIsoDateOnlyNullable(rec.data_coleta, "data_coleta");
    const categoria_sensibilidade = parseOptionalStringNullable(rec.categoria_sensibilidade, 120);
    const coombs = parseOptionalStringNullable(rec.coombs, 50);
    const resultado_criptografado = parseOptionalStringNullable(rec.resultado_criptografado, 50000);

    const prisma = getPrisma();
    await requirePaciente(prisma, paciente_id);

    const created = await prisma.exame.create({
      data: {
        paciente_id,
        tipo,
        trimestre: trimestre === undefined ? null : trimestre,
        valor: valor === undefined ? null : valor,
        is_alterado: is_alterado === undefined ? false : is_alterado,
        data_coleta: data_coleta === undefined ? null : data_coleta,
        categoria_sensibilidade: categoria_sensibilidade === undefined ? null : categoria_sensibilidade,
        coombs: coombs === undefined ? null : coombs,
        resultado_criptografado: resultado_criptografado === undefined ? null : resultado_criptografado,
      },
    });
    await syncTipoRiscoGestacoesAtivasDoPaciente(prisma, paciente_id);
    return c.json(created, 201);
  });

  secured.patch("/exames/:id", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) {
      throw new AppError("validation_error", "id invalido.", 400);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError("bad_request", "JSON obrigatorio.", 400);
    }
    if (!body || typeof body !== "object") {
      throw new AppError("validation_error", "Payload invalido.", 400);
    }
    const rec = body as Record<string, unknown>;
    const tipo =
      rec.tipo === undefined ? undefined : parseEnumRequired(ExameTipo as any, rec.tipo, "tipo");
    const trimestre = parseOptionalIntNullable(rec.trimestre);
    const valor = parseOptionalStringNullable(rec.valor, 8000);
    const is_alterado = parseOptionalBool(rec.is_alterado);
    const data_coleta = parseOptionalIsoDateOnlyNullable(rec.data_coleta, "data_coleta");
    const categoria_sensibilidade = parseOptionalStringNullable(rec.categoria_sensibilidade, 120);
    const coombs = parseOptionalStringNullable(rec.coombs, 50);
    const resultado_criptografado = parseOptionalStringNullable(rec.resultado_criptografado, 50000);

    const prisma = getPrisma();
    const cur = await prisma.exame.findUnique({ where: { id } });
    if (!cur) {
      throw new AppError("not_found", "Exame nao encontrado.", 404);
    }

    const data: Prisma.ExameUpdateInput = {};
    if (tipo !== undefined) {
      data.tipo = tipo;
    }
    if (trimestre !== undefined) {
      data.trimestre = trimestre;
    }
    if (valor !== undefined) {
      data.valor = valor;
    }
    if (is_alterado !== undefined) {
      data.is_alterado = is_alterado;
    }
    if (data_coleta !== undefined) {
      data.data_coleta = data_coleta;
    }
    if (categoria_sensibilidade !== undefined) {
      data.categoria_sensibilidade = categoria_sensibilidade;
    }
    if (coombs !== undefined) {
      data.coombs = coombs;
    }
    if (resultado_criptografado !== undefined) {
      data.resultado_criptografado = resultado_criptografado;
    }

    if (Object.keys(data).length === 0) {
      throw new AppError("validation_error", "Informe ao menos um campo.", 400);
    }

    const updated = await prisma.exame.update({ where: { id }, data });
    await syncTipoRiscoGestacoesAtivasDoPaciente(prisma, cur.paciente_id);
    return c.json(updated);
  });

  secured.delete("/exames/:id", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) {
      throw new AppError("validation_error", "id invalido.", 400);
    }
    const prisma = getPrisma();
    const cur = await prisma.exame.findUnique({ where: { id } });
    if (!cur) {
      throw new AppError("not_found", "Exame nao encontrado.", 404);
    }
    await prisma.exame.delete({ where: { id } });
    await syncTipoRiscoGestacoesAtivasDoPaciente(prisma, cur.paciente_id);
    return c.json({ ok: true });
  });

  secured.post("/gestacoes/:id/usgs", async (c) => {
    const gestacao_id = c.req.param("id");
    if (!isUuid(gestacao_id)) {
      throw new AppError("validation_error", "gestacao_id invalido.", 400);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError("bad_request", "JSON obrigatorio.", 400);
    }
    if (!body || typeof body !== "object") {
      throw new AppError("validation_error", "Payload invalido.", 400);
    }
    const rec = body as Record<string, unknown>;
    const prisma = getPrisma();
    const g = await requireGestacao(prisma, gestacao_id);

    const data_exame = parseOptionalIsoDateOnlyNullable(rec.data_exame, "data_exame");
    const ig_dum = parseOptionalStringNullable(rec.ig_dum, 50);
    const ig_usg = parseOptionalStringNullable(rec.ig_usg, 50);
    const peso_fetal_estimado = parseOptionalNumberNullable(rec.peso_fetal_estimado);
    const localizacao_placenta = parseOptionalStringNullable(rec.localizacao_placenta, 120);
    const idade_gestacional_usg = parseOptionalIntNullable(rec.idade_gestacional_usg);
    const is_liquido_amniotico_normal = parseOptionalBool(rec.is_liquido_amniotico_normal);
    const outros = parseOptionalStringNullable(rec.outros, 8000);

    const created = await prisma.exameImagemUsg.create({
      data: {
        gestacao_id,
        data_exame: data_exame === undefined ? null : data_exame,
        ig_dum: ig_dum === undefined ? null : ig_dum,
        ig_usg: ig_usg === undefined ? null : ig_usg,
        peso_fetal_estimado: peso_fetal_estimado === undefined ? null : peso_fetal_estimado,
        localizacao_placenta: localizacao_placenta === undefined ? null : localizacao_placenta,
        idade_gestacional_usg: idade_gestacional_usg === undefined ? null : idade_gestacional_usg,
        is_liquido_amniotico_normal: is_liquido_amniotico_normal === undefined ? true : is_liquido_amniotico_normal,
        outros: outros === undefined ? null : outros,
      },
    });
    await syncTipoRiscoGestacao(prisma, gestacao_id);
    await syncTipoRiscoGestacoesAtivasDoPaciente(prisma, g.paciente_id);
    return c.json(created, 201);
  });

  secured.patch("/usgs/:id", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) {
      throw new AppError("validation_error", "id invalido.", 400);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError("bad_request", "JSON obrigatorio.", 400);
    }
    if (!body || typeof body !== "object") {
      throw new AppError("validation_error", "Payload invalido.", 400);
    }
    const rec = body as Record<string, unknown>;
    const prisma = getPrisma();
    const cur = await prisma.exameImagemUsg.findUnique({ where: { id } });
    if (!cur) {
      throw new AppError("not_found", "USG nao encontrado.", 404);
    }

    const data_exame = parseOptionalIsoDateOnlyNullable(rec.data_exame, "data_exame");
    const ig_dum = parseOptionalStringNullable(rec.ig_dum, 50);
    const ig_usg = parseOptionalStringNullable(rec.ig_usg, 50);
    const peso_fetal_estimado = parseOptionalNumberNullable(rec.peso_fetal_estimado);
    const localizacao_placenta = parseOptionalStringNullable(rec.localizacao_placenta, 120);
    const idade_gestacional_usg = parseOptionalIntNullable(rec.idade_gestacional_usg);
    const is_liquido_amniotico_normal = parseOptionalBool(rec.is_liquido_amniotico_normal);
    const outros = parseOptionalStringNullable(rec.outros, 8000);

    const data: Prisma.ExameImagemUsgUpdateInput = {};
    if (data_exame !== undefined) {
      data.data_exame = data_exame;
    }
    if (ig_dum !== undefined) {
      data.ig_dum = ig_dum;
    }
    if (ig_usg !== undefined) {
      data.ig_usg = ig_usg;
    }
    if (peso_fetal_estimado !== undefined) {
      data.peso_fetal_estimado = peso_fetal_estimado;
    }
    if (localizacao_placenta !== undefined) {
      data.localizacao_placenta = localizacao_placenta;
    }
    if (idade_gestacional_usg !== undefined) {
      data.idade_gestacional_usg = idade_gestacional_usg;
    }
    if (is_liquido_amniotico_normal !== undefined) {
      data.is_liquido_amniotico_normal = is_liquido_amniotico_normal;
    }
    if (outros !== undefined) {
      data.outros = outros;
    }

    if (Object.keys(data).length === 0) {
      throw new AppError("validation_error", "Informe ao menos um campo.", 400);
    }

    const updated = await prisma.exameImagemUsg.update({ where: { id }, data });
    const g = await prisma.gestacao.findUnique({ where: { id: cur.gestacao_id }, select: { paciente_id: true } });
    await syncTipoRiscoGestacao(prisma, cur.gestacao_id);
    if (g) {
      await syncTipoRiscoGestacoesAtivasDoPaciente(prisma, g.paciente_id);
    }
    return c.json(updated);
  });

  secured.delete("/usgs/:id", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) {
      throw new AppError("validation_error", "id invalido.", 400);
    }
    const prisma = getPrisma();
    const cur = await prisma.exameImagemUsg.findUnique({ where: { id } });
    if (!cur) {
      throw new AppError("not_found", "USG nao encontrado.", 404);
    }
    const gestacao_id = cur.gestacao_id;
    await prisma.exameImagemUsg.delete({ where: { id } });
    const g = await prisma.gestacao.findUnique({ where: { id: gestacao_id }, select: { paciente_id: true } });
    await syncTipoRiscoGestacao(prisma, gestacao_id);
    if (g) {
      await syncTipoRiscoGestacoesAtivasDoPaciente(prisma, g.paciente_id);
    }
    return c.json({ ok: true });
  });

  secured.patch("/gestacoes/:id/avaliacao-odonto", async (c) => {
    const gestacao_id = c.req.param("id");
    if (!isUuid(gestacao_id)) {
      throw new AppError("validation_error", "gestacao_id invalido.", 400);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError("bad_request", "JSON obrigatorio.", 400);
    }
    if (!body || typeof body !== "object") {
      throw new AppError("validation_error", "Payload invalido.", 400);
    }
    const rec = body as Record<string, unknown>;
    const anotacoes = parseOptionalStringNullable(rec.anotacoes, 8000);
    const is_alta = parseOptionalBool(rec.is_alta);
    const is_sangramento_gengival = parseOptionalBool(rec.is_sangramento_gengival);
    const is_carie_detectada = parseOptionalBool(rec.is_carie_detectada);

    const prisma = getPrisma();
    const g = await requireGestacao(prisma, gestacao_id);

    const patch: Prisma.AvaliacaoOdontoUncheckedUpdateInput = {};
    if (anotacoes !== undefined) {
      patch.anotacoes = anotacoes;
    }
    if (is_alta !== undefined) {
      patch.is_alta = is_alta;
    }
    if (is_sangramento_gengival !== undefined) {
      patch.is_sangramento_gengival = is_sangramento_gengival;
    }
    if (is_carie_detectada !== undefined) {
      patch.is_carie_detectada = is_carie_detectada;
    }

    if (Object.keys(patch).length === 0) {
      throw new AppError("validation_error", "Informe ao menos um campo.", 400);
    }

    const updated = await prisma.avaliacaoOdonto.upsert({
      where: { gestacao_id },
      create: {
        gestacao_id,
        anotacoes: (anotacoes as string | null) ?? null,
        is_alta: is_alta ?? false,
        is_sangramento_gengival: is_sangramento_gengival ?? false,
        is_carie_detectada: is_carie_detectada ?? false,
      },
      update: patch,
    });
    await syncTipoRiscoGestacao(prisma, gestacao_id);
    await syncTipoRiscoGestacoesAtivasDoPaciente(prisma, g.paciente_id);
    return c.json(updated);
  });

  secured.patch("/gestacoes/:id/plano-parto", async (c) => {
    const gestacao_id = c.req.param("id");
    if (!isUuid(gestacao_id)) {
      throw new AppError("validation_error", "gestacao_id invalido.", 400);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError("bad_request", "JSON obrigatorio.", 400);
    }
    if (!body || typeof body !== "object") {
      throw new AppError("validation_error", "Payload invalido.", 400);
    }
    const rec = body as Record<string, unknown>;
    const acompanhante_nome = parseOptionalStringNullable(rec.acompanhante_nome, 120);
    const posicao_parto_pref = parseOptionalStringNullable(rec.posicao_parto_pref, 80);
    const anestesia_alivio_dor = parseOptionalStringNullable(rec.anestesia_alivio_dor, 80);
    const is_deseja_doula = parseOptionalBool(rec.is_deseja_doula);

    const prisma = getPrisma();
    const g = await requireGestacao(prisma, gestacao_id);

    const patch: Prisma.PlanoPartoUncheckedUpdateInput = {};
    if (acompanhante_nome !== undefined) {
      patch.acompanhante_nome = acompanhante_nome;
    }
    if (posicao_parto_pref !== undefined) {
      patch.posicao_parto_pref = posicao_parto_pref;
    }
    if (anestesia_alivio_dor !== undefined) {
      patch.anestesia_alivio_dor = anestesia_alivio_dor;
    }
    if (is_deseja_doula !== undefined) {
      patch.is_deseja_doula = is_deseja_doula;
    }

    if (Object.keys(patch).length === 0) {
      throw new AppError("validation_error", "Informe ao menos um campo.", 400);
    }

    const updated = await prisma.planoParto.upsert({
      where: { gestacao_id },
      create: {
        gestacao_id,
        acompanhante_nome: (acompanhante_nome as string | null) ?? null,
        posicao_parto_pref: (posicao_parto_pref as string | null) ?? null,
        anestesia_alivio_dor: (anestesia_alivio_dor as string | null) ?? null,
        is_deseja_doula: is_deseja_doula ?? false,
      },
      update: patch,
    });
    await syncTipoRiscoGestacao(prisma, gestacao_id);
    await syncTipoRiscoGestacoesAtivasDoPaciente(prisma, g.paciente_id);
    return c.json(updated);
  });

  secured.patch("/gestacoes/:id/desfecho", async (c) => {
    const gestacao_id = c.req.param("id");
    if (!isUuid(gestacao_id)) {
      throw new AppError("validation_error", "gestacao_id invalido.", 400);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError("bad_request", "JSON obrigatorio.", 400);
    }
    if (!body || typeof body !== "object") {
      throw new AppError("validation_error", "Payload invalido.", 400);
    }
    const rec = body as Record<string, unknown>;
    const unidade_id_raw = rec.unidade_id;
    const unidade_id =
      typeof unidade_id_raw === "string" && isUuid(unidade_id_raw.trim())
        ? unidade_id_raw.trim()
        : undefined;

    const tipo_parto = parseOptionalStringNullable(rec.tipo_parto, 80);
    const peso_nascimento = parseOptionalNumberNullable(rec.peso_nascimento);
    const sexo = parseOptionalStringNullable(rec.sexo, 20);
    const grau_laceracao = parseOptionalStringNullable(rec.grau_laceracao, 80);
    const apgar_1_minuto = parseOptionalIntNullable(rec.apgar_1_minuto);
    const apgar_5_minuto = parseOptionalIntNullable(rec.apgar_5_minuto);
    const is_indicacao_cesarea = parseOptionalBool(rec.is_indicacao_cesarea);
    const is_reanimacao = parseOptionalBool(rec.is_reanimacao);
    const is_laceracao = parseOptionalBool(rec.is_laceracao);

    const prisma = getPrisma();
    const g = await requireGestacao(prisma, gestacao_id);
    const existing = await prisma.desfechoGestacao.findUnique({ where: { gestacao_id } });

    if (!existing && !unidade_id) {
      throw new AppError("validation_error", "unidade_id obrigatorio ao criar desfecho.", 400);
    }
    if (unidade_id) {
      const u = await prisma.unidade.findUnique({ where: { id: unidade_id }, select: { id: true } });
      if (!u) {
        throw new AppError("validation_error", "unidade_id nao encontrado.", 400);
      }
    }

    const patch: Prisma.DesfechoGestacaoUncheckedUpdateInput = {};
    if (unidade_id !== undefined && unidade_id) {
      patch.unidade_id = unidade_id;
    }
    if (tipo_parto !== undefined) {
      patch.tipo_parto = tipo_parto;
    }
    if (peso_nascimento !== undefined) {
      patch.peso_nascimento = peso_nascimento;
    }
    if (sexo !== undefined) {
      patch.sexo = sexo;
    }
    if (grau_laceracao !== undefined) {
      patch.grau_laceracao = grau_laceracao;
    }
    if (apgar_1_minuto !== undefined) {
      patch.apgar_1_minuto = apgar_1_minuto;
    }
    if (apgar_5_minuto !== undefined) {
      patch.apgar_5_minuto = apgar_5_minuto;
    }
    if (is_indicacao_cesarea !== undefined) {
      patch.is_indicacao_cesarea = is_indicacao_cesarea;
    }
    if (is_reanimacao !== undefined) {
      patch.is_reanimacao = is_reanimacao;
    }
    if (is_laceracao !== undefined) {
      patch.is_laceracao = is_laceracao;
    }

    if (Object.keys(patch).length === 0) {
      throw new AppError("validation_error", "Informe ao menos um campo.", 400);
    }

    if (!existing) {
      const created = await prisma.desfechoGestacao.create({
        data: {
          gestacao_id,
          unidade_id: unidade_id!,
          tipo_parto: (tipo_parto as string | null) ?? null,
          peso_nascimento: peso_nascimento === undefined ? null : peso_nascimento,
          sexo: (sexo as string | null) ?? null,
          grau_laceracao: (grau_laceracao as string | null) ?? null,
          apgar_1_minuto: apgar_1_minuto === undefined ? null : apgar_1_minuto,
          apgar_5_minuto: apgar_5_minuto === undefined ? null : apgar_5_minuto,
          is_indicacao_cesarea: is_indicacao_cesarea ?? false,
          is_reanimacao: is_reanimacao ?? false,
          is_laceracao: is_laceracao ?? false,
        },
      });
      await syncTipoRiscoGestacao(prisma, gestacao_id);
      await syncTipoRiscoGestacoesAtivasDoPaciente(prisma, g.paciente_id);
      return c.json(created, 201);
    }

    const updated = await prisma.desfechoGestacao.update({
      where: { gestacao_id },
      data: patch,
    });
    await syncTipoRiscoGestacao(prisma, gestacao_id);
    await syncTipoRiscoGestacoesAtivasDoPaciente(prisma, g.paciente_id);
    return c.json(updated);
  });

  secured.post("/gestacoes/:id/consultas-pos-parto", async (c) => {
    const gestacao_id = c.req.param("id");
    if (!isUuid(gestacao_id)) {
      throw new AppError("validation_error", "gestacao_id invalido.", 400);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError("bad_request", "JSON obrigatorio.", 400);
    }
    if (!body || typeof body !== "object") {
      throw new AppError("validation_error", "Payload invalido.", 400);
    }
    const rec = body as Record<string, unknown>;
    const data = parseOptionalIsoDateOnlyNullable(rec.data, "data");
    const avaliacao_amamentacao = parseOptionalStringNullable(rec.avaliacao_amamentacao, 8000);
    const involucao_uterina = parseOptionalStringNullable(rec.involucao_uterina, 8000);
    const metodo_contraceptivo = parseOptionalStringNullable(rec.metodo_contraceptivo, 8000);

    const prisma = getPrisma();
    const g = await requireGestacao(prisma, gestacao_id);

    const created = await prisma.consultaPosParto.create({
      data: {
        gestacao_id,
        data: data === undefined ? null : data,
        avaliacao_amamentacao: avaliacao_amamentacao === undefined ? null : avaliacao_amamentacao,
        involucao_uterina: involucao_uterina === undefined ? null : involucao_uterina,
        metodo_contraceptivo: metodo_contraceptivo === undefined ? null : metodo_contraceptivo,
      },
    });
    await syncTipoRiscoGestacao(prisma, gestacao_id);
    await syncTipoRiscoGestacoesAtivasDoPaciente(prisma, g.paciente_id);
    return c.json(created, 201);
  });

  secured.patch("/consultas-pos-parto/:id", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) {
      throw new AppError("validation_error", "id invalido.", 400);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError("bad_request", "JSON obrigatorio.", 400);
    }
    if (!body || typeof body !== "object") {
      throw new AppError("validation_error", "Payload invalido.", 400);
    }
    const rec = body as Record<string, unknown>;
    const data = parseOptionalIsoDateOnlyNullable(rec.data, "data");
    const avaliacao_amamentacao = parseOptionalStringNullable(rec.avaliacao_amamentacao, 8000);
    const involucao_uterina = parseOptionalStringNullable(rec.involucao_uterina, 8000);
    const metodo_contraceptivo = parseOptionalStringNullable(rec.metodo_contraceptivo, 8000);

    const prisma = getPrisma();
    const cur = await prisma.consultaPosParto.findUnique({ where: { id } });
    if (!cur) {
      throw new AppError("not_found", "Consulta pos-parto nao encontrada.", 404);
    }

    const patch: Prisma.ConsultaPosPartoUpdateInput = {};
    if (data !== undefined) {
      patch.data = data;
    }
    if (avaliacao_amamentacao !== undefined) {
      patch.avaliacao_amamentacao = avaliacao_amamentacao;
    }
    if (involucao_uterina !== undefined) {
      patch.involucao_uterina = involucao_uterina;
    }
    if (metodo_contraceptivo !== undefined) {
      patch.metodo_contraceptivo = metodo_contraceptivo;
    }

    if (Object.keys(patch).length === 0) {
      throw new AppError("validation_error", "Informe ao menos um campo.", 400);
    }

    const updated = await prisma.consultaPosParto.update({ where: { id }, data: patch });
    const g = await prisma.gestacao.findUnique({
      where: { id: cur.gestacao_id },
      select: { paciente_id: true },
    });
    await syncTipoRiscoGestacao(prisma, cur.gestacao_id);
    if (g) {
      await syncTipoRiscoGestacoesAtivasDoPaciente(prisma, g.paciente_id);
    }
    return c.json(updated);
  });

  secured.delete("/consultas-pos-parto/:id", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) {
      throw new AppError("validation_error", "id invalido.", 400);
    }
    const prisma = getPrisma();
    const cur = await prisma.consultaPosParto.findUnique({ where: { id } });
    if (!cur) {
      throw new AppError("not_found", "Consulta pos-parto nao encontrada.", 404);
    }
    const gestacao_id = cur.gestacao_id;
    await prisma.consultaPosParto.delete({ where: { id } });
    const g = await prisma.gestacao.findUnique({ where: { id: gestacao_id }, select: { paciente_id: true } });
    await syncTipoRiscoGestacao(prisma, gestacao_id);
    if (g) {
      await syncTipoRiscoGestacoesAtivasDoPaciente(prisma, g.paciente_id);
    }
    return c.json({ ok: true });
  });
}
