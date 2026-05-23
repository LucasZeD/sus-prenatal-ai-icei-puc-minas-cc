#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Monta TESTES_SECAO_ARTIGO.md a partir dos relatorios dos tres blocos e figuras."""
from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path

REPORT_DIR = Path(__file__).resolve().parent
TESTS_DIR = REPORT_DIR.parent
OUT = REPORT_DIR / "TESTES_SECAO_ARTIGO.md"


def read_or_placeholder(path: Path, label: str) -> str:
    if path.is_file():
        return path.read_text(encoding="utf-8").strip()
    return (
        f"*(Artefato ausente: execute o bloco {label} antes "
        f"\u2014 `{path.relative_to(TESTS_DIR)}`)*"
    )


def load_manifest(fig_dir: Path) -> dict | None:
    manifest_path = fig_dir / "figures_manifest.json"
    if not manifest_path.is_file():
        return None
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def fig_md(manifest: dict | None, key: str, caption: str) -> str:
    if not manifest:
        return f"*(Figura ausente: rode `plot_benchmark_results.py` \u2014 {caption})*\n"
    figs = manifest.get("figures") or {}
    entry = figs.get(key)
    if not entry or "png" not in entry:
        return f"*(Figura `{key}` ausente no manifest.)*\n"
    rel = entry["png"].replace("\\", "/")
    return f"![{caption}]({rel})\n\n"


def parse_llm_summary(text: str) -> str:
    lines = text.splitlines()
    table_lines: list[str] = []
    in_table = False
    for line in lines:
        if line.startswith("difficulty") or line.startswith("---"):
            in_table = True
        if in_table and line.strip() and not line.startswith("10 piores"):
            if line.startswith("difficulty"):
                table_lines.append("| Dificuldade | Ollama (%) | n | Gemini (%) | n |")
                table_lines.append("|-------------|------------|---|------------|---|")
                continue
            if line.startswith("---"):
                continue
            parts_line = line.split()
            if len(parts_line) >= 5 and parts_line[0] in ("easy", "medium", "hard", "ALL"):
                diff = parts_line[0]
                o_pct = parts_line[1].rstrip("%")
                n_o = parts_line[2]
                g_pct = parts_line[3].rstrip("%")
                n_g = parts_line[4]
                table_lines.append(f"| {diff} | {o_pct} | {n_o} | {g_pct} | {n_g} |")
        if line.startswith("Taxa global"):
            break
    if not table_lines:
        return "*(Tabela n\u00e3o dispon\u00edvel \u2014 execute o bench de modelos.)*"
    return "\n".join(table_lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Monta TESTES_SECAO_ARTIGO.md")
    parser.add_argument("--date", default=date.today().strftime("%Y%m%d"), help="YYYYMMDD")
    args = parser.parse_args()
    stamp = args.date

    validation_path = TESTS_DIR / "01_validacao_dataset" / "reports" / "validation_report.txt"
    rag_article_path = TESTS_DIR / "03_bench_rag_retrieval" / "results" / stamp / "rag_summary_for_article.md"
    llm_summary_path = TESTS_DIR / "02_bench_modelos_llm" / "results" / stamp / "summary.txt"
    roteiro_summary_path = TESTS_DIR / "04_bench_roteiro_ground_truth" / "results" / stamp / "roteiro_summary.txt"
    fig_dir = REPORT_DIR / "figures" / stamp

    validation = read_or_placeholder(validation_path, "1 \u2014 valida\u00e7\u00e3o")
    rag_md = read_or_placeholder(rag_article_path, "3 \u2014 RAG")
    llm_raw = read_or_placeholder(llm_summary_path, "2 \u2014 modelos")
    llm_table = parse_llm_summary(llm_raw) if "Artefato ausente" not in llm_raw else llm_raw
    roteiro_raw = read_or_placeholder(roteiro_summary_path, "4 \u2014 roteiro")
    manifest = load_manifest(fig_dir)

    sections = [
        "# Testes e Resultados \u2014 texto para o artigo (TCC)\n\n",
        "Documento gerado a partir dos benchmarks em `Documentacao/Testes/`.\n\n",
        f"Data dos resultados: `{stamp}`.\n\n",
        "---\n\n",
        "## A) Instrumento de avalia\u00e7\u00e3o\n\n",
        "Benchmark com **110 perguntas** em portugu\u00eas, com resposta ouro derivada de **17 documentos** "
        "do Minist\u00e9rio da Sa\u00fade (cartilhas e manuais de pr\u00e9-natal em `corpus/CartilhasSUS`). "
        "Cada item referencia `source_document`, dificuldade (`easy` / `medium` / `hard`) e modo de "
        "avalia\u00e7\u00e3o autom\u00e1tica: `contains_all`, `contains_any`, `boolean_exact` ou `human_judge`.\n\n",
        fig_md(manifest, "fig01_instrumento_dificuldade", "Distribuicao por dificuldade"),
        fig_md(manifest, "fig02_instrumento_modos", "Modos de avaliacao"),
        "Valida\u00e7\u00e3o estrutural e de *grounding* (frases esperadas no texto extra\u00eddo dos PDFs):\n\n",
        "```\n",
        validation,
        "\n```\n\n",
        "---\n\n",
        "## B) Resultados da recupera\u00e7\u00e3o RAG (retrieval only)\n\n",
        "Configura\u00e7\u00e3o \u00fanica: `top_k=6`, expans\u00e3o de query ativada. Endpoint: `POST /rag/test/query`.\n\n",
        fig_md(manifest, "fig03_rag_hit_at_6", "Hit@6 e MRR por dificuldade"),
        fig_md(manifest, "fig04_rag_mrr", "MRR medio por dificuldade"),
        rag_md if rag_md.startswith("#") else rag_md + "\n",
        "---\n\n",
        "## C) Resultados dos modelos (end-to-end)\n\n",
        "Pipeline completo: recupera\u00e7\u00e3o RAG + gera\u00e7\u00e3o via Ollama local e Gemini (`llm_provider`). "
        "M\u00e9trica: taxa de `pass_auto=true` (correspond\u00eancia lexical de frases ou booleano).\n\n",
        fig_md(manifest, "fig05_llm_pass_provider", "Acerto por dificuldade e provider"),
        fig_md(manifest, "fig06_llm_pass_global", "Taxa global por provider"),
        llm_table + "\n\n",
        "Detalhe completo:\n\n",
        "```\n",
        llm_raw,
        "\n```\n\n",
        "---\n\n",
        "## D) Roteiro cl\u00ednico e seguran\u00e7a (GT01\u2013GT05)\n\n",
        "Benchmark reprodut\u00edvel a partir do roteiro de *ground truth* "
        "(casos cl\u00ednicos, PII, *guardrail* de escopo). Caso 6 (STT por \u00e1udio) permanece no checklist manual.\n\n",
        fig_md(manifest, "fig07_roteiro_pass_por_caso", "Aprovacao por caso GT"),
        fig_md(manifest, "fig08_roteiro_clinico_rag_llm", "Clinico: RAG vs LLM"),
        fig_md(manifest, "fig09_roteiro_pii_mascaramento", "Mascaramento PII GT04"),
        fig_md(manifest, "fig10_roteiro_guardrail_escopo", "Guardrail escopo GT05"),
        "```\n",
        roteiro_raw,
        "\n```\n\n",
        "---\n\n",
        "## E) Limita\u00e7\u00f5es\n\n",
        "Os resultados **n\u00e3o substituem valida\u00e7\u00e3o em campo** com gestantes ou profissionais de sa\u00fade. "
        "Itens marcados como `human_judge` exigem revis\u00e3o manual e n\u00e3o entram na taxa autom\u00e1tica. "
        "As m\u00e9tricas de resposta dos modelos s\u00e3o **lexicais** (presen\u00e7a de frases ou SIM/N\u00c3O); respostas "
        "semanticamente corretas com reda\u00e7\u00e3o diferente podem ser classificadas como falha. "
        "O benchmark de retrieval mede se o documento-fonte esperado aparece no top-6, n\u00e3o a qualidade "
        "cl\u00ednica da resposta final gerada pelo LLM.\n\n",
        "*Para LaTeX: use `\\includegraphics{figures/",
        stamp,
        "/figXX.pdf}` com os PDFs gerados; tabelas com `booktabs` "
        "(`\\toprule`, `\\midrule`, `\\bottomrule`).*\n",
    ]

    OUT.write_text("".join(sections), encoding="utf-8")
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
