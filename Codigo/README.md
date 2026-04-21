# Guia de Desenvolvimento e Testes (Cheat-sheet)

## 1. Topologia de Execução (Ambiente Híbrido)
A arquitetura de desenvolvimento opera em duas frentes isoladas:
- **Backend, Banco de Dados e IA:** Execução em contêineres (Docker).
- **Frontend (React/Vite):** Execução nativa no host (Terminal local).

---

## 2. Inicialização do Ambiente (Passo a Passo)

### Passo 2.1: Infraestrutura (Backend e DB)
No terminal, navegue até a pasta raiz `Codigo/` e inicie os serviços:
```bash
docker compose up -d db backend
```
### Passo 2.2: Banco de Dados (Prisma)
Abra um segundo terminal, navegue até a pasta `Codigo/backend` e execute as configurações:
```bash
npx prisma generate
npx prisma migrate deploy
npm run db:seed
```
### Passo 2.3: Interface Gráfica (Frontend)
Abra um terceiro terminal, navegue até a pasta `Codigo/frontend` e inicie o servidor Vite:
```bash
npm install
npm run dev
```
*Acesse o sistema no navegador através do endereço `http://localhost:5173`.*

---

## 3. Bateria de Testes
Os comandos de teste devem ser executados dentro do diretório `Codigo/backend`.

**Testes Unitários**
Executa validações lógicas isoladas. Não exige contêineres.
```bash
npm run test:unit
```
**Testes de Integração**
Utiliza Testcontainers para levantar instâncias isoladas de banco de dados e aplicar migrações. Exige Docker ativo.
```bash
npm run test:integration
```
**Execução Completa (Unitário + Integração)**
Requer Docker ativo.
```bash
npm test
```
**Execução Completa com Bypass de Integração**
Utilizado quando não há runtime de contêiner disponível no host de execução.
```bash
SKIP_INTEGRATION_TESTS=1 npm test
```

---

## 4. Operações de Manutenção (Prisma)
Comandos para execução no diretório `Codigo/backend` durante alterações de modelo de dados.

**Verificar estado das migrações aplicadas no banco atual:**
```bash
npx prisma migrate status
```
**Gerar nova migração após alterar arquivo `schema.prisma`:**
```bash
npx prisma migrate dev --name descricao_da_alteracao
```
**Resetar banco de dados (Atenção: Destrói dados e reaplica migrações/seeds):**
```bash
npx prisma migrate reset
```

**Atualizar dependências de contêiner do Backend (Após instalar novas bibliotecas):**
```bash
# Na pasta raiz (Codigo/)
docker compose up -d --build backend
```

---

## 5. Conexão com Cliente SQL Externo (DBeaver, pgAdmin, etc.)

Para conectar ferramentas de gerenciamento visual ao banco de dados rodando no Docker, utilize os seguintes parâmetros de conexão (expostos em loopback para a máquina host):

* **Host:** `127.0.0.1`
* **Porta:** `5432`
* **Database:** `sus_prenatal` *(ou valor de POSTGRES_DB no .env)*
* **Usuário:** `postgres` *(ou valor de POSTGRES_USER no .env)*
* **Senha:** *(Valor definido na variável POSTGRES_PASSWORD no .env da raiz)*