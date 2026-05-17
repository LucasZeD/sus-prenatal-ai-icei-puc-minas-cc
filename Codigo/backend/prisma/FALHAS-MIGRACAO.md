# Falhas de migra��o (Prisma + Postgres)

Comandos assumem pasta `**Codigo/**` no host, salvo indica��o de `Codigo/backend/`.

## Sintomas

- `docker compose ps`: `prenatal_backend` em **Restarting**; em `docker compose logs backend` aparece falha em `prisma migrate deploy`.
- `**P3009`**: `migrate found failed migrations in the target database`.
- `**P3018**`: SQL de uma migra��o falhou.
- Seed: `**P2022**` ou mensagem de coluna inexistente (ex.: `profissional.unidade_id`).
- Hist�rico: erros `**42P01**` (`relation does not exist`) em cadeias de migra��es incrementais antigas.

## Por que ocorre

- O Prisma **interrompe** o `migrate deploy` enquanto `_prisma_migrations` n�o refletir o que existe de fato no Postgres.
- O reposit�rio usa **uma** migra��o baseline (`20260421180000_baseline_der`) alinhada ao `schema.prisma` atual. Volume com checksums ou nomes de migra��es **removidas** da pasta `prisma/migrations` n�o reconcilia sozinho.
- Volume **desalinhado** do schema atual (schema evoluiu, banco n�o): comum ap�s puxar mudan�as grandes.
- Senha/usu�rio ou URL interna incorretos tamb�m derrubam migra��o; caracteres como `@`, `:`, `/`, `#` na senha podem quebrar URLs `postgresql://...`.

## Ambiente local � reaplicar do zero (recomendado se pode apagar dados)

1. `docker compose down`
2. `docker volume rm prenatal-digital_prenatal_pg_data`
3. `docker compose up -d --build`

O Postgres sobe vazio; no entrypoint do backend o `migrate deploy` aplica a baseline e o estado �failed� some.

**Aten��o:** apaga todos os dados desse stack no volume nomeado acima.

## Sem apagar o volume

1. Identifique o **nome exato** da migra��o em falha (`npx prisma migrate status` no contexto do backend / logs).
2. Use `npx prisma migrate resolve` com `**--rolled-back`** ou `**--applied**`, conforme o caso real do banco.
3. Rode `npx prisma migrate deploy` de novo.

Se o banco ficou **meio migrado** por uma cadeia antiga, o caminho seguro costuma ser volume limpo.

Documenta��o oficial: [Resolve migration issues in production](https://www.prisma.io/docs/guides/migrate/production-troubleshooting).

## Contexto da baseline

Erros `**42P01`** em migra��es incrementais antigas ocorriam quando o SQL assumia tabelas criadas s� em migra��es **posteriores**. A baseline �nica evita essa classe de problema em **banco novo**.

Ap�s seed, se ainda houver erro de coluna inexistente, trate como volume/schema desalinhado e use a sequ�ncia �reaplicar do zero� acima, depois `docker compose exec backend npx prisma db seed`.