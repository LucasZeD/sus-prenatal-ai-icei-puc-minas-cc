# Interfaces — Prenatal Digital (wireframe e disposição de dados)

Documento de **UX/UI e disposição de conteúdo** para implementação alinhada ao repositório em `Codigo/`. O foco aqui é **hierarquia visual, fluxos e blocos de dados**, não a stack de frameworks (a implementação real está em `cursor.md` / `Documentacao/Arquitetura.md`).

**Abordagem:** mobile-first responsiva, baixa carga cognitiva para profissionais de saúde, conformidade LGPD na superfície exibida (nomes mascarados, últimos dígitos de identificadores).

---

## 1. Referências visuais (Mapeamento de Telas)

Arquivos PNG versionados na documentação, refletindo o layout atual do sistema:

| Arquivo | Tela | Descrição Visual |
|---------|------|------------------|
| `0_LandingPage.png` | Landing Page / Login | Layout tipo "Hero". Esquerda: Formulário de login simples. Direita: Ilustração acolhedora. Abaixo: Categorias (Demonstração, Valores, Artigo, etc.), explicação do funcionamento das IAs (Escriba, LívIA, IA WhatsApp), áreas para testar o sistema e tecnologias utilizadas (Vite, Postgres, Prisma, Hono, Whisper). |
| `1_Dashboard.png` | Dashboard (Agenda) | Visão de calendário semanal. Cabeçalho superior (Top Header) com ícones e perfil do usuário. Sidebar esquerda com navegação (Home, Pacientes, Configurações). Centro: Grade de horários detalhada exibindo as consultas marcadas por dia da semana. |
| `2_Pacientes.png` | Lista de Pacientes | Barra de busca movida para o Top Header. Centro: Lista vertical de cartões de pacientes (Nome em destaque, Idade, Idade Gestacional, Risco, Última/Próxima consulta). Direita: Painel lateral da "Assistente de IA" (LívIA). |
| `3_Paciente[id].png` | Perfil do Paciente | Prontuário detalhado. Topo: Nome de preferência e acompanhante. Centro: "Unified Identity Card" (Identificação completa com dados pessoais). Abaixo: Timeline de Consultas em formato sanfona (acordeão). Consultas anteriores podem ser expandidas. A próxima consulta exibe o botão "Iniciar Consulta". |
| `4_Paciente[id]-InicioConsulta.png` | Escriba (Gravando) | Interface durante o atendimento. Os blocos de identificação e consultas anteriores ficam contraídos. O bloco da consulta atual se expande exibindo a área de escuta do Escriba, com botões para "Pausar Escriba" e "Finalizar Consulta". |
| `5_Paciente[id]-FinalizarConsulta.png` | Escriba (Revisão) | Fase "Human-in-the-loop". O áudio processado preenche estruturalmente os campos clínicos (Queixa, Peso, Edema, PA, etc.). Exibe botão de "Core Action" (verde) para "Confirmar Dados de Consulta". Painel direito da LívIA exibe sugestões ativas baseadas nos dados preenchidos (ex: condutas para PA 14/9). |

---

## 2. Identidade visual e Design System

- **Cores Primárias:** Fundo suave em tons de rosa pastel (`bg-rose-50/50`, `rose-100`) para a Sidebar e acentos da assistente, transmitindo um tom maternal e acolhedor.
- **Estrutura de Cartões:** Utilização de `rounded-2xl` para bordas mais arredondadas e amigáveis, com sombras leves.
- **Ações Principais:** Botões de confirmação médica (Core Actions) utilizam cor de destaque (ex: verde) para guiar o fluxo seguro de "Confirmar dados" no prontuário.
- **Tipografia:** Sans-serif. Negrito para nomes e títulos de blocos, corpo regular para dados e labels.

---

## 3. Shell global (Três colunas no desktop)

O layout principal (pós-login) é composto por:

| Região | Conteúdo |
|--------|-----------|
| **Cabeçalho (Top Header)** | Busca central (para pacientes), ícones de ação (notificações, mensagens) e perfil do profissional de saúde (ex: Psf. Rafael). |
| **Esquerda (Sidebar fixa)** | Fundo suave (`rose-50`). Navegação limpa: `Home` (Agenda), `Pacientes` e `Configurações`. Botão de `Log out` no rodapé. |
| **Centro (Área Fluida)** | Conteúdo dinâmico da rota ativa (`Outlet`): Calendário da agenda, lista de pacientes ou prontuário/escriba. |
| **Direita (Painel LívIA)** | Painel lateral fixo da Assistente de IA. Serve para chat livre RAG ou para exibir sugestões contextuais e alertas de conduta baseados nos formulários abertos no centro. |

---

## 4. Rotas e blocos de dados

Rotas da SPA (**React Router**):

| Rota | Função | Dados / disposição |
|------|--------|-------------------|
| `/login` | Autenticação (RF14) | Landing page completa. E-mail, senha e apresentação das capacidades do Prenatal Digital. |
| `/dashboard` | Agenda da unidade | Visão em calendário semanal (`Home`). Permite visualizar a distribuição de carga da unidade e selecionar a paciente do horário. |
| `/pacientes` | Lista de gestantes | Busca via Top Header. Cartões de resumo com identificadores mascarados, idade gestacional atualizada e badges de risco. |
| `/pacientes/:id` | Prontuário | Unified Identity Card. Timeline em acordeão. Transições de estado claras entre consultas antigas e consultas a serem iniciadas. |
| `/consultas/:consultaId/escriba` | Escriba digital | **Início:** Captura ativa (WebSocket `ws://.../ws/consultation/:id`). <br>**Revisão:** Espelho preenchido (STT/IA). Edição manual permitida. Finalização via botão verde (PATCH para confirmação médica). |
| **`/dev/sandbox`** | **Testes Rápidos** | **(NOVA TELA DEV)** Interface exclusiva de ambiente de desenvolvimento para debugar os microserviços isoladamente (ver detalhes abaixo). |

---

## 5. Tela de Testes Rápidos do Desenvolvedor (Dev Sandbox)

Para facilitar a validação das integrações complexas (STT, LLM, MCP, WebSocket) sem precisar simular uma consulta inteira, a interface possui a rota oculta `/dev/sandbox`.

**Blocos presentes no Sandbox:**
1. **Painel WebSocket / Escriba:**
   - Botão para Iniciar/Parar simulação de envio de chunks de áudio (Mock ou Mic real).
   - Log em tempo real dos eventos recebidos do servidor (`consulta_stream_evento`).
2. **Painel do MCP (Privacy Gateway):**
   - Input de texto livre para testar a sanitização de PII.
   - Display exibindo o "Antes" (Texto sujo) e o "Depois" (Texto assepsiado que iria para o LLM).
3. **Painel LLM (Inferência Direta):**
   - Campo para enviar prompts diretos ao Ollama/RAG.
   - Retorno estruturado (JSON ou Markdown) para verificar a estruturação de variáveis e tempos de resposta (Cold Start).
4. **Painel de Status de Infra:**
   - Indicadores visuais simples: Conexão PostgreSQL (OK/Erro), Instância Ollama (Ativa/Inativa), Faster-Whisper (Ativo/Inativo).

---

## 6. Escriba (transcrição) e LívIA (RAG)

### Escriba (Fluxo Operacional)
1. **Gravando:** A interface se contrai para focar no áudio. Botões claros para pausar (VAD manual) ou finalizar a escuta.
2. **Revisão (HITL):** O texto processado é injetado nos *inputs* da tela. O médico pode editar livremente os campos.
3. **Confirmação:** A persistência clínica (salvar no banco como prontuário real) só ocorre após o clique explícito no botão verde de "Confirmar Dados da Consulta", garantindo o *Human-in-the-loop*.

### LívIA (Contexto Ativo)
- O painel direito ouve as atualizações de estado do componente central. Se o Escriba preencher uma "Pressão Arterial de 14/9", a LívIA atualizará seu bloco sugerindo condutas baseadas no Manual do MS para síndromes hipertensivas na gestação.

---

## 7. Requisitos técnicos reais do monorepo (resumo)

| Camada | Tecnologia |
|--------|------------|
| Frontend | **Vite + React + React Router + Tailwind CSS v4** (`Codigo/frontend`) |
| API + WS | **Node + TypeScript + Hono**; WebSocket com `@hono/node-ws` (`Codigo/backend`) |
| Dados | **PostgreSQL + Prisma** |

Boas práticas aplicadas: sanitização de inputs, LGPD via `paciente_ids` (hashes HMAC + pepper), e auditoria rigorosa de consultas.