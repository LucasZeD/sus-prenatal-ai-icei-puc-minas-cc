Esta análise técnica detalha a arquitetura de interface e a experiência do usuário (UX/UI) do sistema **Conecte Mãe**, estruturada para orientar uma implementação via IA de alta fidelidade. O design segue uma abordagem **Mobile-First Responsiva**, com foco em redução de carga cognitiva para profissionais de saúde.

---

## 1. Identidade Visual e Fundamentos de Design

* **Paleta de Cores:**
    * **Primária:** Rosa Pastel (`#F8BBD0` ou similar) — evocando o tema maternal e saúde humanizada. Utilizada em barras laterais, botões de ação secundária e áreas de destaque (sidebar de IA).
    * **Fundo:** Branco Puro (`#FFFFFF`) e Cinza Ultraleve (`#F9FAFB`) para superfícies de cards, garantindo contraste para leitura.
    * **Tipografia:** Sans-serif (preferencialmente **Inter** ou **Roboto**). Pesos variados para hierarquia: *Bold* para nomes de pacientes e títulos de seções; *Regular/Light* para rótulos de campos de formulário.
* **Componentização:** Uso de **Cards com bordas arredondadas** (Radius: `12px` a `16px`) e sombras sutis (*Soft Shadows*) para criar profundidade sem poluição visual.

---

## 2. Arquitetura de Layout (Wireframe Analysis)

### A. Estrutura Global (Shell)
O sistema utiliza um layout de três colunas flexíveis:
1.  **Sidebar de Navegação (Esquerda):** Fixa, contendo o Logotipo, links de navegação (Home, Pacientes, Configurações) e botão de Log out na base.
2.  **Área de Conteúdo Principal (Centro):** Onde o prontuário e listas residem. Largura fluida.
3.  **Assistente de IA "Lívia" (Direita):** Uma barra lateral contextual (drawer) para interação via chat RAG (Retrieval-Augmented Generation).

### B. Fluxo de Listagem (`/pacientes`)
* **Cabeçalho:** Barra de busca centralizada com ícone de lupa.
* **Cards de Pacientes:** Exibição em lista vertical. Cada card contém: Nome (Destaque), Idade, Idade Gestacional e Status de Risco.
* **Design Pattern:** *Information Chunking* — apenas os dados vitais são expostos antes do clique.

### C. Prontuário e Escriba Digital (`/pacientes/[id]`)
O design do prontuário simula a "Caderneta da Gestante", mas de forma digitalizada e expansível.
* **Seção de Identificação:** Dados demográficos organizados em grid de 3 colunas.
* **Timeline de Consultas:** Cards numerados (Consulta 1, 2, etc.).
* **Mecanismo de Expansão:** Uso de *Accordions* para esconder consultas passadas e focar na atual, otimizando o scroll vertical.

---

## 3. Especificações do Módulo de IA (Escriba e Lívia)

### Escriba Digital (Interface de Transcrição)
1.  **Estado Ativo (Recording):** Um componente de feedback visual (onda sonora ou ícone pulsante) e botões de "Pausar" e "Finalizar".
2.  **Estado de Revisão (Post-Processing):** Esta é a parte mais crítica. A IA deve mapear o áudio para um formulário estruturado.
    * **UI de Validação:** O profissional vê os campos (Peso, Edema, PA, etc.) pré-preenchidos pela IA em campos de input editáveis.
    * **Segurança de Dados:** Nenhum dado é salvo no DB antes da "Confirmação de Dados da Consulta" pelo humano (Human-in-the-loop).

### Lívia (Agente RAG)
* **Interface de Chat:** Localizada à direita, com sugestões de perguntas baseadas no contexto clínico atual (ex: "Baseado na PA de 14/9 mmHg...").
* **Output:** As respostas devem obrigatoriamente citar fontes (Manuais do Ministério da Saúde/FEBRASGO), conforme sua diretriz de evitar alucinações.

---

## 4. Requisitos Técnicos para Implementação

Para garantir um design limpo e gerenciável (Clean Design):

* **Frontend Stack Recomendada:**
    * **Next.js 14+ (App Router):** Para roteamento robusto.
    * **Tailwind CSS:** Para estilização utilitária e rápida manutenção da paleta de cores.
    * **Shadcn/UI:** Para componentes de acessibilidade (Dialogs, Accordions, Cards).
    * **Lucide React:** Para iconografia consistente.
* **Estratégia de Segurança (Production-Ready):**
    * **Sanitização de Inputs:** Rigorosa em todos os campos do Escriba.
    * **Criptografia:** Dados sensíveis de pacientes (CPF, NIS, Cartão SUS) devem ser criptografados *at rest*.
    * **LGPD:** Implementar logs de auditoria para cada acesso ao prontuário.

---

## 5. Referências de Design de Mercado
Para validar estas escolhas, recomendo o estudo dos seguintes padrões de design utilizados por grupos líderes em HealthTech:
* **Carbon Design System (IBM Health):** Pelo uso eficiente de densidade de dados em telas médicas.
* **Material Design 3 (M3):** Pelo sistema de "Cards" e estados de botões flutuantes.
* **Oscar Health UI:** Referência em como tornar interfaces de saúde acolhedoras (Pink/Pastel tones) sem perder o profissionalismo.

> **Análise Skeptical:** O maior risco deste design é o "over-reliance" (excesso de confiança) na automação do Escriba. A interface de confirmação (EscribaConfirmar.png) deve ter destaques visuais (ex: cores diferentes) para campos onde a IA teve baixa confiança na transcrição, forçando a revisão humana.

Deseja que eu detalhe a estrutura de tipos (TypeScript) para os objetos de `Consulta` que a IA deverá preencher?