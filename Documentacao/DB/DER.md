## 1. Núcleo de Identificação e Segurança (PII)
A arquitetura utiliza uma estratégia de segregação de dados para conformidade com a LGPD, separando identificadores diretos de dados clínicos.

### Tabela: `PACIENTE`
Armazena o perfil clínico e social da gestante.
* **PK:** `id` (UUID)
* `nome_mascarado` (VARCHAR(50))
* `nome_social` (VARCHAR(50))
* `data_cadastro` (Timestamp)
* `data_nascimento` (Date)
* `etnia` (Enum)
* `escolaridade` (Enum)
* `estado_civil` (Enum)
* `ocupacao` (VARCHAR(50))
* `altura` (Float)
* `peso_pre_gestacional` (Float)
* `is_particip_atvd_educativa` (Boolean)

#### Tabela: `PACIENTE_IDS`
Contém os identificadores sensíveis (hashes).
* **PK:** `id` (UUID)
* **FK:** `paciente_id` (UUID) -> `PACIENTE`
* `cartao_sus_hash` (VARCHAR(64))
* `cpf_hash` (VARCHAR(64))

### Tabela: `PARCEIRO`
Mapeia os dados básicos e exames rápidos do parceiro.
* **PK/FK:** `paciente_id` (UUID) -> `PACIENTE`
* `nome` (String)
* `vdrl` (String)
* `hiv` (String)

---

## 2. Estrutura Operacional

Mapeia a infraestrutura física e os profissionais envolvidos no atendimento.

### Tabela: `UNIDADE`
* **PK:** `id` (UUID)
* `endereco` (String)
* `telefone` (String)

### Tabela: `PROFISSIONAL`
* **PK:** `id` (UUID)
* **FK:** `unidade_id` (UUID) -> `UNIDADE`
* `nome` (String)
* `email` (String) - *Unique*
* `senha_hash` (VARCHAR(255))
* `registro` (VARCHAR(50))

---

## 3. Ciclo de Gestação e Antecedentes
Estrutura para mapear o histórico obstétrico e o progresso da gestação atual.

### Tabela: `GESTACAO`
* **PK:** `id` (UUID)
* **FK:** `paciente_id` (UUID) -> `PACIENTE`
* `dum` (Date) 
* `dpp` (Date) 
* `ig_inicial` (Int)
* `tipo_risco` (String)
* `abo_rh` (String)
* `coombs` (String)
* `tipo_gravidez` (Enum)
* `idade_gestac_confirmada` (Int)
* `is_planejada` (Boolean)
* `is_visita_maternidade` (Boolean)

### Tabela: `ANTECEDENTES`
* **PK/FK:** `gestacao_id` (UUID) -> `GESTACAO`
* `gestas_previas` (Int)
* `partos` (Int)
* `abortos` (Int)
* `is_hipertensao` (Boolean)
* `is_diabetes` (Boolean)
* `is_fumo` (Boolean)
* `is_alcool` (Boolean)
* `is_drogas` (Boolean)
* `is_cardiopatia` (Boolean)
* `is_tromboembolismo` (Boolean)
* `is_infertilidade` (Boolean)
* `is_isoimunizacao_rh` (Boolean)
* `is_cirurgia_pelvica_uterina` (Boolean)

### Tabela: `VACINA`
* **PK:** `id` (UUID)
* **FK:** `paciente_id` (UUID) -> `PACIENTE`
* `tipo` (String)
* `data` (Date)
* `data_aprazada` (Date)

---

## 4. Eventos Clínicos e Acompanhamento
Mapeamento das consultas, exames e intervenções odontológicas.

### Tabela: `CONSULTA`
* **PK:** `id` (UUID)
* **FK:** `gestacao_id` (UUID) -> `GESTACAO`
* **FK:** `unidade_id` (UUID) -> `UNIDADE`
* `data-hora` (DateTime)
* `idade_gestacional` (Int)
* `peso` (Float)
* `pa_sistolica` (Float)
* `pa_diastolica` (Float)
* `au` (Float)
* `bfc` (Float)
* `mov_fetal` (String)
* `apresentacao_fetal` (Enum)
* `queixa` (String)
* `is_edema` (Boolean)
* `is_exantema` (Boolean)

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

### Tabela: `EXAME_IMAGEM_USG`
* **PK:** `id` (UUID)
* **FK:** `gestacao_id` (UUID) -> `GESTACAO`
* `peso_fetal_estimado` (Float)
* `localizacao_placenta` (String)
* `idade_gestacional_usg` (Int)
* `is_liquido_amniotico_normal` (Boolean)

### Tabela: `AVALIACAO_ODONTO`
* **PK/FK:** `gestacao_id` (UUID) -> `GESTACAO`
* `anotacoes` (String)
* `is_alta` (Boolean)
* `is_sangramento_gengival` (Boolean)
* `is_carie_detectada` (Boolean)

### Tabela: `PLANO_PARTO`
* **PK/FK:** `gestacao_id` (UUID) -> `GESTACAO`
* `acompanhante_nome` (String)
* `posicao_parto_pref` (Enum)
* `anestesia_alivio_dor` (Enum)
* `is_deseja_doula` (Boolean)

---

## 5. Camada de Inteligência Artificial e Auditoria
Tabelas projetadas para suportar modelos de Responsible AI e rastreabilidade.

### Tabela: `CONSULTA_IA`
* **FK:** `consulta_id` (UUID) -> `CONSULTA`
* `transcricao_efemera_id` (String)
* `sugestao_conduta` (String)
* `risco_calculado` (String)
* `modelo_versao` (String)
* `justificativa_risco` (String)
* `is_sugestao_aceita` (Boolean)

### Tabela: `LOGS`
Fundamental para auditoria de eventos e tracking de mudanças nos dados clínicos (Event Sourcing simplificado).
* **PK:** `id` (UUID)
* **FK:** `consulta_id` (UUID) -> `CONSULTA`
* `tipo_evento` (Enum)
* `valor_anterior` (String)
* `valor_novo` (String)
* `timestamp` (Timestamp)

---

## 6. Desfecho e Pós-Parto
Mapeamento final da ficha perinatal e acompanhamento puerperal.

### Tabela: `DESFECHO_GESTACAO`
* **PK:** `id` (UUID)
* **PK/FK:** `gestacao_id` (UUID) -> `GESTACAO`
* **FK:** `unidade_id` (UUID) -> `UNIDADE`
* `tipo_parto` (String)
* `peso_nascimento` (Float)
* `sexo` (Enum)
* `grau_laceracao` (String)
* `apgar_1_minuto` (Int)
* `apgar_5_minuto` (Int)
* `is_indicacao_cesarea` (Boolean)
* `is_reanimacao` (Boolean)
* `is_laceracao` (Boolean)

### Tabela: `CONSULTA_POS_PARTO`
Mapeia a consulta de puerpério.
* **PK:** `id` (UUID)
* **FK:** `gestacao_id` (UUID) -> `GESTACAO`
* `data` (Date)
* `avaliacao_amamentacao` (String)
* `involucao_uterina` (String)
* `metodo_contraceptivo` (String)

---

## 7. Análise de Engenharia de Dados (Abordagem Cética)

1.  **Segurança de Dados Sensíveis:** O uso de `categoria_sensibilidade` em `EXAME` é fundamental para filtrar quais dados a IA pode processar sem violar restrições éticas de diagnósticos estigmatizantes (ex: HIV/VDRL).
2.  **Referencial de Unidade:** A inclusão de `unidade_id` em `DESFECHO_GESTACAO` resolve a falha de rastrear onde o parto ocorreu, permitindo análises de fluxo entre Unidades Básicas e Maternidades.
3.  **Auditabilidade:** A tabela `LOGS` conectada à `CONSULTA` garante o registro de alterações em sinais vitais, essencial para auditoria médica em casos de pré-eclampsia não detectada.
4.  **Lacunas Clínicas Preenchidas:** A inclusão de `enxantema` e `queixa` aproxima o banco de dados do uso real no ambulatório, capturando a subjetividade da paciente necessária para modelos de IA mais precisos.