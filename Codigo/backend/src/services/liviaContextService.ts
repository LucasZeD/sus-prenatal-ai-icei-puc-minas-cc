import type { Consulta, Exame } from "@prisma/client";
import { ExameTipo } from "../lib/prismaBarrel.js";
import { AppError } from "../core/errors.js";
import { isUuid } from "../lib/validation/uuid.js";
import { mcpGateway } from "../lib/privacyMcpGateway.js";
import { getPrisma } from "../repository/prisma.js";

const MAX_GESTACAO_CHARS = 3500;
const MAX_CONSULTA_CHARS = 3500;
const CONSULTAS_RECENT = 5;

/** IDs usados para escopo clnico (Lívia / sugestes); `question` s  obrigatrio em `buildLiviaContext`. */
export type LiviaScopeIds = {
  paciente_id?: string;
  gestacao_id?: string;
  consulta_id?: string;
};

export type LiviaContextInput = LiviaScopeIds & {
  question: string;
};

export type LiviaContextResult = {
  gestacao_context: string;
  consulta_escriba_context: string;
};

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

function normalizeQuestion(q: string): string {
  return stripAccents(q.trim().toLowerCase());
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}`;
}

type Intent = {
  wantsPA: boolean;
  wantsDiabetes: boolean;
  wantsVaccine: boolean;
  wantsRisco: boolean;
  wantsAntecedentes: boolean;
  wantsConsultaNarrative: boolean;
  wantsInfeccao: boolean;
  wantsCardio: boolean;
  wantsConduta: boolean;
};

function detectIntent(q: string): Intent {
  const n = normalizeQuestion(q);
  return {
    wantsPA:
      /\b(pa|pressao|pressao arterial|hipertens|sistolica|diastolica|ta elevad)\b/u.test(n) ||
      n.includes("pre-eclampsia") ||
      n.includes("pre eclampsia"),
    wantsDiabetes:
      n.includes("diabetes") ||
      n.includes("glicemia") ||
      n.includes("glicose") ||
      n.includes("totg") ||
      n.includes("tolerancia oral") ||
      n.includes("dm"),
    wantsVaccine:
      n.includes("vacina") ||
      n.includes("imuniz") ||
      n.includes("dtpa") ||
      n.includes("tripe") ||
      n.includes("influenza"),
    wantsRisco:
      n.includes("risco") ||
      n.includes("alto risco") ||
      n.includes("encaminh") ||
      n.includes("obstetr"),
    wantsAntecedentes:
      n.includes("antecedent") ||
      n.includes("historia obstetric") ||
      n.includes("gestacao anterior") ||
      n.includes("parto anterior") ||
      n.includes("aborto") ||
      n.includes("cesarea"),
    wantsConsultaNarrative:
      n.includes("queixa") ||
      n.includes("consulta") ||
      n.includes("hoje") ||
      n.includes("atual") ||
      n.includes("sintoma") ||
      n.includes("edema") ||
      n.includes("cefale") ||
      n.includes("exame fisico") ||
      n.includes("vitais"),
    wantsInfeccao:
      n.includes("infeccao urinaria") ||
      n.includes("itu ") ||
      n.includes("itu,") ||
      n.includes(" urinaria") ||
      n.includes("sifilis") ||
      n.includes("hiv") ||
      (n.includes("hepatite") && !n.includes("vacina")),
    wantsCardio: n.includes("cardiopat") || n.includes("trombo") || n.includes("arritmia"),
    wantsConduta: n.includes("conduta") || n.includes("plano") || n.includes("tratamento"),
  };
}

const GLICOSE_EXAMES: readonly ExameTipo[] = [
  ExameTipo.GLICEMIA_JEJUM,
  ExameTipo.TESTE_ORAL_TOLERANCIA_GLICOSE,
];

function formatYm(d: Date | null | undefined): string | null {
  if (!d) return null;
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  const y = x.getUTCFullYear();
  const m = String(x.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function gestacaoBoolSummary(g: {
  is_hipertensao_arterial: boolean;
  is_diabetes_gestacional: boolean;
  is_infeccao_urinaria: boolean;
  is_cardiopatia: boolean;
  is_tromboembolismo: boolean;
}): string {
  const on: string[] = [];
  if (g.is_hipertensao_arterial) on.push("HAS gestacao (marcador)");
  if (g.is_diabetes_gestacional) on.push("DMG (marcador)");
  if (g.is_infeccao_urinaria) on.push("infeccao urinaria (marcador)");
  if (g.is_cardiopatia) on.push("cardiopatia (marcador)");
  if (g.is_tromboembolismo) on.push("tromboembolismo (marcador)");
  return on.length ? on.join("; ") : "sem marcadores ativos alem dos blocos condicionais";
}

function hasAnyGestacaoMarker(g: {
  is_hipertensao_arterial: boolean;
  is_diabetes_gestacional: boolean;
  is_infeccao_urinaria: boolean;
  is_cardiopatia: boolean;
  is_tromboembolismo: boolean;
}): boolean {
  return (
    g.is_hipertensao_arterial ||
    g.is_diabetes_gestacional ||
    g.is_infeccao_urinaria ||
    g.is_cardiopatia ||
    g.is_tromboembolismo
  );
}

/** Quando a ficha tem pouco alm da tag de risco: instrui o LLM a avisar o profissional explicitamente. */
function buildProntuarioCoberturaNote(
  gestacao: { dum: Date | null; dpp: Date | null; dpp_eco: Date | null; consultas: { length: number } },
  pac: { idade: number | null; abo_rh: string | null },
  igSem: number | null,
  gestacaoMarkers: {
    is_hipertensao_arterial: boolean;
    is_diabetes_gestacional: boolean;
    is_infeccao_urinaria: boolean;
    is_cardiopatia: boolean;
    is_tromboembolismo: boolean;
  },
): string | null {
  let filled = 0;
  if (igSem != null) filled++;
  if (formatYm(gestacao.dum ?? undefined)) filled++;
  if (formatYm(gestacao.dpp ?? undefined) || formatYm(gestacao.dpp_eco ?? undefined)) filled++;
  if (pac.idade != null) filled++;
  if (pac.abo_rh?.trim()) filled++;

  const markers = hasAnyGestacaoMarker(gestacaoMarkers);
  const nConsultas = gestacao.consultas.length;

  if (!markers && filled <= 1 && nConsultas === 0) {
    return [
      "### Cobertura do prontuario (instrucao ao assistente)",
      "- **Ficha com dados minimos**: alem da classificacao de risco, poucos ou nenhum campo relevante (IG, DUM/DPP, idade, ABO/Rh) e **nenhuma consulta** registrada.",
      "- Na **primeira frase** da resposta ao profissional, informe com clareza que **nao ha informacoes suficientes na ficha** para resumo de risco **individualizado** desta gestacao.",
      "- Depois pode explicar em termos gerais o que a classificacao atual costuma implicar e citar trechos RAG como referencia de protocolo, **sem atribuir** dados ou achados a esta paciente que nao constem no CONTEXT.",
      "- Sugira completar DUM, IG, DPP, dados vitais, antecedentes e registro das consultas no prontuario.",
    ].join("\n");
  }

  if (!markers && filled <= 2) {
    return [
      "### Cobertura do prontuario (instrucao ao assistente)",
      "- Ficha **parcialmente preenchida**; se faltar dado essencial a pergunta, diga explicitamente ao profissional antes de conclusoes personalizadas.",
      "- Priorize o que consta no CONTEXT; use RAG como apoio normativo, sem inventar informacoes do caso.",
    ].join("\n");
  }

  return null;
}

export async function resolveLiviaClinicalScope(input: LiviaScopeIds): Promise<{ gestacaoId: string; consultaFocusedId: string | null }> {
  const prisma = getPrisma();
  let gestacaoId = input.gestacao_id?.trim() ?? "";
  const consultaFocusedId = input.consulta_id?.trim() ?? "";
  const pacienteId = input.paciente_id?.trim() ?? "";

  if (consultaFocusedId) {
    if (!isUuid(consultaFocusedId)) {
      throw new AppError("validation_error", "consulta_id deve ser UUID.", 400);
    }
    const c = await prisma.consulta.findUnique({
      where: { id: consultaFocusedId },
      select: { gestacao_id: true, gestacao: { select: { paciente_id: true } } },
    });
    if (!c) {
      throw new AppError("not_found", "Consulta nao encontrada.", 404);
    }
    if (gestacaoId && gestacaoId !== c.gestacao_id) {
      throw new AppError("validation_error", "consulta_id nao pertence a gestacao indicada.", 400);
    }
    gestacaoId = c.gestacao_id;
    if (pacienteId && pacienteId !== c.gestacao.paciente_id) {
      throw new AppError("validation_error", "consulta nao pertence ao paciente indicado.", 400);
    }
    return { gestacaoId, consultaFocusedId };
  }

  if (!gestacaoId) {
    throw new AppError("validation_error", "Informe gestacao_id ou consulta_id.", 400);
  }
  if (!isUuid(gestacaoId)) {
    throw new AppError("validation_error", "gestacao_id deve ser UUID.", 400);
  }

  const g = await prisma.gestacao.findUnique({
    where: { id: gestacaoId },
    select: { id: true, paciente_id: true },
  });
  if (!g) {
    throw new AppError("not_found", "Gestacao nao encontrada.", 404);
  }
  if (pacienteId && pacienteId !== g.paciente_id) {
    throw new AppError("validation_error", "Gestacao nao pertence ao paciente indicado.", 400);
  }

  return { gestacaoId: g.id, consultaFocusedId: null };
}

/** Recorte textual para a Livia (blocos filtrados pela pergunta + baseline). */
export async function buildLiviaContext(input: LiviaContextInput): Promise<LiviaContextResult> {
  const qRaw = typeof input.question === "string" ? input.question.trim() : "";
  if (!qRaw) {
    throw new AppError("validation_error", "Campo question e obrigatorio.", 400);
  }
  const intent = detectIntent(qRaw);
  const { gestacaoId, consultaFocusedId } = await resolveLiviaClinicalScope(input);

  const prisma = getPrisma();
  const gestacao = await prisma.gestacao.findUnique({
    where: { id: gestacaoId },
    include: {
      antecedentes: true,
      paciente: {
        select: {
          id: true,
          idade: true,
          etnia: true,
          escolaridade: true,
          estado_civil: true,
          ocupacao: true,
          abo_rh: true,
          altura: true,
          peso_pre_gestacional: true,
          vacinas: { orderBy: { data: "desc" }, take: 8 },
          exames: { orderBy: { data_coleta: "desc" }, take: 14 },
        },
      },
      consultas: { orderBy: { data: "desc" }, take: CONSULTAS_RECENT },
    },
  });

  if (!gestacao || !gestacao.paciente) {
    throw new AppError("not_found", "Dados da gestacao indisponiveis.", 404);
  }

  const pac = gestacao.paciente;
  const latestConsulta = gestacao.consultas[0] ?? null;
  const igSem =
    consultaFocusedId != null
      ? (await prisma.consulta.findUnique({ where: { id: consultaFocusedId }, select: { idade_gestacional: true } }))
          ?.idade_gestacional
      : (latestConsulta?.idade_gestacional ?? gestacao.idade_gestac_confirmada ?? gestacao.ig_inicial ?? null);

  const baseline: string[] = [];
  baseline.push(
    "### Resumo basal (filtro automatico pela pergunta)",
    `- Classificacao de risco: ${gestacao.tipo_risco}`,
    `- IG referencia (consulta foco ou ultima): ${igSem != null ? `${igSem} semanas` : "nao informada"}`,
    `- DUM (YYYY-MM): ${formatYm(gestacao.dum ?? undefined) ?? "-"}`,
    `- DPP (YYYY-MM): ${formatYm(gestacao.dpp ?? undefined) ?? formatYm(gestacao.dpp_eco ?? undefined) ?? "-"}`,
    `- Idade materna (anos): ${pac.idade ?? "-"}`,
    `- ABO/Rh: ${pac.abo_rh ?? "-"}`,
    `- Marcadores: ${gestacaoBoolSummary(gestacao)}`,
  );

  const cobertura = buildProntuarioCoberturaNote(gestacao, pac, igSem ?? null, gestacao);
  const sections: string[] = [...baseline];
  if (cobertura) sections.push(cobertura);

  if (intent.wantsPA) {
    const paLines: string[] = ["### Relacionado: pressao arterial / hipertensao"];
    paLines.push(`- HAS (campo gestacao): ${gestacao.is_hipertensao_arterial ? "sim" : "nao"}`);
    if (gestacao.antecedentes?.is_hipertensao_familiar) paLines.push("- Antecedente familiar hipertensao: sim");
    for (const c of gestacao.consultas.slice(0, 3)) {
      if (c.pa_sistolica != null || c.pa_diastolica != null) {
        paLines.push(
          `- PA em ${formatYm(c.data ?? undefined) ?? "?"} (IG ${c.idade_gestacional ?? "?"}s): ${c.pa_sistolica ?? "?"}/${c.pa_diastolica ?? "?"}`,
        );
      }
    }
    sections.push(paLines.join("\n"));
  }

  if (intent.wantsDiabetes) {
    const lines: string[] = ["### Relacionado: diabetes / glicose"];
    lines.push(`- DMG (marcador): ${gestacao.is_diabetes_gestacional ? "sim" : "nao"}`);
    if (gestacao.antecedentes?.is_diabetes_familiar) lines.push("- Antecedente familiar diabetes: sim");
    const exFiltered = pac.exames.filter((e: Exame) => GLICOSE_EXAMES.includes(e.tipo));
    for (const e of exFiltered.slice(0, 5)) {
      lines.push(
        `- ${e.tipo} coleta(${formatYm(e.data_coleta ?? undefined) ?? "?"}) valor=${e.valor ?? "indisponivel"} alterado=${e.is_alterado ? "sim" : "nao"}`,
      );
    }
    sections.push(lines.join("\n"));
  }

  if (intent.wantsVaccine && pac.vacinas.length > 0) {
    const lines: string[] = ["### Vacinas recentes"];
    for (const v of pac.vacinas) {
      lines.push(`- ${v.tipo} data=${formatYm(v.data ?? undefined) ?? "?"}`);
    }
    sections.push(lines.join("\n"));
  }

  if (intent.wantsAntecedentes && gestacao.antecedentes) {
    const a = gestacao.antecedentes;
    const lines: string[] = ["### Antecedentes obstetricos"];
    lines.push(
      `Gestas/partos/abortos/NV: ${a.n_gestas_anteriores ?? "?"}/${a.n_partos ?? "?"}/${a.n_abortos ?? "?"}/${a.n_nascidos_vivos ?? "?"}`,
    );
    lines.push(`Cesarea/PN/prematuro: ${a.n_cesarea ?? "?"}/${a.n_parto_normal ?? "?"}/${a.n_parto_prematuro ?? "?"}`);
    if (a.is_sifilis) lines.push("- sifilis em gestacao anterior: sim");
    if (a.is_gesta_ectopica) lines.push("- gestacao ectopica: sim");
    sections.push(lines.join("\n"));
  }

  if (intent.wantsRisco) {
    sections.push(
      [
        "### Risco obstetrico",
        `- Tipo: ${gestacao.tipo_risco}`,
        `- Tipo gravidez: ${gestacao.tipo_gravidez ?? "-"}`,
      ].join("\n"),
    );
  }

  if (intent.wantsInfeccao) {
    const lines = ["### Infeccoes / IST"];
    lines.push(`- IU na gestacao atual: ${gestacao.is_infeccao_urinaria ? "sim" : "nao"}`);
    if (gestacao.antecedentes?.is_sifilis) lines.push("- sifilis (antecedentes): sim");
    sections.push(lines.join("\n"));
  }

  if (intent.wantsCardio) {
    sections.push(
      [
        "### Cardiovascular / trombo",
        `- Cardiopatia gestacao: ${gestacao.is_cardiopatia ? "sim" : "nao"}`,
        `- Tromboembolismo: ${gestacao.is_tromboembolismo ? "sim" : "nao"}`,
      ].join("\n"),
    );
  }

  let gestacao_context = truncate(sections.join("\n\n"), MAX_GESTACAO_CHARS);

  let targetConsult =
    consultaFocusedId != null
      ? gestacao.consultas.find((x: Consulta) => x.id === consultaFocusedId)
      : intent.wantsConsultaNarrative
        ? latestConsulta
        : null;

  if (consultaFocusedId && !targetConsult) {
    const c = await prisma.consulta.findUnique({ where: { id: consultaFocusedId } });
    if (!c || c.gestacao_id !== gestacaoId) {
      throw new AppError("not_found", "Consulta nao encontrada nesta gestacao.", 404);
    }
    targetConsult = { ...c, ia: null } as Consulta;
  }

  let consulta_escriba_context = "";
  if (targetConsult) {
    const parts = [
      "### Consulta (recorte)",
      `Data ref (YYYY-MM): ${formatYm(targetConsult.data ?? undefined) ?? "-"}`,
      `IG (s): ${targetConsult.idade_gestacional ?? "-"}`,
      `PA: ${targetConsult.pa_sistolica ?? "?"}/${targetConsult.pa_diastolica ?? "?"}`,
      `Peso kg: ${targetConsult.peso ?? "?"}`,
      `AU/BFC: ${targetConsult.au ?? "?"}/${targetConsult.bfc ?? "?"}`,
      `Edema: ${targetConsult.is_edema ? "sim" : "nao"}`,
      `Exantema: ${targetConsult.is_exantema ? "sim" : "nao"}`,
      `Queixa:\n${truncate(targetConsult.queixa ?? "", 900)}`,
    ];
    if (intent.wantsConduta && targetConsult.conduta) {
      parts.push(`Conduta:\n${truncate(targetConsult.conduta, 700)}`);
    }
    consulta_escriba_context = truncate(parts.join("\n"), MAX_CONSULTA_CHARS);
  }

  gestacao_context = truncate(gestacao_context, MAX_GESTACAO_CHARS);

  const gateway = mcpGateway();
  try {
    gestacao_context = gestacao_context.trim()
      ? (await gateway.sanitizeForModel(gestacao_context)).trim()
      : "";
    consulta_escriba_context = consulta_escriba_context.trim()
      ? (await gateway.sanitizeForModel(consulta_escriba_context)).trim()
      : "";
  } catch {
    throw new AppError(
      "service_unavailable",
      "Sanitizacao de dados para o assistente indisponivel. Confira CLINICAL_AI_URL e se o servico clinical-ai esta no ar.",
      503,
    );
  }

  return {
    gestacao_context,
    consulta_escriba_context,
  };
}

const MAX_LIVIA_SUGGESTIONS = 4;

/** Perguntas sugeridas (somente texto derivado de campos estruturados; sem colar queixa livre). */
export async function buildLiviaSuggestions(input: LiviaScopeIds): Promise<{ suggestions: string[] }> {
  const { gestacaoId, consultaFocusedId } = await resolveLiviaClinicalScope(input);
  const prisma = getPrisma();
  const gestacao = await prisma.gestacao.findUnique({
    where: { id: gestacaoId },
    include: {
      antecedentes: true,
      consultas: { orderBy: { data: "desc" }, take: 3 },
    },
  });
  if (!gestacao) {
    throw new AppError("not_found", "Gestacao nao encontrada.", 404);
  }

  let refConsult = gestacao.consultas[0] ?? null;
  if (consultaFocusedId) {
    const focused = await prisma.consulta.findUnique({ where: { id: consultaFocusedId } });
    if (focused && focused.gestacao_id === gestacaoId) {
      refConsult = focused;
    }
  }

  const igSem =
    refConsult?.idade_gestacional ?? gestacao.idade_gestac_confirmada ?? gestacao.ig_inicial ?? null;
  const tipoRisco = String(gestacao.tipo_risco ?? "nao informado");

  const suggestions: string[] = [];
  if (igSem != null) {
    suggestions.push(`Resumo do risco (${tipoRisco}) nesta gestacao com IG ~${igSem}s`);
  } else {
    suggestions.push(`Resumo do risco (${tipoRisco}) desta gestacao`);
  }

  const hasPaMarcador =
    gestacao.is_hipertensao_arterial ||
    Boolean(gestacao.antecedentes?.is_hipertensao_familiar) ||
    gestacao.consultas.some((c) => c.pa_sistolica != null || c.pa_diastolica != null);
  if (hasPaMarcador) {
    suggestions.push("Conduta para PA elevada (protocolo MS) nesta paciente");
  }

  if (gestacao.is_diabetes_gestacional || gestacao.antecedentes?.is_diabetes_familiar) {
    suggestions.push("Monitoramento e conduta para diabetes / glicemia na gestacao");
  }

  if (gestacao.is_infeccao_urinaria || gestacao.antecedentes?.is_sifilis) {
    suggestions.push("Rastreio e conduta de infeccoes urinarias ou IST nesta gestacao");
  }

  if (gestacao.is_cardiopatia || gestacao.antecedentes?.is_cardiopatia) {
    suggestions.push("Cuidados e conduta com cardiopatia nesta gestacao");
  }

  if (gestacao.is_tromboembolismo || gestacao.antecedentes?.is_tromboembolismo) {
    suggestions.push("Vigilancia tromboembolica e orientacoes de protocolo");
  }

  suggestions.push("Criterios de encaminhamento obstetrico conforme cartilhas do SUS");
  suggestions.push("Imunizacoes recomendadas no pre-natal: o que conferir neste caso");

  if (refConsult?.queixa?.trim()) {
    suggestions.push("Interpretar queixas e achados da ultima consulta registrada (ver texto no prontuario)");
  }

  if (refConsult) {
    suggestions.push("Conduta e plano para a consulta em foco (edema, PA, sinais de alerta)");
  }

  const seen = new Set<string>();
  const out = suggestions.filter((s) => {
    if (seen.has(s)) return false;
    seen.add(s);
    return true;
  });
  return { suggestions: out.slice(0, MAX_LIVIA_SUGGESTIONS) };
}
