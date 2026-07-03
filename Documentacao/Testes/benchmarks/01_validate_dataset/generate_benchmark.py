#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate prenatal_sus_benchmark.csv with 110 grounded QA rows."""
from __future__ import annotations

import csv
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "lib"))
from paths import BENCHMARK_CSV, CORPUS_EXTRACTED  # noqa: E402

OUT = BENCHMARK_CSV
EXTRACTED = CORPUS_EXTRACTED
HEADER = [
    "question_id", "topic_pt", "source_document", "difficulty", "question_pt",
    "answer_evaluation_mode", "expected_phrases_pt", "gold_answer_short_pt",
    "must_not_contain_pt", "notes_scoring_pt",
]
DOC_STEM = {
    "CadernetaGestante_8ed_rev_2024.pdf": "CadernetaGestante_8ed_rev_2024",
    "ManualGestacaoAltoRisco_2022.pdf": "ManualGestacaoAltoRisco_2022",
    "GestacaoAltoRisco_2010.pdf": "GestacaoAltoRisco_2010",
    "GuiaDeAtencaoSaudeDaGestante_CriteriosParaEstratificacaoDeRiscoAcompanhamentoDaGestante_2024.pdf": "GuiaDeAtencaoSaudeDaGestante_CriteriosParaEstratificacaoDeRiscoAcompanhamentoDaGestante_2024",
    "GuiaDoPreNatal_PuerperioNaAtencaoPrimariaSaude_2024.pdf": "GuiaDoPreNatal_PuerperioNaAtencaoPrimariaSaude_2024",
    "CartilhaDaGestante.pdf": "CartilhaDaGestante",
    "CadernosDeAtencaoBasica_AtencaoAoPreNatalDeBaixoRisco_2012.pdf": "CadernosDeAtencaoBasica_AtencaoAoPreNatalDeBaixoRisco_2012",
    "GuiaPreNatalDoParceiro_ProfissionaisSaude_2023.pdf": "GuiaPreNatalDoParceiro_ProfissionaisSaude_2023",
    "GuiaReferenciaRapida_AtencaoAoPreNatalParaGestantesDeBaixoRisco_ProfissionaisSaude_2013.pdf": "GuiaReferenciaRapida_AtencaoAoPreNatalParaGestantesDeBaixoRisco_ProfissionaisSaude_2013",
    "FichaPerinatal-Ambulatorio.pdf": "FichaPerinatal-Ambulatorio",
    "CadernoDeAtencaoAoPreNatal_RiscoHabitual_.pdf": "CadernoDeAtencaoAoPreNatal_RiscoHabitual_",
    "ManualTecnico_GestacaoAltoRisco.pdf": "ManualTecnico_GestacaoAltoRisco",
    "ManualTecnico_PrenatalPuerperio.pdf": "ManualTecnico_PrenatalPuerperio",
    "CadernetaGestante_3ed_2016.pdf": "CadernetaGestante_3ed_2016",
    "GuiaPreNatalDoParceiro_ProfissionaisSaude_2018.pdf": "GuiaPreNatalDoParceiro_ProfissionaisSaude_2018",
    "CadernetaGestante_ANS.pdf": "CadernetaGestante_ANS",
    "ManualTecnico_OficinaAtualizacaoEmPreNatal_ProfissionaisAtencaoBasica_2014.pdf": "ManualTecnico_OficinaAtualizacaoEmPreNatal_ProfissionaisAtencaoBasica_2014",
}
RAW: list[tuple[str, ...]] = []

def norm(text: str) -> str:
    t = unicodedata.normalize("NFD", text.lower())
    return "".join(c for c in t if unicodedata.category(c) != "Mn")

def load_extracted(doc_pdf: str) -> str:
    return (EXTRACTED / f"{DOC_STEM[doc_pdf]}.txt").read_text(encoding="utf-8")

def verify_row(row: tuple[str, ...]) -> None:
    _topic, doc, _diff, _q, mode, phrases, _gold, _mn, _notes, _tag = row
    if mode in ("boolean_exact", "human_judge"):
        return
    text = norm(load_extracted(doc))
    parts = [p.strip() for p in phrases.split(";") if p.strip()]
    if mode == "contains_all":
        missing = [p for p in parts if norm(p) not in text]
    elif mode == "contains_any":
        missing = [] if any(norm(p) in text for p in parts) else parts
    else:
        missing = []
    if missing:
        raise ValueError(f"Missing phrases in {doc}: {missing[:3]}")

def q(*args: str) -> None:
    RAW.append(args)



q("Telefones úteis Samu", "CadernetaGestante_8ed_rev_2024.pdf", "easy", "Qual o número do Samu informado na caderneta da gestante (8ª edição revisada 2024)?", "contains_all", "Samu: 192", "Na seção de telefones úteis consta Samu: 192.", "", "", "list")
q("Telefones úteis SUS", "CadernetaGestante_8ed_rev_2024.pdf", "easy", "Qual o número da Ouvidoria-Geral do SUS na caderneta 2024?", "contains_all", "Ouvidoria-Geral do SUS: 136", "A Ouvidoria-Geral do SUS é o 136.", "", "", "list")
q("Direito acompanhante parto", "CadernetaGestante_8ed_rev_2024.pdf", "easy", "Qual lei federal a caderneta 2024 cita para o direito ao acompanhante no parto no SUS?", "contains_all", "Lei Federal nº 11.108/2005", "A Lei Federal nº 11.108/2005 garante às parturientes o direito a um acompanhante durante o trabalho de parto, parto e pós-parto imediato no SUS.", "", "", "literal")
q("Licença-maternidade dias", "CadernetaGestante_8ed_rev_2024.pdf", "easy", "Quantos dias de licença-maternidade a caderneta 2024 menciona para gestantes com carteira assinada?", "contains_all", "120 (cento e vinte) dias", "A caderneta prevê licença-maternidade de 120 (cento e vinte) dias.", "", "", "gestante_pro")
q("Vacina dTpa semana gestação", "CadernetaGestante_8ed_rev_2024.pdf", "medium", "A partir de qual semana de gestação a 1ª dose da vacina dTpa deve ser tomada, segundo a caderneta 2024?", "contains_all", "partir da 20ª semana", "A vacina dTpa deve ter a 1ª dose tomada a partir da 20ª semana de gravidez.", "", "", "sequential")
q("Esquema dT e dTpa gestante", "CadernetaGestante_8ed_rev_2024.pdf", "medium", "Como a caderneta 2024 descreve o esquema de três doses contra tétano e difteria na gestante?", "contains_all", "doses com a vacina dT;vacina dTpa", "O esquema é de três doses: duas com dT e uma com dTpa.", "", "", "sequential")
q("Vacina influenza gestação", "CadernetaGestante_8ed_rev_2024.pdf", "medium", "Até quantos dias após o parto a caderneta 2024 recomenda vacina influenza para a mulher?", "contains_all", "até 42 dias após o parto", "A vacina influenza é recomendada em qualquer idade gestacional e até 42 dias após o parto, na campanha anual.", "", "", "vacina")
q("Vacina hepatite B doses", "CadernetaGestante_8ed_rev_2024.pdf", "easy", "Quantas doses da vacina hepatite B a gestante não vacinada deve tomar, conforme a caderneta 2024?", "contains_all", "3 doses", "Se não vacinada contra hepatite B, deve tomar 3 doses o mais precocemente possível.", "", "", "vacina")
q("Sinais de alerta pressão", "CadernetaGestante_8ed_rev_2024.pdf", "medium", "Cite dois sinais de alerta listados na caderneta 2024 para procurar o serviço de saúde.", "contains_all", "a pressão estiver alta;sangramento ou perda de líquido", "Entre os sinais: pressão alta e sangramento ou perda de líquido pela vagina.", "", "", "alerta")
q("Sinais de alerta febre", "CadernetaGestante_8ed_rev_2024.pdf", "easy", "A caderneta 2024 orienta procurar saúde se houver febre associada a quais outros sintomas?", "contains_any", "dor de cabeça;dor no corpo;vermelhidão nos olhos;manchas vermelhas na pele", "Deve procurar serviço se apresentar febre com dor de cabeça, dor no corpo, vermelhidão nos olhos ou manchas vermelhas na pele.", "", "", "alerta")
q("Pré-natal do parceiro UBS", "CadernetaGestante_8ed_rev_2024.pdf", "easy", "Como a caderneta 2024 nomeia a estratégia de cuidado ao homem nas UBS durante a gestação da parceira?", "contains_all", "Pré-Natal do Parceiro", "Nas UBS os homens têm direito de cuidar de si e acompanhar parceiras na estratégia Pré-Natal do Parceiro.", "", "", "parceiro")
q("Agenda consultas pré-natal", "CadernetaGestante_8ed_rev_2024.pdf", "hard", "Quantos campos numerados de consulta de pré-natal (1ª a Nª) aparecem no cartão de agendamento da caderneta 2024, sem contar consultas odontológicas?", "human_judge", "14ª consulta", "O agendamento lista da 1ª à 14ª consulta de pré-natal.", "", "Contar linhas 1ª?14ª consulta no PDF; excluir odontológicas.", "list")
q("Gestante linguagem acessível dTpa", "CadernetaGestante_8ed_rev_2024.pdf", "easy", "Posso tomar a vacina contra coqueluche na gravidez? O que a caderneta 2024 diz sobre quando tomar a dTpa?", "contains_all", "partir da 20ª semana", "A vacina dTpa protege contra coqueluche e a 1ª dose deve ser a partir da 20ª semana.", "", "", "gestante_pro")
q("Sífilis penicilina única opção", "ManualGestacaoAltoRisco_2022.pdf", "hard", "No Manual de Gestação de Alto Risco 2022, a azitromicina substitui a penicilina para tratar sífilis na gestante?", "boolean_exact", "NÃO", "NÃO. A azitromicina não está recomendada na gestação; considera-se a penicilina o único antibiótico adequado para sífilis em gestantes.", "azitromicina substitui;eritromicina cura", "", "trap")
q("Alergia penicilina sífilis", "ManualGestacaoAltoRisco_2022.pdf", "medium", "Qual a conduta do manual 2022 para gestante com alergia a penicilina e sífilis?", "contains_all", "dessensibilização;tratamento com penicilina", "Recomenda-se dessensibilização e tratamento com penicilina em ambiente hospitalar.", "", "", "sequential")
q("Dose penicilina benzatina", "ManualGestacaoAltoRisco_2022.pdf", "hard", "Qual a dose de penicilina benzatina citada no manual 2022 para sífilis (em UI)?", "human_judge", "2.400.000 UI", "A dose de penicilina benzatina é 2.400.000 UI, em duas injeções de 1.200.000 UI.", "", "", "literal")
q("Intervalo doses sífilis", "ManualGestacaoAltoRisco_2022.pdf", "medium", "O manual 2022 permite intervalo maior que quantos dias entre doses de penicilina na gestante?", "contains_all", "não deve ultrapassar sete dias", "O intervalo entre doses não deve ultrapassar sete dias; se ocorrer, reinicia-se o esquema.", "", "", "sequential")
q("Alto risco sífilis resistente", "ManualGestacaoAltoRisco_2022.pdf", "medium", "O manual 2022 classifica sífilis resistente a penicilina benzatina em qual nível de risco?", "contains_all", "alto risco", "Sífilis resistente ao tratamento com penicilina benzatina é fator de alto risco.", "", "", "alto_risco")
q("Reação Jarisch-Herxheimer", "ManualGestacaoAltoRisco_2022.pdf", "easy", "O que o manual 2022 diz sobre reação de Jarisch-Herxheimer no tratamento da sífilis?", "contains_any", "Jarisch;Herxheimer", "O tratamento da sífilis pode desencadear reação de Jarisch-Herxheimer.", "", "", "reasoning")
q("Encaminhamento PNAR manual", "ManualGestacaoAltoRisco_2022.pdf", "medium", "Segundo o manual 2022, qual antibiótico é o único adequado para tratamento da sífilis em gestantes?", "contains_all", "único antibiótico adequado", "Considera-se a penicilina como o único antibiótico adequado para o tratamento da sífilis em gestantes.", "", "", "alto_risco")
q("Rastreamento sífilis gestante", "ManualGestacaoAltoRisco_2022.pdf", "easy", "O manual 2022 recomenda tratamento da sífilis na gestação com qual medicamento?", "contains_any", "penicilina", "O tratamento da sífilis na gestação deve ser realizado com penicilina.", "", "", "alerta")
q("Azitromicina gestação trap", "ManualGestacaoAltoRisco_2022.pdf", "hard", "Posso tratar sífilis na gravidez só com azitromicina 1 g VO porque é mais prático, conforme o manual MS 2022?", "boolean_exact", "NÃO", "NÃO. Apesar da facilidade posológica, a azitromicina não está recomendada para tratamento durante a gestação.", "azitromicina é suficiente;substituto seguro", "", "trap")
q("Doenças alto risco lista", "ManualGestacaoAltoRisco_2022.pdf", "hard", "Liste três condições infecciosas que o manual 2022 associa a gestação de alto risco.", "contains_all", "sífilis;toxoplasmose;HIV", "Entre as condições: sífilis (formas graves/resistentes), toxoplasmose aguda e HIV.", "", "", "list")
q("Hipertensão 140/90 manual 2022", "ManualGestacaoAltoRisco_2022.pdf", "medium", "Qual valor de pressão arterial o manual 2022 usa como referência para hipertensão na gestação?", "contains_all", "140/90", "Pressão arterial igual ou maior que 140/90 mmHg, pela média de medições.", "", "", "literal")
q("Tratamento definitivo sífilis sem parto", "ManualGestacaoAltoRisco_2022.pdf", "hard", "O manual 2022 considera cura definitiva da sífilis gestacional sem necessidade de penicilina parenteral?", "boolean_exact", "NÃO", "NÃO. A penicilina permanece o único antibiótico adequado para tratamento da sífilis em gestantes.", "cura definitiva sem penicilina;tratamento oral suficiente", "", "trap")
q("PA hipertensão 2010", "GestacaoAltoRisco_2010.pdf", "easy", "No documento Gestação de Alto Risco 2010, qual o limiar de pressão arterial para hipertensão?", "contains_all", "140/90mmHg", "Pressão arterial igual ou maior que 140/90 mmHg.", "", "", "alerta")
q("Síndromes hipertensivas 2010", "GestacaoAltoRisco_2010.pdf", "hard", "Quais síndromes hipertensivas o manual 2010 aborda no capítulo específico?", "contains_any", "pré-eclâmpsia;eclâmpsia;hipertensão crônica", "O capítulo trata classificação e conduta nas síndromes hipertensivas da gravidez.", "", "", "list")
q("Encaminhamento hemorrágica 2010", "GestacaoAltoRisco_2010.pdf", "hard", "O manual 2010 cita síndrome hemorrágica como critério de alto risco?", "human_judge", "Síndrome hemorrágica", "Síndrome hemorrágica ou hipertensiva é situação de alto risco.", "", "", "alto_risco")
q("Medição PA sentada 2010", "GestacaoAltoRisco_2010.pdf", "medium", "Como o manual 2010 orienta medir a pressão arterial na gestante?", "contains_all", "gestante sentada", "A pressão arterial deve ser mensurada com a gestante sentada, braço na altura do coração.", "", "", "sequential")
q("Pré-eclâmpsia sobreposta 2010", "GestacaoAltoRisco_2010.pdf", "hard", "O manual 2010 descreve pré-eclâmpsia sobreposta à hipertensão crônica?", "boolean_exact", "SIM", "SIM. Há seção específica sobre pré-eclâmpsia sobreposta à hipertensão crônica.", "", "", "reasoning")
q("Tratamento hipertensão aguda 2010", "GestacaoAltoRisco_2010.pdf", "medium", "O manual Gestação de Alto Risco 2010 possui seção de tratamento da hipertensão aguda?", "contains_all", "Tratamento da hipertensão aguda", "SIM, há capítulo de tratamento da hipertensão aguda.", "", "", "sequential")
q("Comparação edição PA 2010", "GestacaoAltoRisco_2010.pdf", "hard", "Conforme apenas o GestacaoAltoRisco_2010.pdf, a PA ?140/90 mmHg define hipertensão na gestação?", "boolean_exact", "SIM", "SIM, no documento de 2010 usa-se PA igual ou maior que 140/90 mmHg.", "manual 2022 diverge", "Usar somente PDF 2010.", "reasoning")
q("Alto risco HIV 2010", "GestacaoAltoRisco_2010.pdf", "hard", "A infecção por HIV na gestação é abordada no manual de alto risco 2010?", "contains_any", "HIV", "O manual de 2010 aborda condições infecciosas incluindo HIV na gestação.", "", "", "alto_risco")
q("Sinais encefalopatia 2010", "GestacaoAltoRisco_2010.pdf", "hard", "Cite dois sinais de encefalopatia hipertensiva listados no manual 2010.", "contains_all", "cefaleia;distúrbios visuais", "Incluem cefaleia e distúrbios visuais entre sinais de encefalopatia hipertensiva.", "", "", "alerta")
q("Classificação síndromes 2010", "GestacaoAltoRisco_2010.pdf", "easy", "O manual 2010 traz classificação das síndromes hipertensivas da gravidez?", "boolean_exact", "SIM", "SIM, há classificação das síndromes hipertensivas da gravidez.", "", "", "reasoning")
q("Edição 2010 vs 2022 penicilina", "GestacaoAltoRisco_2010.pdf", "hard", "Segundo somente o GestacaoAltoRisco_2010.pdf, a penicilina é citada no tratamento de sífilis?", "contains_any", "penicilina;sífilis", "O documento de 2010 aborda sífilis na gestação e tratamento com penicilina benzatina.", "azitromicina como primeira linha", "Não usar Manual 2022 nesta pergunta.", "reasoning")
q("Proporção risco habitual MG", "GuiaDeAtencaoSaudeDaGestante_CriteriosParaEstratificacaoDeRiscoAcompanhamentoDaGestante_2024.pdf", "easy", "Segundo a nota técnica MG 2024, qual a proporção aproximada de gestações de risco habitual?", "contains_all", "85%", "A população de risco habitual é de aproximadamente 85%.", "", "", "literal")
q("Níveis estratificação MG", "GuiaDeAtencaoSaudeDaGestante_CriteriosParaEstratificacaoDeRiscoAcompanhamentoDaGestante_2024.pdf", "easy", "Quais níveis de estratificação a nota técnica 2024 propõe para Minas Gerais?", "contains_all", "Habitual e Alto Risco", "Propõe estratificar em Habitual e Alto Risco, cada qual com fluxo na RAS.", "", "", "literal")
q("Encaminhamento PNAR MG", "GuiaDeAtencaoSaudeDaGestante_CriteriosParaEstratificacaoDeRiscoAcompanhamentoDaGestante_2024.pdf", "medium", "O que a nota técnica 2024 orienta fazer nas situações classificadas como Alto Risco?", "contains_all", "Pré-Natal de Alto Risco (PNAR)", "Deve-se encaminhar prontamente ao Pré-Natal de Alto Risco (PNAR).", "", "", "alto_risco")
q("Síndrome hemorrágica critério MG", "GuiaDeAtencaoSaudeDaGestante_CriteriosParaEstratificacaoDeRiscoAcompanhamentoDaGestante_2024.pdf", "medium", "A nota técnica 2024 lista síndrome hemorrágica ou hipertensiva grave como critério de qual nível?", "contains_all", "Alto Risco", "Síndrome hemorrágica ou hipertensiva grave é critério de Alto Risco.", "", "", "alto_risco")
q("IMC habitual MG", "GuiaDeAtencaoSaudeDaGestante_CriteriosParaEstratificacaoDeRiscoAcompanhamentoDaGestante_2024.pdf", "hard", "Qual faixa de IMC a nota técnica 2024 associa a risco habitual (sem ir direto a alto risco)?", "contains_any", "IMC <18,5;30-39", "IMC <18,5 ou >30-39 kg/m² entra nos critérios (IMC?40 vai para alto risco).", "", "", "list")
q("Objetivo estratificação MG", "GuiaDeAtencaoSaudeDaGestante_CriteriosParaEstratificacaoDeRiscoAcompanhamentoDaGestante_2024.pdf", "hard", "Qual o objetivo da estratificação de risco descrito na nota técnica 2024?", "contains_any", "organização da assistência;estratificação", "A estratificação organiza a assistência perinatal na rede.", "", "", "reasoning")
q("Urgência e emergência MG", "GuiaDeAtencaoSaudeDaGestante_CriteriosParaEstratificacaoDeRiscoAcompanhamentoDaGestante_2024.pdf", "easy", "A nota técnica 2024 destaca além dos níveis habituais quais situações?", "contains_any", "urgência;emergência", "Destaca situações de urgência e emergência.", "", "", "alerta")
q("Manual MS referência MG", "GuiaDeAtencaoSaudeDaGestante_CriteriosParaEstratificacaoDeRiscoAcompanhamentoDaGestante_2024.pdf", "easy", "Qual manual federal a nota técnica MG 2024 referencia para alto risco?", "contains_all", "Manual de Gestação de Alto Risco", "Referencia o Manual de Gestação de Alto Risco do Ministério da Saúde (2022).", "", "", "sequential")
q("HIV alto risco MG", "GuiaDeAtencaoSaudeDaGestante_CriteriosParaEstratificacaoDeRiscoAcompanhamentoDaGestante_2024.pdf", "medium", "O diagnóstico de HIV aparece na nota técnica 2024 em qual nível de risco?", "contains_all", "Alto Risco", "Diagnóstico de HIV é critério de Alto Risco.", "", "", "alerta")
q("Trap único nível MG", "GuiaDeAtencaoSaudeDaGestante_CriteriosParaEstratificacaoDeRiscoAcompanhamentoDaGestante_2024.pdf", "hard", "A nota técnica MG 2024 admite apenas um nível de risco (sem distinção habitual/alto)?", "boolean_exact", "NÃO", "NÃO. Propõe níveis Habitual e Alto Risco com fluxos distintos.", "apenas risco habitual;sem alto risco", "", "trap")
q("Critérios habitual lista MG", "GuiaDeAtencaoSaudeDaGestante_CriteriosParaEstratificacaoDeRiscoAcompanhamentoDaGestante_2024.pdf", "hard", "Cite dois critérios de risco habitual mencionados na nota técnica 2024.", "contains_any", "85%;Habitual", "Inclui gestações classificadas como habitual (~85% da população).", "", "", "list")
q("Título guia APS RS", "GuiaDoPreNatal_PuerperioNaAtencaoPrimariaSaude_2024.pdf", "easy", "Qual o título do guia SES/RS 2024 sobre atenção primária?", "contains_all", "Guia do Pré-natal e", "O documento é o Guia do Pré-natal e Puerpério na Atenção Primária à Saúde (APS).", "", "", "literal")
q("Consulta pré-natal APS", "GuiaDoPreNatal_PuerperioNaAtencaoPrimariaSaude_2024.pdf", "hard", "O guia APS 2024 possui seção específica sobre consulta de pré-natal?", "contains_all", "Consulta de pré-natal", "SIM, há seção 3.1.1 Consulta de pré-natal.", "", "", "sequential")
q("Consulta puerpério APS", "GuiaDoPreNatal_PuerperioNaAtencaoPrimariaSaude_2024.pdf", "medium", "O guia APS 2024 aborda consulta de puerpério?", "contains_all", "Consulta de puerpério", "SIM, há seção 3.1.2 Consulta de puerpério.", "", "", "sequential")
q("Pré-natal parceiro APS", "GuiaDoPreNatal_PuerperioNaAtencaoPrimariaSaude_2024.pdf", "medium", "O guia APS 2024 inclui capítulo sobre pré-natal do parceiro?", "contains_all", "Pré-natal do parceiro", "SIM, há seção 3.13 Pré-natal do parceiro.", "", "", "parceiro")
q("Acolhimento pré-natal APS", "GuiaDoPreNatal_PuerperioNaAtencaoPrimariaSaude_2024.pdf", "easy", "O guia APS 2024 enfatiza acolhimento e início precoce do quê?", "contains_all", "acolhimento e início precoce", "A atenção ao pré-natal na APS deve garantir acolhimento e início precoce do acompanhamento.", "", "", "literal")
q("Referência CAB APS", "GuiaDoPreNatal_PuerperioNaAtencaoPrimariaSaude_2024.pdf", "easy", "Qual caderno federal o guia APS 2024 cita para pré-natal de risco habitual?", "contains_all", "Pré-natal de Baixo Risco", "Segue orientações do Caderno de Atenção Básica: Atenção ao Pré-natal de Baixo Risco (2012).", "", "", "literal")
q("Estratificação risco APS", "GuiaDoPreNatal_PuerperioNaAtencaoPrimariaSaude_2024.pdf", "medium", "O guia APS 2024 aborda estratificação de risco gestacional?", "contains_any", "estratificação de risco", "O guia traz critérios para estratificação de risco e suporte à APS.", "", "", "alto_risco")
q("Gestante APS linguagem", "GuiaDoPreNatal_PuerperioNaAtencaoPrimariaSaude_2024.pdf", "easy", "O guia APS 2024 prioriza cuidado materno-paterno-infantil em qual nível?", "contains_all", "Atenção Primária", "Insere-se na qualificação das Redes de Atenção na Atenção Primária à Saúde.", "", "", "gestante_pro")
q("Fluxograma risco habitual APS", "GuiaDoPreNatal_PuerperioNaAtencaoPrimariaSaude_2024.pdf", "medium", "O guia APS 2024 traz fluxograma de pré-natal de risco habitual?", "contains_all", "pré-natal de risco habitual", "SIM, há Fluxograma 2: Pré-natal de risco habitual.", "", "", "list")
q("Foco qualificação 2024 APS", "GuiaDoPreNatal_PuerperioNaAtencaoPrimariaSaude_2024.pdf", "medium", "Qual o foco de qualificação da rede citado para 2024 no guia APS?", "contains_all", "pré-natal", "Em 2024 o foco da qualificação será no pré-natal.", "", "", "reasoning")
q("Trap dispensar puerpério APS", "GuiaDoPreNatal_PuerperioNaAtencaoPrimariaSaude_2024.pdf", "hard", "O guia APS 2024 orienta encerrar o cuidado logo após o parto, sem puerpério?", "boolean_exact", "NÃO", "NÃO. O guia cobre pré-natal e puerpério na APS.", "sem consulta de puerpério;alta no parto", "", "reasoning")
q("Definição pré-natal cartilha", "CartilhaDaGestante.pdf", "easy", "Como a Cartilha da Gestante define o pré-natal?", "contains_all", "supervisão médica e de enfermagem", "O pré-natal é a supervisão médica e de enfermagem oferecida à gestante desde a confirmação.", "", "", "gestante_pro")
q("Exames mínimos cartilha", "CartilhaDaGestante.pdf", "medium", "A cartilha lista exames mínimos para o pré-natal?", "contains_all", "Exames mínimos", "SIM, há seção 'Exames mínimos que devem ser realizados no pré-natal'.", "", "", "list")
q("Vacina tétano cartilha", "CartilhaDaGestante.pdf", "easy", "Quais vacinas a cartilha orienta tomar na gestação (tétano e gripe)?", "contains_any", "tétano;gripe (influenza)", "Orienta vacinar contra tétano e gripe (influenza).", "", "", "vacina")
q("Vacina hepatite cartilha", "CartilhaDaGestante.pdf", "medium", "A cartilha cita vacinas dT e hepatite B para gestante?", "contains_all", "hepatite B", "Cita vacinas antitetânica (dT), hepatite B se não vacinada, e gripe.", "", "", "vacina")
q("Gestante cartilha importância", "CartilhaDaGestante.pdf", "easy", "Por que a cartilha diz que o pré-natal é fundamental?", "contains_any", "gravidez saudável;garantir", "É fundamental para garantir uma gravidez saudável.", "", "", "gestante_pro")
q("Aleitamento cartilha", "CartilhaDaGestante.pdf", "medium", "A cartilha aborda preparação para aleitamento materno?", "contains_all", "aleitamento materno", "SIM, orienta sobre aleitamento materno no pré-natal e pós-parto.", "", "", "reasoning")
q("Ficha pré-natal cartilha", "CartilhaDaGestante.pdf", "easy", "O que a cartilha orienta preencher no acompanhamento?", "contains_all", "ficha de acompanhamento", "Orienta preencher adequadamente a ficha de acompanhamento do pré-natal.", "", "", "sequential")
q("Sinais alerta cartilha", "CartilhaDaGestante.pdf", "medium", "A cartilha lista sinais que exigem procurar pré-natal com urgência?", "contains_any", "vômito constante;pus", "Lista sinais como vômito constante e pus/vermelhidão que exigem atendimento.", "", "", "alerta")
q("Testes cartilha lista", "CartilhaDaGestante.pdf", "hard", "Cite dois testes citados na cartilha para o bebê/gestação (hepatite ou HIV).", "contains_any", "hepatite B;anti-HIV", "Inclui teste para hepatite B (HBsAg) e testes para HIV.", "", "", "list")
q("BHCG cartilha", "CartilhaDaGestante.pdf", "easy", "A cartilha menciona exame BHCG para confirmar gravidez?", "contains_any", "BHCG", "Menciona exame BHCG e início imediato do pré-natal.", "", "", "literal")
q("Trap sem pré-natal cartilha", "CartilhaDaGestante.pdf", "hard", "A cartilha diz que exames de rotina dispensam consultas de pré-natal?", "boolean_exact", "NÃO", "NÃO. O pré-natal é supervisão contínua, não substituído só por exames.", "dispensar consultas;exames substituem", "", "trap")
q("Vacinação criança cartilha", "CartilhaDaGestante.pdf", "medium", "A cartilha orienta atenção à caderneta de vacinação de quem?", "contains_all", "criança", "Os pais devem estar atentos à caderneta de vacinação da criança.", "", "", "sequential")
q("Título CAB baixo risco", "CadernosDeAtencaoBasica_AtencaoAoPreNatalDeBaixoRisco_2012.pdf", "easy", "Qual o título do Caderno de Atenção Básica nº 32 citado?", "contains_all", "ATENÇÃO AO PRÉ-NATAL DE BAIXO RISCO", "O caderno é 'Atenção ao pré-natal de baixo risco'.", "", "", "literal")
q("Vacina dT CAB", "CadernosDeAtencaoBasica_AtencaoAoPreNatalDeBaixoRisco_2012.pdf", "medium", "O CAB 2012 descreve vacina dT para gestante contra quais doenças?", "contains_all", "difteria e tétano", "A vacina dT protege contra difteria e tétano e previne tétano neonatal.", "", "", "vacina")
q("Orientar vacinação CAB", "CadernosDeAtencaoBasica_AtencaoAoPreNatalDeBaixoRisco_2012.pdf", "easy", "O CAB 2012 orienta profissionais a orientar vacinação contra o quê?", "contains_any", "tétano;hepatite B", "Orienta vacinação contra tétano e hepatite B.", "", "", "vacina")
q("Lista medicamentos CAB", "CadernosDeAtencaoBasica_AtencaoAoPreNatalDeBaixoRisco_2012.pdf", "medium", "O CAB 2012 lista medicamentos básicos e vacinas no kit?", "contains_all", "Medicamentos básicos e vacinas", "SIM, inclui medicamentos básicos e vacinas (tétano e hepatite B).", "", "", "list")
q("Tétano neonatal CAB", "CadernosDeAtencaoBasica_AtencaoAoPreNatalDeBaixoRisco_2012.pdf", "medium", "Qual indicador o CAB 2012 relaciona à vacinação antitetânica?", "contains_all", "tétano neonatal", "Monitora crianças com tétano neonatal em relação a recém-nascidos vivos.", "", "", "reasoning")
q("Encaminhar imunização CAB", "CadernosDeAtencaoBasica_AtencaoAoPreNatalDeBaixoRisco_2012.pdf", "medium", "Quando o CAB 2012 manda encaminhar para imunização antitetânica?", "contains_all", "imunização antitetânica", "Deve-se encaminhar a gestante para imunização antitetânica quando indicado.", "", "", "sequential")
q("Alto risco intercorrência CAB", "CadernosDeAtencaoBasica_AtencaoAoPreNatalDeBaixoRisco_2012.pdf", "medium", "Gestante de baixo risco pode ter intercorrências segundo CAB 2012?", "contains_all", "baixo risco", "Gestante de baixo risco pode ser acometida por intercorrências que mudam o risco.", "", "", "alto_risco")
q("Guillain-Barré CAB", "CadernosDeAtencaoBasica_AtencaoAoPreNatalDeBaixoRisco_2012.pdf", "hard", "O CAB 2012 contraindica dT após síndrome de Guillain-Barré recente?", "contains_all", "Guillain-Barré", "SIM, contraindica nas seis semanas após vacinação anterior contra difteria/tétano com Guillain-Barré.", "", "", "trap")
q("Roteiro exames CAB", "CadernosDeAtencaoBasica_AtencaoAoPreNatalDeBaixoRisco_2012.pdf", "easy", "O CAB 2012 traz roteiro de exames para pré-natal de baixo risco?", "contains_all", "Roteiro para a solicitação de exames", "SIM, há Quadro 12 ? Roteiro para solicitação de exames.", "", "", "list")
q("Aplicar vacinas CAB", "CadernosDeAtencaoBasica_AtencaoAoPreNatalDeBaixoRisco_2012.pdf", "easy", "Que ação o CAB 2012 prevê sobre vacinas antitetânica e hepatite B?", "contains_all", "Aplicar vacinas", "Prevê aplicar vacinas antitetânica e contra hepatite B.", "", "", "vacina")
q("Trap alto risco CAB", "CadernosDeAtencaoBasica_AtencaoAoPreNatalDeBaixoRisco_2012.pdf", "hard", "O CAB 2012 diz que toda gestante é automaticamente alto risco?", "boolean_exact", "NÃO", "NÃO. O foco é atenção ao pré-natal de baixo risco com critérios de encaminhamento.", "todas alto risco;sem baixo risco", "", "trap")
q("Human judge esquema CAB", "CadernosDeAtencaoBasica_AtencaoAoPreNatalDeBaixoRisco_2012.pdf", "hard", "Quantas entradas de 'Tabela 7 ? Esquema de vacinação de dT' o CAB 2012 possui no sumário?", "human_judge", "Tabela 7", "O sumário lista Tabela 7 ? Esquema de vacinação de dT.", "", "Confirmar no PDF/sumário.", "list")
q("Sigla EPNP 2023", "GuiaPreNatalDoParceiro_ProfissionaisSaude_2023.pdf", "easy", "Qual a sigla da Estratégia Pré-Natal do Parceiro no guia MS 2023?", "contains_all", "EPNP", "A Estratégia Pré-Natal do Parceiro (EPNP).", "", "", "literal")
q("Objetivo EPNP 2023", "GuiaPreNatalDoParceiro_ProfissionaisSaude_2023.pdf", "medium", "O guia 2023 visa orientar profissionais sobre qual estratégia?", "contains_all", "Pré-Natal do Parceiro", "Orienta a EPNP para profissionais de saúde na APS.", "", "", "parceiro")
q("Homens EPNP 2023", "GuiaPreNatalDoParceiro_ProfissionaisSaude_2023.pdf", "medium", "A EPNP 2023 se estende a quais homens?", "contains_any", "todos os homens;pais", "Estende-se a todos os homens, pais biológicos ou não.", "", "", "parceiro")
q("Licença-paternidade 2023", "GuiaPreNatalDoParceiro_ProfissionaisSaude_2023.pdf", "easy", "O guia 2023 aborda licença-paternidade?", "contains_all", "licença-paternidade", "SIM, há seção sobre licença-paternidade.", "", "", "parceiro")
q("Cosah coordenação 2023", "GuiaPreNatalDoParceiro_ProfissionaisSaude_2023.pdf", "easy", "Qual coordenação do MS elaborou o guia 2023?", "contains_all", "Atenção à Saúde do Homem", "Coordenação de Atenção à Saúde do Homem (Cosah).", "", "", "literal")
q("Trap EPNP só gestante 2023", "GuiaPreNatalDoParceiro_ProfissionaisSaude_2023.pdf", "hard", "O guia 2023 limita a EPNP apenas à gestante, excluindo o homem?", "boolean_exact", "NÃO", "NÃO. A EPNP foca o cuidado ao homem/parceiro durante a gestação.", "apenas gestante;homem excluído", "", "trap")
q("Acolhimento parceiro 2023", "GuiaPreNatalDoParceiro_ProfissionaisSaude_2023.pdf", "medium", "O guia 2023 possui seção de acolhimento do parceiro?", "contains_all", "ACOLHIMENTO DO(A) PARCEIRO", "SIM, há capítulo de acolhimento do(a) parceiro(a).", "", "", "sequential")
q("APS baixo risco REF", "GuiaReferenciaRapida_AtencaoAoPreNatalParaGestantesDeBaixoRisco_ProfissionaisSaude_2013.pdf", "easy", "Quem deve realizar o pré-natal de baixo risco segundo o guia rápido 2013?", "contains_all", "profissionais de atenção primária", "Os profissionais de atenção primária devem realizar o pré-natal de baixo risco.", "", "", "literal")
q("Esquema 3 doses tétano REF", "GuiaReferenciaRapida_AtencaoAoPreNatalParaGestantesDeBaixoRisco_ProfissionaisSaude_2013.pdf", "medium", "Quantas doses de tétano o guia rápido 2013 prevê para gestante nunca vacinada?", "contains_all", "3 doses", "Gestante nunca vacinada deve receber 3 doses de tétano (dT/TT).", "", "", "vacina")
q("Ultrassom doppler trap REF", "GuiaReferenciaRapida_AtencaoAoPreNatalParaGestantesDeBaixoRisco_ProfissionaisSaude_2013.pdf", "hard", "O guia rápido 2013 recomenda ultrassom com doppler de rotina em baixo risco?", "boolean_exact", "NÃO", "NÃO. Lista como não recomendado ultrassom com doppler de rotina em baixo risco.", "doppler de rotina recomendado", "", "trap")
q("Vacinas vivas REF", "GuiaReferenciaRapida_AtencaoAoPreNatalParaGestantesDeBaixoRisco_ProfissionaisSaude_2013.pdf", "medium", "Quais vacinas o guia rápido 2013 contraindica na gestação?", "contains_all", "vírus vivo atenuado", "Contraindica vacinas com vírus vivo atenuado (sarampo, rubéola, caxumba, febre amarela).", "", "", "vacina")
q("Título ficha perinatal", "FichaPerinatal-Ambulatorio.pdf", "easy", "Qual o título do formulário ambulatorial extraído?", "contains_all", "FICHA PERINATAL", "O documento é a FICHA PERINATAL ? Ambulatório.", "", "", "literal")
q("Campo dTpa ficha", "FichaPerinatal-Ambulatorio.pdf", "easy", "A ficha perinatal registra vacina dTpa?", "contains_all", "Vacina dTpa", "SIM, há campo Vacina dTpa com datas de doses.", "", "", "vacina")
q("Risco habitual ficha", "FichaPerinatal-Ambulatorio.pdf", "easy", "A ficha perinatal distingue gravidez de risco habitual e alto risco?", "human_judge", "habitual;risco", "SIM, há opções Risco habitual e Alto risco.", "", "Confirmar campos de estratificação na ficha.", "literal")
q("TOTG risco habitual", "CadernoDeAtencaoAoPreNatal_RiscoHabitual_.pdf", "medium", "O caderno de risco habitual aborda diagnóstico de DMG com qual exame?", "contains_all", "TOTG", "Descreve diagnóstico de DMG com TOTG.", "", "", "sequential")
q("Glicemia jejum CRH", "CadernoDeAtencaoAoPreNatal_RiscoHabitual_.pdf", "medium", "Qual valor de glicemia de jejum o caderno cita como limiar (mg/dl)?", "contains_all", "92 mg/dl", "Glicemia de jejum ?92 mg/dl e <126 mg/dl entra no fluxo diagnóstico.", "", "", "literal")
q("Hemoglobina CRH", "CadernoDeAtencaoAoPreNatal_RiscoHabitual_.pdf", "easy", "O caderno recomenda hemoglobina para gestantes de risco habitual?", "contains_all", "hemoglobina", "Recomenda hemoglobina para todas as gestantes de risco habitual.", "", "", "list")
q("Síndrome hemorrágica MTG", "ManualTecnico_GestacaoAltoRisco.pdf", "medium", "O manual técnico GAR lista síndrome hemorrágica como?", "contains_all", "Síndrome hemorrágica ou hipertensiva", "Lista síndrome hemorrágica ou hipertensiva.", "", "", "alto_risco")
q("Alto risco MTG", "ManualTecnico_GestacaoAltoRisco.pdf", "easy", "O manual técnico de gestação alto risco trata gestação de alto risco?", "contains_all", "Gestação de Alto Risco", "SIM, é manual técnico de Gestação de Alto Risco.", "", "", "alto_risco")
q("HIV MTG", "ManualTecnico_GestacaoAltoRisco.pdf", "medium", "O manual técnico GAR aborda HIV na gestação?", "contains_any", "HIV", "Aborda condições como HIV na gestação de alto risco.", "", "", "list")
q("Trap baixo risco MTG", "ManualTecnico_GestacaoAltoRisco.pdf", "hard", "O ManualTecnico_GestacaoAltoRisco.pdf é destinado só a gestação de baixo risco?", "boolean_exact", "NÃO", "NÃO. É destinado à gestação de alto risco.", "somente baixo risco", "", "trap")
q("Enfermeiro baixo risco MTP", "ManualTecnico_PrenatalPuerperio.pdf", "easy", "Quem pode realizar consulta de pré-natal de baixo risco no manual técnico?", "contains_all", "enfermeiro(a)", "Gestante classificada como baixo risco pode ser atendida pelo(a) enfermeiro(a).", "", "", "literal")
q("Equipe MTP", "ManualTecnico_PrenatalPuerperio.pdf", "medium", "O manual técnico prenatal cita equipe com enfermeiro e médico?", "contains_any", "enfermeiro;médico", "A equipe inclui enfermeiro(a), médico(a) e auxiliar de enfermagem.", "", "", "list")
q("Atividade laboral MTP", "ManualTecnico_PrenatalPuerperio.pdf", "easy", "Gestação de baixo risco pode continuar atividade laboral até quando?", "contains_all", "baixo risco", "Atividade laboral pode continuar em gestações de baixo risco até o parto.", "", "", "list")
q("Licença 120 dias 2016", "CadernetaGestante_3ed_2016.pdf", "easy", "Quantos dias de licença-maternidade a caderneta 2016 prevê?", "contains_all", "120 (cento e vinte) dias", "Licença-maternidade de 120 (cento e vinte) dias para gestantes com carteira assinada.", "", "", "literal")
q("Parceiro 2018 guia", "GuiaPreNatalDoParceiro_ProfissionaisSaude_2018.pdf", "easy", "Como o guia MS 2018 nomeia a estratégia para profissionais sobre o homem na gestação?", "contains_all", "Pré-Natal do Parceiro", "É o Guia do Pré-Natal do Parceiro para profissionais de saúde.", "", "", "parceiro")
q("Disque ANS", "CadernetaGestante_ANS.pdf", "easy", "Qual telefone da ANS na caderneta para dúvidas?", "contains_all", "0800 701 9656", "Disque ANS 0800 701 9656.", "", "", "literal")
q("Seis consultas oficina", "ManualTecnico_OficinaAtualizacaoEmPreNatal_ProfissionaisAtencaoBasica_2014.pdf", "easy", "Quantas consultas mínimas a oficina MS 2014 recomenda à gestante?", "human_judge", "mínimo de 6 consultas", "Recomenda número mínimo de 6 consultas; a primeira deve ocorrer no 1º trimestre.", "", "Aceitar resposta numérica 6 com referência ao trecho do manual.", "sequential")
def main() -> None:
    if len(RAW) != 110:
        raise SystemExit(f"Expected 110 questions, got {len(RAW)}")
    for row in RAW:
        verify_row(row)
    with OUT.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(HEADER)
        for i, row in enumerate(RAW, start=1):
            topic, doc, diff, question, mode, phrases, gold, must_not, notes, tag = row
            note_out = f"{notes} | tag={tag}" if notes else f"tag={tag}"
            w.writerow([f"Q{i:03d}", topic, doc, diff, question, mode, phrases, gold, must_not, note_out])
    print(f"Wrote {OUT} ({len(RAW)} rows)")

if __name__ == "__main__":
    main()