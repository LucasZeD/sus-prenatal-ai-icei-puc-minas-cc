#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Verifica resolucao de audios do corpus e (opcional) transcricao no stt-service."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import httpx

BENCH_DIR = Path(__file__).resolve().parent
ROOT = BENCH_DIR.parent.parent
sys.path.insert(0, str(ROOT / "lib"))
from paths import STT_DATA  # noqa: E402

DATASET = STT_DATA
DEFAULT_CORPORA = [
    DATASET / "stt_corpus.jsonl",
    DATASET / "stt_corpus_medical.jsonl",
    DATASET / "stt_corpus_coraa.jsonl",
]


def load_corpus(path: Path) -> list[dict]:
    rows: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


def resolve_audio(audio_dir: Path, row: dict) -> Path:
    clip_id = str(row.get("id", ""))
    audio_name = row.get("audio_file") or f"{clip_id}.wav"
    return audio_dir / audio_name


def check_corpus(corpus_path: Path, audio_dir: Path) -> tuple[int, int, list[str]]:
    if not corpus_path.is_file():
        return 0, 0, [f"corpus ausente: {corpus_path}"]
    rows = load_corpus(corpus_path)
    missing: list[str] = []
    ok = 0
    for row in rows:
        ap = resolve_audio(audio_dir, row)
        if ap.is_file() and ap.stat().st_size > 0:
            ok += 1
        else:
            missing.append(f"{row.get('id')}: {ap}")
    return ok, len(rows), missing


def probe_stt(stt_url: str, audio_path: Path, timeout: float) -> tuple[bool, str]:
    with httpx.Client() as client:
        health = client.get(f"{stt_url.rstrip('/')}/health", timeout=timeout)
        health.raise_for_status()
        with audio_path.open("rb") as fh:
            resp = client.post(
                f"{stt_url.rstrip('/')}/v1/audio/transcriptions",
                files={"file": (audio_path.name, fh, "audio/wav")},
                data={"model": "whisper-1"},
                timeout=timeout,
            )
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        body = resp.json()
        text = str(body.get("text") or "").strip()
        if not text:
            return False, "resposta vazia"
        return True, text[:160]


def main() -> int:
    parser = argparse.ArgumentParser(description="Verifica audios STT e opcionalmente transcreve 1 clip.")
    parser.add_argument("--corpus", type=Path, action="append", default=[], help="JSONL (repita para varios)")
    parser.add_argument("--audio-dir", type=Path, default=DATASET / "audio")
    parser.add_argument("--stt-url", default="http://127.0.0.1:8000")
    parser.add_argument("--probe-id", default="", help="ID do clip para transcricao de prova (ex. M003)")
    parser.add_argument("--timeout", type=float, default=120.0)
    parser.add_argument("--skip-probe", action="store_true")
    args = parser.parse_args()

    corpora = args.corpus or DEFAULT_CORPORA
    failed = False
    any_corpus_ok = False

    print("=== Verificacao de arquivos de audio ===\n")
    first_ok_path: Path | None = None
    for corpus_path in corpora:
        ok, total, missing = check_corpus(corpus_path, args.audio_dir)
        status = "OK" if ok == total and total > 0 else ("PARCIAL" if ok else "FALHA")
        if corpus_path.is_file():
            print(f"{corpus_path.name}: {ok}/{total} audios ({status})")
        else:
            print(f"{corpus_path.name}: (nao encontrado)")
            continue
        if missing:
            failed = True
            for m in missing[:5]:
                print(f"  - ausente: {m}")
            if len(missing) > 5:
                print(f"  - ... +{len(missing) - 5} ausentes")
        elif ok == total and total > 0:
            any_corpus_ok = True
            if first_ok_path is None:
                rows = load_corpus(corpus_path)
                first_ok_path = resolve_audio(args.audio_dir, rows[0])

    if args.skip_probe:
        return 0 if any_corpus_ok else 1

    if not any_corpus_ok:
        print("\nNenhum corpus com todos os audios presentes.", file=sys.stderr)
        return 1

    probe_row: dict | None = None
    probe_path: Path | None = None
    for corpus_path in corpora:
        if not corpus_path.is_file():
            continue
        for row in load_corpus(corpus_path):
            if args.probe_id and row.get("id") != args.probe_id:
                continue
            ap = resolve_audio(args.audio_dir, row)
            if ap.is_file():
                probe_row = row
                probe_path = ap
                break
        if probe_path:
            break
    if probe_path is None and first_ok_path is not None:
        probe_path = first_ok_path

    if probe_path is None:
        print("\nNenhum audio disponivel para prova STT.", file=sys.stderr)
        return 1

    print(f"\n=== Prova STT ({args.stt_url}) ===\n")
    print(f"clip: {probe_row.get('id') if probe_row else probe_path.name}")
    print(f"arquivo: {probe_path}")
    try:
        ok, detail = probe_stt(args.stt_url, probe_path, args.timeout)
    except Exception as exc:
        print(f"FALHA: {exc}", file=sys.stderr)
        print(
            "\nDica: suba o stt com COMPOSE_PROFILES=ai e publique a porta "
            "(STT_PUBLISH_PORT=8000 no Codigo/.env).",
            file=sys.stderr,
        )
        return 1

    if ok:
        print(f"OK: {detail}")
        if probe_row:
            ref = str(probe_row.get("reference_text") or "")[:160]
            print(f"ref: {ref}")
        return 0 if ok else 1

    print(f"FALHA STT: {detail}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
