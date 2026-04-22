# SUS Pré-natal — guia de ambiente e build

Este diretório (`Codigo/`) concentra **backend** (Hono + Prisma), **frontend** (Vite + React), `docker-compose.yml` e o arquivo **`.env`** na raiz do compose.

---

## Setup inicial (passo a passo)

Siga na ordem. Os comandos assumem PowerShell no Windows e pasta **`F:\...\sus-prenatal-ai-icei-puc-minas-cc\Codigo`** (ajuste o disco/caminho).

### 1) Onde fica o `.env`

- O arquivo deve chamar-se **`.env`** e ficar em **`Codigo/.env`** (o **mesmo** diretório que `docker-compose.yml`).
- O Docker Compose **carrega automaticamente** esse arquivo quando você roda `docker compose` a partir de `Codigo/`.
- **Não** confie em `.env` só dentro de `Codigo/backend/` para o Compose: o `docker-compose.yml` não monta esse arquivo no contêiner; variáveis críticas são **repassadas** pelo Compose a partir de `Codigo/.env`.

### 2) Preencha o `.env` (mínimo para subir)

Copie o modelo se ainda não existir:

```powershell
cd F:\TCC\sus-prenatal-ai-icei-puc-minas-cc\Codigo
copy .env.example .env
```

Edite **`.env`** e garanta estes itens (valores reais, não placeholder de tutorial):

| Variável | Uso |
|----------|-----|
| `POSTGRES_PASSWORD` | Senha do Postgres (o Compose falha se estiver vazia). |
| `JWT_SECRET` | Pelo menos **32 caracteres**; autenticação JWT. |
| `PACIENTE_IDS_PEPPER` | Segredo longo para HMAC de CPF/Cartão; obrigatório no Compose para o `backend`. |
| `DATABASE_URL` | Para Prisma **no seu PC** (host): `postgresql://USUARIO:SENHA@127.0.0.1:PORTA/sus_prenatal` com **a mesma** senha/usuário que `POSTGRES_*`. Dentro do Docker o backend usa outra URL montada pelo Compose (`@db:5432`). |
| `SEED_PROFISSIONAL_EMAIL` / `SEED_PROFISSIONAL_PASSWORD` | Credenciais do profissional criadas pelo **seed** (login na API). |

**Senha do Postgres e URL:** use preferencialmente letras e números. Caracteres como `@`, `:`, `/`, `#` na senha podem **quebrar** a montagem de `postgresql://user:password@db:5432/...` e derrubar migração ou conexão.

### 3) Subir os serviços

Sempre a partir de **`Codigo/`**:

```powershell
cd F:\TCC\sus-prenatal-ai-icei-puc-minas-cc\Codigo
docker compose up -d --build
```

O contêiner `backend` só inicia o Node **depois** de `prisma migrate deploy` no `docker-entrypoint.sh`. O `db` precisa passar no healthcheck antes.

### 4) Conferir se está estável (não em “Restarting”)

```powershell
docker compose ps
```

- **`prenatal_backend`** deve estar **Up** (não “Restarting”).
- Se estiver reiniciando, veja o motivo:

```powershell
docker compose logs backend --tail 100
```

Causas frequentes: migração falhando (histórico de DB incompatível, senha errada), `JWT_SECRET` curto, ou senha do Postgres com caracteres que estragam a URL interna.

**Log `exec ./docker-entrypoint.sh: no such file or directory`:** quase sempre é o arquivo `docker-entrypoint.sh` com **fim de linha Windows (CRLF)**. O `Dockerfile` já remove `\r` na build; faça **`docker compose build --no-cache backend`** e suba de novo. O repositório usa **`.gitattributes`** (`*.sh` → LF) para não voltar a acontecer após `git add`.

### 5) Health check (URL correta)

No navegador ou com `curl`:

- **Correto:** `http://localhost:3000/health` (há **`://`** depois de `localhost` e **`/`** antes de `health`).
- **Errado:** `localhost3000health` — o navegador não trata isso como HTTP na porta 3000.

Se a conexão for recusada, o processo não está escutando (contêiner caiu ou ainda reinicia) — volte ao passo 4.

### 6) Seed do usuário de login

Só rode quando o **backend** estiver **Up**:

```powershell
docker compose exec backend npx prisma db seed
```

Com `NODE_ENV=production` no contêiner (padrão do compose), o seed **só grava** o profissional se **`SEED_PROFISSIONAL_EMAIL`** e **`SEED_PROFISSIONAL_PASSWORD`** estiverem definidos no **`Codigo/.env`** (agora repassados ao contêiner pelo `docker-compose.yml`). Use os mesmos valores para fazer login na aplicação.

**Erro `spawn tsx ENOENT`:** na imagem Docker o `npm prune --omit=dev` remove o `tsx`. O projeto compila `prisma/seed.ts` → **`dist/seed.js`** no build e o Prisma roda `node dist/seed.js`. Rebuild do backend: `docker compose build --no-cache backend`.

**Seed: `P2022` / coluna `profissional.unidade_id` não existe:** o volume do Postgres costuma estar **desalinhado** do `schema.prisma` atual (schema evoluiu e o banco não). Com o histórico atual do repositório há **uma** migração baseline (`20260421180000_baseline_der`) que cria o schema inteiro; use o passo 8 (volume limpo) e `docker compose up -d --build` para reaplicar do zero, depois rode o seed de novo.

### 7) Frontend

- **Docker:** `http://localhost:5173` (porta `FRONTEND_PUBLISH_PORT`), apontando para a API definida em `VITE_API_BASE_URL` **no momento do build** da imagem.
- Se mudar `VITE_API_BASE_URL` no `.env`, faça rebuild: `docker compose up -d --build frontend`.

### 8) “Limpar e tentar de novo” (opcional)

Se o Postgres ficou com volume inconsistente e as migrações não aplicam:

```powershell
docker compose down
docker volume rm prenatal-digital_prenatal_pg_data
docker compose up -d --build
```

**Atenção:** isso apaga todos os dados do banco desse compose.

### 9) Migração falha no banco (`P3009` / `P3018`)

Se os logs do backend mostram **`P3009`** (`migrate found failed migrations in the target database`) ou **`P3018`** (SQL de uma migração falhou), o Prisma **para** até o estado em `_prisma_migrations` bater com o que realmente existe no Postgres.

**Histórico de migrações no repositório:** o projeto passou a usar **uma** migração baseline (`20260421180000_baseline_der`) gerada a partir do `schema.prisma` atual (TCC / sem necessidade de preservar histórico incremental). Se o seu volume ainda contém **checksums ou nomes** de migrações antigas que já não existem na pasta `prisma/migrations`, o `migrate deploy` não “reconcilia” isso sozinho.

**Ambiente local (pode apagar dados) — recomendado após puxar essa mudança:**

1. `docker compose down`
2. `docker volume rm prenatal-digital_prenatal_pg_data`
3. `docker compose up -d --build`

Assim o Postgres sobe vazio, a baseline aplica o schema completo no `migrate deploy` do entrypoint e o estado “failed” some.

**Sem apagar o volume** (avançado): use `prisma migrate resolve` com o **nome exato** da migração que o `migrate status` / log acusar como falha (`--rolled-back` ou `--applied`, conforme o caso), depois `prisma migrate deploy`. Se o banco ficou **meio migrado** por uma cadeia antiga, o caminho seguro continua sendo volume limpo.

Documentação oficial: [Resolve migration issues in production](https://www.prisma.io/docs/guides/migrate/production-troubleshooting).

**Erros antigos `42P01` (relation does not exist) em migrações incrementais:** ocorriam quando o SQL assumia tabelas que só existiam em migrações **posteriores** na pasta (ordem difícil de manter enquanto o DER crescia). A baseline única evita essa classe de problema em banco novo.

---

## O que corrigiu o erro do `docker compose build`

O log `TS2307: Cannot find module '../lib/....js'` indicava **`src/lib/` ausente** no frontend e no backend (imports já usavam sufixo `.js` no estilo ESM/TypeScript). Esses módulos foram recriados sob `backend/src/lib/` e `frontend/src/lib/`, de modo que `npm run build` / imagens Docker voltam a compilar.

A causa raiz no Git era o `.gitignore` na raiz do repositório com a entrada **`lib/`** (herdada do bloco Python), que ignorava **qualquer** pasta chamada `lib`, inclusive `Codigo/**/src/lib`. Isso foi restrito a **`/lib/`** e **`/lib64/`** (somente na raiz do repo) para que `src/lib` possa ser versionado.

## Pré-requisitos

- [Node.js](https://nodejs.org/) no host: **19+** costuma bastar para scripts locais; **22 LTS** é o alvo das imagens Docker (`node:22-alpine`) e evita surpresas com Prisma 7.
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Linux containers no Windows).

**Nota Prisma 7:** em tipos gerados, `*CreateInput` prefere relações (`paciente: { connect: { id } }`). O código da API usa chaves estrangeiras escalares (`paciente_id`, `gestacao_id`, `unidade_id`); os repositórios usam `*UncheckedCreateInput`, que é o tipo correto para esse padrão.

## Build / Compose (referência rápida)

Na pasta **`Codigo/`**:

```powershell
docker compose up -d --build
```

Rebuild só do backend:

```powershell
docker compose build --no-cache backend
docker compose up -d backend
```

Referência completa de variáveis: comentários em **`.env.example`**.

## Modo desenvolvimento híbrido (opcional)

Útil quando você quer hot-reload do Vite no host e só Postgres + API em container.

### Infraestrutura (Postgres + backend)

Em **`Codigo/`**:

```powershell
docker compose up -d db backend
```

### Prisma no host (migrações + seed)

Em **`Codigo/backend/`** (com `DATABASE_URL` no `.env` apontando para `127.0.0.1:5432`):

```powershell
npx prisma generate
npx prisma migrate deploy
npm run db:seed
```

### Frontend (Vite)

Em **`Codigo/frontend/`**:

1. Copie `frontend/.env.example` → **`frontend/.env`** se ainda não existir.
2. Instale dependências e suba o dev server:

```powershell
npm install
npm run dev
```

Abra **`http://localhost:5173`**. A URL da API vem de **`VITE_API_BASE_URL`** (WebSocket deriva dela: `http`→`ws`, `https`→`wss`).

## Testes

Todos os comandos abaixo são em **`Codigo/backend/`**.

**Unitários** (sem Docker de integração):

```powershell
npm run test:unit
```

**Integração** (Testcontainers; exige Docker):

```powershell
npm run test:integration
```

**Todos** (unitário + integração):

```powershell
npm test
```

Sem Docker disponível:

```powershell
$env:SKIP_INTEGRATION_TESTS=1; npm test
```

## Manutenção Prisma

Em **`Codigo/backend/`**:

| Objetivo | Comando |
|----------|---------|
| Estado das migrações | `npx prisma migrate status` |
| Nova migração (dev) | `npx prisma migrate dev --name descricao` |
| Reset (apaga dados) | `npx prisma migrate reset` |
| Rebuild só do backend após mudar deps | Na pasta `Codigo/`: `docker compose up -d --build backend` |

## Cliente SQL (DBeaver, pgAdmin, …)

Com o serviço **`db`** publicado no host:

- **Host:** `127.0.0.1`
- **Porta:** valor de `POSTGRES_HOST_PORT` (padrão `5432`)
- **Database:** `POSTGRES_DB` (padrão `sus_prenatal`)
- **Usuário / senha:** `POSTGRES_USER` / `POSTGRES_PASSWORD` do `.env`

## IA opcional (Compose comentado)

Em `docker-compose.yml` há exemplos comentados (`ollama`, `faster-whisper`) e perfil `ai`. O backend usa **`MCP_SERVER_URL`**, **`OLLAMA_HTTP_URL`**, **`WHISPER_HTTP_URL`** conforme `.env.example`. Sem esses serviços, STT/LLM ficam desativados (fluxo ainda sobe).

## PowerShell no Windows

Em versões antigas do PowerShell, `&&` pode falhar. Use **`;`** entre comandos ou execute um comando por vez, sempre com o diretório de trabalho correto (`Codigo/` ou `Codigo/backend/` / `Codigo/frontend/`).

---

Documentação específica do template Vite/React (ESLint etc.) não é usada neste repositório; o guia operacional do projeto é este arquivo.
