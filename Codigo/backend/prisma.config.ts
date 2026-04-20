import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

const backendRoot = path.dirname(fileURLToPath(import.meta.url));

// `Codigo/.env` deve prevalecer sobre `backend/.env` (mesma regra do `src/loadEnv.ts`).
config({ path: path.join(backendRoot, ".env") });
config({ path: path.join(backendRoot, "..", ".env"), override: true });

export default defineConfig({
  schema: path.join(backendRoot, "prisma", "schema.prisma"),
  migrations: {
    path: path.join(backendRoot, "prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
