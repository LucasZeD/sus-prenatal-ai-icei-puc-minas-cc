# Falhas de migrao (Prisma + Postgres)

Comandos assumem pasta `**Codigo/**` no host, salvo indicao de `Codigo/backend/`.

## Sintomas

- `docker compose ps`: `prenatal_backend` em **Restarting**; em `docker compose logs backend` aparece falha em `prisma migrate deploy`.
- `**P3009`**: `migrate found failed migrations in the target database`.
- `**P3018**`: SQL de uma migrao falhou.
- Seed: `**P2022**` ou mensagem de coluna inexistente (ex.: `profissional.unidade_id`).
- Histrico: erros `**42P01**` (`relation does not exist`) em cadeias de migraes incrementais antigas.

## Por que ocorre

- O Prisma **interrompe** o `migrate deploy` enquanto `_prisma_migrations` no refletir o que existe de fato no Postgres.
- O repositrio usa **uma** migrao baseline (`20260421180000_baseline_der`) alinhada ao `schema.prisma` atual. Volume com checksums ou nomes de migraes **removidas** da pasta `prisma/migrations` no reconcilia sozinho.
- Volume **desalinhado** do schema atual (schema evoluiu, banco no): comum aps puxar mudanas grandes.
- Senha/usurio ou URL interna incorretos tambm derrubam migrao; caracteres como `@`, `:`, `/`, `#` na senha podem quebrar URLs `postgresql://...`.

## Ambiente local  reaplicar do zero (recomendado se pode apagar dados)

1. `docker compose down`
2. `docker volume rm prenatal-digital_prenatal_pg_data`
3. `docker compose up -d --build`

O Postgres sobe vazio; no entrypoint do backend o `migrate deploy` aplica a baseline e o estado failed some.

**Ateno:** apaga todos os dados desse stack no volume nomeado acima.

## Sem apagar o volume

1. Identifique o **nome exato** da migrao em falha (`npx prisma migrate status` no contexto do backend / logs).
2. Use `npx prisma migrate resolve` com `**--rolled-back`** ou `**--applied**`, conforme o caso real do banco.
3. Rode `npx prisma migrate deploy` de novo.

Se o banco ficou **meio migrado** por uma cadeia antiga, o caminho seguro costuma ser volume limpo.

Documentao oficial: [Resolve migration issues in production](https://www.prisma.io/docs/guides/migrate/production-troubleshooting).

## Contexto da baseline

Erros `**42P01`** em migraes incrementais antigas ocorriam quando o SQL assumia tabelas criadas s em migraes **posteriores**. A baseline nica evita essa classe de problema em **banco novo**.

Aps seed, se ainda houver erro de coluna inexistente, trate como volume/schema desalinhado e use a sequncia reaplicar do zero acima, depois `docker compose exec backend npx prisma db seed`.
