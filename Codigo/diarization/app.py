"""FastAPI diarization service (pyannote.audio 3.1, 100% local).

Contrato espelhado no `stt-service`: microserviço HTTP de responsabilidade única,
consumido por um client fino no backend Node (`diarizationClient.ts`).

Privacidade (LGPD):
- Nenhum conteúdo de áudio/transcrição é logado.
- Áudio é processado em memória/arquivo temporário e descartado ao fim da requisição.
- Em runtime os modelos vêm do cache da imagem/volume (`HF_HUB_OFFLINE=1`); sem rede externa.

Backends:
- `pyannote`  : pipeline `pyannote/speaker-diarization-3.1` (qualidade; PyTorch).
- `fallback`  : agrupamento espectral 2-means em numpy puro (sem PyTorch), usado quando
                o pyannote não está disponível e nos testes offline. Mantém o MESMO contrato.
- `auto`      : tenta pyannote; cai para fallback se o pipeline não carregar.
"""

from __future__ import annotations

import asyncio
import io
import logging
import os
import subprocess
import tempfile
import wave
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any

import numpy as np
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("diarization")

TARGET_SR = 16_000

DIARIZATION_MODEL = os.getenv("DIARIZATION_MODEL", "pyannote/speaker-diarization-3.1")
DIARIZATION_DEVICE = os.getenv("DIARIZATION_DEVICE", "cpu").strip().lower()
DIARIZATION_BACKEND = os.getenv("DIARIZATION_BACKEND", "auto").strip().lower()
DIARIZATION_CONCURRENCY_LIMIT = max(
    1, int(os.getenv("DIARIZATION_CONCURRENCY_LIMIT", "1") or "1")
)
# Janela do fallback (segundos) para feature/clustering quando o pyannote não roda.
FALLBACK_WINDOW_S = float(os.getenv("DIARIZATION_FALLBACK_WINDOW_S", "1.0") or "1.0")

_semaphore = asyncio.Semaphore(DIARIZATION_CONCURRENCY_LIMIT)
_pipeline: Any | None = None
_active_backend = "fallback"


# --------------------------------------------------------------------------- #
# Decodificação de áudio (WebM/WAV/PCM) -> float32 mono @ 16 kHz               #
# --------------------------------------------------------------------------- #
def _ffmpeg_to_wav(raw: bytes, suffix: str) -> bytes:
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as inp:
        inp.write(raw)
        inp_path = inp.name
    out_path = inp_path + ".wav"
    try:
        fmt = "webm" if suffix.lower() in (".webm", ".mkv") else None
        cmd = [
            "ffmpeg",
            "-y",
            *([] if fmt is None else ["-f", fmt]),
            "-i",
            inp_path,
            "-ac",
            "1",
            "-ar",
            str(TARGET_SR),
            "-f",
            "wav",
            out_path,
        ]
        proc = subprocess.run(cmd, capture_output=True, timeout=120)
        if proc.returncode != 0:
            err = proc.stderr.decode("utf-8", errors="replace")[:300]
            raise RuntimeError(f"ffmpeg failed: {err}")
        with open(out_path, "rb") as f:
            return f.read()
    finally:
        for p in (inp_path, out_path):
            try:
                os.unlink(p)
            except OSError:
                pass


def _wav_to_float32(wav_bytes: bytes) -> tuple[np.ndarray, int]:
    with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
        sr = wf.getframerate()
        n_ch = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        frames = wf.readframes(wf.getnframes())
    dtype = np.int16 if sampwidth == 2 else np.int8
    audio = np.frombuffer(frames, dtype=dtype).astype(np.float32)
    if dtype == np.int16:
        audio = audio / 32768.0
    else:
        audio = audio / 128.0
    if n_ch > 1:
        audio = audio.reshape(-1, n_ch).mean(axis=1)
    if sr != TARGET_SR and len(audio) > 0:
        from scipy import signal

        n_out = int(len(audio) * TARGET_SR / sr)
        audio = signal.resample(audio, n_out).astype(np.float32)
        sr = TARGET_SR
    return audio.astype(np.float32), sr


def decode_audio(raw: bytes, filename: str = "utterance.webm") -> tuple[np.ndarray, int]:
    """Decodifica bytes recebidos para float32 mono @ 16 kHz. Não persiste o áudio."""
    ext = os.path.splitext(filename)[1].lower() or ".webm"
    if ext in (".pcm", ".raw"):
        audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
        return audio, TARGET_SR
    if ext == ".wav":
        return _wav_to_float32(raw)
    wav = _ffmpeg_to_wav(raw, suffix=ext)
    return _wav_to_float32(wav)


# --------------------------------------------------------------------------- #
# Tipos de saída                                                              #
# --------------------------------------------------------------------------- #
@dataclass
class DiarSegment:
    start: float
    end: float
    speaker: str

    def to_json(self) -> dict[str, Any]:
        return {"start": round(self.start, 3), "end": round(self.end, 3), "speaker": self.speaker}


# --------------------------------------------------------------------------- #
# Fallback (numpy puro, sem PyTorch)  também usado nos testes offline         #
# --------------------------------------------------------------------------- #
def _window_features(audio: np.ndarray, sr: int, win_s: float) -> tuple[np.ndarray, list[tuple[float, float]]]:
    win = max(1, int(win_s * sr))
    feats: list[np.ndarray] = []
    spans: list[tuple[float, float]] = []
    for i0 in range(0, len(audio), win):
        chunk = audio[i0 : i0 + win]
        if len(chunk) < win // 4:
            break
        rms = float(np.sqrt(np.mean(chunk**2)) + 1e-9)
        zcr = float(np.mean(np.abs(np.diff(np.signbit(chunk).astype(np.int8)))))
        fft = np.abs(np.fft.rfft(chunk))
        freqs = np.fft.rfftfreq(len(chunk), 1.0 / sr)
        centroid = float(np.sum(freqs * fft) / (np.sum(fft) + 1e-9))
        bandwidth = float(np.sqrt(np.sum(((freqs - centroid) ** 2) * fft) / (np.sum(fft) + 1e-9)))
        feats.append(np.array([rms, zcr, centroid, bandwidth], dtype=np.float64))
        spans.append((i0 / sr, min(i0 + win, len(audio)) / sr))
    if not feats:
        return np.zeros((0, 4)), []
    return np.stack(feats), spans


def _kmeans2(features: np.ndarray, k: int, iters: int = 25, seed: int = 42) -> np.ndarray:
    """2..k-means simples em numpy (z-score + centróides iniciais determinísticos)."""
    n = features.shape[0]
    if n == 0:
        return np.zeros(0, dtype=int)
    mean = features.mean(axis=0)
    std = features.std(axis=0) + 1e-9
    norm = (features - mean) / std
    k = max(1, min(k, n))
    rng = np.random.default_rng(seed)
    centroids = norm[rng.choice(n, size=k, replace=False)]
    labels = np.zeros(n, dtype=int)
    for _ in range(iters):
        dists = np.linalg.norm(norm[:, None, :] - centroids[None, :, :], axis=2)
        new_labels = dists.argmin(axis=1)
        if np.array_equal(new_labels, labels):
            labels = new_labels
            break
        labels = new_labels
        for c in range(k):
            members = norm[labels == c]
            if len(members):
                centroids[c] = members.mean(axis=0)
    return labels


def fallback_diarize(
    audio: np.ndarray,
    sr: int,
    *,
    num_speakers: int | None = None,
    min_speakers: int | None = None,
    max_speakers: int | None = None,
    window_s: float = FALLBACK_WINDOW_S,
) -> list[DiarSegment]:
    feats, spans = _window_features(audio, sr, window_s)
    if len(spans) == 0:
        return []
    if len(spans) == 1:
        return [DiarSegment(spans[0][0], spans[0][1], "SPEAKER_00")]

    k = num_speakers or 2
    if max_speakers:
        k = min(k, max_speakers)
    if min_speakers:
        k = max(k, min_speakers)
    k = max(1, min(k, len(spans)))

    labels = _kmeans2(feats, k)
    # Renomeia clusters por ordem de aparição: 1º falante = SPEAKER_00.
    order: dict[int, int] = {}
    for lab in labels:
        if int(lab) not in order:
            order[int(lab)] = len(order)

    segments: list[DiarSegment] = []
    cur_label = int(labels[0])
    cur_start = spans[0][0]
    cur_end = spans[0][1]
    for lab, (s, e) in zip(labels[1:], spans[1:]):
        if int(lab) == cur_label:
            cur_end = e
            continue
        segments.append(DiarSegment(cur_start, cur_end, f"SPEAKER_{order[cur_label]:02d}"))
        cur_label = int(lab)
        cur_start = s
        cur_end = e
    segments.append(DiarSegment(cur_start, cur_end, f"SPEAKER_{order[cur_label]:02d}"))
    return segments


# --------------------------------------------------------------------------- #
# pyannote.audio 3.1                                                          #
# --------------------------------------------------------------------------- #
def _load_pyannote() -> Any | None:
    token = os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_TOKEN")
    try:
        import torch
        from pyannote.audio import Pipeline

        pipeline = Pipeline.from_pretrained(DIARIZATION_MODEL, use_auth_token=token or True)
        if DIARIZATION_DEVICE == "cuda" and torch.cuda.is_available():
            pipeline.to(torch.device("cuda"))
        else:
            pipeline.to(torch.device("cpu"))
        log.info("pyannote pipeline carregado (device=%s)", DIARIZATION_DEVICE)
        return pipeline
    except Exception as e:  # noqa: BLE001  qualquer falha cai para o fallback
        log.warning("pyannote indisponível (%s); usando fallback espectral.", type(e).__name__)
        return None


def pyannote_diarize(
    pipeline: Any,
    audio: np.ndarray,
    sr: int,
    *,
    num_speakers: int | None = None,
    min_speakers: int | None = None,
    max_speakers: int | None = None,
) -> list[DiarSegment]:
    import torch

    waveform = torch.from_numpy(np.ascontiguousarray(audio)).float().unsqueeze(0)
    kwargs: dict[str, int] = {}
    if num_speakers:
        kwargs["num_speakers"] = num_speakers
    if min_speakers:
        kwargs["min_speakers"] = min_speakers
    if max_speakers:
        kwargs["max_speakers"] = max_speakers
    annotation = pipeline({"waveform": waveform, "sample_rate": sr}, **kwargs)
    segments: list[DiarSegment] = []
    for turn, _track, speaker in annotation.itertracks(yield_label=True):
        segments.append(DiarSegment(float(turn.start), float(turn.end), str(speaker)))
    segments.sort(key=lambda s: s.start)
    return segments


# --------------------------------------------------------------------------- #
# App                                                                         #
# --------------------------------------------------------------------------- #
@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _pipeline, _active_backend
    if DIARIZATION_BACKEND in ("pyannote", "auto"):
        _pipeline = _load_pyannote()
        _active_backend = "pyannote" if _pipeline is not None else "fallback"
        if _pipeline is None and DIARIZATION_BACKEND == "pyannote":
            log.error("DIARIZATION_BACKEND=pyannote mas pipeline não carregou; servindo fallback.")
    else:
        _active_backend = "fallback"
    yield
    _pipeline = None


app = FastAPI(title="Diarization Service", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "backend": _active_backend,
        "model": DIARIZATION_MODEL,
        "device": DIARIZATION_DEVICE,
        "concurrency_limit": DIARIZATION_CONCURRENCY_LIMIT,
        "offline": os.getenv("HF_HUB_OFFLINE", "0"),
    }


def _opt_int(value: str | None) -> int | None:
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    try:
        n = int(value)
    except ValueError:
        return None
    return n if n > 0 else None


def _run_diarization(
    audio: np.ndarray,
    sr: int,
    *,
    num_speakers: int | None,
    min_speakers: int | None,
    max_speakers: int | None,
) -> list[DiarSegment]:
    if _pipeline is not None:
        try:
            return pyannote_diarize(
                _pipeline,
                audio,
                sr,
                num_speakers=num_speakers,
                min_speakers=min_speakers,
                max_speakers=max_speakers,
            )
        except Exception as e:  # noqa: BLE001
            log.warning("pyannote falhou em runtime (%s); fallback.", type(e).__name__)
    return fallback_diarize(
        audio,
        sr,
        num_speakers=num_speakers,
        min_speakers=min_speakers,
        max_speakers=max_speakers,
    )


@app.post("/v1/diarize")
async def diarize(
    file: UploadFile = File(...),
    num_speakers: str | None = Form(default=None),
    min_speakers: str | None = Form(default=None),
    max_speakers: str | None = Form(default=None),
) -> JSONResponse:
    raw = await file.read()
    if not raw:
        return JSONResponse({"segments": [], "num_speakers": 0})

    filename = file.filename or "utterance.webm"
    try:
        audio, sr = decode_audio(raw, filename=filename)
    except Exception as e:  # noqa: BLE001  sem logar conteúdo, só o tipo do erro
        log.warning("falha ao decodificar áudio (%s)", type(e).__name__)
        return JSONResponse({"segments": [], "num_speakers": 0, "error": "decode_failed"}, status_code=400)

    if len(audio) == 0:
        return JSONResponse({"segments": [], "num_speakers": 0})

    ns = _opt_int(num_speakers)
    mins = _opt_int(min_speakers)
    maxs = _opt_int(max_speakers)

    async with _semaphore:
        segments = await asyncio.to_thread(
            _run_diarization,
            audio,
            sr,
            num_speakers=ns,
            min_speakers=mins,
            max_speakers=maxs,
        )

    # libera referências ao áudio assim que a diarização termina (efêmero)
    del audio, raw

    distinct = sorted({s.speaker for s in segments})
    return JSONResponse(
        {
            "segments": [s.to_json() for s in segments],
            "num_speakers": len(distinct),
        }
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=int(os.getenv("PORT", "8001")))
