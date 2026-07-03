#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Validate prenatal_sus_benchmark.csv counts, schema, and phrase grounding."""
from __future__ import annotations

import argparse
import csv
import sys
import unicodedata
from collections import Counter
from io import StringIO
from pathlib import Path

import sys

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "lib"))
from paths import (  # noqa: E402
    BENCHMARK_CSV,
    CLINICAL_AI_ROOT,
    CORPUS_EXTRACTED,
    validation_dir,
)

CORPUS_DIR = CLINICAL_AI_ROOT / "corpus" / "CartilhasSUS"
CSV_PATH = BENCHMARK_CSV
EXTRACTED = CORPUS_EXTRACTED
DEFAULT_REPORT = validation_dir("latest") / "validation_report.txt"

sys.path.insert(0, str(CLINICAL_AI_ROOT))
from clinical_ai.corpus import document_rag_indexed  # noqa: E402

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

# Per-document targets (N=100; apenas PDFs indexados no RAG — ver corpus.py)
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

DOC_STEM = {
    "CadernoDeAtencaoAoPreNatal_RiscoHabitual_.pdf": "CadernoDeAtencaoAoPreNatal_RiscoHabitual_",
    "CadernosDeAtencaoBasica_AtencaoAoPreNatalDeBaixoRisco_2012.pdf": "CadernosDeAtencaoBasica_AtencaoAoPreNatalDeBaixoRisco_2012",
    "GuiaDeAtencaoSaudeDaGestante_CriteriosParaEstratificacaoDeRiscoAcompanhamentoDaGestante_2024.pdf": "GuiaDeAtencaoSaudeDaGestante_CriteriosParaEstratificacaoDeRiscoAcompanhamentoDaGestante_2024",
    "GuiaDoPreNatal_PuerperioNaAtencaoPrimariaSaude_2024.pdf": "GuiaDoPreNatal_PuerperioNaAtencaoPrimariaSaude_2024",
    "GuiaPreNatalDoParceiro_ProfissionaisSaude_2023.pdf": "GuiaPreNatalDoParceiro_ProfissionaisSaude_2023",
    "GuiaReferenciaRapida_AtencaoAoPreNatalParaGestantesDeBaixoRisco_ProfissionaisSaude_2013.pdf": "GuiaReferenciaRapida_AtencaoAoPreNatalParaGestantesDeBaixoRisco_ProfissionaisSaude_2013",
    "ManualGestacaoAltoRisco_2022.pdf": "ManualGestacaoAltoRisco_2022",
    "ManualTecnico_OficinaAtualizacaoEmPreNatal_ProfissionaisAtencaoBasica_2014.pdf": "ManualTecnico_OficinaAtualizacaoEmPreNatal_ProfissionaisAtencaoBasica_2014",
    "ManualTecnico_PrenatalPuerperio.pdf": "ManualTecnico_PrenatalPuerperio",
}

DIFFICULTY = {"easy": 42, "medium": 35, "hard": 23}
TAG_MIN = {
    "literal": 15,
    "sequential": 13,
    "list": 13,
    "reasoning": 5,
    "trap": 10,
    "gestante_pro": 4,
    "parceiro": 5,
    "alto_risco": 10,
    "alerta": 8,
    "vacina": 10,
}
TRAP_EXPECTED = 10
TRAP_MUST_NOT_EXPECTED = 10
MODE_RANGES = {
    "contains_all": (60, 75),
    "contains_any": (15, 25),
    "boolean_exact": (8, 14),
    "human_judge": (4, 8),
}


def norm(text: str) -> str:
    t = text.lower()
    t = unicodedata.normalize("NFD", t)
    return "".join(c for c in t if unicodedata.category(c) != "Mn")


def load_rows() -> list[dict[str, str]]:
    with CSV_PATH.open(encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        if reader.fieldnames != EXPECTED_HEADER:
            raise ValueError(f"Header mismatch: {reader.fieldnames}")
        return list(reader)


def extract_tag(notes: str) -> str:
    if "tag=" in notes:
        return notes.split("tag=", 1)[1].split()[0].strip("|; ")
    if notes.startswith("tag="):
        return notes[4:].split()[0]
    return ""


def verify_phrases(row: dict[str, str], cache: dict[str, str]) -> list[str]:
    mode = row["answer_evaluation_mode"]
    if mode in ("boolean_exact", "human_judge"):
        return []
    doc = row["source_document"]
    if not document_rag_indexed(CORPUS_DIR, doc):
        return []
    if doc not in cache:
        stem = DOC_STEM[doc]
        cache[doc] = norm((EXTRACTED / f"{stem}.txt").read_text(encoding="utf-8"))
    text = cache[doc]
    parts = [p.strip() for p in row["expected_phrases_pt"].split(";") if p.strip()]
    if mode == "contains_all":
        return [p for p in parts if norm(p) not in text]
    if mode == "contains_any":
        return [] if any(norm(p) in text for p in parts) else parts
    return [f"unknown mode {mode}"]


def build_report(
    rows: list[dict[str, str]],
    errors: list[str],
    doc_counts: Counter,
    diff_counts: Counter,
    modes: Counter,
    tags: Counter,
    hard_trap_must: int,
    trap_count: int,
) -> str:
    buf = StringIO()
    w = buf.write
    w("=== Validação do benchmark (N=100) ===\n\n")
    w(f"Linhas: {len(rows)}\n")
    w(f"Composição: {len(rows) - trap_count} protocolo / {trap_count} trap\n")
    w(f"Documentos: {dict(sorted(doc_counts.items()))}\n")
    w(f"Dificuldade: {dict(diff_counts)}\n")
    w(f"Modos de avaliação: {dict(modes)}\n")
    w(f"Tags: {dict(sorted(tags.items()))}\n")
    w(f"must_not_contain preenchido (trap): {hard_trap_must}\n")
    w(f"Corpus extraído: {EXTRACTED}\n")
    if errors:
        w("\nERROS:\n")
        for e in errors:
            w(f" - {e}\n")
    else:
        w("\nOK: todas as verificações passaram.\n")
    return buf.getvalue()


def main() -> int:
    parser = argparse.ArgumentParser(description="Valida prenatal_sus_benchmark.csv")
    parser.add_argument(
        "--report-out",
        type=Path,
        default=DEFAULT_REPORT,
        help="Caminho do relatório (stdout sempre espelhado)",
    )
    args = parser.parse_args()

    errors: list[str] = []
    rows = load_rows()

    if len(rows) != 100:
        errors.append(f"row count: expected 100, got {len(rows)}")

    ids = [r["question_id"] for r in rows]
    if ids != [f"Q{i:03d}" for i in range(1, 101)]:
        errors.append("question_id sequence invalid")

    doc_counts = Counter(r["source_document"] for r in rows)
    for doc, expected in EXPECTED_DOCS.items():
        got = doc_counts.get(doc, 0)
        if got != expected:
            errors.append(f"doc {doc}: expected {expected}, got {got}")

    diff_counts = Counter(r["difficulty"] for r in rows)
    for diff, expected in DIFFICULTY.items():
        got = diff_counts.get(diff, 0)
        if got != expected:
            errors.append(f"difficulty {diff}: expected {expected}, got {got}")

    tags = Counter(extract_tag(r["notes_scoring_pt"]) for r in rows)
    for tag, minimum in TAG_MIN.items():
        got = tags.get(tag, 0)
        if got < minimum:
            errors.append(f"tag {tag}: need >={minimum}, got {got}")
    trap_count = tags.get("trap", 0)
    if trap_count != TRAP_EXPECTED:
        errors.append(f"tag trap: expected exactly {TRAP_EXPECTED}, got {trap_count}")

    modes = Counter(r["answer_evaluation_mode"] for r in rows)
    for mode, (lo, hi) in MODE_RANGES.items():
        got = modes.get(mode, 0)
        if not (lo <= got <= hi):
            errors.append(f"mode {mode}: expected {lo}-{hi}, got {got}")

    hard_trap_must = sum(
        1
        for r in rows
        if extract_tag(r["notes_scoring_pt"]) == "trap"
        if r["must_not_contain_pt"].strip()
    )
    if hard_trap_must != TRAP_MUST_NOT_EXPECTED:
        errors.append(f"must_not_contain on trap: expected {TRAP_MUST_NOT_EXPECTED}, got {hard_trap_must}")

    cache: dict[str, str] = {}
    for r in rows:
        missing = verify_phrases(r, cache)
        if missing:
            errors.append(f"{r['question_id']} missing phrases: {missing[:2]}")

    report = build_report(rows, errors, doc_counts, diff_counts, modes, tags, hard_trap_must, trap_count)
    print(report, end="")
    if args.report_out:
        args.report_out.parent.mkdir(parents=True, exist_ok=True)
        args.report_out.write_text(report, encoding="utf-8")
        print(f"Relatório salvo em: {args.report_out}")

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
