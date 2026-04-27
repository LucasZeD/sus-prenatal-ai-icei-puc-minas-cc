import "./loadEnv.js";
import { serve } from "@hono/node-server";
import { createRuntimeApp } from "./runtimeApp.js";
import { disconnectPrisma } from "./repository/prisma.js";

const { app, injectWebSocket } = createRuntimeApp();

const port = Number(process.env.PORT ?? 3000);

const server = serve({ fetch: app.fetch, port }, (info) => {
  // Intencionalmente sem payload sensível (LGPD / gemini.md).
  console.log(`backend_ready port=${info.port}`);
});
injectWebSocket(server);

const shutdown = async () => {
  await disconnectPrisma();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
