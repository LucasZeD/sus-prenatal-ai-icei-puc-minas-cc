import type { ConsultaStreamEventoTipo, Prisma } from "../lib/prismaBarrel.js";
import { StatusConsulta } from "../lib/prismaBarrel.js";
import { getPrisma } from "./prisma.js";

type ConsultaDelegate = ReturnType<typeof getPrisma>["consulta"];

export type Consulta = NonNullable<Awaited<ReturnType<ConsultaDelegate["findUnique"]>>>;
type ConsultaCreateArgs = Parameters<ConsultaDelegate["create"]>[0];
type ConsultaCreateInput = ConsultaCreateArgs extends { data: infer D } ? D : never;

export class ConsultaRepository {
  async findById(id: string): Promise<Consulta | null> {
    const prisma = getPrisma();
    return prisma.consulta.findUnique({ where: { id } });
  }

  async findByGestacaoId(gestacaoId: string): Promise<Consulta[]> {
    const prisma = getPrisma();
    return prisma.consulta.findMany({
      where: { gestacao_id: gestacaoId },
      orderBy: { data: "desc" },
    });
  }

  /**
   * Consultas ainda não confirmadas (worklist para atendimento / WebSocket).
   * Inclui gestação e nome mascarado do paciente para exibição segura na UI.
   */
  async findDisponiveisParaAtendimento(take = 80) {
    const prisma = getPrisma();
    return prisma.consulta.findMany({
      where: { status: { not: StatusConsulta.CONFIRMADA } },
      take,
      orderBy: [{ data: "desc" }, { id: "desc" }],
      include: {
        gestacao: {
          select: {
            id: true,
            paciente_id: true,
            tipo_risco: true,
            paciente: { select: { nome_mascarado: true, cpf_ultimos4: true, cartao_sus_ultimos4: true } },
          },
        },
        unidade: { select: { id: true, nome: true } },
      },
    });
  }

  async create(data: ConsultaCreateInput): Promise<Consulta> {
    const prisma = getPrisma();
    return prisma.consulta.create({ data });
  }

  async updateById(id: string, data: Prisma.ConsultaUpdateInput): Promise<Consulta> {
    const prisma = getPrisma();
    return prisma.consulta.update({ where: { id }, data });
  }

  async updateStatus(id: string, status: Consulta["status"]): Promise<Consulta> {
    const prisma = getPrisma();
    return prisma.consulta.update({ where: { id }, data: { status } });
  }

  async setValidacaoMedica(id: string, validacao_medica: boolean): Promise<Consulta> {
    const prisma = getPrisma();
    return prisma.consulta.update({ where: { id }, data: { validacao_medica } });
  }

  async appendStreamEvento(consultaId: string, tipo: ConsultaStreamEventoTipo, payload: string) {
    const prisma = getPrisma();
    return prisma.consultaStreamEvento.create({
      data: { consulta_id: consultaId, tipo, payload },
    });
  }

  async listStreamEventos(consultaId: string, take = 200) {
    const prisma = getPrisma();
    return prisma.consultaStreamEvento.findMany({
      where: { consulta_id: consultaId },
      orderBy: { createdAt: "asc" },
      take,
    });
  }
}
