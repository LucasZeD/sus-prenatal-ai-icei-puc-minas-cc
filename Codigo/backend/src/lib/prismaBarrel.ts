/**
 * Ponto único de importação do cliente Prisma + enums (evita ciclos com `repository/prisma`).
 */
export {
  PrismaClient,
  AboRh,
  RiscoGestacional,
  StatusConsulta,
  Etnia,
  Escolaridade,
  EstadoCivil,
  ConsultaStreamEventoTipo,
} from "@prisma/client";

export type { Prisma } from "@prisma/client";
