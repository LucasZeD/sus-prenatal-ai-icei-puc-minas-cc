# Prenatal Digital: Inteligência Artificial Local e RAG na Caderneta da Gestante

Este projeto consiste em uma plataforma fullstack projetada para a digitalização da Caderneta da Gestante do SUS, transformando o registro físico em um ecossistema de dados estruturados focado em privacidade governamental. 

O sistema utiliza um **Escriba Digital** offline (Faster-Whisper) para transcrição de consultas e um **Agente de IA Local** (Ollama) com RAG (Retrieval-Augmented Generation) que consome protocolos oficiais do Ministério da Saúde para auxiliar profissionais de saúde em tempo real. Toda a arquitetura foi desenhada em cima da ótica de **Zero Trust** e **Privilégio Mínimo**, onde regras de infraestrutura garantem que LLMs não exponham dados médicos sigilosos através do uso de um **Servidor MCP** (Model Context Protocol) como sidecar de limpeza algorítmica.

O objetivo central é reduzir a carga cognitiva do profissional de saúde e aumentar a segurança clínica da paciente, garantindo que as condutas recomendadas estejam alinhadas com as evidências científicas mais recentes (Cartilha do SUS 8ª Edição). O envio de recomendações ao longo das semanas via WhatsApp é tratado como módulo complementar (Plus).

## Tabela de Conteúdos
* [Especificação de Requisitos e User Stories](Documentacao/Especificacao.md) 

* [Arquitetura e SecOps](Documentacao/Arquitetura.md) 

* [Artigo Científico](Documentacao/Artigo/TCC-2_04-2026/TCC_2_PC2.pdf)

## Integrantes

### Alunos integrantes da equipe

* [Lucas Zegrine Duarte](https://www.linkedin.com/in/lucas-zegrine/)

### Professores responsáveis

* [Humberto (Torres) Marques-Neto](https://www.linkedin.com/in/humbertotmarques/)

## Instruções de utilização

Este sistema utilizará uma arquitetura em camadas focada em infraestrutura Docker, orquestrando aplicações Frontend (SPA), Backend (Hub), Nginx e os motores locais de IA.

1. **Clonar o repositório:**
   `git clone https://github.com/LucasZeD/projeto-prenatal.git`

2. **Seguir o Tutorial Técnico de Instalação e Configuração:**