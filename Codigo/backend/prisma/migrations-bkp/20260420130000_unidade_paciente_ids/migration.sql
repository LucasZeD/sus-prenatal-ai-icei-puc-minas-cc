-- Fase A: `unidade` + FK obrigatória em `consulta`; tabela `paciente_ids` (hashes).
-- Deve rodar **após** `20260420120000_sprint1_core_clinico` (schema `consulta` com `unidade_id`).

CREATE TABLE "unidade" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(200) NOT NULL,
    "cnes" VARCHAR(15),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unidade_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "unidade_cnes_key" ON "unidade"("cnes");

INSERT INTO "unidade" ("id", "nome", "cnes")
VALUES (
    '00000000-0000-4000-8000-000000000001'::uuid,
    'Legado — unidade não informada',
    NULL
);

UPDATE "consulta"
SET "unidade_id" = '00000000-0000-4000-8000-000000000001'::uuid
WHERE "unidade_id" IS NULL;

ALTER TABLE "consulta" ALTER COLUMN "unidade_id" SET NOT NULL;

ALTER TABLE "consulta"
ADD CONSTRAINT "consulta_unidade_id_fkey"
FOREIGN KEY ("unidade_id") REFERENCES "unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "paciente_ids" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paciente_id" UUID NOT NULL,
    "cartao_sus_hash" VARCHAR(128) NOT NULL,
    "cpf_hash" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paciente_ids_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "paciente_ids_paciente_id_key" ON "paciente_ids"("paciente_id");
CREATE UNIQUE INDEX "paciente_ids_cartao_sus_hash_key" ON "paciente_ids"("cartao_sus_hash");
CREATE UNIQUE INDEX "paciente_ids_cpf_hash_key" ON "paciente_ids"("cpf_hash");

ALTER TABLE "paciente_ids"
ADD CONSTRAINT "paciente_ids_paciente_id_fkey"
FOREIGN KEY ("paciente_id") REFERENCES "paciente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
