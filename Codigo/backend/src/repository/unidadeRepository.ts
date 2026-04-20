import { getPrisma } from "./prisma.js";

type UnidadeDelegate = ReturnType<typeof getPrisma>["unidade"];

export type Unidade = NonNullable<Awaited<ReturnType<UnidadeDelegate["findUnique"]>>>;
type UnidadeCreateArgs = Parameters<UnidadeDelegate["create"]>[0];
type UnidadeCreateInput = UnidadeCreateArgs extends { data: infer D } ? D : never;

export class UnidadeRepository {
  async findById(id: string): Promise<Unidade | null> {
    const prisma = getPrisma();
    return prisma.unidade.findUnique({ where: { id } });
  }

  async findMany(): Promise<Unidade[]> {
    const prisma = getPrisma();
    return prisma.unidade.findMany({ orderBy: { nome: "asc" } });
  }

  async create(data: UnidadeCreateInput): Promise<Unidade> {
    const prisma = getPrisma();
    return prisma.unidade.create({ data });
  }
}
