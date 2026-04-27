-- Reparo idempotente para volumes em que `profissional` ficou sem `unidade_id` / `senha_hash`
-- (P2022 no seed: coluna inexistente vs schema Prisma atual).

-- 1) senha_hash a partir de password_hash (RF14 → DER)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profissional'
      AND column_name = 'password_hash'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profissional'
      AND column_name = 'senha_hash'
  ) THEN
    EXECUTE 'ALTER TABLE "profissional" RENAME COLUMN "password_hash" TO "senha_hash"';
  END IF;
END $$;

-- 2) registro (opcional no DER)
ALTER TABLE "profissional"
  ADD COLUMN IF NOT EXISTS "registro" VARCHAR(50);

-- 3) unidade_id + NOT NULL + FK (alinhado a 20260422173000_der_fixes_consulta_unidade_profissional)
ALTER TABLE "profissional"
  ADD COLUMN IF NOT EXISTS "unidade_id" UUID;

UPDATE "profissional"
SET "unidade_id" = '00000000-0000-4000-8000-000000000001'::uuid
WHERE "unidade_id" IS NULL;

ALTER TABLE "profissional"
  ALTER COLUMN "unidade_id" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND constraint_name = 'profissional_unidade_id_fkey'
  ) THEN
    EXECUTE 'ALTER TABLE "profissional" ADD CONSTRAINT "profissional_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "profissional_unidade_id_idx" ON "profissional"("unidade_id");
