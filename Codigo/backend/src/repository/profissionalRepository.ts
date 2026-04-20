import { getPrisma } from "./prisma.js";

type ProfissionalDelegate = ReturnType<typeof getPrisma>["profissional"];

export type Profissional = NonNullable<Awaited<ReturnType<ProfissionalDelegate["findUnique"]>>>;

export class ProfissionalRepository {
  /** Uso interno (login) — inclui hash de senha; nunca serializar em JSON público. */
  async findByEmailForAuth(
    email: string,
  ): Promise<Pick<Profissional, "id" | "email" | "password_hash" | "nome"> | null> {
    const prisma = getPrisma();
    const normalized = email.trim().toLowerCase();
    return prisma.profissional.findUnique({
      where: { email: normalized },
      select: { id: true, email: true, password_hash: true, nome: true },
    });
  }

  /** Criação administrativa / seed — sem auto-cadastro na API pública. */
  async create(data: { email: string; password_hash: string; nome: string }): Promise<Profissional> {
    const prisma = getPrisma();
    return prisma.profissional.create({
      data: {
        email: data.email.trim().toLowerCase(),
        password_hash: data.password_hash,
        nome: data.nome.trim(),
      },
    });
  }
}
