import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ConcurrencyLimitExceededError } from "../lib/concurrencyLimiter.js";

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 500,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function mapAppError(c: Context, err: Error): Response {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  const isDev = process.env.NODE_ENV !== "production";

  if (err instanceof AppError) {
    return c.json({ code: err.code, message: err.message }, err.status as ContentfulStatusCode);
  }

  if (err instanceof ConcurrencyLimitExceededError) {
    c.header("Retry-After", "1");
    return c.json({ code: err.code, message: err.message }, 429);
  }

  // Não registrar corpo de requisição nem campos clínicos — apenas metadados do erro.
  console.error("unhandled_error", {
    name: err.name,
    message: err.message,
    stack: isDev ? err.stack : undefined,
  });

  return c.json({ code: "internal_error", message: "Erro interno do servidor." }, 500);
}
