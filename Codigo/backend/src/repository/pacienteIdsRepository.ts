import { getPrisma } from "./prisma.js";

type PacienteIdsDelegate = ReturnType<typeof getPrisma>["pacienteIds"];

export type PacienteIds = NonNullable<Awaited<ReturnType<PacienteIdsDelegate["findUnique"]>>>;
type PacienteIdsCreateArgs = Parameters<PacienteIdsDelegate["create"]>[0];
type PacienteIdsCreateInput = PacienteIdsCreateArgs extends { data: infer D } ? D : never;

/**
 * Apenas hashes — valores sensíveis devem ser transformados na camada de serviço com `pacienteIdsHash`.
 */
export class PacienteIdsRepository {
  async findByPacienteId(pacienteId: string): Promise<PacienteIds | null> {
    const prisma = getPrisma();
    return prisma.pacienteIds.findUnique({ where: { paciente_id: pacienteId } });
  }

  async create(data: PacienteIdsCreateInput): Promise<PacienteIds> {
    const prisma = getPrisma();
    return prisma.pacienteIds.create({ data });
  }
}
