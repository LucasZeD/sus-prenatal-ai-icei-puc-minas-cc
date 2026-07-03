/**
 * Tres gestantes de demonstracao com perfis clinicos completos (apresentacao / demo).
 * Idempotente: localiza cada paciente pelo hash fixo de CPF de demo.
 */
import { createHmac } from "node:crypto";
import type {
  AboRh,
  Escolaridade,
  EstadoCivil,
  Etnia,
  ExameTipo,
  PrismaClient,
  RiscoGestacional,
  VacinaTipo,
} from "@prisma/client";
import { StatusConsulta } from "@prisma/client";

const SENTINEL_UNIDADE_ID = "00000000-0000-4000-8000-000000000001";

function hmacSha256Hex(message: string, secret: string): string {
  return createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

function hashCpf(cpfBruto: string, pepper: string): string {
  const d = cpfBruto.replace(/\D/g, "");
  if (d.length !== 11) throw new Error("cpf_invalido");
  return hmacSha256Hex(d, pepper);
}

function hashCartaoSus(cartaoBruto: string, pepper: string): string {
  const d = cartaoBruto.replace(/\D/g, "");
  if (d.length < 15) throw new Error("cartao_sus_invalido");
  return hmacSha256Hex(d, pepper);
}

function dppFromDum(dum: Date): Date {
  const d = new Date(dum);
  d.setUTCDate(d.getUTCDate() + 280);
  return d;
}

type ConsultaSeed = {
  data: Date;
  idade_gestacional: number;
  peso: number;
  pa_sistolica: number;
  pa_diastolica: number;
  au: number;
  bfc: number;
  is_edema: boolean;
  mov_fetal: string;
  apresentacao_fetal: string;
  queixa: string;
  conduta: string;
};

type GestanteSeed = {
  cpf: string;
  cartaoSus: string;
  paciente: {
    nome_mascarado: string;
    nome_social?: string;
    data_nascimento: Date;
    idade: number;
    etnia: Etnia;
    escolaridade: Escolaridade;
    estado_civil: EstadoCivil;
    ocupacao: string;
    abo_rh: AboRh;
    telefone: string;
    email: string;
    localizacao: string;
    altura: number;
    peso_pre_gestacional: number;
    is_particip_atvd_educativa: boolean;
  };
  parceiro: { nome: string; vdrl: string; hiv: string };
  gestacao: {
    dum: Date;
    dpp_eco?: Date;
    ig_inicial: number;
    idade_gestac_confirmada: number;
    tipo_risco: RiscoGestacional;
    coombs?: string;
    tipo_gravidez: string;
    is_planejada: boolean;
    is_visita_maternidade: boolean;
    is_did_consulta_odontologica: boolean;
    is_diabetes_gestacional: boolean;
    is_infeccao_urinaria: boolean;
    is_hipertensao_arterial: boolean;
    suplementacao_ferro: boolean;
    suplementacao_acido_folico: boolean;
  };
  antecedentes: Record<string, number | boolean>;
  vacinas: Array<{ tipo: VacinaTipo; data: Date; data_aprazada?: Date }>;
  exames: Array<{
    tipo: ExameTipo;
    trimestre: number;
    valor: string;
    is_alterado: boolean;
    data_coleta: Date;
  }>;
  usgs: Array<{
    data_exame: Date;
    ig_dum: string;
    ig_usg: string;
    peso_fetal_estimado: number;
    localizacao_placenta: string;
    idade_gestacional_usg: number;
    is_liquido_amniotico_normal: boolean;
    outros: string;
  }>;
  odonto: {
    anotacoes: string;
    is_alta: boolean;
    is_sangramento_gengival: boolean;
    is_carie_detectada: boolean;
  };
  planoParto: {
    acompanhante_nome: string;
    posicao_parto_pref: string;
    anestesia_alivio_dor: string;
    is_deseja_doula: boolean;
  };
  consultas: ConsultaSeed[];
};

const GESTANTES: GestanteSeed[] = [  {
    cpf: "39053344705",
    cartaoSus: "89800123456789012",
    paciente: {
      nome_mascarado: "Maria Fernanda Silva",
      data_nascimento: new Date("2000-03-14"),
      idade: 26,
      etnia: "PARDA",
      escolaridade: "MEDIO_COMPLETO",
      estado_civil: "UNIAO_ESTAVEL",
      ocupacao: "Auxiliar administrativa",
      abo_rh: "O_POS",
      telefone: "(31) 99234-5610",
      email: "maria.fernanda.demo@email.com",
      localizacao: "Belo Horizonte — Bairro Santa Efigênia",
      altura: 1.63,
      peso_pre_gestacional: 62.5,
      is_particip_atvd_educativa: true,
    },
    parceiro: { nome: "Ricardo Almeida Silva", vdrl: "Não reagente", hiv: "Não reagente" },
    gestacao: {
      dum: new Date("2025-12-15"),
      ig_inicial: 8,
      idade_gestac_confirmada: 28,
      tipo_risco: "HABITUAL",
      tipo_gravidez: "Única",
      is_planejada: true,
      is_visita_maternidade: true,
      is_did_consulta_odontologica: true,
      is_diabetes_gestacional: false,
      is_infeccao_urinaria: false,
      is_hipertensao_arterial: false,
      suplementacao_ferro: true,
      suplementacao_acido_folico: true,
    },
    antecedentes: {
      n_gestas_anteriores: 0,
      n_partos: 0,
      n_abortos: 0,
      n_nascidos_vivos: 0,
      is_fumo: false,
      is_alcool: false,
      is_drogas: false,
      is_hipertensao_familiar: true,
      is_diabetes_familiar: false,
    },
    vacinas: [
      { tipo: "ANTITETANICA", data: new Date("2026-01-20"), data_aprazada: new Date("2026-07-20") },
      { tipo: "HEPATITE_B", data: new Date("2025-12-20") },
      { tipo: "INFLUENZA", data: new Date("2026-04-10") },
      { tipo: "OUTRAS", data: new Date("2026-06-01") },
    ],
    exames: [
      { tipo: "ABO_RH", trimestre: 1, valor: "O positivo", is_alterado: false, data_coleta: new Date("2025-12-18") },
      { tipo: "HEMOGLOBINA", trimestre: 1, valor: "12,8 g/dL", is_alterado: false, data_coleta: new Date("2025-12-18") },
      { tipo: "GLICEMIA_JEJUM", trimestre: 1, valor: "82 mg/dL", is_alterado: false, data_coleta: new Date("2025-12-18") },
      { tipo: "HIV", trimestre: 1, valor: "Não reagente", is_alterado: false, data_coleta: new Date("2025-12-18") },
      { tipo: "SIFILIS", trimestre: 1, valor: "Não reagente", is_alterado: false, data_coleta: new Date("2025-12-18") },
      { tipo: "VDRL", trimestre: 1, valor: "Não reagente", is_alterado: false, data_coleta: new Date("2025-12-18") },
      { tipo: "URINA_EAS", trimestre: 1, valor: "Normal", is_alterado: false, data_coleta: new Date("2025-12-18") },
      { tipo: "TOXOPLASMOSE", trimestre: 1, valor: "IgG reagente / IgM não reagente", is_alterado: false, data_coleta: new Date("2025-12-18") },
      { tipo: "HEMOGLOBINA", trimestre: 2, valor: "11,9 g/dL", is_alterado: false, data_coleta: new Date("2026-03-10") },
      { tipo: "TESTE_ORAL_TOLERANCIA_GLICOSE", trimestre: 2, valor: "88 mg/dL", is_alterado: false, data_coleta: new Date("2026-03-10") },
    ],
    usgs: [
      {
        data_exame: new Date("2026-01-08"),
        ig_dum: "3s 3d",
        ig_usg: "13s 2d",
        peso_fetal_estimado: 0,
        localizacao_placenta: "—",
        idade_gestacional_usg: 13,
        is_liquido_amniotico_normal: true,
        outros: "Gestção única, embrião com BCF presente, anatomia inicial sem alterações.",
      },
      {
        data_exame: new Date("2026-04-22"),
        ig_dum: "18s 1d",
        ig_usg: "18s 0d",
        peso_fetal_estimado: 285,
        localizacao_placenta: "Anterior",
        idade_gestacional_usg: 18,
        is_liquido_amniotico_normal: true,
        outros: "Morfologia fetal sem achados relevantes. Placenta anterior, líquido amniótico normal.",
      },
    ],
    odonto: { anotacoes: "Consulta odontológica de rotina. Orientação de higiene bucal reforçada.", is_alta: true, is_sangramento_gengival: true, is_carie_detectada: false },
    planoParto: { acompanhante_nome: "Ricardo Almeida Silva", posicao_parto_pref: "Vertical / livre", anestesia_alivio_dor: "Analgesia conforme indicação", is_deseja_doula: false },
    consultas: [
      { data: new Date("2026-01-10T10:00:00.000Z"), idade_gestacional: 12, peso: 64, pa_sistolica: 110, pa_diastolica: 70, au: 12, bfc: 158, is_edema: false, mov_fetal: "Não avaliado", apresentacao_fetal: "—", queixa: "Náuseas leves, sem sangramento.", conduta: "Manter ácido fólico e ferro. Retorno em 4 semanas." },
      { data: new Date("2026-02-14T10:00:00.000Z"), idade_gestacional: 18, peso: 65.2, pa_sistolica: 112, pa_diastolica: 72, au: 18, bfc: 148, is_edema: false, mov_fetal: "Preservado", apresentacao_fetal: "—", queixa: "Movimentos fetais percebidos. Sem queixas urinárias.", conduta: "Solicitar morfológico. Manter suplementação." },
      { data: new Date("2026-04-05T10:00:00.000Z"), idade_gestacional: 24, peso: 66.8, pa_sistolica: 114, pa_diastolica: 74, au: 24, bfc: 142, is_edema: false, mov_fetal: "Preservado", apresentacao_fetal: "Cefálica", queixa: "Dor lombar ocasional.", conduta: "TOTG agendado. Orientações posturais. Retorno em 4 semanas." },
      { data: new Date("2026-05-17T10:00:00.000Z"), idade_gestacional: 28, peso: 68.1, pa_sistolica: 116, pa_diastolica: 76, au: 28, bfc: 138, is_edema: false, mov_fetal: "Preservado", apresentacao_fetal: "Cefálica", queixa: "Bem-estar geral. Refere contrações esporádicas, irregulares.", conduta: "Vacina dTpa registrada. Visita à maternidade orientada. Retorno em 2 semanas." },
    ],
  },
  {
    cpf: "15350946056",
    cartaoSus: "89800123456789034",
    paciente: {
      nome_mascarado: "Juliana Costa Oliveira",
      data_nascimento: new Date("1993-07-22"),
      idade: 32,
      etnia: "BRANCA",
      escolaridade: "SUPERIOR_COMPLETO",
      estado_civil: "CASADA",
      ocupacao: "Professora",
      abo_rh: "A_NEG",
      telefone: "(31) 98765-4321",
      email: "juliana.costa.demo@email.com",
      localizacao: "Contagem — Bairro Eldorado",
      altura: 1.68,
      peso_pre_gestacional: 71,
      is_particip_atvd_educativa: false,
    },
    parceiro: { nome: "Paulo Henrique Oliveira", vdrl: "Não reagente", hiv: "Não reagente" },
    gestacao: {
      dum: new Date("2025-11-03"),
      dpp_eco: new Date("2026-08-05"),
      ig_inicial: 10,
      idade_gestac_confirmada: 34,
      tipo_risco: "ALTO",
      coombs: "Negativo",
      tipo_gravidez: "Única",
      is_planejada: true,
      is_visita_maternidade: true,
      is_did_consulta_odontologica: true,
      is_diabetes_gestacional: false,
      is_infeccao_urinaria: false,
      is_hipertensao_arterial: true,
      suplementacao_ferro: true,
      suplementacao_acido_folico: true,
    },
    antecedentes: {
      n_gestas_anteriores: 1,
      n_partos: 1,
      n_abortos: 0,
      n_nascidos_vivos: 1,
      n_vivem: 1,
      n_parto_normal: 1,
      n_cesarea: 0,
      is_hipertensao_familiar: true,
      is_diabetes_familiar: true,
      is_fumo: false,
      is_alcool: false,
    },
    vacinas: [
      { tipo: "ANTITETANICA", data: new Date("2025-12-01"), data_aprazada: new Date("2026-06-01") },
      { tipo: "INFLUENZA", data: new Date("2026-03-15") },
      { tipo: "HEPATITE_B", data: new Date("2025-11-20") },
    ],
    exames: [
      { tipo: "ABO_RH", trimestre: 1, valor: "A negativo", is_alterado: false, data_coleta: new Date("2025-11-10") },
      { tipo: "COOMBS_INDIRETO", trimestre: 1, valor: "Negativo", is_alterado: false, data_coleta: new Date("2025-11-10") },
      { tipo: "HEMOGLOBINA", trimestre: 1, valor: "12,1 g/dL", is_alterado: false, data_coleta: new Date("2025-11-10") },
      { tipo: "GLICEMIA_JEJUM", trimestre: 1, valor: "79 mg/dL", is_alterado: false, data_coleta: new Date("2025-11-10") },
      { tipo: "HIV", trimestre: 1, valor: "Não reagente", is_alterado: false, data_coleta: new Date("2025-11-10") },
      { tipo: "SIFILIS", trimestre: 1, valor: "Não reagente", is_alterado: false, data_coleta: new Date("2025-11-10") },
      { tipo: "URINA_EAS", trimestre: 3, valor: "Proteinúria 1+", is_alterado: true, data_coleta: new Date("2026-05-20") },
      { tipo: "HEMOGLOBINA", trimestre: 3, valor: "11,4 g/dL", is_alterado: false, data_coleta: new Date("2026-05-20") },
    ],
    usgs: [
      {
        data_exame: new Date("2026-02-01"),
        ig_dum: "12s 6d",
        ig_usg: "13s 0d",
        peso_fetal_estimado: 0,
        localizacao_placenta: "Posterior",
        idade_gestacional_usg: 13,
        is_liquido_amniotico_normal: true,
        outros: "Morfologia fetal sem alterações.",
      },
      {
        data_exame: new Date("2026-05-25"),
        ig_dum: "29s 2d",
        ig_usg: "29s 1d",
        peso_fetal_estimado: 1480,
        localizacao_placenta: "Posterior",
        idade_gestacional_usg: 29,
        is_liquido_amniotico_normal: true,
        outros: "Feto em apresentação cefálica. Doppler umbilical dentro da normalidade.",
      },
    ],
    odonto: { anotacoes: "Tratamento de gengivite leve. Retorno em 6 meses.", is_alta: false, is_sangramento_gengival: true, is_carie_detectada: false },
    planoParto: { acompanhante_nome: "Paulo Henrique Oliveira", posicao_parto_pref: "Semi-Fowler", anestesia_alivio_dor: "Analgesia epidural se indicada", is_deseja_doula: true },
    consultas: [
      { data: new Date("2025-12-05T14:00:00.000Z"), idade_gestacional: 16, peso: 72.5, pa_sistolica: 128, pa_diastolica: 84, au: 16, bfc: 152, is_edema: false, mov_fetal: "Preservado", apresentacao_fetal: "—", queixa: "Cefaleia ocasional.", conduta: "PA limítrofe. Orientar sinais de alarme. Repouso relativo." },
      { data: new Date("2026-01-20T14:00:00.000Z"), idade_gestacional: 24, peso: 74.8, pa_sistolica: 132, pa_diastolica: 88, au: 24, bfc: 145, is_edema: true, mov_fetal: "Preservado", apresentacao_fetal: "Cefálica", queixa: "Edema de membros inferiores ao final do dia.", conduta: "Estratificação de risco alto (HAS). Cardiotocografia se necessário. Retorno quinzenal." },
      { data: new Date("2026-03-18T14:00:00.000Z"), idade_gestacional: 30, peso: 76.2, pa_sistolica: 138, pa_diastolica: 90, au: 30, bfc: 140, is_edema: true, mov_fetal: "Preservado", apresentacao_fetal: "Cefálica", queixa: "Edema persistente. Sem cefaleia ou escotomas.", conduta: "Proteinúria de fita 1+. Solicitar EAS. Avaliar internação se piora." },
      { data: new Date("2026-05-22T14:00:00.000Z"), idade_gestacional: 34, peso: 77.5, pa_sistolica: 136, pa_diastolica: 88, au: 34, bfc: 136, is_edema: true, mov_fetal: "Preservado", apresentacao_fetal: "Cefálica", queixa: "Bem-estar fetal. Refere cansaço.", conduta: "Manter vigilância de PA. USG de crescimento realizado. Retorno semanal." },
    ],
  },
  {
    cpf: "23100299900",
    cartaoSus: "89800123456789056",
    paciente: {
      nome_mascarado: "Ana Beatriz Santos",
      nome_social: "Bia",
      data_nascimento: new Date("1997-11-05"),
      idade: 28,
      etnia: "PRETA",
      escolaridade: "SUPERIOR_COMPLETO",
      estado_civil: "SOLTEIRA",
      ocupacao: "Técnica de enfermagem",
      abo_rh: "O_NEG",
      telefone: "(31) 99876-1234",
      email: "ana.beatriz.demo@email.com",
      localizacao: "Betim — Bairro Ingá",
      altura: 1.59,
      peso_pre_gestacional: 58,
      is_particip_atvd_educativa: true,
    },
    parceiro: { nome: "Felipe Martins Rocha", vdrl: "Não reagente", hiv: "Não reagente" },
    gestacao: {
      dum: new Date("2026-02-10"),
      ig_inicial: 6,
      idade_gestac_confirmada: 20,
      tipo_risco: "HABITUAL",
      coombs: "Negativo",
      tipo_gravidez: "Única",
      is_planejada: false,
      is_visita_maternidade: false,
      is_did_consulta_odontologica: false,
      is_diabetes_gestacional: false,
      is_infeccao_urinaria: false,
      is_hipertensao_arterial: false,
      suplementacao_ferro: true,
      suplementacao_acido_folico: true,
    },
    antecedentes: {
      n_gestas_anteriores: 2,
      n_partos: 2,
      n_abortos: 0,
      n_nascidos_vivos: 2,
      n_vivem: 2,
      n_cesarea: 1,
      n_parto_normal: 1,
      n_parto_prematuro: 0,
      is_cirurgia_pelvica_uterina: true,
      is_isoimunizacao_rh: false,
      is_fumo: false,
      is_alcool: false,
    },
    vacinas: [
      { tipo: "ANTITETANICA", data: new Date("2026-03-05") },
      { tipo: "HEPATITE_B", data: new Date("2026-02-20") },
    ],
    exames: [
      { tipo: "ABO_RH", trimestre: 1, valor: "O negativo", is_alterado: false, data_coleta: new Date("2026-02-18") },
      { tipo: "COOMBS_INDIRETO", trimestre: 1, valor: "Negativo", is_alterado: false, data_coleta: new Date("2026-02-18") },
      { tipo: "HEMOGLOBINA", trimestre: 1, valor: "13,0 g/dL", is_alterado: false, data_coleta: new Date("2026-02-18") },
      { tipo: "GLICEMIA_JEJUM", trimestre: 1, valor: "85 mg/dL", is_alterado: false, data_coleta: new Date("2026-02-18") },
      { tipo: "HIV", trimestre: 1, valor: "Não reagente", is_alterado: false, data_coleta: new Date("2026-02-18") },
      { tipo: "SIFILIS", trimestre: 1, valor: "Não reagente", is_alterado: false, data_coleta: new Date("2026-02-18") },
      { tipo: "URINA_EAS", trimestre: 1, valor: "Normal", is_alterado: false, data_coleta: new Date("2026-02-18") },
      { tipo: "TOXOPLASMOSE", trimestre: 1, valor: "IgG e IgM não reagentes", is_alterado: false, data_coleta: new Date("2026-02-18") },
    ],
    usgs: [
      {
        data_exame: new Date("2026-03-28"),
        ig_dum: "6s 4d",
        ig_usg: "12s 1d",
        peso_fetal_estimado: 0,
        localizacao_placenta: "Fundica",
        idade_gestacional_usg: 12,
        is_liquido_amniotico_normal: true,
        outros: "Gestção única. Rastreio morfológico inicial sem alterações.",
      },
    ],
    odonto: { anotacoes: "Encaminhada para avaliação odontológica — consulta ainda não realizada.", is_alta: false, is_sangramento_gengival: false, is_carie_detectada: false },
    planoParto: { acompanhante_nome: "Felipe Martins Rocha", posicao_parto_pref: "A definir", anestesia_alivio_dor: "Conforme orientação da equipe", is_deseja_doula: false },
    consultas: [
      { data: new Date("2026-03-01T09:00:00.000Z"), idade_gestacional: 12, peso: 59.2, pa_sistolica: 108, pa_diastolica: 68, au: 12, bfc: 162, is_edema: false, mov_fetal: "Não avaliado", apresentacao_fetal: "—", queixa: "Primeira consulta de pré-natal desta gestação.", conduta: "Solicitar exames de rotina. Iniciar ferro e ácido fólico. USG morfológico." },
      { data: new Date("2026-04-12T09:00:00.000Z"), idade_gestacional: 16, peso: 60.1, pa_sistolica: 110, pa_diastolica: 70, au: 16, bfc: 156, is_edema: false, mov_fetal: "Preservado", apresentacao_fetal: "—", queixa: "Náuseas em melhora. Histórico de cesárea anterior.", conduta: "Revisar antecedentes obstétricos. Orientar sinais de trabalho de parto." },
      { data: new Date("2026-05-24T09:00:00.000Z"), idade_gestacional: 20, peso: 61, pa_sistolica: 112, pa_diastolica: 72, au: 20, bfc: 150, is_edema: false, mov_fetal: "Preservado", apresentacao_fetal: "—", queixa: "Movimentos fetais ativos. Sem queixas.", conduta: "Exames do 2º trimestre solicitados. Retorno em 4 semanas." },
    ],
  },
];


export function shouldSeedDemoGestantesApresentacao(): boolean {
  const raw = process.env.SEED_DEMO_GESTANTE?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no") return false;
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  if (process.env.NODE_ENV === "production") return false;
  const url = process.env.DATABASE_URL ?? "";
  return /127\.0\.0\.1|localhost|@db:/.test(url);
}

async function upsertPaciente(
  prisma: PrismaClient,
  pepper: string,
  seed: GestanteSeed,
): Promise<string> {
  const cpfHash = hashCpf(seed.cpf, pepper);
  const idsRow = await prisma.pacienteIds.findUnique({ where: { cpf_hash: cpfHash } });

  const pacienteData = {
    ...seed.paciente,
    cpf_ultimos4: seed.cpf.slice(-4),
    cartao_sus_ultimos4: seed.cartaoSus.slice(-4),
  };

  if (idsRow) {
    await prisma.paciente.update({ where: { id: idsRow.paciente_id }, data: pacienteData });
    return idsRow.paciente_id;
  }

  const created = await prisma.$transaction(async (tx) => {
    const paciente = await tx.paciente.create({ data: pacienteData });
    await tx.pacienteIds.create({
      data: {
        paciente_id: paciente.id,
        cpf_hash: cpfHash,
        cartao_sus_hash: hashCartaoSus(seed.cartaoSus, pepper),
      },
    });
    return paciente;
  });
  return created.id;
}

async function seedGestante(prisma: PrismaClient, pepper: string, seed: GestanteSeed): Promise<void> {
  const pacienteId = await upsertPaciente(prisma, pepper, seed);
  const dpp = dppFromDum(seed.gestacao.dum);

  await prisma.parceiro.upsert({
    where: { paciente_id: pacienteId },
    create: { paciente_id: pacienteId, ...seed.parceiro },
    update: seed.parceiro,
  });

  let gestacao = await prisma.gestacao.findFirst({
    where: { paciente_id: pacienteId, is_ativa: true },
  });

  const gestacaoData = {
    ...seed.gestacao,
    dpp,
    is_ativa: true,
  };

  if (gestacao) {
    gestacao = await prisma.gestacao.update({
      where: { id: gestacao.id },
      data: gestacaoData,
    });
  } else {
    gestacao = await prisma.gestacao.create({
      data: { paciente_id: pacienteId, ...gestacaoData },
    });
  }

  await prisma.antecedentes.upsert({
    where: { gestacao_id: gestacao.id },
    create: { gestacao_id: gestacao.id, ...seed.antecedentes },
    update: seed.antecedentes,
  });

  await prisma.avaliacaoOdonto.upsert({
    where: { gestacao_id: gestacao.id },
    create: { gestacao_id: gestacao.id, ...seed.odonto },
    update: seed.odonto,
  });

  await prisma.planoParto.upsert({
    where: { gestacao_id: gestacao.id },
    create: { gestacao_id: gestacao.id, ...seed.planoParto },
    update: seed.planoParto,
  });

  await prisma.vacina.deleteMany({ where: { paciente_id: pacienteId } });
  if (seed.vacinas.length > 0) {
    await prisma.vacina.createMany({
      data: seed.vacinas.map((v) => ({
        paciente_id: pacienteId,
        tipo: v.tipo,
        data: v.data,
        data_aprazada: v.data_aprazada ?? null,
      })),
    });
  }

  await prisma.exame.deleteMany({ where: { paciente_id: pacienteId } });
  if (seed.exames.length > 0) {
    await prisma.exame.createMany({
      data: seed.exames.map((e) => ({
        paciente_id: pacienteId,
        tipo: e.tipo,
        trimestre: e.trimestre,
        valor: e.valor,
        is_alterado: e.is_alterado,
        data_coleta: e.data_coleta,
      })),
    });
  }

  await prisma.exameImagemUsg.deleteMany({ where: { gestacao_id: gestacao.id } });
  if (seed.usgs.length > 0) {
    await prisma.exameImagemUsg.createMany({
      data: seed.usgs.map((u) => ({ gestacao_id: gestacao.id, ...u })),
    });
  }

  for (const c of seed.consultas) {
    const dup = await prisma.consulta.findFirst({
      where: { gestacao_id: gestacao.id, idade_gestacional: c.idade_gestacional },
    });
    const consultaData = {
      ...c,
      status: StatusConsulta.CONFIRMADA,
      validacao_medica: true,
      unidade_id: SENTINEL_UNIDADE_ID,
    };
    if (dup) {
      await prisma.consulta.update({ where: { id: dup.id }, data: consultaData });
    } else {
      await prisma.consulta.create({
        data: { gestacao_id: gestacao.id, ...consultaData },
      });
    }
  }

  console.log("seed_demo_apresentacao_ok", seed.paciente.nome_mascarado, gestacao.id);
}

export async function seedDemoGestantesApresentacao(prisma: PrismaClient): Promise<void> {
  const pepper = process.env.PACIENTE_IDS_PEPPER?.trim();
  if (!pepper) {
    console.warn("seed_demo_apresentacao_skip: PACIENTE_IDS_PEPPER ausente.");
    return;
  }

  for (const g of GESTANTES) {
    await seedGestante(prisma, pepper, g);
  }

  console.log("seed_demo_apresentacao_ok total", GESTANTES.length, "gestantes");
}
