"""Schema validation for prenatal_sus_benchmark.csv (offline)."""
from __future__ import annotations

import csv
from collections import Counter
from pathlib import Path

from paths import BENCHMARK_CSV, ROOT

EXPECTED_HEADER = [
    "question_id",
    "topic_pt",
    "source_document",
    "difficulty",
    "question_pt",
    "answer_evaluation_mode",
    "expected_phrases_pt",
    "gold_answer_short_pt",
    "must_not_contain_pt",
    "notes_scoring_pt",
]

EXPECTED_DOCS = {
    "CadernoDeAtencaoAoPreNatal_RiscoHabitual_.pdf": 3,
    "CadernosDeAtencaoBasica_AtencaoAoPreNatalDeBaixoRisco_2012.pdf": 19,
    "GuiaDeAtencaoSaudeDaGestante_CriteriosParaEstratificacaoDeRiscoAcompanhamentoDaGestante_2024.pdf": 11,
    "GuiaDoPreNatal_PuerperioNaAtencaoPrimariaSaude_2024.pdf": 16,
    "GuiaPreNatalDoParceiro_ProfissionaisSaude_2023.pdf": 9,
    "GuiaReferenciaRapida_AtencaoAoPreNatalParaGestantesDeBaixoRisco_ProfissionaisSaude_2013.pdf": 7,
    "ManualGestacaoAltoRisco_2022.pdf": 27,
    "ManualTecnico_OficinaAtualizacaoEmPreNatal_ProfissionaisAtencaoBasica_2014.pdf": 2,
    "ManualTecnico_PrenatalPuerperio.pdf": 6,
}


def _load_rows() -> list[dict[str, str]]:
    with BENCHMARK_CSV.open(encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        assert reader.fieldnames == EXPECTED_HEADER
        return list(reader)


def _extract_tag(notes: str) -> str:
    if "tag=" in notes:
        return notes.split("tag=", 1)[1].split()[0].strip("|; ")
    return ""


def test_benchmark_csv_exists() -> None:
    assert BENCHMARK_CSV.is_file(), f"Missing {BENCHMARK_CSV.relative_to(ROOT)}"


def test_benchmark_n100_unique_ids() -> None:
    rows = _load_rows()
    assert len(rows) == 100
    ids = [r["question_id"] for r in rows]
    assert ids == [f"Q{i:03d}" for i in range(1, 101)]
    assert len(set(ids)) == 100


def test_benchmark_trap_count() -> None:
    rows = _load_rows()
    traps = sum(1 for r in rows if _extract_tag(r["notes_scoring_pt"]) == "trap")
    assert traps == 10


def test_benchmark_doc_distribution() -> None:
    rows = _load_rows()
    doc_counts = Counter(r["source_document"] for r in rows)
    for doc, expected in EXPECTED_DOCS.items():
        assert doc_counts.get(doc, 0) == expected
