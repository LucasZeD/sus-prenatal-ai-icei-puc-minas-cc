/**
 * Gestante de demonstração para gráfico de ganho de peso (Caderneta MS 2024).
 * Idempotente: localiza por hash de CPF fixo de demo.
 */
import { createHmac } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { StatusConsulta } from "@prisma/client";

const SENTINEL_UNIDADE_ID = "00000000-0000-4000-8000-000000000001";
/** CPF válido apenas para ambiente de desenvolvimento/demo. */
const DEMO_CPF = "52998224725";
const DEMO_NOME_MASCARADO = "An*** Demo";

function hmacSha256Hex(message: string, secret: string): string {
  return createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

function hashCpf(cpfBruto: string, pepper: string): string {
  const d = cpfBruto.replace(/\D/g, "");
  if (d.length !== 11) throw new Error("cpf_invalido");
  return hmacSha256Hex(d, pepper);
}

function hashCartaoOuSentinela(pacienteId: string, cartaoBruto: string | undefined, pepper: string): string {
  if (cartaoBruto) {
    const d = cartaoBruto.replace(/\D/g, "");
    if (d.length < 15) throw new Error("cartao_sus_invalido");
    return hmacSha256Hex(d, pepper);
  }
  return hmacSha256Hex(`__sem_cartao_sus_v1__:${pacienteId}`, pepper);
}

export function shouldSeedDemoGestante(): boolean {
  const raw = process.env.SEED_DEMO_GESTANTE?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no") return false;
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  if (process.env.NODE_ENV === "production") return false;
  const url = process.env.DATABASE_URL ?? "";
  return /127\.0\.0\.1|localhost|@db:/.test(url);
}

export async function seedDemoGestanteNutricao(prisma: PrismaClient): Promise<void> {
  const pepper = process.env.PACIENTE_IDS_PEPPER?.trim();
  if (!pepper) {
    console.warn("seed_demo_gestante_skip: PACIENTE_IDS_PEPPER ausente.");
    return;
  }

  const cpfHash = hashCpf(DEMO_CPF, pepper);
  const idsRow = await prisma.pacienteIds.findUnique({ where: { cpf_hash: cpfHash } });

  let pacienteId = idsRow?.paciente_id;

  if (!pacienteId) {
    const created = await prisma.$transaction(async (tx) => {
      const paciente = await tx.paciente.create({
        data: {
          nome_mascarado: DEMO_NOME_MASCARADO,
          cpf_ultimos4: DEMO_CPF.slice(-4),
          idade: 28,
          altura: 1.62,
          peso_pre_gestacional: 68,
        },
      });
      await tx.pacienteIds.create({
        data: {
          paciente_id: paciente.id,
          cpf_hash: cpfHash,
          cartao_sus_hash: hashCartaoOuSentinela(paciente.id, undefined, pepper),
        },
      });
      return paciente;
    });
    pacienteId = created.id;
    console.log("seed_demo_gestante: paciente criado", pacienteId);
  } else {
    await prisma.paciente.update({
      where: { id: pacienteId },
      data: {
        nome_mascarado: DEMO_NOME_MASCARADO,
        altura: 1.62,
        peso_pre_gestacional: 68,
        idade: 28,
      },
    });
    console.log("seed_demo_gestante: paciente atualizado", pacienteId);
  }

  const gestacaoExistente = await prisma.gestacao.findFirst({
    where: { paciente_id: pacienteId, is_ativa: true },
    include: { _count: { select: { consultas: true } } },
  });

  if (gestacaoExistente && gestacaoExistente._count.consultas >= 4) {
    console.log("seed_demo_gestante_skip: gestação demo já possui consultas.");
    return;
  }

  const gestacao =
    gestacaoExistente ??
    (await prisma.gestacao.create({
      data: {
        paciente_id: pacienteId,
        is_ativa: true,
        dum: new Date("2025-08-23"),
        ig_inicial: 12,
        idade_gestac_confirmada: 30,
      },
    }));

  const consultasDemo: Array<{
    data: Date;
    idade_gestacional: number;
    peso: number;
  }> = [
    { data: new Date("2025-11-15T10:00:00.000Z"), idade_gestacional: 12, peso: 70.5 },
    { data: new Date("2025-12-27T10:00:00.000Z"), idade_gestacional: 18, peso: 71.5 },
    { data: new Date("2026-02-07T10:00:00.000Z"), idade_gestacional: 24, peso: 72.8 },
    { data: new Date("2026-03-21T10:00:00.000Z"), idade_gestacional: 30, peso: 74.0 },
  ];

  const existentes = await prisma.consulta.count({ where: { gestacao_id: gestacao.id } });
  if (existentes >= 4) {
    console.log("seed_demo_gestante_skip: consultas demo já existem.");
    return;
  }

  for (const c of consultasDemo) {
    const dup = await prisma.consulta.findFirst({
      where: { gestacao_id: gestacao.id, idade_gestacional: c.idade_gestacional },
    });
    if (dup) {
      await prisma.consulta.update({
        where: { id: dup.id },
        data: { peso: c.peso, data: c.data },
      });
    } else {
      await prisma.consulta.create({
        data: {
          gestacao_id: gestacao.id,
          unidade_id: SENTINEL_UNIDADE_ID,
          data: c.data,
          idade_gestacional: c.idade_gestacional,
          peso: c.peso,
          status: StatusConsulta.CONFIRMADA,
          validacao_medica: true,
        },
      });
    }
  }

  console.log("seed_demo_gestante_ok gestacao", gestacao.id, "consultas", consultasDemo.length);
}
