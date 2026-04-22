/*
  Warnings:

  - The `etnia` column on the `paciente` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `escolaridade` column on the `paciente` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `estado_civil` column on the `paciente` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `tipo` on the `exame` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `tipo` on the `vacina` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "VacinaTipo" AS ENUM ('ANTITETANICA', 'HEPATITE_B', 'INFLUENZA', 'VIRUS_SINCICIAL_RESPIRATORIO', 'TRIPLICE_VIRAL', 'FEBRE_AMARELA', 'OUTRAS');

-- CreateEnum
CREATE TYPE "ExameTipo" AS ENUM ('ABO_RH', 'GLICEMIA_JEJUM', 'TESTE_ORAL_TOLERANCIA_GLICOSE', 'SIFILIS', 'VDRL', 'HIV', 'HEPATITE_B', 'TOXOPLASMOSE', 'HEMOGLOBINA', 'URINA_EAS', 'URINA_CULTURA', 'COOMBS_INDIRETO', 'ELETROFORESE_HEMOGLOBINA', 'COOMBS', 'OUTROS');

-- CreateEnum
CREATE TYPE "Etnia" AS ENUM ('BRANCA', 'PRETA', 'PARDA', 'AMARELA', 'INDIGENA');

-- CreateEnum
CREATE TYPE "Escolaridade" AS ENUM ('ANALFABETO', 'FUNDAMENTAL_INCOMPLETO', 'FUNDAMENTAL_COMPLETO', 'MEDIO_INCOMPLETO', 'MEDIO_COMPLETO', 'SUPERIOR_INCOMPLETO', 'SUPERIOR_COMPLETO');

-- CreateEnum
CREATE TYPE "EstadoCivil" AS ENUM ('SOLTEIRA', 'CASADA', 'UNIAO_ESTAVEL', 'DIVORCIADA', 'VIUVA');

-- DropIndex
DROP INDEX IF EXISTS "profissional_unidade_id_idx";

-- `antecedentes` só existe a partir de `20260422150000_der_modulos_gestacao_ativa`; `is_sifilis` foi movida para lá.

-- AlterTable
ALTER TABLE "consulta" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "consulta_pos_parto" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "desfecho_gestacao" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "exame" ADD COLUMN     "coombs" VARCHAR(50),
ALTER COLUMN "id" DROP DEFAULT,
DROP COLUMN "tipo",
ADD COLUMN     "tipo" "ExameTipo" NOT NULL;

-- AlterTable
ALTER TABLE "exame_imagem_usg" ADD COLUMN     "data_exame" DATE,
ADD COLUMN     "ig_dum" VARCHAR(50),
ADD COLUMN     "ig_usg" VARCHAR(50),
ADD COLUMN     "outros" TEXT,
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "gestacao" ADD COLUMN     "is_cardiopatia" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_cirugia" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_cirurgia_elvica_uterina" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_diabetes_gestacional" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_dificuldade_alimentar" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_hipertensao_arterial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_infeccao_urinaria" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_infertilidade" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_tromboembolismo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suplementacao_acido_folico" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suplementacao_ferro" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tratamento_sifilis_dose_1" DATE,
ADD COLUMN     "tratamento_sifilis_dose_2" DATE,
ADD COLUMN     "tratamento_sifilis_dose_3" DATE,
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "logs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "paciente" ALTER COLUMN "id" DROP DEFAULT,
DROP COLUMN "etnia",
ADD COLUMN     "etnia" "Etnia",
DROP COLUMN "escolaridade",
ADD COLUMN     "escolaridade" "Escolaridade",
DROP COLUMN "estado_civil",
ADD COLUMN     "estado_civil" "EstadoCivil";

-- AlterTable
ALTER TABLE "paciente_ids" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "profissional" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "unidade" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "vacina" ALTER COLUMN "id" DROP DEFAULT,
DROP COLUMN "tipo",
ADD COLUMN     "tipo" "VacinaTipo" NOT NULL;
