import { getPrisma } from "./prisma.js";

type GestacaoDelegate = ReturnType<typeof getPrisma>["gestacao"];

export type Gestacao = NonNullable<Awaited<ReturnType<GestacaoDelegate["findUnique"]>>>;
type GestacaoCreateArgs = Parameters<GestacaoDelegate["create"]>[0];
type GestacaoCreateInput = GestacaoCreateArgs extends { data: infer D } ? D : never;
type GestacaoUpdateArgs = Parameters<GestacaoDelegate["update"]>[0];
type GestacaoUpdateInput = GestacaoUpdateArgs extends { data: infer D } ? D : never;

export class GestacaoRepository {
  async findById(id: string): Promise<Gestacao | null> {
    const prisma = getPrisma();
    return prisma.gestacao.findUnique({ where: { id } });
  }

  async findByPacienteId(pacienteId: string): Promise<Gestacao[]> {
    const prisma = getPrisma();
    return prisma.gestacao.findMany({
      where: { paciente_id: pacienteId },
      orderBy: { id: "desc" },
    });
  }

  async create(data: GestacaoCreateInput): Promise<Gestacao> {
    const prisma = getPrisma();
    return prisma.gestacao.create({ data });
  }

  async updateById(id: string, data: GestacaoUpdateInput): Promise<Gestacao> {
    const prisma = getPrisma();
    return prisma.gestacao.update({
      where: { id },
      data,
    });
  }

  async updateTipoRisco(id: string, tipo_risco: Gestacao["tipo_risco"]): Promise<Gestacao> {
    const prisma = getPrisma();
    return prisma.gestacao.update({
      where: { id },
      data: { tipo_risco },
    });
  }
}
