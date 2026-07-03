"""Testes do serviço de diarização (offline, backend fallback).

Gera um WAV sintético de 2 "locutores" (timbres/frequências distintas alternados)
e valida: (i) o fallback separa >= 2 falantes; (ii) o contrato HTTP /v1/diarize.
Não exige PyTorch/pyannote nem download de modelos.
"""

from __future__ import annotations

import io
import os
import sys
import wave

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Força o backend leve antes de importar o app (sem PyTorch/pyannote).
os.environ.setdefault("DIARIZATION_BACKEND", "fallback")

import app as diar  # noqa: E402


SR = 16_000


def _tone(freq: float, seconds: float, sr: int = SR) -> np.ndarray:
    t = np.linspace(0, seconds, int(seconds * sr), endpoint=False)
    # timbre com harmônicos para diferenciar "vozes"
    wave_ = 0.6 * np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(2 * np.pi * 2 * freq * t)
    return (wave_ * 0.5).astype(np.float32)


def _two_speaker_audio() -> np.ndarray:
    # A(150Hz) B(420Hz) A B  2s cada => 8s, 4 turnos alternados
    blocks = [_tone(150, 2.0), _tone(420, 2.0), _tone(150, 2.0), _tone(420, 2.0)]
    return np.concatenate(blocks)


def _to_wav_bytes(audio: np.ndarray, sr: int = SR) -> bytes:
    pcm16 = np.clip(audio, -1.0, 1.0)
    pcm16 = (pcm16 * 32767.0).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm16.tobytes())
    return buf.getvalue()


def test_fallback_detecta_dois_locutores():
    audio = _two_speaker_audio()
    segments = diar.fallback_diarize(audio, SR)
    speakers = {s.speaker for s in segments}
    assert len(speakers) >= 2
    # turnos ordenados e dentro da duração
    assert all(s.end > s.start for s in segments)
    assert segments[0].start == 0.0
    assert segments[-1].end <= len(audio) / SR + 1e-3


def test_decode_wav_roundtrip():
    audio = _two_speaker_audio()
    decoded, sr = diar.decode_audio(_to_wav_bytes(audio), filename="x.wav")
    assert sr == SR
    assert len(decoded) > 0


def test_endpoint_diarize_contrato():
    from fastapi.testclient import TestClient

    client = TestClient(diar.app)

    health = client.get("/health").json()
    assert health["status"] == "ok"
    assert "backend" in health

    wav = _to_wav_bytes(_two_speaker_audio())
    res = client.post(
        "/v1/diarize",
        files={"file": ("utterance.wav", wav, "audio/wav")},
    )
    assert res.status_code == 200
    body = res.json()
    assert "segments" in body and isinstance(body["segments"], list)
    assert body["num_speakers"] >= 2
    for seg in body["segments"]:
        assert set(seg.keys()) == {"start", "end", "speaker"}
        assert isinstance(seg["start"], (int, float))
        assert isinstance(seg["end"], (int, float))
        assert isinstance(seg["speaker"], str)


def test_endpoint_empty_file():
    from fastapi.testclient import TestClient

    client = TestClient(diar.app)
    res = client.post("/v1/diarize", files={"file": ("empty.wav", b"", "audio/wav")})
    assert res.status_code == 200
    assert res.json() == {"segments": [], "num_speakers": 0}
