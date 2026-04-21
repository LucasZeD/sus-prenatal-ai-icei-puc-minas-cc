import { defineConfig } from "vitest/config";

/**
 * `fileParallelism: false` evita corridas no singleton do Prisma (`getPrisma`) quando
 * há mais de um arquivo de teste que altera `DATABASE_URL` entre suites.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["test/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
