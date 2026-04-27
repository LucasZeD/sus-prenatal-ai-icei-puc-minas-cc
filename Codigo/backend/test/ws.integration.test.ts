/**
 * WebSocket `/ws/consultation/:id` com Postgres efêmero (Testcontainers).
 * `SKIP_INTEGRATION_TESTS=1 npm test` pula este arquivo.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serve } from "@hono/node-server";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sign } from "hono/jwt";
import { StatusConsulta } from "../src/lib/prismaBarrel.js";
import { createRuntimeApp } from "../src/runtimeApp.js";

const backendRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SENTINEL_UNIDADE = "00000000-0000-4000-8000-000000000001";

const skipIntegration = process.env.SKIP_INTEGRATION_TESTS === "1";

function msgType(m: unknown): string | undefined {
  if (typeof m === "object" && m !== null && "type" in m) {
    return String((m as { type: unknown }).type);
  }
  return undefined;
}

describe.skipIf(skipIntegration)("integração: WebSocket consulta", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let httpServer: Server | undefined;
  let wsOrigin = "";
  let consultaId = "";
  let token = "";

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

    const { getPrisma } = await import("../src/repository/prisma.js");
    const prisma = getPrisma();
    const paciente = await prisma.paciente.create({
      data: { nome_mascarado: "Ws***" },
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
    consultaId = consulta.id;

    token = await sign(
      {
        sub: "00000000-0000-4000-8000-0000000000cc",
        email: "prof.ws@test.dev",
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      process.env.JWT_SECRET!,
      "HS256",
    );

    const { app, injectWebSocket } = createRuntimeApp();
    await new Promise<void>((resolve, reject) => {
      const server = serve(
        { fetch: app.fetch, port: 0, hostname: "127.0.0.1" },
        (info) => {
          const addr = info as AddressInfo;
          wsOrigin = `ws://127.0.0.1:${addr.port}`;
          resolve();
        },
      );
      server.once("error", reject);
      injectWebSocket(server);
      httpServer = server;
    });
  }, 180_000);

  afterAll(async () => {
    try {
      await new Promise<void>((resolve, reject) => {
        if (!httpServer) {
          resolve();
          return;
        }
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    } catch {
      /* noop */
    }
    try {
      const { disconnectPrisma } = await import("../src/repository/prisma.js");
      await disconnectPrisma();
    } catch {
      /* noop */
    }
    if (container) {
      await container.stop();
    }
  });

  it("envia history + ready após conexão com JWT válido", async () => {
    const q = new URLSearchParams({ token });
    const url = `${wsOrigin}/ws/consultation/${consultaId}?${q.toString()}`;
    const received: unknown[] = await new Promise((resolve, reject) => {
      const out: unknown[] = [];
      let done = false;
      const ws = new WebSocket(url);
      const t = setTimeout(() => {
        try {
          ws.close(4000, "test_timeout");
        } catch {
          /* noop */
        }
        if (!done) reject(new Error("timeout aguardando ready"));
      }, 15_000);
      const finish = (fn: () => void) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        fn();
      };
      ws.onmessage = (ev) => {
        let m: unknown;
        try {
          m = JSON.parse(String(ev.data)) as unknown;
        } catch {
          finish(() => reject(new Error("JSON inválido no WS")));
          return;
        }
        out.push(m);
        if (msgType(m) === "ready") {
          try {
            ws.close(1000, "test_done");
          } catch {
            /* noop */
          }
          finish(() => resolve(out));
        }
      };
      ws.onerror = () => {
        finish(() => reject(new Error("erro de transporte WS")));
      };
      ws.onclose = () => {
        finish(() => {
          if (out.length === 0) {
            reject(new Error("WS fechou sem mensagens"));
          } else if (!out.some((x) => msgType(x) === "ready")) {
            reject(new Error("WS fechou sem evento ready"));
          }
        });
      };
    });
    const types = received.map((m) => msgType(m));
    expect(types).toContain("history");
    expect(types).toContain("ready");
    const ready = received.find((m) => msgType(m) === "ready") as { consultaId?: string };
    expect(ready.consultaId).toBe(consultaId);
  });

  it("token inválido: mensagem de erro antes do fechamento", async () => {
    const q = new URLSearchParams({ token: "definitely-not-a-jwt" });
    const url = `${wsOrigin}/ws/consultation/${consultaId}?${q.toString()}`;
    const received: unknown[] = await new Promise((resolve, reject) => {
      const out: unknown[] = [];
      const ws = new WebSocket(url);
      const t = setTimeout(() => reject(new Error("timeout")), 8000);
      ws.onmessage = (ev) => {
        try {
          out.push(JSON.parse(String(ev.data)) as unknown);
        } catch {
          /* noop */
        }
      };
      ws.onclose = () => {
        clearTimeout(t);
        resolve(out);
      };
      ws.onerror = () => {
        clearTimeout(t);
        resolve(out);
      };
    });
    expect(received.some((m) => msgType(m) === "error")).toBe(true);
  });
});
