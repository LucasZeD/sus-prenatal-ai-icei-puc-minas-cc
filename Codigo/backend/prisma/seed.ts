/**
 * Cria ou atualiza um profissional (RF14 — sem auto-cadastro na API).
 * Defina no `Codigo/.env`: SEED_PROFISSIONAL_EMAIL, SEED_PROFISSIONAL_PASSWORD [, SEED_PROFISSIONAL_NOME].
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { config } from "dotenv";

const prismaDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(prismaDir, "..");
config({ path: path.join(backendRoot, ".env") });
config({ path: path.join(backendRoot, "..", ".env"), override: true });

function isLocalPostgresUrl(url: string): boolean {
  // Host típico no host: 127.0.0.1 / localhost; no Compose (rede interna): @db:
  return /127\.0\.0\.1|localhost|@db:/.test(url);
}

/** Em dev + DB local, cria o mesmo usuário do `.env.example` se `SEED_*` estiver ausente (evita login 401 após `migrate reset`). */
function devSeedDefaults(): { email: string; password: string } | null {
  if (process.env.NODE_ENV === "production") {
    return null;
  }
  const url = process.env.DATABASE_URL ?? "";
  if (!url || !isLocalPostgresUrl(url)) {
    return null;
  }
  return { email: "admin@local.dev", password: "changeme_seed_password" };
}

async function main(): Promise<void> {
  let email = process.env.SEED_PROFISSIONAL_EMAIL?.trim().toLowerCase();
  let password = process.env.SEED_PROFISSIONAL_PASSWORD;
  const nome = process.env.SEED_PROFISSIONAL_NOME?.trim() || "Profissional (seed)";

  if (!email || !password) {
    const d = devSeedDefaults();
    if (d) {
      email = d.email;
      password = d.password;
      console.warn(
        "seed_dev_defaults: usando admin@local.dev / changeme_seed_password (DB local). Defina SEED_PROFISSIONAL_EMAIL e SEED_PROFISSIONAL_PASSWORD no Codigo/.env para outro usuário.",
      );
    } else {
      console.log(
        "seed_skip: defina SEED_PROFISSIONAL_EMAIL e SEED_PROFISSIONAL_PASSWORD no Codigo/.env (ou use DATABASE_URL em localhost sem NODE_ENV=production para ativar credenciais de dev do seed).",
      );
      return;
    }
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada.");
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  const senha_hash = await bcrypt.hash(password, 12);

  await prisma.profissional.upsert({
    where: { email },
    create: { email, senha_hash, nome, unidade_id: "00000000-0000-4000-8000-000000000001" },
    update: { senha_hash, nome },
  });

  console.log("seed_ok profissional", email);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
