# Especificação do Sistema

Este documento define as especificações centrais do sistema de apoio ao pré-natal SUS com Inteligência Artificial, descrevendo as Histórias de Usuário, os Requisitos Funcionais e os Requisitos Não Funcionais, observando padrões de implementação on-premise (Local LLM) e Clean Architecture.

## 1. Histórias de Usuário

| ID | Ator | Descrição | Valor de Negócio |
| :--- | :--- | :--- | :--- |
| US01 | Prof. da Saúde | Eu quero que o áudio da minha consulta seja transcrito em tempo real e preencha a caderneta digital | Eliminar o tempo manual de digitação de prontuários, mantendo foco do médico direcionado à paciente. |
| US02 | Prof. da Saúde | Eu quero interagir com um Chatbot especialista embasado nos Manuais Técnicos Oficiais do SUS na tela lateral do website | Reduzir dúvidas em protocolos raros, padronizando o suporte médico primário no pré-natal segundo o MS. |
| US03 | Prof. da Saúde | Eu quero receber "Sugestões de Condutas" textuais ou clínicas recomendadas pela IA com base nos dados preenchidos no sistema pelo escriba ou por mim. | Elevar a qualidade da triagem ao induzir o seguimento ativo de recomendações protocolares preventivas. |
| US04 | Prof. da Saúde | Eu quero ter a capacidade de "Aprovar" ou "Ignorar" as sugestões/condutas da IA antes que entrem no registro consolidado | Garantir a responsabilidade (Human-in-the-loop) e o protagonismo humano perante o prontuário. |
| US05 | Prof. da Saúde | Eu quero ver alertas visuais automáticos de "Alto Risco" caso os dados avaliados pela IA estourem os limites base da Cartilha | Antecipar a identificação de perigo fatal para o feto ou a mãe, ativando transferência para atenção secundária. |
| US06 | Prof. da Saúde | Eu quero gerar a extração da Caderneta em um formato PDF oficial idêntico à ficha física nacional do SUS impressa | Permitir a portabilidade e inclusão analógica de mulheres que preferem a via impressa ou vivem sem acesso à internet. |
| US07 | Prof. da Saúde | Eu quero alterar a qualquer momento os campos de formulário preenchido pela IA durante a consulta. | Permitir a correção de informações inseridas incorretamente pela IA. |
| US08 | Prof. da Saúde | Eu quero visualizar todos os meus agendamentos em um calendário. | Permitir o acompanhamento do fluxo de consultas da gestante. |
| US09 | Prof. da Saúde | Eu quero visualizar o perfil do paciente e toda sua caderneta com consultas no seu perfil. | Permitir o acompanhamento da linha de cuidado da gestante. |
| US10 | Gestante | Eu quero receber lembretes periódicos enviados ativamente no meu WhatsApp agendando as semanas corretas da próxima consulta | Combater o alto índice de evasão nas idas aos postos ou esquecimentos das consultas críticas finais da gestação. |
| US11 | Gestante | Eu quero receber, ao fim de cada atendimento, um lembrete do meu plano de cuidado (medicamentos/orientações do médico) resumido pelo WhatsApp  Aumentar drasticamente a aderência do tratamento no dia a dia sem depender de "decorebas" e letras inelegíveis. |
| US12 | Gestante | Eu quero receber "pílulas de conhecimento" educativas, em linguagem clara gerada por NLP partindo do conteúdo maçante do SUS *(Módulo Plus)* | Promover acesso à saúde empática, estimulando autocuidado preventivo com leitura simples, semanalmente coerente. |
| US13 | Prod/Dev | Eu quero que a coleta de dados passe por um intermediador de privacidade bloqueando dados de identificação (PII) sensíveis para a governança na camada local/Docker | Cumprir rigor ético e mandatório de segurança do dado perante a LGPD protegendo os cenários clínicos da quebra de sigilo via Model Context Protocol (MCP). |


## 2. Requisitos Funcionais (RF)

Os requisitos funcionais ditam as ações técnicas que o sistema deve realizar para sanar as _User Stories_.

| ID | Nome do Requisito | Descrição Técnica |
| :--- | :--- | :--- |
| RF01 | Calendário de Consultas | O sistema deve permitir que o profissional de saúde veja um calendário com suas consultas marcadas. |
| RF02 | CRUD de Pacientes | O sistema deve permitir que o profissional de saúde cadastre, atualize, visualize e exclua pacientes, incluindo dados de identificação completos (Cartão SUS, NIS, Sisprenatal, endereço, raça, ocupação). |
| RF03 | Agente Escriba (STT) | O WebApp deve capturar áudio do microfone e processar a conversão *Speech-to-Text* (via motor offline **Faster-Whisper**) isolado da internet. |
| RF04 | Preenchimento Estruturado | O sistema deve injetar os resultados da transcrição mapeados diretamente nas variáveis e input-fields virtuais da caderneta utilizando o Agente LLM local, **sem persistir a transcrição bruta**. |
| RF05 | Consulta às Cartilhas (Chat RAG) | O sistema deve disponibilizar um *Chat* (LívIA) que recupere dados em bases vetoriais relativas aos Manuais do Ministério da Saúde. |
| RF06 | Painel de Condutas da IA | O servidor deve processar os dados inseridos e retornar na interface "cards" de Sugestões / Condutas textuais (Ação/Reação). |
| RF07 | Workflow "Human-in-the-Loop" | O sistema deve bloquear que uma sugestão entre no sistema sem que a Profissional de Saúde revise e confirme os dados extraídos, garantindo responsividade e ética na ferramenta. O status da consulta percorre o ciclo: `RASCUNHO → EM_ANDAMENTO → AGUARDANDO_CONFIRMACAO → CONFIRMADA`. |
| RF08 | Alerta de Alto Risco | O frontend deve gerar Alertas Visuais de *Alto Risco* caso o Score Clínico processado estoure os limiares padronizados na Cartilha SUS. O campo `risco_calculado` na `Consulta` pode assumir `NORMAL`, `ALTO` ou `MUITO_ALTO`. |
| RF09 | Procedimento de Alto Risco | O sistema deve sugerir o protocolo médico padrão para o quadro clínico detectado, de acordo com a Cartilha SUS. |
| RF10 | Geração de Relatório Físico | O sistema deve renderizar o layout estrutural exato de uma página dupla e exportar como PDF para imprimir um "Clone da Ficha Física". |
| RF11 | Agendador de M-Health *(Módulo Plus)* | O back-end deve rodar uma tarefa CRON calculando as datas quinzenais/mensais de disparo no WhatsApp com a próxima consulta. |
| RF12 | Resumo via Bot do Wpp *(Módulo Plus)* | O sistema deve disparar as Condutas Salvas, processadas sintaticamente por IA, integrando API de WhatsApp (API da Meta ou provedor homologado). |
| RF13 | Aulas Semanais Educa *(Módulo Plus)* | O sistema deve rotear trechos dos conhecimentos técnicos do banco, reescrever e enviar via WhatsApp para a gestante de acordo com a `Idade Gestacional`. |
| RF14 | Autenticação do Profissional | O sistema deve autenticar o profissional de saúde via `email` e `senha` (hash bcrypt) antes de permitir acesso a qualquer dado de paciente. Não há auto-cadastro: contas são criadas pelo administrador. |
| RF15 | Status do Ciclo de Vida da Consulta | A consulta deve ter um ciclo de vida rastreado no banco: `RASCUNHO → EM_ANDAMENTO → AGUARDANDO_CONFIRMACAO → CONFIRMADA`. Somente consultas `CONFIRMADAS` geram registro definitivo no prontuário. |
| RF16 | Cálculo de Risco Gestacional | O sistema deve calcular o nível de risco da paciente (`NORMAL`, `ALTO`, `MUITO_ALTO`) com base nos dados clínicos de cada consulta, seguindo os limiares definidos na Caderneta da Gestante SUS 8ª Edição. |

## 3. Requisitos Não Funcionais (RNF)

Os RNF representam as restrições arquiteturais e de qualidade de serviço exigidas à Plataforma.

| ID | Categoria | Descrição Técnica (Regras e Restrições) |
| :--- | :--- | :--- |
| RNF01 | Privacidade M-Health | Nenhuma informação hipercrítica de diagnóstico deve ser publicamente exposta em formato não criptografado e direto via WhatsApp sem validação de número/token pelo serviço. |
| RNF02 | Desempenho (Escriba e VRAM) | A requisição do *Speech-to-Text* (Faster-Whisper) e *LLM* devm ocorrer tolerando tempos aceitáveis via streaming/WebSocket. Deve-se observar o overhead de alocação de memória do host Docker. |
| RNF03 | Confiança/Rigor Médico | Módulo Anti-Alucinação: O Agente local (Ollama) só pode recuperar conhecimento do repositório da Saúde Pública (RAG) em relação ao prompt e a temperatura de geração em inferência clínica não pode tender ao *criativo*. |
| RNF04 | Segurança de Dados/LGPD (Anonymizer) | O backend deve aplicar um Proxy via **Servidor MCP** antes de bater no Agente Ollama. A camada deve interceptar a string limando o `nome_real`, Cartão SUS e NIS por tokens anonimizadores. A transcrição bruta do áudio **nunca deve ser persistida**. |
| RNF05 | Acessibilidade Digital | As mensagens (Pílulas e Resumos) geradas deverão instruir na persona do System Prompts o uso de linguagem equivalente ao 1º grau formativo, garantindo assim completo entendimento no contexto SUS. |
| RNF06 | Arquitetura (Escalabilidade) | O Worker CRON de disparos no WhatsApp (eventos longos em massa) rodará numa arquitetura desacoplada na backend-nw para não onerar os recursos pesados de GPU/RAM dos contêineres do Ollama e Whisper. |
| RNF07 | Segurança em Repouso (Dados SUS) | Identificadores sensíveis como Cartão SUS e NIS devem ser armazenados como hash (bcrypt/SHA-256) na `data-nw`, nunca em texto plano contínuo. Exposição de string real somente via autenticação na API FastAPI. |