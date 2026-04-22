-- Alinha `antecedentes` ao DER atualizado (Abr/2026): contagens obstétricas + flags familiares.
-- Estratégia:
-- - Renomeia colunas antigas quando houver equivalência
-- - Adiciona novas colunas com DEFAULTs seguros (false)

BEGIN;

-- Renomes (compatibilidade com schema antigo)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'antecedentes' AND column_name = 'gestas_previas'
  ) THEN
    ALTER TABLE "antecedentes" RENAME COLUMN "gestas_previas" TO "n_gestas_anteriores";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'antecedentes' AND column_name = 'partos'
  ) THEN
    ALTER TABLE "antecedentes" RENAME COLUMN "partos" TO "n_partos";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'antecedentes' AND column_name = 'abortos'
  ) THEN
    ALTER TABLE "antecedentes" RENAME COLUMN "abortos" TO "n_abortos";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'antecedentes' AND column_name = 'is_hipertensao'
  ) THEN
    ALTER TABLE "antecedentes" RENAME COLUMN "is_hipertensao" TO "is_hipertensao_familiar";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'antecedentes' AND column_name = 'is_diabetes'
  ) THEN
    ALTER TABLE "antecedentes" RENAME COLUMN "is_diabetes" TO "is_diabetes_familiar";
  END IF;
END$$;

-- Novas colunas (contagens + flags)
ALTER TABLE "antecedentes"
  ADD COLUMN IF NOT EXISTS "n_nascidos_vivos" INT,
  ADD COLUMN IF NOT EXISTS "n_vivem" INT,
  ADD COLUMN IF NOT EXISTS "n_mortos_primeira_semana" INT,
  ADD COLUMN IF NOT EXISTS "n_mortos_apos_primeira_semana" INT,
  ADD COLUMN IF NOT EXISTS "n_nascidos_mortos" INT,
  ADD COLUMN IF NOT EXISTS "n_cesarea" INT,
  ADD COLUMN IF NOT EXISTS "n_parto_normal" INT,
  ADD COLUMN IF NOT EXISTS "n_parto_prematuro" INT,
  ADD COLUMN IF NOT EXISTS "n_bebe_menos_dois_kilos_e_meio" INT,
  ADD COLUMN IF NOT EXISTS "n_bebe_mais_quatro_kilos_e_meio" INT,
  ADD COLUMN IF NOT EXISTS "is_gesta_ectopica" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "is_gesta_molar" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "is_gravidez_gemelar_familiar" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "is_final_gestacao_anterior_1_ano" BOOLEAN NOT NULL DEFAULT false;

COMMIT;

