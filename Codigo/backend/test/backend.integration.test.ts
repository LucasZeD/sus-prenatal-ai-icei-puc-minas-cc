/**
 * Requer Docker (Testcontainers). Sem runtime de container: `SKIP_INTEGRATION_TESTS=1 npm test`
 * ou `npm run test:unit` para apenas unidade.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sign } from "hono/jwt";
import type { Hono } from "hono";
import { StatusConsulta } from "../src/lib/prismaBarrel.js";
import { hashCartaoSus, hashCpf } from "../src/lib/identificadores/pacienteIdsHash.js";
import { cadastrarPacienteComHashesIds } from "../src/services/pacienteCadastroComIdsService.js";

const backendRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SENTINEL_UNIDADE = "00000000-0000-4000-8000-000000000001";

const skipIntegration = process.env.SKIP_INTEGRATION_TESTS === "1";

describe.skipIf(skipIntegration)("integração: Postgres efêmero + API Hono", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let app: Hono;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.JWT_SECRET = "test-jwt-secret-at-least-32-chars-long!";
    process.env.PACIENTE_IDS_PEPPER = "test-pepper-for-paciente-ids-hmac-layer";
    process.env.NODE_ENV = "test";

    execSync("npx prisma migrate deploy", {
      cwd: backendRoot,
      env: {
        ...process.env,
        DATABASE_URL: container.getConnectionUri(),
        PRENATAL_PRISMA_USE_PROCESS_ENV_ONLY: "1",
      },
      stdio: "pipe",
    });

    const { createApp } = await import("../src/api/app.js");
    app = createApp();
  }, 180_000);

  afterAll(async () => {
    try {
      const { disconnectPrisma } = await import("../src/repository/prisma.js");
      await disconnectPrisma();
    } catch {
      /* prisma pode não ter sido inicializado se beforeAll falhou cedo */
    }
    if (container) {
      await container.stop();
    }
  });

  describe("Zero Trust — rotas clínicas sem JWT (RF14)", () => {
    const clinicalPaths: Array<{ method: string; path: string; body?: unknown }> = [
      { method: "GET", path: "/api/v1/pacientes" },
      { method: "POST", path: "/api/v1/pacientes", body: {} },
      { method: "GET", path: "/api/v1/pacientes/00000000-0000-4000-8000-000000000099" },
      {
        method: "POST",
        path: "/api/v1/pacientes/verificar-identificadores",
        body: {},
      },
      { method: "GET", path: "/api/v1/gestacoes" },
      { method: "GET", path: "/api/v1/consultas" },
      { method: "GET", path: "/api/v1/consultas/disponiveis-stream" },
      { method: "GET", path: "/api/v1/unidades" },
      {
        method: "PATCH",
        path: "/api/v1/consultas/00000000-0000-4000-8000-000000000099",
        body: { peso: 70 },
      },
    ];

    it.each(clinicalPaths)(
      "$method $path não retorna 2xx sem Authorization",
      async ({ method, path: p, body }) => {
        const init: RequestInit = { method };
        if (body !== undefined) {
          init.headers = { "Content-Type": "application/json" };
          init.body = JSON.stringify(body);
        }
        const res = await app.request(`http://local${p}`, init);
        expect(res.status).not.toBe(200);
        expect(res.status).not.toBe(201);
        expect(res.status).toBeGreaterThanOrEqual(400);
      },
    );

    it("rejeita Bearer vazio (header presente, credencial ausente)", async () => {
      const res = await app.request("http://local/api/v1/pacientes", {
        headers: { Authorization: "Bearer " },
      });
      expect(res.status).toBe(401);
    });

    it("GET /health permanece público (200)", async () => {
      const res = await app.request("http://local/health");
      expect(res.status).toBe(200);
    });

    it("POST /api/v1/auth/login não exige Authorization (corpo inválido → 4xx, não 401 por falta de token)", async () => {
      const res = await app.request("http://local/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).not.toBe(401);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("JWT assinado com segredo incorreto → 401 nas rotas protegidas", async () => {
      const wrongToken = await sign(
        { sub: "00000000-0000-4000-8000-0000000000aa", email: "x@test.dev", exp: Math.floor(Date.now() / 1000) + 3600 },
        "wrong-secret-but-also-32-chars-minimum!!",
        "HS256",
      );
      const res = await app.request("http://local/api/v1/pacientes", {
        headers: { Authorization: `Bearer ${wrongToken}` },
      });
      expect(res.status).toBe(401);
    });
  });

  describe("RNF07 — paciente_ids só com HMAC (sem PII em repouso)", () => {
    it("persiste apenas hashes esperados para CPF e Cartão SUS", async () => {
      const { getPrisma } = await import("../src/repository/prisma.js");
      const prisma = getPrisma();
      const pepper = process.env.PACIENTE_IDS_PEPPER!;

      const cpf = "11144477735";
      const cartao = "89870000002131812";

      const created = await cadastrarPacienteComHashesIds(
        prisma,
        {
          nome_mascarado: "Ma***",
          cpf_ultimos4: "7735",
          cartao_sus_ultimos4: "1812",
        },
        cpf,
        cartao,
      );

      const row = await prisma.pacienteIds.findUnique({ where: { paciente_id: created.id } });
      expect(row).not.toBeNull();
      expect(row!.cpf_hash).toBe(hashCpf(cpf, pepper));
      expect(row!.cartao_sus_hash).toBe(hashCartaoSus(cartao, pepper));
      expect(row!.cpf_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(row!.cartao_sus_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(row!.cpf_hash).not.toContain(cpf);
    });
  });

  describe("RF07 — PATCH consulta com JWT (transições)", () => {
    it("bloqueia salto ilegal RASCUNHO → CONFIRMADA mesmo autenticado (400)", async () => {
      const { getPrisma } = await import("../src/repository/prisma.js");
      const prisma = getPrisma();

      const paciente = await prisma.paciente.create({
        data: { nome_mascarado: "Te***" },
      });
      const gestacao = await prisma.gestacao.create({
        data: { paciente_id: paciente.id },
      });
      const consulta = await prisma.consulta.create({
        data: {
          gestacao_id: gestacao.id,
          unidade_id: SENTINEL_UNIDADE,
          data: new Date("2025-06-01T12:00:00.000Z"),
          status: StatusConsulta.RASCUNHO,
          validacao_medica: false,
        },
      });

      const token = await sign(
        {
          sub: "00000000-0000-4000-8000-0000000000bb",
          email: "prof.integration@test.dev",
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        process.env.JWT_SECRET!,
        "HS256",
      );

      const res = await app.request(`http://local/api/v1/consultas/${consulta.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: StatusConsulta.CONFIRMADA,
          validacao_medica: true,
        }),
      });

      expect(res.status).toBe(400);
    });

    it("GET /api/v1/consultas/:id retorna 200 com JWT e corpo da consulta", async () => {
      const { getPrisma } = await import("../src/repository/prisma.js");
      const prisma = getPrisma();

      const paciente = await prisma.paciente.create({
        data: { nome_mascarado: "Api***" },
      });
      const gestacao = await prisma.gestacao.create({
        data: { paciente_id: paciente.id },
      });
      const consulta = await prisma.consulta.create({
        data: {
          gestacao_id: gestacao.id,
          unidade_id: SENTINEL_UNIDADE,
          data: new Date("2025-07-10T12:00:00.000Z"),
          status: StatusConsulta.EM_ANDAMENTO,
          validacao_medica: false,
        },
      });

      const token = await sign(
        {
          sub: "00000000-0000-4000-8000-0000000000dd",
          email: "prof.getconsulta@test.dev",
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        process.env.JWT_SECRET!,
        "HS256",
      );

      const res = await app.request(`http://local/api/v1/consultas/${consulta.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id?: string; status?: string };
      expect(body.id).toBe(consulta.id);
      expect(body.status).toBe(StatusConsulta.EM_ANDAMENTO);
    });

    it("PATCH /api/v1/consultas/:id persiste campos do prontuário estruturado (inclui conduta)", async () => {
      const { getPrisma } = await import("../src/repository/prisma.js");
      const prisma = getPrisma();

      const paciente = await prisma.paciente.create({
        data: { nome_mascarado: "Es***" },
      });
      const gestacao = await prisma.gestacao.create({
        data: { paciente_id: paciente.id },
      });
      const consulta = await prisma.consulta.create({
        data: {
          gestacao_id: gestacao.id,
          unidade_id: SENTINEL_UNIDADE,
          data: new Date("2025-08-01T10:20:00.000Z"),
          status: StatusConsulta.EM_ANDAMENTO,
          validacao_medica: false,
        },
      });

      const token = await sign(
        {
          sub: "00000000-0000-4000-8000-0000000000ee",
          email: "prof.patch@test.dev",
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        process.env.JWT_SECRET!,
        "HS256",
      );

      const payload = {
        idade_gestacional: 24,
        peso: 68.5,
        pa_sistolica: 120,
        pa_diastolica: 80,
        au: 24,
        bfc: 140,
        is_edema: true,
        mov_fetal: "Preservado",
        apresentacao_fetal: "Cefálica",
        queixa: "Dor lombar",
        is_exantema: false,
        conduta: "Conduta final definida pela profissional.",
        sugestao_conduta: "Sugestão IA (não oficial).",
      };

      const res = await app.request(`http://local/api/v1/consultas/${consulta.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(200);

      const saved = await prisma.consulta.findUnique({ where: { id: consulta.id } });
      expect(saved).not.toBeNull();
      expect(saved!.idade_gestacional).toBe(24);
      expect(saved!.peso).toBeCloseTo(68.5);
      expect(saved!.pa_sistolica).toBe(120);
      expect(saved!.pa_diastolica).toBe(80);
      expect(saved!.au).toBe(24);
      expect(saved!.bfc).toBe(140);
      expect(saved!.is_edema).toBe(true);
      expect(saved!.mov_fetal).toBe("Preservado");
      expect(saved!.apresentacao_fetal).toBe("Cefálica");
      expect(saved!.queixa).toBe("Dor lombar");
      expect(saved!.is_exantema).toBe(false);
      expect(saved!.conduta).toBe(payload.conduta);

      const ia = await prisma.consultaIa.findUnique({ where: { consulta_id: consulta.id } });
      expect(ia?.sugestao_conduta).toBe(payload.sugestao_conduta);
    });

    it("DELETE /api/v1/consultas/:id remove consulta (cascade dependências)", async () => {
      const { getPrisma } = await import("../src/repository/prisma.js");
      const prisma = getPrisma();

      const paciente = await prisma.paciente.create({
        data: { nome_mascarado: "Del***" },
      });
      const gestacao = await prisma.gestacao.create({
        data: { paciente_id: paciente.id },
      });
      const consulta = await prisma.consulta.create({
        data: {
          gestacao_id: gestacao.id,
          unidade_id: SENTINEL_UNIDADE,
          data: new Date("2025-09-01T10:20:00.000Z"),
          status: StatusConsulta.RASCUNHO,
          validacao_medica: false,
          queixa: "Teste delete",
        },
      });

      await prisma.consultaIa.upsert({
        where: { consulta_id: consulta.id },
        create: { consulta_id: consulta.id, sugestao_conduta: "IA" },
        update: { sugestao_conduta: "IA" },
      });

      const token = await sign(
        {
          sub: "00000000-0000-4000-8000-0000000000fa",
          email: "prof.delete@test.dev",
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        process.env.JWT_SECRET!,
        "HS256",
      );

      const res = await app.request(`http://local/api/v1/consultas/${consulta.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);

      const after = await prisma.consulta.findUnique({ where: { id: consulta.id } });
      expect(after).toBeNull();
      const iaAfter = await prisma.consultaIa.findUnique({ where: { consulta_id: consulta.id } });
      expect(iaAfter).toBeNull();
    });
  });
});
