import "./loadEnv.js";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { createApp } from "./api/app.js";
import { registerConsultationWebSocket } from "./api/ws/consultation.js";
import { disconnectPrisma } from "./repository/prisma.js";

const app = createApp();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
registerConsultationWebSocket(app, upgradeWebSocket);

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
