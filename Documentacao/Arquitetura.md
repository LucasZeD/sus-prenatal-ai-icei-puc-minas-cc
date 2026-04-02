# Arquitetura do Sistema: Digitalização e Inteligência da Caderneta de Gestante do SUS

Este documento apresenta a proposta arquitetural para o trabalho de conclusão de curso (TCC), focada na digitalização da Caderneta da Gestante com auxílio de Inteligência Artificial, melhorando o fluxo de atendimento da profissional de saúde e o engajamento da paciente.

## 1. Visão Geral
O ecossistema é dividido em duas interfaces principais:
1. O **WebApp** Next.js (focado no uso clínico e no acompanhamento da consulta).
2. O **Módulo de WhatsApp** (focado no engajamento e comunicação direta cm a gestante).

## 2. Stack Tecnológica
- **Framework**: 
    - **FrontEnd**:
        - `Next.js` (React) e `Tailwind CSS`.
    - **BackEnd**:
        - `Node.js` (com TypeScript, Express ou NestJS). Controle de rotas, usuários e agendadores (via biblioteca Node-Cron/BullMQ).
- **Serviços de IA (Python)**:
    - `FastAPI`, ideal para performance e data-science.
    - **Whisper (OpenAI)**: Para conversão local do áudio de consulta para texto (STT).
    - **LangChain / LlamaIndex**: Orquestração do processamento dos textos brutos da consulta contra o modelo principal.
    - **LLM (Gemini 1.5 Pro, Llama-3, ChatGPT)**: Motor principal de sumarização (Sugestões, Chat do Profissional e reescrita de Pílulas NLP pro wpp).
- **Banco de Dados**: `PostgreSQL` via Prisma ORM, relacional para rastreabilidade de dados demográficos e consultas atreladas de maneira histórica.
- **Gateway / WhatsApp**: Integração do backend Node com `Twilio` ou a `API Oficial do WataApp Cloud da Meta` para escalabilidade das remessas de mensagens.
- **Hospedagem**: Vercel (Frontend) + Railway/AWS (Backend).

## 3. Detalhamento dos Módulos

### 3.1 WebApp (Interface Clínica para o Profissional de Saúde)
Um sistema web moderno, seguro e responsivo, desenvolvido como SPA (Single Page Application - ex: React/Next.js/Angular) que servirá como ferramenta principal da consulta.
*   **Caderneta Virtual Central**: Tela em substituição ao modelo físico tradicional do SUS. Permite inserção manual e edição de todos os exames, pesagem, vacinas e ultrassons.
    *   **Funcionalidade de Download**: A caderneta inteira é capaz de ser compilada num arquivo `.pdf` parametrizado na estrutura oficial do SUS, permitindo a **impressão** fácil para a gestante, caso ela queira a caderneta física.
*   **Agente Escriba (AI)**: Sistema que escuta em segundo plano e realiza transcrição de áudio em tempo real e extração de entidades. Ele observa a anamnese da paciente e preenche os campos do formulário na tela automaticamente sem que o médico precise digitar ("mão na roda").
*   **Agente Chat de Dúvidas**: Uma área contínua (como um painel lateral) onde o profissional de saúde conversa com um assistente especializado (treinado nos manuais mais recentes do Ministério da Saúde) para tirar dúvidas pontuais da caderneta.
*   **Agente de Sugestões e Condutas ("Human-in-the-Loop")**: Conforme a consulta anda, o sistema avalia o que foi dito ou anotado. Ele insere "Cards" sugestivos de perguntas (Ex: *"Pergunte sobre náuseas recentes"* ou *"Recomende o exame de curva glicêmica"*). Nenhuma ação entra na caderneta sem o **crivo / aprovação do profissional**, garantindo o rigor ético da prática médica.
*   **Previsão de Gravidez de Risco**: Um motor que roda paralelamente analisando idades, pressões arteriais, histórico familiar e resultados de sangue em face às diretrizes da **cartilha de gravidez de risco**. Caso a predição cruze uma margem de perigo, o sistema sinaliza (ex: tela em vermelho), altera o protocolo principal de sugestões da IA e informa ações contingenciais de forma imediata (ex: transferência de nível de atenção).


### 3.2 Módulo / Backend de Disparo no WhatsApp
Serviço separado, frequentemente desenvolvido pautado em arquitetura de eventos (que pode consultar a mesma base principal), projetado para aproximar o sistema da Gestante utilizando a plataforma WhatsApp.
*   **Lembretes de Consulta Ativos**: Baseado na regra imposta na cartilha (ex: consultas mensais, quinzenais da 28ª à 36ª semana, semanais após a 36ª semana), um job em background envia mensagens de WhatsApp automatizadas com lembretes à gestante.
*   **Condutas Pós-Consulta**: Resumo do que foi falado. Através do NLP, o sistema sintetiza tudo o que foi orientado pelo profissional de saúde ("você deve tomar a vacina dtPa, lembre-se da suplementação de ácido fólico"), enviando em texto compreensível via WhatsApp gerando um registro fácil p/ acesso posterior à mãe.
*   **Pílulas Informativas baseadas na Cartilha (NLP)**: Motor de geração de conhecimento que pega as dezenas de páginas educativas que o SUS fornece e engaja a paciente gradativamente. O NLP adequa o texto, simplifica termos médicos, e engatilha conteúdos informativos sobre o desenvolvimento do feto no momento exato em que a paciente atinge a respectiva idade gestacional relatada.