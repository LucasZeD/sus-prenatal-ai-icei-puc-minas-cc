import type { Prisma } from "../lib/prismaBarrel.js";
import { getPrisma } from "./prisma.js";

type GestacaoDelegate = ReturnType<typeof getPrisma>["gestacao"];

export type Gestacao = NonNullable<Awaited<ReturnType<GestacaoDelegate["findUnique"]>>>;

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

  /** Usa forma *unchecked* para aceitar `paciente_id` escalar (API JSON), não só `paciente: { connect }`. */
  async create(data: Prisma.GestacaoUncheckedCreateInput): Promise<Gestacao> {
    const prisma = getPrisma();
    return prisma.gestacao.create({ data });
  }

  async updateById(id: string, data: Prisma.GestacaoUpdateInput): Promise<Gestacao> {
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
