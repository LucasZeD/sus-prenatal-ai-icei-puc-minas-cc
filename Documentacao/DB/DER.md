## 1. Núcleo de Identificação e Segurança (PII)
A arquitetura utiliza uma estratégia de segregação de dados para conformidade com a LGPD, separando identificadores diretos de dados clínicos.

### Tabela: `PACIENTE`
Armazena o perfil clínico e social da gestante.
* **PK:** `id` (UUID)
* `nome_mascarado` (VARCHAR(50))
* `nome_social` (VARCHAR(50))
* `data_cadastro` (Timestamp)
* `data_nascimento` (Date)
* `etnia` (Enum) [Branca, Preta, Parda, Amarela, Indígena]
* `escolaridade` (Enum)
* `estado_civil` (Enum)
* `ocupacao` (VARCHAR(50))
* `abo_rh` (Enum) - [A,B,AB,O] [+,-]
* `telefone` (String)
* `email` (String)
* `localizacao` (String)
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
* `dpp-eco` (Date)
* `ig_inicial` (Int)
* `tipo_risco` (String)
* `tipo_gravidez` (Enum) [unica, gemelar, tripla ou mais, ignorada]
* `idade_gestac_confirmada` (Int)
* `is_planejada` (Boolean)
* `is_visita_maternidade` (Boolean)
* `is_ativa` (Boolean) — **regra**: somente 1 gestação ativa por gestante
* `is_colocar_diu` (Boolean)
* `is_fez_consulta_odontologica` (Boolean)
* `is_gestacao_risco` (Boolean)
* `suplementacao_ferro` (Boolean)
* `suplementacao_acido_folico` (Boolean)
* `concluida_em` (Timestamp) — preenchido automaticamente ao registrar desfecho (nascimento) ou consulta de puerpério

### Tabela: `ANTECEDENTES`
* **PK/FK:** `gestacao_id` (UUID) -> `GESTACAO`
* #### Antecedentes familiares
* `is_diabetes_familiar` (Boolean)
* `is_hipertensao_familiar` (Boolean)
* `is_gravidez_gemelar_familiar` (Boolean)
* #### Gestacoes
* `n_gestas_anteriores` (Int)
* `n_partos` (Int)
* `n_parto_prematuro` (Int)
* `n_abortos` (Int)
* `n_nascidos_vivos` (Int)
* `n_vivem` (Int)
* `n_mortos_primeira_semana` (Int)
* `n_mortos_apos_primeira_semana` (Int)
* `n_nascidos_mortos` (Int)
* `n_cesarea` (Int)
* `n_bebe_menos_dois_kilos_e_meio` (Int)
* `n_bebe_mais_quatro_kilos_e_meio` (Int)
* `is_gesta_ectopica` (Boolean)
* #### Antecedentes clinicos obstetricos
* `is_diabetes_gestacional_antecedente` (Boolean)
* `is_infeccao_urinaria_antecedente` (Boolean)
* `is_infertilidade_antecedente` (Boolean)
* `is_dificuldade_alimentar_antecedente` (Boolean)
* `is_cardiopatia_antecedente` (Boolean)
* `is_tromboembolismo_antecedente` (Boolean)
* `is_hipertensao_arterial_antecedente` (Boolean)
* `is_cirurgia_pelvica_uterina_antecedente` (Boolean)
* `is_cirugia_antecedente` (Boolean)
* #### Gestacao atual
* `is_fumo` (Boolean)
* `is_alcool` (Boolean)
* `is_drogas` (Boolean)
* `is_violencia_domestica` (Boolean)
* `is_hiv` (Boolean)
* `is_toxoplasmose` (Boolean)
* `is_infeccao_urinaria` (Boolean)
* `is_anemia` (Boolean)
* `is_inc_istmocervical` (Boolean)
* `is_ameaca_de_parto_prematuro` (Boolean)
* `is_isoimunizacao_rh` (Boolean)
* `is_oligo_polidramnio` (Boolean)
* `is_ruptura_prem_membranas` (Boolean)
* `is_cirurgia_uterina` (Boolean)
* `is_posdatismo` (Boolean)
* `is_febre_na_gestacao` (Boolean)
* `is_hipertensao_arterial` (Boolean)
* `is_preeclampsia` (Boolean)
* `is_cardiopatia` (Boolean)
* `is_diabetes_gestacional` (Boolean)
* `is_uso_insulina` (Boolean)
* `is_hemorragia_1_trimestre` (Boolean)
* `is_hemorragia_2_trimestre` (Boolean)
* `is_hemorragia_3_trimestre` (Boolean)
* `is_exantema` (Boolean)
* `is_tromboembolismo` (Boolean)
* `is_infertilidade` (Boolean)
* `is_cirurgia_pelvica_uterina` (Boolean)
* `is_final_gestacao_anterior_1_ano` (Boolean)
* `is_sifilis` (Boolean)
* `tratamento_sifilis_dose_1` (Date)
* `tratamento_sifilis_dose_2` (Date)
* `tratamento_sifilis_dose_3` (Date)

### Tabela: `VACINA`
* **PK:** `id` (UUID)
* **FK:** `paciente_id` (UUID) -> `PACIENTE`
* `tipo` (Enum) [Antitetanica, Hepatite b, influenza, Virus Sincicial Respiratório, tríplice viral, febre amarela, Outras]
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
* `peso` (Float)
* `pa_sistolica` (Float)
* `pa_diastolica` (Float)
* `altura_uterina` (Int) [X CM]
* `bfc` (Int)
* `mov_fetal` (Boolean) [Presente, Ausente]
* `apresentacao_fetal` (Enum) [cefalico, pelvico, obliqua, trasnversa]
* `queixa` (String)
* `conduta` (String)
* `ig_dum` () [X Semanas X Dias]
* `ig_usg` () [X Semanas X Dias]
* `is_edema` (Boolean)
* `is_exantema` (Boolean) [Presente, Ausente]

### Tabela: `EXAME`
Centraliza resultados laboratoriais com criptografia.
* **PK:** `id` (UUID)
* **FK:** `paciente_id` (UUID) -> `PACIENTE`
* `tipo` (Enum) [ABO-RH, Glicemia Jejum, Teste Oral Tolerancia Glicose, Sifilis, VDRL, HIV, Hepatite B, Toxoplasmosoe, Hemoglobina, UrinaEAS, UrinaCultura, CoombsIndireto,Eletroforese Hemoglobina, Coombs, Outros]
* `resultado_criptografado` (String)
* `trimestre` (Int)
* `valor` (String)
* `is_alterado` (Boolean)
* `data_coleta` (Date)
* `coombs` (String)
* `categoria_sensibilidade` (Enum)

### Tabela: `EXAME_IMAGEM_USG`
* **PK:** `id` (UUID)
* **FK:** `gestacao_id` (UUID) -> `GESTACAO`
* `data_exame` (Date)
* `ig_dum` (Int) [X Semanas X Dias]
* `ig_usg` (Int) [X Semanas X Dias]
* `peso_fetal_estimado` (Float)
* `localizacao_placenta` (String)
* `is_liquido_amniotico_normal` (Boolean)
* `outros` (String)

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