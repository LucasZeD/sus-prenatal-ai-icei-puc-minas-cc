-- Alinha DER (Abr/2026): risco habitual/alto, ABO/Rh em paciente, e novos campos em gestacao.
-- - RiscoGestacional: ('NORMAL','ALTO','MUITO_ALTO') -> ('HABITUAL','ALTO')
-- - gestacao: remove `abo_rh`, adiciona `dpp_eco`, `is_colocar_diu`, `is_did_consulta_odontologica`
-- - paciente: adiciona `abo_rh` (enum AboRh)

BEGIN;

-- 1) Novo enum para ABO/Rh (DER `PACIENTE.abo_rh`)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AboRh') THEN
    CREATE TYPE "AboRh" AS ENUM ('A_POS','A_NEG','B_POS','B_NEG','AB_POS','AB_NEG','O_POS','O_NEG');
  END IF;
END$$;

ALTER TABLE "paciente"
  ADD COLUMN IF NOT EXISTS "abo_rh" "AboRh";

-- 2) Atualiza enum de risco (recria tipo, pois Postgres não permite remover valores do enum)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RiscoGestacional') THEN
    CREATE TYPE "RiscoGestacional__new" AS ENUM ('HABITUAL','ALTO');

    ALTER TABLE "gestacao"
      ALTER COLUMN "tipo_risco" DROP DEFAULT;

    ALTER TABLE "gestacao"
      ALTER COLUMN "tipo_risco" TYPE "RiscoGestacional__new"
      USING (
        CASE
          WHEN "tipo_risco"::text = 'NORMAL' THEN 'HABITUAL'
          WHEN "tipo_risco"::text = 'ALTO' THEN 'ALTO'
          WHEN "tipo_risco"::text = 'MUITO_ALTO' THEN 'ALTO'
          ELSE 'HABITUAL'
        END
      )::"RiscoGestacional__new";

    DROP TYPE "RiscoGestacional";
    ALTER TYPE "RiscoGestacional__new" RENAME TO "RiscoGestacional";

    ALTER TABLE "gestacao"
      ALTER COLUMN "tipo_risco" SET DEFAULT 'HABITUAL';
  END IF;
END$$;

-- 3) Ajustes em `gestacao`
ALTER TABLE "gestacao"
  ADD COLUMN IF NOT EXISTS "dpp_eco" DATE,
  ADD COLUMN IF NOT EXISTS "is_colocar_diu" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "is_did_consulta_odontologica" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "gestacao"
  DROP COLUMN IF EXISTS "abo_rh";

COMMIT;

