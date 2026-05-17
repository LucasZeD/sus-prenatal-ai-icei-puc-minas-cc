# Estrutura do artigo

## Artigo Completo

% Título + Autores + Email
% 1. Abstract + Resumo
%    - Problema + Abordagem (IA local, RAG, MCP, STT) + Contribuicao (especificacao + arquitetura replicavel) + 1 Limitacao do sistema (50 palavras + Keywords)
% 2. Introdução
%    - Contexto SUS/Caderneta da Gestante/Linha de Cuidado
%    - Desafios LGPD
%    - Carga cognitiva
%    - Porque a IA generativa + RAG e processamento local importam
%    2.1 Justificativa
%     - Porque a IA generativa + RAG e processamento local importam
%     - Lacuna de projetos no contexto atual
%     2.1.1 Depoimentos de profissionais de saúde sobre a solucao proposta e o cenario atual
%       - Deve háver método para coletar depoimentos de profissionais de saúde sobre a solucao proposta e o cenario atual
%       - Roteiro, N, Perfil, Posicao clara de opiniao informal
%       - Pode levar a necessidade de liberacao de comite de etica
%         - Metodo de fallback via revisao de literatura clinica
% 3. Problema de Pesquisa
%    - 1 Pergunta norteadaora + 3 subquestoes operacionias relevantes
%    - Como especificar e arquitetar o sistema que reduza carga cognitiva do profissional de saúde sem gravar decicoes da ia sem vaidacao profissional?
%    - Vies de automacao (medico confiar cegamente na ia por cansaćo)
%    - Metrica de sucesso: como avaliar sem o comite de etica para contato com usuario final
%     - Metodo de fallback via metricas de desempenho (Ragas/TruLens/GOMS/KLM)
% 4. Objetivos
%    4.1 Objetivo Geral
%     - Plataforma de apoio ao pré-natal + Especificacao + Arquitetura
%    4.2 Objetivos Específicos
%     - Mapear User Stories
%     - Propor topologia replicavel em Docker
%     - Descrever Pipe de consulta STT -> MCP -> RAG -> LLM -> Estados de cosnutla
%     - Descrever Riscos locais e solucoes de miticacao com anonimizacao e api externa
%     - Descrever Riscos de conduta por ia e mitigacao por RAG, temeratura e revisao humana.
% 5. Fundamentacao Teorica
%     - Melhorar coesao entre os artigos
%    5.1 IA em Saúde pública e copilotos clínicos
%    5.2 RAG e ancoragem em diretrizes
%    5.3 Privacidade: LGPD, minimizacao, processamento on-premise
%    5.4 Human-in-the-loop e responsabilidade clinica
%    5.5 MCP e Tooling para governanca de contexto
%    5.6 Security by design no desenvolvimento de agentes de IA (OWASP top 10 for llm applications)
%    5.7 Caso de Uso dda Micorosoft com o Presidio como referencia comparativa (mitigação de Sensitive Data Exposure e Indirect Prompt Injection através do uso do Microsoft Presidio) (NER customizado para PII)
%    5.8 Trabalhos correlatos (comparar com 2 projetos similares) (validar lacuna de projetos no contexto atual) (tabela comparativa com 2 projetos similares)
% 6. Materiais, Métodos e Metodologia
%    6.1 Materiais
%     - Justificar escolhas com base em performance, custo, escalabilidade e seguranca etc.
%     - Stack Tecnica
%       - Redes Docker
%       - Whisper
%       - MCP
%       - RAG
%       - Ollama
%       - SQLite (vector store RAG no clinical-ai)
%       - PostgreSQL
%    6.1.1 Hardware
%      - cpu, gpu, ram, storage, etc.
%      - Definir arquitetura minima para rodar o sistema em ambiente de producao (single user)
%    6.1.2 Software e Frameworks
%      - Python, bibliotecas importantes, sistemas operacionais, frameworks, etc.
%    6.1.3 Base de Dados
%      - Cartilhas do SUS e fontes
%    6.1.4 Ferramentas de IA
%      - Ferramentas Open Source
%    6.2 Métodos
%     - Como e Com o que?
%     - O que foi feito?
%     - Procedimentos praticos e ferramentas utilizadas
%      - Como foi especificado/construido/validado/testado/implantado?
%      - RF/RNF Importantes (Documentacao/Especificacao.md)
%     6.2.1 Coleta, preparacao e governança de dados
%      - Curadoria, chunking e indexacao das cartilhas (chunking semantico) (como lidar com tabelas de exames prenatais [Markdwon coversion unstructured/LiteParse]/Docling/Marker)
%      - Politica de nao persistencia de dados brutos de trasncricao de consulta
%      - Politica de anonimizacao de dados sensiveis
%     6.2.2 Arquitetura do sistema
%       - UMLs
%       - Arquitetura (Documentacao/Arquitetura.md)
%       - Fluxo de Consulta (Documentacao/UML/FluxoDaConsulta.png)
%       - Fluxo de implantação (Documentacao/UML/DiagramaDeImplantacao.jpg)
%       - Fluxo de sequencia (Documentacao/UML/DiagramaDeSequencia.png)
%    6.3 Metodologia
%     - DSR valida porque foi feito
%     - Porquê? Fundamentacao teorica do caminho escolhido
%     6.3.1 DSR
%      - PROBLEMA
%      - ARTEFACTO
%      - DEMONSTRACAO
%      - COMUNICACAO
%      - Recall e Precision para o RAG (Ragas/TruLens)
%      - Metricas de desempenho local (latencia de inferencias whisper/ollama no hardware + fallback com anonimizacao)
%    6.4 Cronograma
% 7. Solução Proposta
%    7.1 Prototipo de alta fidelidade (Documentacao/Prototipo/Prototipo.png)
%     - Telas, Fluxo confirmados, tempos grosseiros, decisoes de implantacao, etc.
%    7.2 Analise de custos e beneficos
%     - Tradeoffs de privacidade vs usabilidade
%     - Tradeoffs de escalabilidade vs custo
%     - Testes realizados com o prototipo
%       - Testes de tolerancia a falhas - STT, RAG, LLM, Hardware, etc.
%       - Testes PII - nomes brasileiros complexos, girias regionasis, etc.
%         - Metrica: % de falso negativo na anonimizacao (grafico) % de dados que passaram para o llm sem a mascara aplicada
%     - Comparar latencia de um modelo de 7B rodando localmente vs a precisao para o contexto clinico (F1 score)
%       - F1 Score - Ground Truth - Criar 10 a 20 casos clinicos ficticios baseados na caderneta para servir de ground truth
% 8. Discussoes
%    - Limitacoes
%     - hardware e precos de implantacao real
%    - Riscos residuais de LLM
%    - Gestao de Riscos
%     - Prompt injection via MCP (mitigacao com context manager, readonly para o db, prompt shelding e sandboxing)
%     - STT latencia em hardware - faster whisper vs insanely fast whisper - diarizacao de audio vs transcricao de audio pura - sem diarizacao llm deve separar papeis em contexto
%     - RAG com recuperacao de chunks de ruido - reraking local top k
%     - STT nao robusto - fallback humano para validacao - stt so preenche dados
%    - Calibracao de confianca - sistema apresentar fontes de rag de forma explicita (citacao exata da caderneta) para o humano validar em segundos
% 9. Conclusão
%    - retomada dos objetivos e resultados
%    - Resumo dos Resultados
%      - Alinhamento com a cartilha da gestante SUS
%    - Contribuições
%    - Afimar viabilidade do projeto em locais de baixa conectividade, hardware limitado e alta privacidade
%    - Perspectivas (contribuicoes, viabilidade, proximos passos, trabalhos futuros)
% 10. Referências
%     - Bibliografia
%     - Links de interesse

## ARTIGO RESUMIDO
% 1. Título + Autores + Email
% 2. Abstract + Resumo
%    - Problema + Abordagem (IA local, RAG, MCP, STT) + Contribuicao (especificacao + arquitetura replicavel) + 1 Limitacao do sistema (50 palavras + Keywords)
% 3. Introdução e Justificativa
%   - Problema SUS
%   - Carga Cognitiva
%   - lacuna de IA local
% 4. Problema de Pesquisa
%    - 1 Pergunta norteadaora + 3 subquestoes operacionias relevantes
%    - Como especificar e arquitetar o sistema que reduza carga cognitiva do profissional de saúde sem gravar decicoes da ia sem vaidacao profissional?
%    - Vies de automacao (medico confiar cegamente na ia por cansaćo)
%    - Metrica de sucesso: como avaliar sem o comite de etica para contato com usuario final
%     - Metodo de fallback via metricas de desempenho (Ragas/TruLens/GOMS/KLM)
% 5. Objetivos
%    5.1 Objetivo Geral
%     - Plataforma de apoio ao pré-natal + Especificacao + Arquitetura
%    5.2 Objetivos Específicos
%     - Mapear User Stories
%     - Propor topologia replicavel em Docker
%     - Descrever Pipe de consulta STT -> MCP -> RAG -> LLM -> Estados de cosnutla
%     - Descrever Riscos locais e solucoes de miticacao com anonimizacao e api externa
%     - Descrever Riscos de conduta por ia e mitigacao por RAG, temeratura e revisao humana.
% 6. Referencial Teórico
%   - rag, mcp, lgpd, comparacao com 2 projetos similares em blocos de paragrafos ou subsecoes curtas
%   - tabela comparativa com 2 projetos similares
% 7. Arquitetura do sistema
%   - pipelines e diagramas uml
%   - mcp e tooling, como mcp gerencia o contexto sem persistencia de dados sensiveis e com tecnicas de seguranca (prompt shelding e sandboxing)
%   - descrever o chunking semantico e reraking local
%   - lgpd, human-in-the-loop
% 8. Materiais, Métodos e Metodologia
%   - dsr, definicao ground truth, ragas, goms
%   - descricao dos 20 casos sinteticos
%   - definicao de matematica das metricas, precision, recall, f1
% 9. Implementações, testes, e resultados preliminares
% 10. Resultados e Análise
%   - tabelas de f1, latencia, taxa de vazamento pii
% 11. Discussao
%   - limitacoes, riscos residuais, calibracao de confianca e proximos passos
%   - G1 - latencia vs quantizacao
%   - G2 - f1 score do rag em tamanhos de contexto
%   - discussao de seguranca dos testes de estresse do NER-PII
% 12. Conclusao
%   - retomada dos objetivos e resultados
%   - afimar viabilidade do projeto em locais de baixa conectividade, hardware limitado e alta privacidade
%   - Perspectivas (contribuicoes, viabilidade, proximos passos, trabalhos futuros)
