import { describe, expect, it } from "vitest";
import { mergeTranscriptWithDiarization } from "../src/lib/diarization/mergeDiarization.js";
import type { TextSegment } from "../src/lib/diarization/mergeDiarization.js";
import type { DiarSegment } from "../src/lib/diarization/diarizationClient.js";

const transcript: TextSegment[] = [
  { start: 0.0, end: 2.0, text: "Bom dia, como a senhora esta?" },
  { start: 2.0, end: 4.0, text: "Estou com dor nas costas." },
  { start: 4.0, end: 6.0, text: "Vamos medir sua pressao." },
];

const turns: DiarSegment[] = [
  { start: 0.0, end: 2.0, speaker: "SPEAKER_00" },
  { start: 2.0, end: 4.0, speaker: "SPEAKER_01" },
  { start: 4.0, end: 6.0, speaker: "SPEAKER_00" },
];

describe("mergeTranscriptWithDiarization", () => {
  it("retorna null quando a diarizacao esta desligada (null) ou vazia", () => {
    expect(mergeTranscriptWithDiarization(transcript, null)).toBeNull();
    expect(mergeTranscriptWithDiarization(transcript, [])).toBeNull();
  });

  it("retorna null quando nao ha texto utilizavel", () => {
    const empty: TextSegment[] = [{ start: 0, end: 1, text: "   " }];
    expect(mergeTranscriptWithDiarization(empty, turns)).toBeNull();
  });

  it("mescla por sobreposicao e mapeia o primeiro locutor como profissional", () => {
    const out = mergeTranscriptWithDiarization(transcript, turns);
    expect(out).not.toBeNull();
    expect(out).toEqual([
      { speaker: "SPEAKER_00", role: "profissional", text: "Bom dia, como a senhora esta?" },
      { speaker: "SPEAKER_01", role: "gestante", text: "Estou com dor nas costas." },
      { speaker: "SPEAKER_00", role: "profissional", text: "Vamos medir sua pressao." },
    ]);
  });

  it("agrupa segmentos contiguos do mesmo locutor", () => {
    const t: TextSegment[] = [
      { start: 0.0, end: 1.0, text: "Parte um." },
      { start: 1.0, end: 2.0, text: "Parte dois." },
      { start: 2.0, end: 3.0, text: "Outro fala." },
    ];
    const d: DiarSegment[] = [
      { start: 0.0, end: 2.0, speaker: "SPEAKER_00" },
      { start: 2.0, end: 3.0, speaker: "SPEAKER_01" },
    ];
    const out = mergeTranscriptWithDiarization(t, d);
    expect(out).toEqual([
      { speaker: "SPEAKER_00", role: "profissional", text: "Parte um. Parte dois." },
      { speaker: "SPEAKER_01", role: "gestante", text: "Outro fala." },
    ]);
  });

  it("respeita firstSpeakerRole=gestante", () => {
    const out = mergeTranscriptWithDiarization(transcript, turns, { firstSpeakerRole: "gestante" });
    expect(out?.[0].role).toBe("gestante");
    expect(out?.[1].role).toBe("profissional");
  });

  it("rotula o terceiro locutor como desconhecido", () => {
    const t: TextSegment[] = [
      { start: 0, end: 1, text: "A." },
      { start: 1, end: 2, text: "B." },
      { start: 2, end: 3, text: "C." },
    ];
    const d: DiarSegment[] = [
      { start: 0, end: 1, speaker: "SPEAKER_00" },
      { start: 1, end: 2, speaker: "SPEAKER_01" },
      { start: 2, end: 3, speaker: "SPEAKER_02" },
    ];
    const out = mergeTranscriptWithDiarization(t, d);
    expect(out?.[2]).toEqual({ speaker: "SPEAKER_02", role: "desconhecido", text: "C." });
  });
});
