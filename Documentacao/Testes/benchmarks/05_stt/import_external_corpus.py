#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Importa corpora externos (HF medical, CORAA) para stt_corpus_*.jsonl + audio/manual/."""
from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

BENCH_DIR = Path(__file__).resolve().parent
ROOT = BENCH_DIR.parent.parent
sys.path.insert(0, str(ROOT / "lib"))
from paths import STT_DATA  # noqa: E402

DATASET_DIR = STT_DATA
AUDIO_MANUAL = DATASET_DIR / "audio" / "manual"
EXTERNAL_DIR = DATASET_DIR / "external"
DEFAULT_MEDICAL_DIR = EXTERNAL_DIR / "medical_audio_ptbr"
DEFAULT_CORAA_DIR = EXTERNAL_DIR / "coraa"
TARGET_SR = 16_000

STEP_DIFFICULTY = {
    "terminology_definition_pair": "medium",
    "structured_question_answer": "medium",
    "multi_speaker_dialog": "hard",
    "long_form_narration": "hard",
    "source_notes_narration": "hard",
}


def load_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    for idx, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError as exc:
            raise ValueError(f"JSON invalido linha {idx} em {path}: {exc}") from exc
    return rows


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + ("\n" if rows else ""),
        encoding="utf-8",
    )


def resample_wav(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if shutil.which("ffmpeg") is None:
        shutil.copy2(src, dst)
        return
    cmd = [
        "ffmpeg",
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
        raise RuntimeError(f"ffmpeg falhou para {src.name}: {err}")


def copy_or_resample(src: Path, dst: Path, resample: bool) -> None:
    if resample:
        resample_wav(src, dst)
    else:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


def guess_phrases(text: str, max_phrases: int = 3) -> str:
    """Extrai frases curtas para phrase_recall a partir do texto de referencia."""
    cleaned = re.sub(r"\s+", " ", (text or "").strip())
    if not cleaned:
        return ""
    parts = re.split(r"[.!?;]\s+", cleaned)
    phrases: list[str] = []
    for part in parts:
        part = part.strip(" ,:")
        if len(part) < 8:
            continue
        if len(part) > 80:
            part = " ".join(part.split()[:6])
        phrases.append(part)
        if len(phrases) >= max_phrases:
            break
    return ";".join(phrases)


def download_coraa_dataset(dest: Path) -> Path:
    try:
        from huggingface_hub import hf_hub_download
    except ImportError as exc:
        raise ImportError("Instale huggingface_hub no venv: pip install huggingface_hub") from exc

    import zipfile

    dest.mkdir(parents=True, exist_ok=True)
    meta = hf_hub_download(
        repo_id="gabrielrstan/CORAA-v1.1",
        repo_type="dataset",
        filename="metadata_dev_final.csv",
        local_dir=str(dest),
    )
    print(f"Metadata: {meta}")
    zip_path = hf_hub_download(
        repo_id="gabrielrstan/CORAA-v1.1",
        repo_type="dataset",
        filename="dev.zip",
        local_dir=str(dest),
    )
    dev_dir = dest / "dev"
    if not dev_dir.is_dir() or not any(dev_dir.iterdir()):
        print(f"Extraindo {zip_path} ...")
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(dest)
    return dest


def download_medical_dataset(dest: Path) -> Path:
    try:
        from huggingface_hub import snapshot_download
    except ImportError as exc:
        raise ImportError("Instale huggingface_hub no venv: pip install huggingface_hub") from exc

    dest.mkdir(parents=True, exist_ok=True)
    snapshot_download(
        repo_id="juliasdata/medical-audio-sample-brazilian-portuguese",
        repo_type="dataset",
        local_dir=str(dest),
    )
    return dest


def import_medical(
    dataset_dir: Path,
    corpus_out: Path,
    audio_manual: Path,
    limit: int,
    resample: bool,
) -> int:
    segments_path = dataset_dir / "manifests" / "segments.jsonl"
    if not segments_path.is_file():
        print(f"Manifesto ausente: {segments_path}", file=sys.stderr)
        print("Baixe com: .venv/bin/python import_external_corpus.py --source medical --download", file=sys.stderr)
        return 1

    segments = sorted(
        load_jsonl(segments_path),
        key=lambda s: (str(s.get("step_type", "")), int(s.get("segment_index", 0))),
    )
    if limit > 0:
        segments = segments[:limit]

    rows: list[dict] = []
    for idx, seg in enumerate(segments, start=1):
        wav_rel = seg.get("audio_wav_path")
        if not wav_rel:
            continue
        src = dataset_dir / str(wav_rel)
        if not src.is_file():
            print(f"[skip] audio ausente: {src}", file=sys.stderr)
            continue

        clip_id = f"M{idx:03d}"
        audio_file = f"manual/{clip_id}.wav"
        dst = audio_manual / f"{clip_id}.wav"
        copy_or_resample(src, dst, resample=resample)

        text = str(seg.get("text_normalized") or seg.get("text_verbatim") or "").strip()
        step_type = str(seg.get("step_type") or "medical")
        word_count = int(seg.get("word_count") or len(text.split()))
        if word_count < 18:
            difficulty = "easy"
        elif word_count < 45:
            difficulty = "medium"
        else:
            difficulty = "hard"
        difficulty = STEP_DIFFICULTY.get(step_type, difficulty)

        rows.append(
            {
                "id": clip_id,
                "difficulty": difficulty,
                "scenario": step_type,
                "reference_text": text,
                "expected_phrases_pt": guess_phrases(text),
                "jargon_terms_pt": "",
                "audio_file": audio_file,
                "source": "hf_medical_ptbr",
                "segment_id": seg.get("segment_id"),
                "segment_role": seg.get("segment_role"),
            }
        )
        print(f"[medical] {clip_id} <- {src.name} ({step_type}, {word_count} palavras)")

    write_jsonl(corpus_out, rows)
    print(f"Corpus: {corpus_out} ({len(rows)} clips)")
    print(f"Audio: {audio_manual}/")
    return 0 if rows else 1


def import_coraa(
    metadata_csv: Path,
    audio_root: Path,
    corpus_out: Path,
    audio_manual: Path,
    limit: int,
    resample: bool,
    variety: str,
    spontaneous_only: bool,
) -> int:
    if not metadata_csv.is_file():
        print(f"CSV ausente: {metadata_csv}", file=sys.stderr)
        return 1

    selected: list[dict[str, str]] = []
    with metadata_csv.open(encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            var = (row.get("variety") or "").strip().casefold().replace("-", "_")
            target = variety.strip().casefold().replace("-", "_")
            if variety and var and var != target:
                continue
            if spontaneous_only:
                style = (row.get("speech_style") or "").strip()
                if style and "spontaneous" not in style.casefold():
                    continue
            text = (row.get("text") or "").strip()
            file_path = (row.get("file_path") or "").strip()
            if not text or not file_path:
                continue
            selected.append(row)

    if limit > 0:
        selected = selected[:limit]

    rows: list[dict] = []
    for idx, row in enumerate(selected, start=1):
        file_path = row["file_path"]
        src = audio_root / file_path
        if not src.is_file():
            alt = audio_root / Path(file_path).name
            src = alt if alt.is_file() else src
        if not src.is_file():
            print(f"[skip] audio ausente: {file_path}", file=sys.stderr)
            continue

        clip_id = f"C{idx:03d}"
        audio_file = f"manual/{clip_id}.wav"
        dst = audio_manual / f"{clip_id}.wav"
        copy_or_resample(src, dst, resample=resample)

        text = row["text"].strip()
        word_count = len(text.split())
        if word_count < 12:
            difficulty = "easy"
        elif word_count < 30:
            difficulty = "medium"
        else:
            difficulty = "hard"

        rows.append(
            {
                "id": clip_id,
                "difficulty": difficulty,
                "scenario": "coraa_spontaneous" if spontaneous_only else "coraa",
                "reference_text": text,
                "expected_phrases_pt": guess_phrases(text, max_phrases=2),
                "jargon_terms_pt": "",
                "audio_file": audio_file,
                "source": "coraa",
                "coraa_file_path": file_path,
                "accent": row.get("accent") or "",
                "speech_style": row.get("speech_style") or "",
            }
        )
        print(f"[coraa] {clip_id} <- {src.name}")

    write_jsonl(corpus_out, rows)
    print(f"Corpus: {corpus_out} ({len(rows)} clips)")
    return 0 if rows else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Importa corpus STT externos para o benchmark Escriba.")
    parser.add_argument(
        "--source",
        choices=["medical", "coraa"],
        required=True,
        help="Fonte do corpus",
    )
    parser.add_argument(
        "--download",
        action="store_true",
        help="Baixar dataset do Hugging Face (medical ou coraa)",
    )
    parser.add_argument(
        "--dataset-dir",
        type=Path,
        default=DEFAULT_MEDICAL_DIR,
        help="Pasta do dataset medical (manifests/segments.jsonl)",
    )
    parser.add_argument(
        "--coraa-metadata",
        type=Path,
        help="CSV CORAA (ex.: metadata_dev_final.csv)",
    )
    parser.add_argument(
        "--coraa-audio-root",
        type=Path,
        help="Raiz dos audios CORAA (onde file_path do CSV resolve)",
    )
    parser.add_argument(
        "--coraa-variety",
        default="PT_BR",
        help="Filtrar variety no CSV CORAA (default PT_BR)",
    )
    parser.add_argument(
        "--coraa-spontaneous-only",
        action="store_true",
        help="Apenas speech_style=Spontaneous Speech",
    )
    parser.add_argument(
        "--out-corpus",
        type=Path,
        default=None,
        help="Saida JSONL (default: stt_corpus_medical.jsonl ou stt_corpus_coraa.jsonl)",
    )
    parser.add_argument(
        "--audio-dir",
        type=Path,
        default=AUDIO_MANUAL,
        help="Pasta de saida dos WAV (default dataset/audio/manual)",
    )
    parser.add_argument("--limit", type=int, default=0, help="Limitar clips (0 = todos)")
    parser.add_argument(
        "--no-resample",
        action="store_true",
        help="Copiar WAV sem converter para 16 kHz mono",
    )
    args = parser.parse_args()

    if args.source == "medical":
        if args.download:
            print(f"Baixando para {args.dataset_dir} ...")
            download_medical_dataset(args.dataset_dir)
        corpus_out = args.out_corpus or (DATASET_DIR / "stt_corpus_medical.jsonl")
        return import_medical(
            args.dataset_dir,
            corpus_out,
            args.audio_dir,
            args.limit,
            resample=not args.no_resample,
        )

    if not args.coraa_metadata or not args.coraa_audio_root:
        coraa_dir = DEFAULT_CORAA_DIR
        if args.download:
            print(f"Baixando CORAA para {coraa_dir} ...")
            download_coraa_dataset(coraa_dir)
        meta = coraa_dir / "metadata_dev_final.csv"
        audio_root = coraa_dir
        if not meta.is_file():
            print("CORAA exige --coraa-metadata ou --download", file=sys.stderr)
            return 1
        args.coraa_metadata = meta
        args.coraa_audio_root = audio_root

    corpus_out = args.out_corpus or (DATASET_DIR / "stt_corpus_coraa.jsonl")
    return import_coraa(
        args.coraa_metadata,
        args.coraa_audio_root,
        corpus_out,
        args.audio_dir,
        args.limit,
        resample=not args.no_resample,
        variety=args.coraa_variety,
        spontaneous_only=args.coraa_spontaneous_only,
    )


if __name__ == "__main__":
    raise SystemExit(main())
