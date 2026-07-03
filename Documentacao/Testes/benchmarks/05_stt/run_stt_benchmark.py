#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Benchmark STT: matriz de ablações, WER, phrase recall, latência."""
from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import yaml

BENCH_DIR = Path(__file__).resolve().parent
ROOT = BENCH_DIR.parent.parent
sys.path.insert(0, str(ROOT / "lib"))
from paths import STT_DATA  # noqa: E402
from bench_scoring import split_phrases  # noqa: E402
from stt_scoring import (  # noqa: E402
    compute_cer,
    compute_wer,
    jargon_hits,
    phrase_recall,
    strip_diarization_labels,
)

DATASET = STT_DATA / "stt_corpus.jsonl"
AUDIO_DIR = STT_DATA / "audio"
PRESETS = BENCH_DIR / "stt_ablation_presets.yaml"

RESULTS_HEADER = [
    "clip_id",
    "difficulty",
    "scenario",
    "corpus",
    "preset_id",
    "ablation_id",
    "whisper_model",
    "compute_type",
    "beam_size",
    "vad_filter",
    "initial_prompt_set",
    "preprocess",
    "noise_reduce",
    "cuda",
    "latency_ms",
    "http_status",
    "error",
    "text_len",
    "empty_response",
    "wer_pct",
    "cer_pct",
    "phrase_recall_pct",
    "missing_phrases",
    "jargon_hits",
    "jargon_total",
    "response_preview",
]


@dataclass
class AblationRequest:
    ablation_id: str
    preprocess: bool | None = None


def load_corpus(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for idx, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError as exc:
            raise ValueError(f"JSON inválido linha {idx}: {exc}") from exc
    return rows


def load_presets(path: Path) -> dict[str, list[dict[str, Any]]]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"Presets inválidos: {path}")
    return {
        "per_request": list(data.get("per_request") or []),
        "container": list(data.get("container") or []),
    }


def ablations_for_mode(mode: str, presets: dict[str, list[dict[str, Any]]]) -> list[AblationRequest]:
    if mode == "per_request":
        out: list[AblationRequest] = []
        for p in presets["per_request"]:
            req = p.get("request") or {}
            preprocess = req.get("preprocess")
            out.append(
                AblationRequest(
                    ablation_id=str(p.get("id", "unknown")),
                    preprocess=bool(preprocess) if preprocess is not None else None,
                )
            )
        return out or [AblationRequest(ablation_id="default", preprocess=None)]
    if mode == "container":
        return [AblationRequest(ablation_id="current_container", preprocess=None)]
    if mode == "all":
        seen: set[str] = set()
        merged: list[AblationRequest] = []
        for a in ablations_for_mode("per_request", presets) + ablations_for_mode("container", presets):
            if a.ablation_id not in seen:
                seen.add(a.ablation_id)
                merged.append(a)
        return merged
    return [AblationRequest(ablation_id="default", preprocess=None)]


def fetch_health(client: httpx.Client, base_url: str, timeout: float) -> dict[str, Any]:
    resp = client.get(f"{base_url.rstrip('/')}/health", timeout=timeout)
    resp.raise_for_status()
    body = resp.json()
    return body if isinstance(body, dict) else {}


def transcribe_file(
    client: httpx.Client,
    base_url: str,
    audio_path: Path,
    ablation: AblationRequest,
    timeout: float,
) -> tuple[int, dict[str, Any], float, str | None]:
    headers: dict[str, str] = {}
    data: dict[str, str] = {"model": "whisper-1"}
    if ablation.preprocess is not None:
        headers["X-STT-Preprocess"] = "1" if ablation.preprocess else "0"
        data["preprocess"] = "true" if ablation.preprocess else "false"

    started = time.perf_counter()
    error: str | None = None
    try:
        with audio_path.open("rb") as fh:
            files = {"file": (audio_path.name, fh, "audio/wav")}
            resp = client.post(
                f"{base_url.rstrip('/')}/v1/audio/transcriptions",
                files=files,
                data=data,
                headers=headers,
                timeout=timeout,
            )
        latency_ms = (time.perf_counter() - started) * 1000.0
        try:
            body = resp.json()
        except Exception:
            body = {"text": "", "error": resp.text[:500]}
        if not isinstance(body, dict):
            body = {"text": "", "error": "invalid_json"}
        return resp.status_code, body, latency_ms, error
    except Exception as exc:
        latency_ms = (time.perf_counter() - started) * 1000.0
        return 0, {"text": "", "error": str(exc)}, latency_ms, str(exc)


def score_row(
    reference: str,
    hypothesis: str,
    expected_phrases: str,
    jargon_terms_field: str,
) -> dict[str, Any]:
    hyp_clean = strip_diarization_labels(hypothesis)
    try:
        wer = compute_wer(reference, hyp_clean)
        cer = compute_cer(reference, hyp_clean)
    except Exception:
        wer = -1.0
        cer = -1.0
    pr = phrase_recall(hyp_clean, expected_phrases)
    terms = split_phrases(jargon_terms_field) if jargon_terms_field.strip() else None
    jh = jargon_hits(hyp_clean, terms)
    return {
        "wer_pct": f"{wer:.2f}" if wer >= 0 else "",
        "cer_pct": f"{cer:.2f}" if cer >= 0 else "",
        "phrase_recall_pct": f"{pr.recall_pct:.1f}",
        "missing_phrases": ";".join(pr.missing),
        "jargon_hits": str(jh.hits),
        "jargon_total": str(jh.total),
    }


def write_summary(out_dir: Path, rows: list[dict[str, str]]) -> None:
    if not rows:
        return
    numeric_rows = [r for r in rows if r.get("wer_pct") and r["wer_pct"] != ""]
    wers = [float(r["wer_pct"]) for r in numeric_rows]
    recalls = [float(r["phrase_recall_pct"]) for r in rows if r.get("phrase_recall_pct")]
    latencies = [float(r["latency_ms"]) for r in rows if r.get("latency_ms")]
    empty = sum(1 for r in rows if r.get("empty_response") == "true")

    lines = [
        "=== Resumo STT benchmark ===",
        f"utterances: {len(rows)}",
        f"wer_mean_pct: {sum(wers) / len(wers):.2f}" if wers else "wer_mean_pct: n/a",
        f"phrase_recall_mean_pct: {sum(recalls) / len(recalls):.1f}" if recalls else "phrase_recall_mean_pct: n/a",
        f"latency_mean_ms: {sum(latencies) / len(latencies):.0f}" if latencies else "latency_mean_ms: n/a",
        f"empty_response_count: {empty}",
    ]
    (out_dir / "summary_stt.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark STT (faster-whisper service).")
    parser.add_argument("--stt-url", default="http://127.0.0.1:8000")
    parser.add_argument("--corpus", type=Path, default=DATASET)
    parser.add_argument("--audio-dir", type=Path, default=AUDIO_DIR)
    parser.add_argument("--presets", type=Path, default=PRESETS)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument(
        "--ablation",
        choices=["per_request", "container", "all", "none"],
        default="per_request",
    )
    parser.add_argument("--limit", type=int, default=0, help="Limitar número de clips (0 = todos)")
    parser.add_argument("--preset-id", default="", help="ID do preset de container (rastreio)")
    parser.add_argument("--corpus-tag", default="", help="Tag do corpus (tts, medical, coraa)")
    parser.add_argument("--timeout", type=float, default=120.0)
    parser.add_argument("--dry-run", action="store_true", help="Validar corpus sem chamar STT")
    args = parser.parse_args()

    if not args.corpus.is_file():
        print(f"Corpus ausente: {args.corpus}", file=sys.stderr)
        return 1

    corpus = load_corpus(args.corpus)
    if args.limit > 0:
        corpus = corpus[: args.limit]

    missing_audio = [
        r["id"]
        for r in corpus
        if not (args.audio_dir / (r.get("audio_file") or f"{r['id']}.wav")).is_file()
    ]
    if missing_audio and not args.dry_run:
        print(
            f"Áudio ausente para: {', '.join(missing_audio)}. "
            f"Execute: generate_tts_audio.py ou import_external_corpus.py",
            file=sys.stderr,
        )
        return 1

    corpus_tag = args.corpus_tag or args.corpus.stem.replace("stt_corpus_", "").replace("stt_corpus", "tts")
    preset_id = args.preset_id or ""

    presets = load_presets(args.presets) if args.presets.is_file() else {"per_request": [], "container": []}
    ablations = ablations_for_mode(args.ablation, presets) if args.ablation != "none" else [
        AblationRequest(ablation_id="default")
    ]

    args.out_dir.mkdir(parents=True, exist_ok=True)
    results_path = args.out_dir / "stt_results.csv"

    if args.dry_run:
        print(f"Dry-run OK: {len(corpus)} clips, {len(ablations)} ablações")
        return 0

    health: dict[str, Any] = {}
    result_rows: list[dict[str, str]] = []

    with httpx.Client() as client:
        try:
            health = fetch_health(client, args.stt_url, args.timeout)
        except Exception as exc:
            print(f"Aviso: /health falhou ({exc})", file=sys.stderr)
            health = {"status": "error", "error": str(exc)}

        health_snapshot = {
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "stt_url": args.stt_url,
            "health": health,
        }
        (args.out_dir / "health_snapshot.json").write_text(
            json.dumps(health_snapshot, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        for ablation in ablations:
            for row in corpus:
                clip_id = str(row.get("id", ""))
                audio_name = row.get("audio_file") or f"{clip_id}.wav"
                audio_path = args.audio_dir / audio_name
                status, body, latency_ms, err = transcribe_file(
                    client, args.stt_url, audio_path, ablation, args.timeout
                )
                text = str(body.get("text") or "")
                scores = score_row(
                    str(row.get("reference_text") or ""),
                    text,
                    str(row.get("expected_phrases_pt") or ""),
                    str(row.get("jargon_terms_pt") or ""),
                )
                result_rows.append(
                    {
                        "clip_id": clip_id,
                        "difficulty": str(row.get("difficulty") or ""),
                        "scenario": str(row.get("scenario") or ""),
                        "corpus": corpus_tag,
                        "preset_id": preset_id,
                        "ablation_id": ablation.ablation_id,
                        "whisper_model": str(health.get("model") or ""),
                        "compute_type": str(health.get("compute_type") or ""),
                        "beam_size": str(health.get("beam_size") or ""),
                        "vad_filter": str(health.get("vad_filter") or ""),
                        "initial_prompt_set": str(health.get("initial_prompt_set") or ""),
                        "preprocess": str(ablation.preprocess if ablation.preprocess is not None else health.get("preprocess")),
                        "noise_reduce": str(health.get("noise_reduce") or ""),
                        "cuda": str(health.get("cuda") or ""),
                        "latency_ms": f"{latency_ms:.1f}",
                        "http_status": str(status),
                        "error": err or str(body.get("error") or ""),
                        "text_len": str(len(text)),
                        "empty_response": "true" if not text.strip() else "false",
                        "response_preview": text[:200].replace("\n", " "),
                        **scores,
                    }
                )

    with results_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=RESULTS_HEADER, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(result_rows)

    write_summary(args.out_dir, result_rows)
    print(f"Resultados: {results_path}")
    print(f"Resumo: {args.out_dir / 'summary_stt.txt'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
