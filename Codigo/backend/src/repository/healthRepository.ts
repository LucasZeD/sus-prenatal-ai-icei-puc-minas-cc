import { getPrisma } from "./prisma.js";

export async function pingDb(): Promise<void> {
  const prisma = getPrisma();
  await prisma.$queryRaw`SELECT 1`;
}
