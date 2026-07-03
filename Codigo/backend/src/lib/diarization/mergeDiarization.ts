import type { DiarSegment } from "./diarizationClient.js";

/** Segmento de transcrição com tempos (vindo do STT). */
export type TextSegment = { start: number; end: number; text: string };

/** Papel clínico atribuído por heurística simples e editável (human-in-the-loop). */
export type SpeakerRole = "profissional" | "gestante" | "desconhecido";

/** Resultado da fusão texto x turnos: bloco contíguo de um locutor. */
export type DiarizedTextSegment = {
  /** Rótulo bruto do diarizador (ex.: `SPEAKER_00`). */
  speaker: string;
  /** Papel sugerido (editável pelo profissional na UI). */
  role: SpeakerRole;
  text: string;
};

export type MergeOptions = {
  /** Papel atribuído ao primeiro locutor que aparece (heurística). Default: `profissional`. */
  firstSpeakerRole?: "profissional" | "gestante";
};

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/** Locutor do turno com maior sobreposição temporal; fallback: mais próximo do ponto médio. */
function speakerForText(seg: TextSegment, turns: DiarSegment[]): string | null {
  let best: { speaker: string; score: number } | null = null;
  for (const t of turns) {
    const ov = overlap(seg.start, seg.end, t.start, t.end);
    if (ov > 0 && (best === null || ov > best.score)) {
      best = { speaker: t.speaker, score: ov };
    }
  }
  if (best) {
    return best.speaker;
  }
  const mid = (seg.start + seg.end) / 2;
  let nearest: { speaker: string; dist: number } | null = null;
  for (const t of turns) {
    const tMid = (t.start + t.end) / 2;
    const dist = Math.abs(tMid - mid);
    if (nearest === null || dist < nearest.dist) {
      nearest = { speaker: t.speaker, dist };
    }
  }
  return nearest ? nearest.speaker : null;
}

/**
 * Mescla os turnos de diarização (`start/end/speaker`) com a transcrição (`start/end/text`)
 * por sobreposição temporal, agrupando blocos contíguos do mesmo locutor.
 *
 * Mapeamento de papéis (heurística configurável, NÃO definitiva): o primeiro locutor a
 * aparecer recebe `firstSpeakerRole` (default `profissional`); o segundo, o papel oposto;
 * demais ficam como `desconhecido`. O rótulo final é editável pelo profissional na UI.
 *
 * Retorna `null` quando a diarização está indisponível/vazia ou não há texto  nesse caso
 * o chamador segue com o fluxo de transcrição simples (sem quebrar nada).
 */
export function mergeTranscriptWithDiarization(
  sttSegments: TextSegment[],
  diarSegments: DiarSegment[] | null,
  options: MergeOptions = {},
): DiarizedTextSegment[] | null {
  if (!diarSegments || diarSegments.length === 0) {
    return null;
  }
  const usableText = sttSegments.filter((s) => s.text.trim().length > 0);
  if (usableText.length === 0) {
    return null;
  }

  const firstRole: SpeakerRole = options.firstSpeakerRole ?? "profissional";
  const otherRole: SpeakerRole = firstRole === "profissional" ? "gestante" : "profissional";

  // Ordem de aparição dos locutores nos turnos (define o papel sugerido).
  const orderedSpeakers: string[] = [];
  for (const t of [...diarSegments].sort((a, b) => a.start - b.start)) {
    if (!orderedSpeakers.includes(t.speaker)) {
      orderedSpeakers.push(t.speaker);
    }
  }
  const roleOf = (speaker: string): SpeakerRole => {
    const idx = orderedSpeakers.indexOf(speaker);
    if (idx === 0) return firstRole;
    if (idx === 1) return otherRole;
    return "desconhecido";
  };

  const ordered = [...usableText].sort((a, b) => a.start - b.start);
  const out: DiarizedTextSegment[] = [];
  for (const seg of ordered) {
    const speaker = speakerForText(seg, diarSegments) ?? orderedSpeakers[0];
    const text = seg.text.trim();
    const last = out[out.length - 1];
    if (last && last.speaker === speaker) {
      last.text = `${last.text} ${text}`.trim();
    } else {
      out.push({ speaker, role: roleOf(speaker), text });
    }
  }
  return out;
}
