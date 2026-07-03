import type { Hono } from "hono";
import type { WSEvents } from "hono/ws";
import type { NodeWebSocket } from "@hono/node-ws";
import type { WebSocket } from "ws";
import { verify } from "hono/jwt";
import { StatusConsulta } from "../../lib/prismaBarrel.js";
import { getJwtSecret } from "../../config/envAuth.js";
import { isUuid } from "../../lib/validation/uuid.js";
import {
  ConsultationStreamService,
  type ConsultationStreamSession,
  type StreamOutbound,
} from "../../services/consultationStreamService.js";

const streamService = new ConsultationStreamService();

type UpgradeWs = NodeWebSocket["upgradeWebSocket"];

async function verifyWsToken(c: { req: { query: (k: string) => string | undefined } }): Promise<boolean> {
  const token = c.req.query("token")?.trim();
  if (!token) {
    return false;
  }
  try {
    const secret = getJwtSecret();
    const payload = await verify(token, secret, { alg: "HS256" });
    const sub = payload.sub;
    return typeof sub === "string" && Boolean(sub);
  } catch {
    return false;
  }
}

export function registerConsultationWebSocket(app: Hono, upgradeWebSocket: UpgradeWs): void {
  app.get(
    "/ws/consultation/:id",
    upgradeWebSocket(async (c) => {
      const consultaId = c.req.param("id") ?? "";
      if (!isUuid(consultaId)) {
        return {
          onOpen(_evt, ws) {
            ws.send(JSON.stringify({ type: "error", message: "Identificador de consulta inválido." } satisfies StreamOutbound));
            ws.close(4400, "invalid_id");
          },
        } satisfies WSEvents<WebSocket>;
      }

      if (!(await verifyWsToken(c))) {
        return {
          onOpen(_evt, ws) {
            ws.send(JSON.stringify({ type: "error", message: "Token ausente ou inválido." } satisfies StreamOutbound));
            ws.close(4401, "unauthorized");
          },
        } satisfies WSEvents<WebSocket>;
      }

      let session: ConsultationStreamSession | null = null;

      return {
        onOpen: async (_evt, ws) => {
          const outbound = (msg: StreamOutbound) => {
            ws.send(JSON.stringify(msg));
          };

          const consultas = streamService.consultaRepository;
          const row = await consultas.findById(consultaId);
          if (!row) {
            outbound({ type: "error", message: "Consulta não encontrada." });
            ws.close(4404, "not_found");
            return;
          }

          if (row.status === StatusConsulta.CONFIRMADA) {
            outbound({ type: "error", message: "Consulta já confirmada; streaming indisponível." });
            ws.close(4409, "confirmed");
            return;
          }

          await consultas.updateStatus(consultaId, StatusConsulta.EM_ANDAMENTO);

          outbound({ type: "history", eventos: [] });
          outbound({ type: "ready", consultaId, diarizationAvailable: streamService.diarizationAvailable });

          session = await streamService.createSession(consultaId, outbound);
        },

        onMessage: async (evt: { data: unknown }) => {
          if (!session) {
            return;
          }
          const data = evt.data;
          if (typeof data === "string") {
            let parsed: { type?: string } | null = null;
            try {
              parsed = JSON.parse(data) as { type?: string };
            } catch {
              return;
            }
            if (parsed?.type === "vad_pause") {
              await session.onVadPause();
              return;
            }
            if (parsed?.type === "mic_state") {
              const active = Boolean((parsed as { active?: boolean }).active);
              session.onMicState(active);
              return;
            }
            if (parsed?.type === "diarization_state") {
              const enabled = Boolean((parsed as { enabled?: boolean }).enabled);
              session.setDiarizationEnabled(enabled);
              return;
            }
            if (parsed?.type === "prontuario_draft") {
              const fields = (parsed as { fields?: unknown }).fields;
              if (fields && typeof fields === "object" && !Array.isArray(fields)) {
                session.onProntuarioDraft(fields as Record<string, unknown>);
              }
              return;
            }
            return;
          }
          if (data instanceof ArrayBuffer) {
            await session.onBinaryAudio(data);
            return;
          }
          if (ArrayBuffer.isView(data)) {
            await session.onBinaryAudio(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
          }
        },

        onClose: () => {
          session?.dispose();
          session = null;
        },
      } satisfies WSEvents<WebSocket>;
    }),
  );
}
