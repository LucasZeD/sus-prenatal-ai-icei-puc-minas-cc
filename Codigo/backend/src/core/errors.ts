import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

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

  // Não registrar corpo de requisição nem campos clínicos — apenas metadados do erro.
  console.error("unhandled_error", {
    name: err.name,
    message: err.message,
    stack: isDev ? err.stack : undefined,
  });

  return c.json({ code: "internal_error", message: "Erro interno do servidor." }, 500);
}
