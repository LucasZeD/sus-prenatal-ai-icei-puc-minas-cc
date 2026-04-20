import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { verify } from "hono/jwt";
import { getJwtSecret } from "../config/envAuth.js";
import { AppError } from "../core/errors.js";

export type AuthVariables = {
  profissional: { id: string; email: string };
};

export const requireAuth: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Token ausente." });
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    throw new HTTPException(401, { message: "Token ausente." });
  }

  try {
    const secret = getJwtSecret();
    const payload = await verify(token, secret, { alg: "HS256" });
    const sub = payload.sub;
    if (typeof sub !== "string" || !sub) {
      throw new HTTPException(401, { message: "Token inválido." });
    }
    const email = typeof payload.email === "string" ? payload.email : "";
    c.set("profissional", { id: sub, email });
    await next();
  } catch (e) {
    if (e instanceof HTTPException) {
      throw e;
    }
    if (e instanceof AppError) {
      throw e;
    }
    throw new HTTPException(401, { message: "Token inválido ou expirado." });
  }
};
