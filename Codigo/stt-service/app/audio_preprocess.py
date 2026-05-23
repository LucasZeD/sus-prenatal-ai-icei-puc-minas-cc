"""Decode WebM/WAV/PCM and normalize for Whisper (16 kHz mono)."""

from __future__ import annotations

import io
import logging
import os
import subprocess
import tempfile
from typing import TYPE_CHECKING

import numpy as np
from scipy import signal

if TYPE_CHECKING:
    pass

log = logging.getLogger(__name__)

TARGET_SR = 16_000
HIGH_PASS_HZ = 80.0


def _ffmpeg_decode_to_wav(raw: bytes, suffix: str = ".webm") -> bytes:
    """Decode arbitrary audio container to PCM WAV via ffmpeg."""
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
        proc = subprocess.run(cmd, capture_output=True, timeout=60)
        if proc.returncode != 0:
            err = proc.stderr.decode("utf-8", errors="replace")[:500]
            raise RuntimeError(f"ffmpeg failed: {err}")
        with open(out_path, "rb") as f:
            return f.read()
    finally:
        for p in (inp_path, out_path):
            try:
                os.unlink(p)
            except OSError:
                pass


def _wav_bytes_to_float32(wav_bytes: bytes) -> np.ndarray:
    """Parse minimal WAV header and return mono float32 [-1, 1]."""
    import wave

    with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
        sr = wf.getframerate()
        n_ch = wf.getnchannels()
        frames = wf.readframes(wf.getnframes())
        dtype = np.int16 if wf.getsampwidth() == 2 else np.int8
        audio = np.frombuffer(frames, dtype=dtype).astype(np.float32)
        if n_ch > 1:
            audio = audio.reshape(-1, n_ch).mean(axis=1)
        if sr != TARGET_SR and len(audio) > 0:
            n_out = int(len(audio) * TARGET_SR / sr)
            audio = signal.resample(audio, n_out).astype(np.float32)
        peak = np.max(np.abs(audio)) or 1.0
        audio = audio / peak
        return audio


def decode_audio(raw: bytes, filename: str = "chunk.webm") -> np.ndarray:
    """Decode uploaded bytes to float32 mono @ 16 kHz."""
    ext = os.path.splitext(filename)[1].lower() or ".webm"
    if ext in (".pcm", ".raw"):
        samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
        return samples
    wav = _ffmpeg_decode_to_wav(raw, suffix=ext)
    return _wav_bytes_to_float32(wav)


def preprocess(
    audio: np.ndarray,
    *,
    enabled: bool = True,
    noise_reduce: bool = False,
) -> np.ndarray:
    if not enabled or len(audio) == 0:
        return audio

    # High-pass ~80 Hz
    nyq = TARGET_SR / 2.0
    wn = min(HIGH_PASS_HZ / nyq, 0.99)
    b, a = signal.butter(2, wn, btype="high")
    audio = signal.filtfilt(b, a, audio).astype(np.float32)

    # Loudness normalization (target RMS)
    rms = float(np.sqrt(np.mean(audio**2)) or 1e-6)
    target_rms = 0.08
    audio = audio * (target_rms / rms)
    audio = np.clip(audio, -1.0, 1.0)

    if noise_reduce:
        try:
            import noisereduce as nr

            audio = nr.reduce_noise(y=audio, sr=TARGET_SR, stationary=True, prop_decrease=0.35)
            audio = np.clip(audio.astype(np.float32), -1.0, 1.0)
        except Exception as e:
            log.warning("noisereduce skipped: %s", e)

    return audio
