import type { Hono } from "hono";
import { AppError } from "../../core/errors.js";
import type { AuthVariables } from "../../middleware/requireAuth.js";
import { loginProfissional } from "../../services/authService.js";

/** Rota relativa ao mount `/api/v1` → `POST /api/v1/auth/login`. */
export function registerAuthV1Routes(v1: Hono<{ Variables: AuthVariables }>): void {
  v1.post("/auth/login", async (c) => {
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
    const email = rec.email;
    const password = rec.password;
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      throw new AppError("validation_error", "Informe e-mail e senha.", 400);
    }

    const result = await loginProfissional(email, password);
    return c.json(result);
  });
}
