-- Substitui o efeito da migração mal ordenada `20260419135958_jwt_failure_fix` (removia DEFAULT e quebrava o shadow).
-- Restaura `gen_random_uuid()` nas PKs, alinhado ao `@default(uuid())` do Prisma.

ALTER TABLE "consulta" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "gestacao" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "paciente" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "paciente_ids" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "profissional" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "unidade" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
