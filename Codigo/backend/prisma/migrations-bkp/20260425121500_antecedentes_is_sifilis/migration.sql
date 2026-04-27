-- `is_sifilis` estava em `20260421124747_final_der_alignment_v4`, que roda **antes** de `antecedentes` existir
-- (criada em `20260422150000_der_modulos_gestacao_ativa`). Movida para esta migração idempotente.

ALTER TABLE "antecedentes"
  ADD COLUMN IF NOT EXISTS "is_sifilis" BOOLEAN NOT NULL DEFAULT false;
