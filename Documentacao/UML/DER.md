## 1. Núcleo de Identificação e Segurança (PII)

A arquitetura utiliza uma estratégia de segregação de dados para conformidade com a LGPD, separando identificadores diretos de dados clínicos.

### Tabela: `PACIENTE`
Armazena o perfil clínico e social da gestante.
* **PK:** `id` (UUID)
* `nome_mascarado` (VARCHAR50)
* `nome_social` (VARCHAR50)
* `data_cadastro` (Timestamp)
* `data_nascimento` (Date)
* `etnia` (Enum)
* `escolaridade` (Enum)
* `estado_civil` (Enum)
* `ocupacao` (VARCHAR50)
* `altura` (Float)
* `peso_pre_gestacional` (Float)

### Tabela: `PACIENTE_IDS`
Contém os identificadores sensíveis (hashes).
* **PK:** `id` (UUID)
* **FK:** `paciente_id` (UUID) -> `PACIENTE`
* `cartao_sus_hash` (String)
* `cpf_hash` (String)

---

## 2. Ciclo de Gestação e Antecedentes

Estrutura para mapear o histórico obstétrico e o progresso da gestação atual.

### Tabela: `GESTACAO`
* **PK:** `id` (UUID)
* **FK:** `paciente_id` (UUID) -> `PACIENTE`
* `dum` (String/LMP)
* `dpp` (String/EDD)
* `ig_inicial` (Int)
* `tipo_risco` (String)
* `abo_rh` (String)
* `coombs` (String)
* `tipo_gravidez` (Enum)
* `idade_gestac_confirmada` (Int)
* `is_planejada` (Enum)

### Tabela: `ANTECEDENTES`
* **FK:** `gestacao_id` (UUID) -> `GESTACAO`
* `gestas_previas` (Int)
* `partos` (Int)
* `abortos` (Int)
* `is_hipertensao` (Boolean)
* `diabetes` (Int)
* `is_fumo` (Boolean)
* `is_alcool` (Boolean)
* `is_drogas` (Boolean)
* `is_cardiopatia` (Boolean)
* `is_tromboembolismo` (Boolean)
* `is_infertilidade` (Boolean)
* `is_isoimunizacao_rh` (Boolean)
* `is_cirurgia_pelvica_uterina` (Boolean)

---

## 3. Eventos Clínicos e Acompanhamento

Mapeamento das consultas, exames e intervenções odontológicas.

### Tabela: `CONSULTA`
* **PK:** `id` (UUID)
* **FK:** `gestacao_id` (UUID) -> `GESTACAO`
* **FK:** `unidade_id` (UUID) -> `UNIDADE`
* `data` (Date)
* `peso` (Float)
* `pa_sistolica` / `pa_diastolica` (Float)
* `au` (Float - Altura Uterina)
* `bfc` (Float - Batimentos Fetais)
* `is_edema` (Boolean)
* `mov_fetal` (String)
* `apresentacao_fetal` (Enum)
* `queixa` (String)
* `enxantema` (Boolean)
* `is_visita_maternidade` (Boolean)
* `is_particip_atvd_educativa` (Boolean)

### Tabela: `EXAME`
Centraliza resultados laboratoriais com criptografia.
* **PK:** `id` (UUID)
* **FK:** `paciente_id` (UUID) -> `PACIENTE`
* `tipo` (Enum)
* `resultado_criptografado` (String)
* `trimestre` (Int)
* `valor` (String)
* `is_alterado` (Boolean)
* `data_coleta` (Date)
* `categoria_sensibilidade` (Enum)

---

## 4. Camada de Inteligência Artificial e Auditoria

Tabelas projetadas para suportar modelos de Responsible AI e rastreabilidade.

### Tabela: `CONSULTA_IA`
* **FK:** `consulta_id` (UUID) -> `CONSULTA`
* `transcricao_efemera_id` (String)
* `sugestao_conduta` (String)
* `risco_calculado` (String)
* `modelo_versao` (String)
* `justificativa_risco` (String)
* `is_sugestao_aceita` (Boolean)

---

## 5. Desfecho e Pós-Parto

Mapeamento final da ficha perinatal e acompanhamento puerperal.

### Tabela: `DESFECHO_GESTACAO`
* **FK:** `gestacao_id` (UUID) -> `GESTACAO`
* **FK:** `unidade_id` (UUID) -> `UNIDADE`
* `tipo_parto` (String)
* `is_indicacao_cesarea` (Boolean)
* `peso_nascimento` (Float)
* `is_reanimacao` (Boolean)
* `sexo` (Int)
* `is_laceracao` (Boolean)
* `grau_laceracao` (String)
* `apgar_1_minuto` / `apgar_5_minuto` (String)

### Tabela: `CONSULTA_POS_PARTO`
Mapeia a consulta de puerpério (até 42 dias).
* **PK:** `id` (UUID)
* **FK:** `gestacao_id` (UUID) -> `GESTACAO`
* `data` (Date)
* `avaliacao_amamentacao` (String)
* `involucao_uterina` (String)
* `metodo_contraceptivo` (String)

---

## Análise de Engenharia de Dados (Abordagem Cética)

1.  **Segurança de Dados Sensíveis:** O uso de `categoria_sensibilidade` em `EXAME` é fundamental para filtrar quais dados a IA pode processar sem violar restrições éticas de diagnósticos estigmatizantes (ex: HIV/VDRL).
2.  **Referencial de Unidade:** A inclusão de `unidade_id` em `DESFECHO_GESTACAO` resolve a falha de rastrear onde o parto ocorreu, permitindo análises de fluxo entre Unidades Básicas e Maternidades.
3.  **Auditabilidade:** A tabela `LOGS` conectada à `CONSULTA` garante o registro de alterações em sinais vitais, essencial para auditoria médica em casos de pré-eclampsia não detectada.
4.  **Lacunas Clínicas Preenchidas:** A inclusão de `enxantema` e `queixa` aproxima o banco de dados do uso real no ambulatório, capturando a subjetividade da paciente necessária para modelos de IA mais precisos.