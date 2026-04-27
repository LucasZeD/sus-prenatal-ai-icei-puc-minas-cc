-- RF14: profissional com senha bcrypt (contas fora da API pública).

CREATE TABLE "profissional" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profissional_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "profissional_email_key" ON "profissional"("email");
