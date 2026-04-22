-- Adiciona `consulta.conduta` (conduta oficial escolhida pela profissional).
-- A sugestão da IA permanece em `consulta_ia.sugestao_conduta`.

ALTER TABLE "consulta"
  ADD COLUMN IF NOT EXISTS "conduta" TEXT;

-- Backfill: versões anteriores gravavam "conduta" no campo de sugestão da IA.
UPDATE "consulta" c
SET "conduta" = ia."sugestao_conduta"
FROM "consulta_ia" ia
WHERE ia."consulta_id" = c."id"
  AND c."conduta" IS NULL
  AND ia."sugestao_conduta" IS NOT NULL;

