#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gera arquivos WAV 16 kHz mono a partir de stt_corpus.jsonl via edge-tts."""
from __future__ import annotations

import argparse
import asyncio
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

BENCH_DIR = Path(__file__).resolve().parent
ROOT = BENCH_DIR.parent.parent
sys.path.insert(0, str(ROOT / "lib"))
from paths import STT_DATA  # noqa: E402

DATASET = STT_DATA / "stt_corpus.jsonl"
AUDIO_DIR = STT_DATA / "audio"
DEFAULT_VOICE = "pt-BR-FranciscaNeural"
TARGET_SR = 16_000


def load_corpus(path: Path) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    raw = path.read_text(encoding="utf-8")
    for idx, line in enumerate(raw.splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError as exc:
            raise ValueError(f"JSON inválido na linha {idx} de {path}: {exc}") from exc
    return rows


async def synthesize_one(text: str, out_wav: Path, voice: str) -> None:
    import edge_tts

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        mp3_path = Path(tmp.name)
    try:
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(str(mp3_path))
        _mp3_to_wav_mono_16k(mp3_path, out_wav)
    finally:
        mp3_path.unlink(missing_ok=True)


def _ffmpeg_exe() -> str:
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError as exc:
        raise RuntimeError(
            "ffmpeg ausente: instale ffmpeg no sistema ou pip install imageio-ffmpeg"
        ) from exc


def _mp3_to_wav_mono_16k(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg = _ffmpeg_exe()
    cmd = [
        ffmpeg,
        "-y",
        "-i",
        str(src),
        "-ac",
        "1",
        "-ar",
        str(TARGET_SR),
        "-f",
        "wav",
        str(dst),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "")[:800]
        raise RuntimeError(f"ffmpeg falhou ao converter {src.name}: {err}")


async def run_all(rows: list[dict[str, str]], voice: str, force: bool) -> int:
    generated = 0
    skipped = 0
    for row in rows:
        clip_id = row.get("id", "")
        audio_file = row.get("audio_file") or f"{clip_id}.wav"
        reference = (row.get("reference_text") or "").strip()
        if not reference:
            print(f"[skip] {clip_id}: reference_text vazio", file=sys.stderr)
            skipped += 1
            continue
        out_path = AUDIO_DIR / audio_file
        if out_path.is_file() and not force:
            print(f"[ok] {out_path.name} já existe")
            skipped += 1
            continue
        print(f"[tts] {clip_id} -> {out_path.name}")
        await synthesize_one(reference, out_path, voice)
        generated += 1
    print(f"Concluído: {generated} gerados, {skipped} ignorados em {AUDIO_DIR}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Gera WAV TTS para o corpus STT.")
    parser.add_argument("--corpus", type=Path, default=DATASET)
    parser.add_argument("--voice", default=DEFAULT_VOICE)
    parser.add_argument("--force", action="store_true", help="Regenerar mesmo se o WAV existir")
    args = parser.parse_args()

    if not args.corpus.is_file():
        print(f"Corpus ausente: {args.corpus}", file=sys.stderr)
        return 1

    try:
        import edge_tts  # noqa: F401
    except ImportError:
        print("Instale edge-tts: pip install edge-tts", file=sys.stderr)
        return 1

    rows = load_corpus(args.corpus)
    return asyncio.run(run_all(rows, args.voice, args.force))


if __name__ == "__main__":
    raise SystemExit(main())
