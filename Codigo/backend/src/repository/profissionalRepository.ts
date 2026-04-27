import { getPrisma } from "./prisma.js";

type ProfissionalDelegate = ReturnType<typeof getPrisma>["profissional"];

export type Profissional = NonNullable<Awaited<ReturnType<ProfissionalDelegate["findUnique"]>>>;

export class ProfissionalRepository {
  /** Uso interno (login) — inclui hash de senha; nunca serializar em JSON público. */
  async findByEmailForAuth(
    email: string,
  ): Promise<Pick<Profissional, "id" | "email" | "senha_hash" | "nome"> | null> {
    const prisma = getPrisma();
    const normalized = email.trim().toLowerCase();
    return prisma.profissional.findUnique({
      where: { email: normalized },
      select: { id: true, email: true, senha_hash: true, nome: true },
    });
  }

  /** Criação administrativa / seed — sem auto-cadastro na API pública. */
  async create(data: { email: string; senha_hash: string; nome: string; unidade_id: string; registro?: string | null }): Promise<Profissional> {
    const prisma = getPrisma();
    return prisma.profissional.create({
      data: {
        email: data.email.trim().toLowerCase(),
        senha_hash: data.senha_hash,
        nome: data.nome.trim(),
        unidade_id: data.unidade_id,
        registro: data.registro ?? undefined,
      },
    });
  }
}
