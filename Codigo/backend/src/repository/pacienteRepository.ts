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
  altura: true,
  peso_pre_gestacional: true,
} as const;

/** Alinhado a `pacienteAssepsisadoSelect` (campos omitidos de propósito). */
export type PacienteAssepsisado = Pick<
  NonNullable<Awaited<ReturnType<PacienteDelegate["findUnique"]>>>,
  keyof typeof pacienteAssepsisadoSelect
>;

type PacienteCreateArgs = Parameters<PacienteDelegate["create"]>[0];
type PacienteCreateInput = PacienteCreateArgs extends { data: infer D } ? D : never;

export class PacienteRepository {
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
}
