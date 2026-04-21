# Referência de API (Postman / cURL) - Prenatal Digital

O servidor backend (Hono) opera por padrão na porta `3000`. 
Por design e segurança (Zero-Trust), **nenhuma rota raiz (`/`) está exposta ou renderizada para navegadores convencionais**. Portanto, acessar `http://localhost:3000/` sempre retornará **404 Not Found**. As rotas disponíveis exigem caminhos absolutos como `/health` ou `/api/v1/...`.

Você pode importar as requisições abaixo no **Postman** (canto superior esquerdo: `Import` > aba `Raw text` > Cole o comando cURL).

---

### 1. Verificar Status de Saúde do Backend (Health Check)
Esta rota não exige autenticação. Verifica acesso ao banco Prisma e ao MCP.

```bash
curl --location 'http://localhost:3000/health'
```

---

### 2. Autenticação do Profissional (Login)
Retorna o Token JWT (`token`). Você precisará desse token para todas as outras requisições clínicas.

```bash
curl --location 'http://localhost:3000/api/v1/auth/login' \
--header 'Content-Type: application/json' \
--data '{
    "email": "medica@localhost",
    "password": "senha"
}'
```

---

### 3. Listar Pacientes Gestantes (Exige Bearer Token)
Busca a lista de pacientes. Substitua `SEU_TOKEN_MUITO_LONGO_AQUI` pelo token retornado no passo do Login. O Postman pode fazer isso automaticamente se você configurar na aba "Authorization -> Bearer Token".

```bash
curl --location 'http://localhost:3000/api/v1/pacientes' \
--header 'Authorization: Bearer SEU_TOKEN_MUITO_LONGO_AQUI' \
--header 'Accept: application/json'
```

---

### 4. Consultar Detalhes de Uma Paciente Específica
Retorna as gestações e histórico médico de um paciente através do `ID`.

```bash
curl --location 'http://localhost:3000/api/v1/pacientes/ID_DO_PACIENTE_AQUI' \
--header 'Authorization: Bearer SEU_TOKEN_MUITO_LONGO_AQUI'
```

---

### 5. Cadastrar Nova Consulta na Agenda
Cria uma consulta associada a uma gestação e a uma unidade. O ID do profissional é deduzido pelo Token enviado (do profissional logado).

```bash
curl --location 'http://localhost:3000/api/v1/consultas' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer SEU_TOKEN_MUITO_LONGO_AQUI' \
--data '{
    "paciente_id": "ID_DO_PACIENTE",
    "gestacao_id": "ID_DA_GESTACAO",
    "unidade_id": "ID_DA_UNIDADE",
    "data_consulta": "2026-05-15T09:00:00Z",
    "tipo_consulta": "ROTEIRO"
}'
```

---

### 6. Atualizar Prontuário Clínico (PATCH Consulta via Escriba)
Esta é a rota chamada pelo Front-End após a análise da IA (*Consultation Stream*) e pela validação Humana, atrelando os atributos físicos.

```bash
curl --location --request PATCH 'http://localhost:3000/api/v1/consultas/ID_DA_CONSULTA' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer SEU_TOKEN_MUITO_LONGO_AQUI' \
--data '{
    "status": "CONFIRMADA",
    "validacao_medica": true,
    "peso": 65.5,
    "movimentacao_fetal": true,
    "edema": false,
    "conduta_clinica": "Paciente bem, retorna em 14 dias."
}'
```

---

### 7. Escriba (Ação Crítica) — Recriar Consulta para Regravar (apaga gravação anterior)
**Uso**: quando uma consulta já foi **finalizada/assinada** (`status = CONFIRMADA`) e o profissional precisa **regravar** a sessão do Escriba.  

**Comportamento (side-effects)**:
- **Bloqueia regravação** na consulta confirmada; para regravar, este endpoint cria uma **NOVA consulta** com **pré-preenchimento** (copia os campos clínicos existentes).
- **Apaga a gravação anterior**: remove os eventos persistidos do streaming (`consulta_stream_evento`) associados à consulta confirmada.
- Mantém o conteúdo útil para revisão: copia `consulta_ia.sugestao_conduta` para a nova consulta (quando existir) e zera `consulta_ia.transcricao_efemera_id` na consulta antiga.

**Regras**:
- Só aceita recriação se a consulta estiver `CONFIRMADA`.
- Exige autenticação (Bearer Token).

**Request**:

```bash
curl --location --request POST 'http://localhost:3000/api/v1/consultas/ID_DA_CONSULTA/recriar-para-escriba' \
--header 'Authorization: Bearer SEU_TOKEN_MUITO_LONGO_AQUI' \
--header 'Accept: application/json'
```

**Response (201)**:

```json
{
  "new_consulta_id": "UUID_DA_NOVA_CONSULTA"
}
```
