# Especificação do Sistema

Este documento define as especificações centrais do sistema de apoio ao pré-natal SUS com Inteligência Artificial, descrevendo as Histórias de Usuário, os Requisitos Funcionais e os Requisitos Não Funcionais.

## 1. Histórias de Usuário

| ID | Ator | Descrição | Valor de Negócio |
| :--- | :--- | :--- | :--- |
| US01 | Prof. da Saúde | Eu quero que o áudio da minha consulta seja transcrito em tempo real e preencha a caderneta digital | Eliminar o tempo manual de digitação de prontuários, mantendo foco do médico direcionado à paciente. |
| US02 | Prof. da Saúde | Eu quero interagir com um Chatbot especialista embasado nos Manuais Técnicos Oficiais do SUS na tela lateral do website | Reduzir dúvidas em protocolos raros, padronizando o suporte médico primário no pré-natal segundo o MS. |
| US03 | Prof. da Saúde | Eu quero receber "Sugestões de Condutas" textuais ou clínicas recomendadas pela IA com base nos dados preenchidos ni sistema pelo escriba ou por mim. | Elevar a qualidade da triagem ao induzir o seguimento ativo de recomendações protocolares preventivas. |
| US04 | Prof. da Saúde | Eu quero ter a capacidade de "Aprovar" ou "Ignorar" as sugestões/condutas da IA antes que entrem no registro consolidado | Garantir a responsabilidade (Human-in-the-loop) e o protagonismo humano perante o prontuário. |
| US05 | Prof. da Saúde | Eu quero ver alertas visuais automáticos de "Alto Risco" caso os dados avaliados pela IA estourem os limites base da Cartilha | Antecipar a identificação de perigo fatal para o feto ou a mãe, ativando transferência para atenção secundária. |
| US06 | Prof. da Saúde | Eu quero gerar a extração da Caderneta em um formato PDF oficial idêntico à ficha física nacional do SUS impressa | Permitir a portabilidade e inclusão analógica de mulheres que preferem a via impressa ou vivem sem acesso à internet. |
| US07 | Prof. da Saúde | Eu quero alterar a qualquer momento os campos de formulário preenchido pela IA durante a consulta. | Permitir a correção de informações inseridas incorretamente pela IA. |
| US08 | Prof. da Saúde | Eu quero visualizar todos os meus agendamentos em um calendário. | Permitir o acompanhamento do fluxo de consultas da gestante. |
| US09 | Prof. da Saúde | Eu quero visualizar o perfil do paciente e toda sua cartirinha com consultas no seu perfil. | Permitir o acompanhamento da linha de cuidado da gestante. |
| US10 | Gestante | Eu quero receber lembretes periódicos enviados ativamente no meu WhatsApp agendando as semanas corretas da próxima consulta | Combater o alto índice de evasão nas idas aos postos ou esquecimentos das consultas críticas finais da gestação. |
| US11 | Gestante | Eu quero receber, ao fim de cada atendimento, um lembrete do meu plano de cuidado (medicamentos/orientações do médico) resumido pelo WhatsApp | Aumentar drasticamente a aderência do tratamento no dia a dia sem depender de "decorebas" e letras inelegíveis. |
| US12 | Gestante | Eu quero receber "pílulas de conhecimento" educativas, em linguagem clara gerada por NLP partindo do conteúdo maçante do SUS | Promover acesso à saúde empática, estimulando autocuidado preventivo com leitura simples, semanalmente coerente. |
| US13 | Prod/Dev | Eu quero que a coleta de áudio para a NLP descarte dados de identificação (PII) sensíveis para a governança na camada Cloud | Cumprir rigor ético e mandatório de segurança do dado perante a LGPD protegendo os cenários clínicos da quebra de sigilo. |


## 2. Requisitos Funcionais (RF)

Os requisitos funcionais ditam as ações técnicas que o sistema deve realizar para sanar as _User Stories_.

| ID | Nome do Requisito | Descrição Técnica |
| :--- | :--- | :--- |
| RF01 | Calendário de Consultas | O sistema deve permitir que o profissional de saude veja um calendário com suas consultas marcadas. |
| RF02 | CRUD de Pacientes | O sistema deve permitir que o profissional de saude cadastre, atualize, visualize e exclua pacientes. |
| RF03 | Agente Escriba (STT) | O WebApp deve capturar áudio do microfone e processar a conversão *Speech-to-Text* (por ex. via API Whisper) em tempo real. |
| RF04 | Preenchimento Estruturado | O sistema deve injetar os resultados da transcrição (NLP/Generativa) mapeados diretamente nas varíaveis e input-fields virtuais da caderneta. |
| RF05 | Consulta às Cartilhas (Chat RAG) | O sistema deve disponibilizar um *Chat* que recupere dados em bases vectoriais relativas aos Manuais do Ministério da Saúde. |
| RF06 | Painel de Condutas da IA | O servidor deve processar os dados inseridos e retornar na interface "cards" de Sugestões / Condutas textuais (Ação/Reação). |
| RF05 | Workflow "Human-in-the-Loop" | O sistema deve bloquear que uma sugestão entre no sistema sem que a Profissional de Saúde clique em aceitar, garantindo responsividade e ética na ferramenta. |
| RF06 | Alerta de Alto Risco | O frontend deve gerar Alertas Visuais de *Alto Risco* caso o Score Clínico processado estoure os limiares padronizados na Cartilha SUS. |
| RF07 | Procedimento de Alto Risco | O sistema deve sugerir o protocolo médico padrão para o quadro clínico detectado, de acordo com a Cartilha SUS. |
| RF08 | Geração de Relatório Físico | O sistema deve renderizar o layout estrutural exato de uma página dupla e exportar como PDF para imprimir um "Clone da Ficha Física". |
| RF09 | Agendador de M-Health | O back-end deve rodar uma tarefa CRON calculando as datas quinzenais/mensais de disparo no WhatsApp com a próxima consulta. |
| RF10 | Resumo via Bot do Whatsapp | O sistema deve disparar as Condutas Salvas, processadas sintaticamente por IA, integrando API de Whatsapp (API da Meta ou provedor homologado). |
| RF11 | Aulas Semanais (Pílulas Educativas) | O sistema deve rotear trechos dos conhecimentos técnicos do banco, reescrever e enviar via WhatsApp pra gestante de acordo com a `Idade Gestacional`. |
| RF12 | Agendamento de Consultas | O sistema deve permitir que a gestante agende consultas médicas diretamente pelo aplicativo. |
| RF13 | Perfil da Gestante | O sistema deve permitir que a gestante visualize seu perfil e histórico de consultas. |

## 3. Requisitos Não Funcionais (RNF)

Os RNF representam as restrições arquiteturais e de qualidade de serviço exigidas à Plataforma.

| ID | Categoria | Descrição Técnica (Regras e Restrições) |
| :--- | :--- | :--- |
| RNF01 | Privacidade M-Health | Nenhuma informação hipercrítica de diagnóstico deve ser publicamente exposta em formato não criptografado e direto via WhatsApp sem validação de número/token pelo serviço. |
| RNF02 | Desempenho (Scribe) | A requisição do *Speech-to-Text* para extração de preenchimento de campos virtuais não pode apresentar timeouts superiores a ~5 segundos para não causar perda temporal da médica. |
| RNF03 | Confiança/Rigor Médico | Módulo Anti-Aluclinaçao: A IA generativa só pode recuperar conhecimento do repositório da Saúde Pública pré-salvo em contexto (RAG) em relação ao prompt e a temperatura de geração em inferência clínica não pode tender ao *criativo*. |
| RNF04 | Segurança de Dados/LGPD (Anonymizer) | O backend ou proxy precisa substituir a string de áudio em que transcrevem `nomes completos`, RG/CPF da paciente, ocultando os Identificadores Pessoais da mesma. |
| RNF05 | Acessibilidade Digital | As mensagens (Pílulas e Resumos via NLP) geradas na cloud deverão instruir na persona do System Prompts o uso de linguagem equivalente ao 1º grau formativo garantirá assim completa entendimento no SUS. |
| RNF06 | Arquitetura | O Worker Cron de disparos no WhatsApp (Eventos longos em massa) rodarão numa arquitetura ou serviço desaclopado para não ferir ou onerar os recursos primários do frontend da sala de triagem dos postos de consulta. |