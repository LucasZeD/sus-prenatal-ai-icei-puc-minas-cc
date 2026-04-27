-- Paciente: contato e localização (para remover mocks do frontend).

ALTER TABLE "paciente"
  ADD COLUMN IF NOT EXISTS "telefone" VARCHAR(40);

ALTER TABLE "paciente"
  ADD COLUMN IF NOT EXISTS "email" VARCHAR(255);

ALTER TABLE "paciente"
  ADD COLUMN IF NOT EXISTS "localizacao" VARCHAR(120);

