import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

const backendRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * Testcontainers / CI: o processo já define `DATABASE_URL` e não deve ser sobrescrito
 * pelo `Codigo/.env` (ex.: `localhost:5432` do Compose local).
 */
if (process.env.PRENATAL_PRISMA_USE_PROCESS_ENV_ONLY !== "1") {
  // `Codigo/.env` deve prevalecer sobre `backend/.env` (mesma regra do `src/loadEnv.ts`).
  config({ path: path.join(backendRoot, ".env") });
  config({ path: path.join(backendRoot, "..", ".env"), override: true });
}

export default defineConfig({
  schema: path.join(backendRoot, "prisma", "schema.prisma"),
  migrations: {
    path: path.join(backendRoot, "prisma", "migrations"),
    /* `tsx` não existe na imagem Docker após `npm prune --omit=dev`; o build gera `dist/seed.js`. */
    seed: "node dist/seed.js",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
