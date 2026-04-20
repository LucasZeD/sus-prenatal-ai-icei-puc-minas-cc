import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, env } from "prisma/config";

const prismaDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  schema: path.join(prismaDir, "schema.prisma"),
  migrations: {
    path: path.join(prismaDir, "migrations"),
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
