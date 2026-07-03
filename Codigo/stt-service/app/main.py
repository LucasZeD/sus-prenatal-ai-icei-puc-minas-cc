"""FastAPI STT service - OpenAI-compatible /v1/audio/transcriptions + health."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, File, Form, Header, UploadFile
from fastapi.responses import JSONResponse

from app.audio_preprocess import audio_rms, decode_audio, default_min_rms, preprocess

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "large-v3")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8_float16")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cuda")
STT_PREPROCESS_ENABLED = os.getenv("STT_PREPROCESS_ENABLED", "true").lower() in ("1", "true", "yes")
STT_NOISE_REDUCE = os.getenv("STT_NOISE_REDUCE", "false").lower() in ("1", "true", "yes")
STT_LANGUAGE = os.getenv("STT_LANGUAGE", "pt")
STT_BEAM_SIZE = int(os.getenv("STT_BEAM_SIZE", "8"))
STT_VAD_FILTER = os.getenv("STT_VAD_FILTER", "true").lower() in ("1", "true", "yes")
STT_INITIAL_PROMPT = os.getenv("STT_INITIAL_PROMPT", "").strip() or None
STT_CONDITION_ON_PREVIOUS_TEXT = os.getenv("STT_CONDITION_ON_PREVIOUS_TEXT", "false").lower() in (
    "1",
    "true",
    "yes",
)
STT_MIN_RMS = default_min_rms()


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name, str(default)).strip()
    try:
        return float(raw)
    except ValueError:
        return default


STT_NO_SPEECH_THRESHOLD = _env_float("STT_NO_SPEECH_THRESHOLD", 0.6)
STT_LOG_PROB_THRESHOLD = _env_float("STT_LOG_PROB_THRESHOLD", -1.0)
STT_COMPRESSION_RATIO_THRESHOLD = _env_float("STT_COMPRESSION_RATIO_THRESHOLD", 2.4)

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
        "compute_type": WHISPER_COMPUTE_TYPE,
        "device": WHISPER_DEVICE,
        "cuda": _cuda_available,
        "preprocess": STT_PREPROCESS_ENABLED,
        "noise_reduce": STT_NOISE_REDUCE,
        "language": STT_LANGUAGE,
        "beam_size": STT_BEAM_SIZE,
        "vad_filter": STT_VAD_FILTER,
        "initial_prompt_set": bool(STT_INITIAL_PROMPT),
        "condition_on_previous_text": STT_CONDITION_ON_PREVIOUS_TEXT,
        "min_rms": STT_MIN_RMS,
        "no_speech_threshold": STT_NO_SPEECH_THRESHOLD,
        "log_prob_threshold": STT_LOG_PROB_THRESHOLD,
        "compression_ratio_threshold": STT_COMPRESSION_RATIO_THRESHOLD,
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
        return JSONResponse({"text": "", "segments": []})

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
        min_rms=STT_MIN_RMS,
    )

    if audio_rms(audio) < STT_MIN_RMS:
        return JSONResponse({"text": "", "segments": []})

    if _model is None:
        return JSONResponse({"text": "", "error": "model not loaded"}, status_code=503)

    segments_out: list[dict[str, Any]] = []

    transcribe_kwargs: dict[str, Any] = {
        "language": STT_LANGUAGE,
        "beam_size": STT_BEAM_SIZE,
        "vad_filter": STT_VAD_FILTER,
        "word_timestamps": False,
        "temperature": 0,
        "condition_on_previous_text": STT_CONDITION_ON_PREVIOUS_TEXT,
        "no_speech_threshold": STT_NO_SPEECH_THRESHOLD,
        "log_prob_threshold": STT_LOG_PROB_THRESHOLD,
        "compression_ratio_threshold": STT_COMPRESSION_RATIO_THRESHOLD,
    }
    if STT_INITIAL_PROMPT:
        transcribe_kwargs["initial_prompt"] = STT_INITIAL_PROMPT

    segs, _info = _model.transcribe(audio, **transcribe_kwargs)
    full_parts: list[str] = []
    for s in segs:
        t = (s.text or "").strip()
        if not t:
            continue
        full_parts.append(t)
        segments_out.append({"start": s.start, "end": s.end, "text": t})

    plain_text = " ".join(full_parts).strip()

    return JSONResponse(
        {
            "text": plain_text,
            "segments": segments_out,
        }
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
