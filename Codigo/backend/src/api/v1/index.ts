import { Hono } from "hono";
import type { AuthVariables } from "../../middleware/requireAuth.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { registerAuthV1Routes } from "./auth.js";
import { registerClinicalV1Routes } from "./clinical.js";
import { registerDevV1Routes } from "./dev.js";

function isPublicLogin(c: { req: { method: string; path: string } }): boolean {
  if (c.req.method !== "POST") {
    return false;
  }
  const p = c.req.path;
  return p === "/auth/login" || p.endsWith("/auth/login");
}

/**
 * Um único app em `/api/v1`: login público e demais rotas protegidas.
 * Evita ambiguidade do `.route()` aninhado (que gerava 404 no login em alguns cenários).
 */
export function registerApiV1Routes(app: Hono): void {
  const v1 = new Hono<{ Variables: AuthVariables }>();

  v1.use("*", async (c, next) => {
    if (isPublicLogin(c)) {
      return next();
    }
    return requireAuth(c, next);
  });

  registerAuthV1Routes(v1);
  registerClinicalV1Routes(v1);
  registerDevV1Routes(v1);
  app.route("/api/v1", v1);
}
