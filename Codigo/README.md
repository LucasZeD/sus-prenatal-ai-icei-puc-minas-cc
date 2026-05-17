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
| `CLINICAL_AI_URL` | Opcional: `http://clinical_ai:4010` no Compose para proxies `/api/v1/dev/...` e sanitize via serviço Python. |

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

Causas frequentes: falha de migração ou histórico de DB incompatível (**[backend/prisma/FALHAS-MIGRACAO.md](backend/prisma/FALHAS-MIGRACAO.md)**), `JWT_SECRET` curto, ou senha do Postgres com caracteres que estragam a URL interna.

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

**Seed: `P2022` / coluna inexistente (ex.: `profissional.unidade_id`):** volume/schema desalinhado — siga **[backend/prisma/FALHAS-MIGRACAO.md](backend/prisma/FALHAS-MIGRACAO.md)** e rode o seed de novo.

### 7) Frontend

- **Docker:** `http://localhost:5173` (porta `FRONTEND_PUBLISH_PORT`), apontando para a API definida em `VITE_API_BASE_URL` **no momento do build** da imagem.
- Se mudar `VITE_API_BASE_URL` no `.env`, faça rebuild: `docker compose up -d --build frontend`.

### 8) Expor pela internet (Cloudflare Tunnel — opcional)

Útil para demo (TCC), teste no celular ou acesso remoto sem abrir portas no roteador. Com o **frontend no Docker** e `VITE_API_BASE_URL=/` (padrão do compose), o nginx já faz proxy de `/api` e `/ws` para o backend; aponte o túnel para a **porta publicada do frontend** no host (ex.: `5173`).

#### 8.1) Instalar o `cloudflared`

Instale o cliente oficial ([Cloudflare — Downloads](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/)) no mesmo PC onde rodam os contêineres.

#### 8.2) Túnel rápido (sem domínio próprio, URL `*.trycloudflare.com`)

Não exige `tunnel login`. Com o stack **já no ar** (`docker compose up`):

```powershell
cloudflared tunnel --url http://127.0.0.1:5173
```

(Ajuste `5173` se `FRONTEND_PUBLISH_PORT` for outra.) O terminal imprime um `https://....trycloudflare.com` — use no navegador. O URL é **temporário** (nova execução pode gerar outro host).

#### 8.3) Túnel nomeado + seu domínio (URL fixa)

Exige **conta Cloudflare** e **pelo menos um domínio** com DNS gerenciado na Cloudflare (o domínio pode ser comprado em qualquer registrador; em [Websites](https://dash.cloudflare.com/) use *Add a site* e troque os nameservers conforme o assistente).

1. **Login do cliente** (associa certificado à sua conta e a uma zona):

   ```powershell
   cloudflared tunnel login
   ```

   - O terminal mostra **“Waiting for login…”** e um **URL** (`https://dash.cloudflare.com/argotunnel?...`).
   - Se o navegador não abrir sozinho, **copie o URL**, cole no Chrome/Edge e confirme o login na Cloudflare.
   - Na página, **escolha o domínio (zona)** que já está na sua conta e autorize (**Authorize** / **Allow**). Isso não “cria” domínio novo — só diz em qual zona o `cloudflared` pode criar registros depois.
   - Ao concluir, o terminal deve sair da espera e gravar o certificado (ex.: `~/.cloudflared/cert.pem` no Linux, equivalente no perfil do usuário no Windows).

   **Se não aparecer nenhum domínio na lista:** adicione o site no painel Cloudflare e aguarde a zona ativa; ou use apenas o **túnel rápido** (passo 8.2).

2. **Criar o túnel** (nome interno livre, ex.: `prenatal`):

   ```powershell
   cloudflared tunnel create prenatal
   ```

   Anote o **Tunnel ID** e o caminho do arquivo `*.json` de credenciais indicado no output.

3. **Arquivo de configuração** (ex.: `~/.cloudflared/config.yml` — ajuste caminhos no Windows se preferir `%USERPROFILE%\.cloudflared\`):

   ```yaml
   tunnel: <TUNNEL_ID>
   credentials-file: /caminho/absoluto/para/<UUID>.json

   ingress:
     - hostname: app.seudominio.com.br
       service: http://127.0.0.1:5173
     - service: http_status:404
   ```

   Substitua `hostname` pela subida real e a porta pela do seu `FRONTEND_PUBLISH_PORT`.

4. **DNS** (CNAME automático para o túnel):

   ```powershell
   cloudflared tunnel route dns prenatal app.seudominio.com.br
   ```

5. **Rodar o túnel**:

   ```powershell
   cloudflared tunnel run prenatal
   ```

   Para manter sempre ligado, configure **serviço** (systemd no Linux, serviço Windows) conforme a documentação da Cloudflare.

**CORS:** se algo chamar a API com **origem diferente** da do SPA, inclua o URL público em `FRONTEND_ORIGIN` no `Codigo/.env` (várias origens separadas por vírgula), rebuild do backend se necessário. Com `VITE_API_BASE_URL=/` e tudo no mesmo host do túnel, na prática tudo sai na mesma origem.

**Segurança:** URL público expõe a aplicação; use senhas fortes, JWT seguro e, se possível, **Cloudflare Access** ou VPN para não deixar o ambiente aberto na internet.

#### 8.4) WSL / servidor sem navegador no mesmo host

Copie o URL impresso pelo `tunnel login` para uma máquina com navegador, conclua a autorização **e** garanta que o `cert.pem` resultante fique na máquina onde o `cloudflared` vai rodar (fluxo típico: fazer o login uma vez nesse host).

### 9) Migração / volume do Postgres inconsistente

Instruções completas (incluindo `P3009`, `P3018`, limpeza de volume, `migrate resolve`): **[backend/prisma/FALHAS-MIGRACAO.md](backend/prisma/FALHAS-MIGRACAO.md)**.

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

## Clinical AI — RAG + contexto (FastAPI)

O Compose inclui o serviço **`clinical_ai`** ([`clinical-ai/`](clinical-ai/)): índice RAG local (JSONL/MD/TXT), reranking MMR + viés a documentos com `meta.effective_date` / `updated_at` / `document_date` mais recentes, desidentificação de PII e rota de pergunta direta à médica (`POST /mcp/test/direct-question`). **Não há busca na internet** — só o corpus e os blocos opcionais enviados no JSON.

**Ollama no host:** o contêiner usa `CLINICAL_AI_OLLAMA_BASE_URL` (padrão `http://host.docker.internal:11434`). No Linux o `docker-compose.yml` já define `extra_hosts: host.docker.internal:host-gateway`. Tenha **`ollama serve`** acessível e modelos puxados:

- **Chat:** mesmo `OLLAMA_MODEL` do `.env` (ex. `qwen3.5:9b-medical-rag`).
- **Embeddings RAG:** modelo **distinto**, `RAG_EMBEDDING_MODEL` (ex. `nomic-embed-text` — `ollama pull nomic-embed-text`).

**Backend (proxies autenticados):** em `Codigo/.env` defina `CLINICAL_AI_URL=http://clinical_ai:4010` (Compose na mesma rede). O `GET /health` do backend consulta `GET /api/tags` no Ollama e `GET /health` no clinical-ai — o Dev Sandbox usa isso para o indicador verde.

**Backend no Docker + Ollama no host:** `OLLAMA_HTTP_URL=http://host.docker.internal:11434` (evite `127.0.0.1` dentro do container).

Rotas JWT:

- `GET /api/v1/dev/clinical-ai/health`
- `POST /api/v1/dev/rag/test/query` — corpo `{ "query": "...", "top_k": 6 }`
- `POST /api/v1/dev/rag/test/rebuild`
- `POST /api/v1/dev/mcp/test/direct-question` — corpo `{ "question": "...", "gestacao_context": "...", "consulta_escriba_context": "...", "top_k": 6 }` (blocos opcionais omitidos se vazios após PII).

**Sanitize:** `CLINICAL_AI_URL` tem prioridade em `mcpGateway()`: o backend chama `POST /sanitize` na raiz do clinical-ai (compatível com o contrato antigo de `MCP_SERVER_URL`).

**Teste direto na porta publicada** (`CLINICAL_AI_PUBLISH_PORT`, padrão `4010`):

```bash
curl -s "http://127.0.0.1:4010/health" | jq .
curl -s -X POST "http://127.0.0.1:4010/rag/test/query" \
  -H "Content-Type: application/json" \
  -d '{"query":"pre natal hipertensao"}' | jq .
```

Corpus padrão na imagem: `clinical-ai/corpus/CartilhasSUS` (`RAG_CORPUS_DIR`; ver `.env.example`). Ficheiros suportados: `.md`, `.txt`, `.pdf`, `.docx`, `.jsonl`. Vetores persistidos em SQLite (`RAG_VECTOR_STORE_PATH`, volume `clinical_rag_data` no Compose). Opcionalmente `corpus/sample.jsonl` apenas para overrides locais se apontares `RAG_CORPUS_DIR` para a raiz `corpus/`.

## IA opcional (Compose comentado)

Em `docker-compose.yml` há exemplos comentados (`ollama`, `faster-whisper`) e perfil `ai`. O backend usa **`OLLAMA_HTTP_URL`**, **`WHISPER_HTTP_URL`** e, para desidentificação, **`CLINICAL_AI_URL`** ou **`MCP_SERVER_URL`** conforme `.env.example`. Sem Ollama no host, o clinical-ai sobe mas `/mcp/test/direct-question` falha na chamada ao modelo.

## PowerShell no Windows

Em versões antigas do PowerShell, `&&` pode falhar. Use **`;`** entre comandos ou execute um comando por vez, sempre com o diretório de trabalho correto (`Codigo/` ou `Codigo/backend/` / `Codigo/frontend/`).

---

Documentação específica do template Vite/React (ESLint etc.) não é usada neste repositório; o guia operacional do projeto é este arquivo.
