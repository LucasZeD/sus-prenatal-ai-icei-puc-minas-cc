"""FastAPI STT service - OpenAI-compatible /v1/audio/transcriptions + health."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import Any

import numpy as np
from fastapi import FastAPI, File, Form, Header, UploadFile
from fastapi.responses import JSONResponse

from app.audio_preprocess import TARGET_SR, decode_audio, preprocess
from app.diarization import Segment, diarize_simple, format_diarized_text

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "large-v3")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8_float16")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cuda")
STT_PREPROCESS_ENABLED = os.getenv("STT_PREPROCESS_ENABLED", "true").lower() in ("1", "true", "yes")
STT_NOISE_REDUCE = os.getenv("STT_NOISE_REDUCE", "false").lower() in ("1", "true", "yes")
STT_DIARIZATION_ENABLED = os.getenv("STT_DIARIZATION_ENABLED", "true").lower() in ("1", "true", "yes")
STT_LANGUAGE = os.getenv("STT_LANGUAGE", "pt")

_model = None
_cuda_available = False


def _load_model():
    global _model, _cuda_available
    from faster_whisper import WhisperModel

    device = WHISPER_DEVICE
    compute_type = WHISPER_COMPUTE_TYPE
    try:
        _model = WhisperModel(WHISPER_MODEL, device=device, compute_type=compute_type)
        _cuda_available = device == "cuda"
        log.info("Loaded Whisper model=%s device=%s compute=%s", WHISPER_MODEL, device, compute_type)
    except Exception as e:
        log.warning("CUDA load failed (%s), falling back to CPU", e)
        _model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
        _cuda_available = False


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _load_model()
    yield


app = FastAPI(title="STT Service", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok" if _model is not None else "loading",
        "model": WHISPER_MODEL,
        "cuda": _cuda_available,
        "preprocess": STT_PREPROCESS_ENABLED,
        "diarization": STT_DIARIZATION_ENABLED,
    }


def _env_preprocess(header: str | None, form_val: str | None) -> bool:
    if header is not None:
        return header.strip() in ("1", "true", "yes")
    if form_val is not None:
        return form_val.lower() in ("1", "true", "yes")
    return STT_PREPROCESS_ENABLED


@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    model: str = Form(default="whisper-1"),
    x_stt_preprocess: str | None = Header(default=None, alias="X-STT-Preprocess"),
    preprocess_field: str | None = Form(default=None, alias="preprocess"),
) -> JSONResponse:
    _ = model  # ignored; WHISPER_MODEL env drives backend
    raw = await file.read()
    if not raw:
        return JSONResponse({"text": "", "segments": [], "speakers": []})

    filename = file.filename or "chunk.webm"
    do_preprocess = _env_preprocess(x_stt_preprocess, preprocess_field)

    try:
        audio = decode_audio(raw, filename=filename)
    except Exception as e:
        log.exception("decode failed")
        return JSONResponse({"text": "", "error": str(e)}, status_code=400)

    audio = preprocess(
        audio,
        enabled=do_preprocess,
        noise_reduce=STT_NOISE_REDUCE,
    )

    if _model is None:
        return JSONResponse({"text": "", "error": "model not loaded"}, status_code=503)

    segments_out: list[dict[str, Any]] = []
    whisper_segments: list[Segment] = []

    segs, _info = _model.transcribe(
        audio,
        language=STT_LANGUAGE,
        beam_size=5,
        vad_filter=True,
        word_timestamps=False,
    )
    full_parts: list[str] = []
    for s in segs:
        t = (s.text or "").strip()
        if not t:
            continue
        full_parts.append(t)
        whisper_segments.append(Segment(start=float(s.start), end=float(s.end), text=t))
        segments_out.append({"start": s.start, "end": s.end, "text": t})

    plain_text = " ".join(full_parts).strip()

    labeled, speaker_blocks = diarize_simple(
        audio,
        TARGET_SR,
        whisper_segments,
        enabled=STT_DIARIZATION_ENABLED,
    )

    speakers_json: list[dict[str, str | int]] = [
        {"id": b.id, "label": b.label, "text": b.text} for b in speaker_blocks
    ]

    if speaker_blocks:
        text = format_diarized_text(speaker_blocks)
    else:
        text = plain_text

    return JSONResponse(
        {
            "text": text or plain_text,
            "segments": segments_out,
            "speakers": speakers_json,
        }
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
