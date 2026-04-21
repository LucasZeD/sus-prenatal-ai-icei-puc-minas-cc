import { createNodeWebSocket } from "@hono/node-ws";
import { createApp } from "./api/app.js";
import { registerConsultationWebSocket } from "./api/ws/consultation.js";

/**
 * App HTTP + registro de upgrade WebSocket (`/ws/consultation/:id`).
 * `injectWebSocket` deve ser chamado com o servidor retornado por `serve()`.
 */
export function createRuntimeApp(): {
  app: ReturnType<typeof createApp>;
  injectWebSocket: ReturnType<typeof createNodeWebSocket>["injectWebSocket"];
} {
  const app = createApp();
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
  registerConsultationWebSocket(app, upgradeWebSocket);
  return { app, injectWebSocket };
}
