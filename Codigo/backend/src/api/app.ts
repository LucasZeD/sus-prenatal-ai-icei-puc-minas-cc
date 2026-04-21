import { Hono } from "hono";
import { cors } from "hono/cors";
import { swaggerUI } from "@hono/swagger-ui";
import { mapAppError } from "../core/errors.js";
import { getHealthStatus } from "../services/healthService.js";
import { registerApiV1Routes } from "./v1/index.js";
import { buildOpenApiDoc } from "./openapi.js";

export function createApp(): Hono {
  const app = new Hono();
  const origin = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";

  app.use(
    "*",
    cors({
      origin: [origin],
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
