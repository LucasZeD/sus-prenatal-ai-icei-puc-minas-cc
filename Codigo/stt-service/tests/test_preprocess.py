"""Lightweight preprocess and energy-gate tests (no Whisper)."""

from __future__ import annotations

import numpy as np

from app.audio_preprocess import audio_rms, preprocess


def test_audio_rms_silence_is_near_zero() -> None:
    silence = np.zeros(16_000, dtype=np.float32)
    assert audio_rms(silence) == 0.0


def test_preprocess_does_not_amplify_quiet_signal() -> None:
    quiet = np.random.default_rng(42).normal(0, 0.0005, 16_000).astype(np.float32)
    rms_before = audio_rms(quiet)
    assert rms_before < 0.004

    out = preprocess(quiet.copy(), enabled=True, min_rms=0.004)
    rms_after = audio_rms(out)
    assert rms_after < 0.01


def test_preprocess_normalizes_loud_signal() -> None:
    loud = np.random.default_rng(7).normal(0, 0.15, 16_000).astype(np.float32)
    rms_before = audio_rms(loud)
    assert rms_before >= 0.004

    out = preprocess(loud.copy(), enabled=True, min_rms=0.004)
    rms_after = audio_rms(out)
    assert 0.05 <= rms_after <= 0.12
