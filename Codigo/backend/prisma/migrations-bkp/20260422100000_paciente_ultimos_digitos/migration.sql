-- Últimos dígitos para desambiguação na agenda (sem persistir CPF/Cartão completos).
ALTER TABLE "paciente" ADD COLUMN "cpf_ultimos4" VARCHAR(4);
ALTER TABLE "paciente" ADD COLUMN "cartao_sus_ultimos4" VARCHAR(4);
