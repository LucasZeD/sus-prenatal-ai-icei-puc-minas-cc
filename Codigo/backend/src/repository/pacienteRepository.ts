import { getPrisma } from "./prisma.js";

type PacienteDelegate = ReturnType<typeof getPrisma>["paciente"];

/**
 * Projeção segura para listagens e APIs públicas: omite campos que podem reidentificar
 * ou expor PII além do `nome_mascarado` já mascarado (LGPD / DER).
 */
export const pacienteAssepsisadoSelect = {
  id: true,
  nome_mascarado: true,
  cpf_ultimos4: true,
  cartao_sus_ultimos4: true,
  data_cadastro: true,
  telefone: true,
  email: true,
  localizacao: true,
  altura: true,
  peso_pre_gestacional: true,
  abo_rh: true,
  etnia: true,
  escolaridade: true,
  estado_civil: true,
  ocupacao: true,
  data_nascimento: true,
  idade: true,
  is_particip_atvd_educativa: true,
} as const;

/** Alinhado a `pacienteAssepsisadoSelect` (campos omitidos de propósito). */
export type PacienteAssepsisado = Pick<
  NonNullable<Awaited<ReturnType<PacienteDelegate["findUnique"]>>>,
  keyof typeof pacienteAssepsisadoSelect
>;

type PacienteCreateArgs = Parameters<PacienteDelegate["create"]>[0];
type PacienteCreateInput = PacienteCreateArgs extends { data: infer D } ? D : never;

type GestacaoAtivaResumo = {
  id: string
  tipo_risco: string
  ig_inicial: number | null
  idade_gestac_confirmada: number | null
  /** ISO date-only YYYY-MM-DD (serializavel em JSON sem deslocamento de fuso). */
  dum: string | null
  dpp: string | null
  dpp_eco: string | null
}

function gestacaoDateFieldToIsoYmd(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
  }
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  return null;
}

export class PacienteRepository {
  async findManyAssepsisadoResumo(): Promise<
    Array<
      PacienteAssepsisado & {
        gestacao_ativa: GestacaoAtivaResumo | null;
        ultima_visita_em: Date | null;
      }
    >
  > {
    const prisma = getPrisma();
    const rows = await prisma.paciente.findMany({
      select: {
        ...pacienteAssepsisadoSelect,
        gestacoes: {
          select: {
            id: true,
            is_ativa: true,
            tipo_risco: true,
            ig_inicial: true,
            idade_gestac_confirmada: true,
            dum: true,
            dpp: true,
            dpp_eco: true,
            consultas: { take: 1, orderBy: { data: "desc" }, select: { data: true } },
          },
        },
      },
      orderBy: { data_cadastro: "desc" },
    });

    return rows.map((p) => {
      type GestacaoResumo = {
        id: string
        is_ativa: boolean
        tipo_risco: unknown
        ig_inicial: number | null
        idade_gestac_confirmada: number | null
        dum: Date | string | null
        dpp: Date | string | null
        dpp_eco: Date | string | null
        consultas?: Array<{ data: Date | string }>
      }
      const gestacoes = (p as unknown as { gestacoes: GestacaoResumo[] }).gestacoes ?? [];
      const ativa = gestacoes.find((g) => g.is_ativa) ?? null;
      const ultima = gestacoes
        .map((g) => (g.consultas?.[0]?.data ? new Date(g.consultas[0].data) : null))
        .filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()))
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

      return {
        ...(p as unknown as PacienteAssepsisado),
        gestacao_ativa: ativa
          ? {
              id: String(ativa.id),
              tipo_risco: String(ativa.tipo_risco),
              ig_inicial: (ativa.ig_inicial ?? null) as number | null,
              idade_gestac_confirmada: (ativa.idade_gestac_confirmada ?? null) as number | null,
              dum: gestacaoDateFieldToIsoYmd(ativa.dum),
              dpp: gestacaoDateFieldToIsoYmd(ativa.dpp),
              dpp_eco: gestacaoDateFieldToIsoYmd(ativa.dpp_eco),
            }
          : null,
        ultima_visita_em: ultima,
      };
    });
  }

  async findManyAssepsisado(
    args?: Omit<Parameters<PacienteDelegate["findMany"]>[0], "select">,
  ): Promise<PacienteAssepsisado[]> {
    const prisma = getPrisma();
    return prisma.paciente.findMany({
      ...args,
      select: pacienteAssepsisadoSelect,
    }) as Promise<PacienteAssepsisado[]>;
  }

  async findUniqueAssepsisado(id: string): Promise<PacienteAssepsisado | null> {
    const prisma = getPrisma();
    const row = await prisma.paciente.findUnique({
      where: { id },
      select: pacienteAssepsisadoSelect,
    });
    return row as PacienteAssepsisado | null;
  }

  /**
   * Cadastro interno (camada de serviço autenticada). Retorno ainda assepsia a leitura padrão.
   */
  async createAndReturnAssepsisado(data: PacienteCreateInput): Promise<PacienteAssepsisado> {
    const prisma = getPrisma();
    const created = await prisma.paciente.create({ data, select: pacienteAssepsisadoSelect });
    return created as PacienteAssepsisado;
  }

  async deleteById(id: string): Promise<void> {
    const prisma = getPrisma();
    await prisma.paciente.delete({ where: { id } });
  }
}
