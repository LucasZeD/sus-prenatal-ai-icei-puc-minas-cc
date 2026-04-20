import bcrypt from "bcryptjs";
import { sign } from "hono/jwt";
import { getJwtExpiresSec, getJwtSecret } from "../config/envAuth.js";
import { AppError } from "../core/errors.js";
import { ProfissionalRepository } from "../repository/profissionalRepository.js";

const SALT_ROUNDS = 12;

export type LoginResult = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  profissional: { id: string; email: string; nome: string };
};

export async function loginProfissional(email: string, password: string): Promise<LoginResult> {
  const repo = new ProfissionalRepository();
  const row = await repo.findByEmailForAuth(email);
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    throw new AppError("invalid_credentials", "E-mail ou senha inválidos.", 401);
  }

  const now = Math.floor(Date.now() / 1000);
  const expires_in = getJwtExpiresSec();
  const exp = now + expires_in;
  const secret = getJwtSecret();
  const access_token = await sign({ sub: row.id, email: row.email, iat: now, exp }, secret, "HS256");

  return {
    access_token,
    token_type: "Bearer",
    expires_in,
    profissional: { id: row.id, email: row.email, nome: row.nome },
  };
}

export async function hashSenhaProfissional(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}
