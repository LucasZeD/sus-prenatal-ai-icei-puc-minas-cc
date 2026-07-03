import { streamEscribaSuggest } from "../lib/clinicalAiClient.js";
import { mcpGateway } from "../lib/privacyMcpGateway.js";
import type { ConsultaClinicalFields } from "../lib/escribaFieldMerge.js";
import { formatProntuarioDraftContext } from "./escribaDraftContext.js";
import { buildLiviaContext } from "./liviaContextService.js";

const ESCRIBA_RAG_TOP_K = 2;

/**
 * Gera sugestoes do Escriba via clinical-ai (RAG top_k=2 + prontuario + transcricao).
 * Resposta em Markdown (PERGUNTA / CONDUTA / ALERTA).
 */
export async function* streamEscribaInsight(
  consultaId: string,
  sanitizedTranscription: string,
  prontuarioDraft: Partial<ConsultaClinicalFields> = {},
): AsyncGenerator<string, void, undefined> {
  const transcription = sanitizedTranscription.trim();
  if (!transcription) {
    return;
  }

  let gestacao_context = "";
  let consulta_escriba_context = "";
  try {
    const ctx = await buildLiviaContext({
      question: transcription,
      consulta_id: consultaId,
    });
    gestacao_context = ctx.gestacao_context;
    consulta_escriba_context = ctx.consulta_escriba_context;
  } catch {
    /* consulta/gestacao indisponivel: segue so com transcricao + RAG */
  }

  const draftBlock = formatProntuarioDraftContext(prontuarioDraft);
  if (draftBlock) {
    try {
      const gateway = mcpGateway();
      const sanitizedDraft = (await gateway.sanitizeForModel(draftBlock)).trim();
      if (sanitizedDraft) {
        consulta_escriba_context = consulta_escriba_context
          ? `${consulta_escriba_context}\n\n${sanitizedDraft}`
          : sanitizedDraft;
      }
    } catch {
      /* rascunho indisponivel apos sanitize: segue sem ele */
    }
  }

  yield* streamEscribaSuggest({
    transcription,
    gestacao_context: gestacao_context || undefined,
    consulta_escriba_context: consulta_escriba_context || undefined,
    top_k: ESCRIBA_RAG_TOP_K,
  });
}
