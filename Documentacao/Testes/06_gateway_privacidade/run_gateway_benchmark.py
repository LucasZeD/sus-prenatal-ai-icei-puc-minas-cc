#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Privacy gateway benchmark with synthetic corpus (50 sentences)."""
from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

import httpx

BENCH_DIR = Path(__file__).resolve().parent
DATASET = BENCH_DIR / "dataset" / "pii_gateway_corpus_50.jsonl"
RESULTS_HEADER = [
    "id",
    "entity_type",
    "entity_value",
    "masked",
    "leak",
    "latency_ms",
    "input_text",
    "sanitized_text",
    "error",
]


@dataclass
class EntityResult:
    rid: str
    entity_type: str
    entity_value: str
    masked: str
    leak: str
    latency_ms: str
    input_text: str
    sanitized_text: str
    error: str


def load_rows(path: Path) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    raw: str | None = None
    decode_errors: list[str] = []
    for enc in ("utf-8", "utf-8-sig", "cp1252", "latin-1"):
        try:
            raw = path.read_text(encoding=enc)
            break
        except UnicodeDecodeError as exc:
            decode_errors.append(f"{enc}: {exc}")
    if raw is None:
        joined = " | ".join(decode_errors) if decode_errors else "unknown decode error"
        raise UnicodeDecodeError("decode", b"", 0, 1, f"Unable to decode dataset {path}: {joined}")

    for idx, line in enumerate(raw.splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid JSON on line {idx} in {path}: {exc}") from exc
    return out


def normalize(value: str) -> str:
    return " ".join((value or "").casefold().split())


def post_sanitize(client: httpx.Client, base_url: str, text: str, timeout: float) -> tuple[str, float]:
    resp = client.post(
        f"{base_url.rstrip('/')}/sanitize",
        json={"input": text},
        timeout=timeout,
    )
    resp.raise_for_status()
    data = resp.json()
    out = str(data.get("output") or data.get("sanitized") or "")
    ms = resp.elapsed.total_seconds() * 1000.0
    return out, round(ms, 1)


def expected_marker(entity_type: str) -> str:
    return {
        "CPF": "[CPF]",
        "CNS": "[CNS]",
        "PHONE": "[TELEFONE]",
        "EMAIL": "[EMAIL]",
        "LONG_NUMERIC_CHAIN": "[NUM]",
        "FULL_NAME": "[NOME]",
    }.get(entity_type, "")


def evaluate_entity(entity: dict[str, Any], sanitized: str) -> tuple[str, str]:
    ent_type = str(entity.get("type") or "")
    value = str(entity.get("value") or "")
    marker = expected_marker(ent_type)
    normalized_sanitized = normalize(sanitized)
    normalized_value = normalize(value)
    has_leak = bool(normalized_value and normalized_value in normalized_sanitized)
    masked = "true" if marker and marker in sanitized else "false"
    return masked, "true" if has_leak else "false"


def write_results(path: Path, rows: list[EntityResult]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=RESULTS_HEADER)
        writer.writeheader()
        for r in rows:
            writer.writerow(
                {
                    "id": r.rid,
                    "entity_type": r.entity_type,
                    "entity_value": r.entity_value,
                    "masked": r.masked,
                    "leak": r.leak,
                    "latency_ms": r.latency_ms,
                    "input_text": r.input_text,
                    "sanitized_text": r.sanitized_text,
                    "error": r.error,
                }
            )


def write_summary(path: Path, rows: list[EntityResult]) -> None:
    by_type: dict[str, list[EntityResult]] = defaultdict(list)
    for r in rows:
        by_type[r.entity_type].append(r)

    total = len(rows)
    leaks = sum(1 for r in rows if r.leak == "true")
    leak_rate = (100.0 * leaks / total) if total else 0.0

    lines: list[str] = []
    lines.append("=== Gateway PII benchmark (50 frases) ===\n")
    lines.append(f"Entidades avaliadas: {total}")
    lines.append(f"PII Leak Rate (global): {leak_rate:.1f}% ({leaks}/{total})\n")
    lines.append("Leak por tipo:")
    for typ in sorted(by_type.keys()):
        subset = by_type[typ]
        lks = sum(1 for r in subset if r.leak == "true")
        pct = (100.0 * lks / len(subset)) if subset else 0.0
        lines.append(f"  {typ}: {pct:.1f}% ({lks}/{len(subset)})")
    lines.append("")
    lines.append("Nota: marcador esperado para FULL_NAME: [NOME].")
    text = "\n".join(lines) + "\n"
    path.write_text(text, encoding="utf-8")
    print(text)


def get_local_sanitizer() -> Callable[[str], str]:
    repo_root = BENCH_DIR.parents[2]
    clinical_ai_root = repo_root / "Codigo" / "clinical-ai"
    sys.path.insert(0, str(clinical_ai_root))
    try:
        from clinical_ai import pii  # noqa: PLC0415
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Unable to import clinical_ai locally from {clinical_ai_root}: {exc}") from exc
    return pii.sanitize_for_model


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark do gateway de privacidade (/sanitize).")
    parser.add_argument("--base-url", default="http://127.0.0.1:4010")
    parser.add_argument("--mode", choices=("http", "local"), default="http")
    parser.add_argument("--dataset", type=Path, default=DATASET)
    parser.add_argument("--timeout", type=float, default=60.0)
    parser.add_argument("--out-dir", type=Path, default=None)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = args.out_dir or (BENCH_DIR / "results" / stamp)
    results_csv = out_dir / "gateway_results.csv"
    summary_txt = out_dir / "gateway_summary.txt"

    rows = load_rows(args.dataset)
    if args.limit > 0:
        rows = rows[: args.limit]

    out_rows: list[EntityResult] = []
    local_sanitize = get_local_sanitizer() if args.mode == "local" else None
    with httpx.Client() as client:
        for row in rows:
            rid = str(row.get("id") or "")
            text = str(row.get("text") or "")
            anns = row.get("annotations") or []
            sanitized = ""
            latency_ms = ""
            err = ""
            try:
                if local_sanitize is not None:
                    sanitized = str(local_sanitize(text))
                    latency_ms = "0.0"
                else:
                    sanitized, ms = post_sanitize(client, args.base_url, text, args.timeout)
                    latency_ms = f"{ms:.1f}"
            except Exception as exc:  # noqa: BLE001
                err = str(exc)
            for ann in anns:
                if not isinstance(ann, dict):
                    continue
                ent_type = str(ann.get("type") or "")
                ent_value = str(ann.get("value") or "")
                if err:
                    masked = "false"
                    leak = "true"
                else:
                    masked, leak = evaluate_entity(ann, sanitized)
                out_rows.append(
                    EntityResult(
                        rid=rid,
                        entity_type=ent_type,
                        entity_value=ent_value,
                        masked=masked,
                        leak=leak,
                        latency_ms=latency_ms,
                        input_text=text,
                        sanitized_text=sanitized,
                        error=err,
                    )
                )

    write_results(results_csv, out_rows)
    write_summary(summary_txt, out_rows)
    print(f"Wrote {results_csv}")
    print(f"Wrote {summary_txt}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
