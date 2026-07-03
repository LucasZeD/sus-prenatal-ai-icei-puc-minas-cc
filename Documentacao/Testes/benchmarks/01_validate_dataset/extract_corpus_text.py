#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Extract PDF text from CartilhasSUS into corpus_extracted/{stem}.txt for validation."""
from __future__ import annotations

from pathlib import Path

import sys

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "lib"))
from paths import BENCHMARK_CSV, CLINICAL_AI_ROOT, CORPUS_EXTRACTED  # noqa: E402

CORPUS_DIR = CLINICAL_AI_ROOT / "corpus" / "CartilhasSUS"
OUT_DIR = CORPUS_EXTRACTED

sys.path.insert(0, str(CLINICAL_AI_ROOT))
from clinical_ai.corpus import document_rag_indexed, iter_corpus_source_files  # noqa: E402


def read_pdf(path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    pages: list[str] = []
    for page in reader.pages:
        t = page.extract_text()
        if t:
            pages.append(t)
    return "\n\n".join(pages).strip()


def main() -> int:
    if not CORPUS_DIR.is_dir():
        print(f"Corpus n\u00e3o encontrado: {CORPUS_DIR}", file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pdfs = sorted(p for p in iter_corpus_source_files(CORPUS_DIR) if p.suffix.lower() == ".pdf")
    if not pdfs:
        print(f"Nenhum PDF indexavel em {CORPUS_DIR}", file=sys.stderr)
        return 1

    ok = 0
    for pdf in pdfs:
        stem = pdf.stem
        out = OUT_DIR / f"{stem}.txt"
        try:
            text = read_pdf(pdf)
        except Exception as exc:
            print(f"ERROR {pdf.name}: {exc}", file=sys.stderr)
            continue
        if not text:
            print(f"AVISO texto vazio: {pdf.name}", file=sys.stderr)
            continue
        out.write_text(text, encoding="utf-8")
        print(f"OK {pdf.name} -> {out.name} ({len(text)} chars)")
        ok += 1

    all_pdfs = sorted(CORPUS_DIR.rglob("*.pdf"))
    skipped_caderneta = sum(1 for p in all_pdfs if not document_rag_indexed(CORPUS_DIR, p.name))
    print(f"\nExtra\u00eddos {ok}/{len(pdfs)} PDFs (indice RAG) em {OUT_DIR}")
    if skipped_caderneta:
        print(
            f"Ignorados {skipped_caderneta} PDF(s) em CadernetaGestante/ "
            "(fichas clinicas, fora do corpus de protocolo)."
        )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
