-- Alinha tipos/campos de `gestacao` ao DER: dum/dpp como DATE, is_planejada como BOOLEAN,
-- e adiciona `is_visita_maternidade` na gestação.

-- 1) dum/dpp: TEXT -> DATE (aceita valores ISO YYYY-MM-DD; caso contrário vira NULL)
ALTER TABLE "gestacao"
  ALTER COLUMN "dum" TYPE DATE
  USING (
    CASE
      WHEN "dum" IS NULL OR btrim("dum") = '' THEN NULL
      ELSE NULLIF("dum", '')::date
    END
  );

ALTER TABLE "gestacao"
  ALTER COLUMN "dpp" TYPE DATE
  USING (
    CASE
      WHEN "dpp" IS NULL OR btrim("dpp") = '' THEN NULL
      ELSE NULLIF("dpp", '')::date
    END
  );

-- 2) is_planejada: TEXT -> BOOLEAN
ALTER TABLE "gestacao"
  ALTER COLUMN "is_planejada" TYPE BOOLEAN
  USING (
    CASE
      WHEN "is_planejada" IS NULL OR btrim("is_planejada") = '' THEN NULL
      WHEN lower(btrim("is_planejada")) IN ('true','t','1','sim','s') THEN true
      WHEN lower(btrim("is_planejada")) IN ('false','f','0','nao','não','n') THEN false
      ELSE NULL
    END
  );

UPDATE "gestacao" SET "is_planejada" = false WHERE "is_planejada" IS NULL;

ALTER TABLE "gestacao"
  ALTER COLUMN "is_planejada" SET DEFAULT false;

ALTER TABLE "gestacao"
  ALTER COLUMN "is_planejada" SET NOT NULL;

-- 3) is_visita_maternidade: novo campo na gestação
ALTER TABLE "gestacao"
  ADD COLUMN IF NOT EXISTS "is_visita_maternidade" BOOLEAN NOT NULL DEFAULT false;

