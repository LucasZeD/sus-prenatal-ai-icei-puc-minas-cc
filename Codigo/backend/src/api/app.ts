import { Hono } from "hono";
import { cors } from "hono/cors";
import { swaggerUI } from "@hono/swagger-ui";
import { mapAppError } from "../core/errors.js";
import { getHealthStatus } from "../services/healthService.js";
import { registerApiV1Routes } from "./v1/index.js";
import { buildOpenApiDoc } from "./openapi.js";

function parseCorsOrigins(raw: string | undefined): string[] {
  const fallback = "http://localhost:5173";
  const s = (raw ?? "").trim();
  if (!s) {
    return [fallback];
  }
  const parts = s
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return parts.length ? parts : [fallback];
}

export function createApp(): Hono {
  const app = new Hono();
  const origins = parseCorsOrigins(process.env.FRONTEND_ORIGIN);

  app.use(
    "*",
    cors({
      origin: origins,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Authorization", "Content-Type", "Accept"],
    }),
  );

  app.get("/openapi.json", (c) => c.json(buildOpenApiDoc("/")));
  app.get("/swagger", swaggerUI({ url: "/openapi.json" }));

  app.get("/health", async (c) => {
    const result = await getHealthStatus();
    return c.json(result.body, result.httpStatus);
  });
  registerApiV1Routes(app);

  app.onError((err, c) => mapAppError(c, err));
  return app;
}
