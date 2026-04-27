# Arquitetura do Sistema: Assistente de Consulta Médica com IA (STT + RAG + MCP)

Este documento apresenta a infraestrutura arquitetural do projeto, guiada pelos princípios de **Security by Design**, **Zero Trust** e **Privilégio Mínimo**. A solução foca na digitalização da Caderneta da Gestante utilizando Inteligência Artificial Operando de Forma Local (On-Premise/Docker) para garantir o completo sigilo sobre os dados de saúde (PII).

## 1. Visão Geral e Módulos

O ecossistema divide as responsabilidades em escopos clínicos e de engajamento:
1. **WebApp Clínico:** Interface principal (SPA) focada na usabilidade da profissional de saúde durante a consulta. Centraliza o uso do "Agente Escriba" e a "Caderneta Virtual".
2. **Módulo de WhatsApp (Futuro):** Um módulo auxiliar acoplado via rotinas (workers/cron) atrelado à mensageria. Seu papel é promover o engajamento da paciente (lembretes e envio de resumos de consulta). *Nota: Considerado funcionalidade estendida pós-MVP*.

![Fluxo da Consulta](UML/FluxoDaConsulta.png)

## 2. Topologia de Rede e Camadas (Docker Segmentation)

O deploy é focado em isolamento rigoroso de redes internas. O WebApp ou serviços de borda nunca se comunicam diretamente com a IA ou Bancos de Dados sem passar pelo Hub central.

1. **`frontend-nw` (Acesso e Borda):**
   - **Cloudflare Tunnel (`cloudflared`):** Ponto de entrada criptografado (tunnel de saída). Sem portas públicas (80/443) expostas pelo host.
   - **Nginx (Reverse Proxy):** Serve a interface de estáticos para performance e faz roteamento reverso controlando bloqueios para as chamadas `/api`.

2. **`backend-nw` (Camada Lógica):**
   - **FastAPI / Node.js (Hub Orquestrador):** Atua como a ponte central (Cross-Network Bridge). Componente com prerrogativa de autenticar a requisição e distribuí-la.
   - **Faster-Whisper (Motor Local de Áudio - STT):** Processa os áudios gravados capturados do dispositivo, transcrevendo em texto plano de forma veloz e 100% offline.

3. **`data-nw` (Camada de Persistência e RAG):**
   - **Servidor MCP (Model Context Protocol):** "Sidecar de Privacidade". O MCP barra a string suja enviada pelo Hub e extirpa Nomes, CPFs, e Cartões SUS antes de entregar pro llm (ex: converte em "Paciente hipertensa, 32 anos"). Nenhuma Query SQL vaza à IA Generativa.
   - **AI Agent (Ollama):** A engine encarregada da inteligência do ecossistema, processando instruções de triagem ou resumitiva rodando modelos restritos (ex: Llama-3 8B). Isolada da rede de internet aberta.
   - **ChromaDB:** Banco Vetorial focado no "Retrieval-Augmented Generation" (RAG). Contém as Diretrizes do SUS picotadas e vetorizadas.
   - **PostgreSQL (via Prisma):** DB Central e de registros. Guardião último de todo o estado transacional.

![Diagrama de Implantação](UML/Diagrama%20de%20Implantacao.jpg)

## 3. Dinâmica de Execução e Workflow (Human-in-the-Loop)

1. A profissional inicia a consulta, validando a captura de voz.
2. O **Faster-Whisper** converte e segmenta o áudio em transcrições efêmeras.
3. A transcrição transita até o **Servidor MCP**, que limpa as identificações (PII).
4. O fragmento assepsado atinge o **Ollama/RAG**. Ele gera preenchimentos semânticos pros formulários virtuais ou exibe `Cards` destacando pendências (Ex: *"Fazer curva glicêmica"*). Se os limites pressóricos da cartilha passarem, ele rotula "Alto Risco".
5. Uma verificação **Human-in-the-Loop** imperativa congela tudo em `AGUARDANDO_CONFIRMACAO`. Somente após o clique humano de validação da médica (committing), os registros caem no PostgreSQL de modo auditado.

### Diagrama de Sequência de Transações

O diagrama demonstra visualmente as restrições e trânsitos entre as camadas de rede perante um save/validação de consulta.

![Diagrama de Sequência](UML/Diagrama%20de%20Sequencia.jpg)

---

## 4. Alertas Críticos de Arquitetura e Engenharia (Skeptical View)

### 4.1 Isolamento e Privacidade Inerente
- `data-nw` só reage ao Orquestrador.
- Nenhum fragmento com a própria voz do consultório persiste no HD ou Banco Relacional visando estrita validade da Lei Geral de Proteção de Dados de Saúde.

### 4.2 Contention de Recursos (VRAM & Cold Start)
- Soluções como o **Ollama** e o **Faster-Whisper** puxam cargas elevadíssimas de hardware. O Host deve fixar limites via `deploy.resources.limits`.
- Operações de inicialização de Load Inference podem levar dezenas de segundos no 1º frame, forçando o frontend a lidar responsivamente por abordagens WebSocket ou Streaming Pacing (Loaders).

### 4.3 Estratégias de Recuperação e Anti-Alucinação
- O chunking fragmentado no **ChromaDB** necessita de sobreposições semânticas saudáveis para não retornar contextos invertidos pro LLM, anulando o objetivo de segurança e padronização do SUS. A temp do modelo deve forçar zero "criatividade" nas conclusões clínicas.