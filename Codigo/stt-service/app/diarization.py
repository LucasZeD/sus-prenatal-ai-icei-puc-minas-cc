"""MVP diarization: 2 speakers from Whisper segments (simple clustering)."""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
from sklearn.cluster import KMeans

log = logging.getLogger(__name__)

LABEL_PRO = "Profissional"
LABEL_PAC = "Paciente"


@dataclass
class Segment:
    start: float
    end: float
    text: str
    speaker_id: int = 0


@dataclass
class SpeakerBlock:
    id: int
    label: str
    text: str


def _segment_mel_feature(audio: np.ndarray, sr: int, start: float, end: float) -> np.ndarray:
    """Simple feature: mean energy + spectral centroid proxy per segment."""
    i0 = max(0, int(start * sr))
    i1 = min(len(audio), int(end * sr))
    if i1 <= i0:
        return np.zeros(4, dtype=np.float32)
    chunk = audio[i0:i1]
    rms = float(np.sqrt(np.mean(chunk**2)))
    zcr = float(np.mean(np.abs(np.diff(np.signbit(chunk)))))
    fft = np.abs(np.fft.rfft(chunk))
    if len(fft) == 0:
        return np.array([rms, zcr, 0.0, 0.0], dtype=np.float32)
    freqs = np.fft.rfftfreq(len(chunk), 1.0 / sr)
    centroid = float(np.sum(freqs * fft) / (np.sum(fft) + 1e-9))
    return np.array([rms, zcr, centroid, float(len(chunk))], dtype=np.float32)


def diarize_simple(
    audio: np.ndarray,
    sr: int,
    segments: list[Segment],
    *,
    enabled: bool = True,
) -> tuple[list[Segment], list[SpeakerBlock]]:
    if not enabled or len(segments) < 2:
        text = " ".join(s.text.strip() for s in segments if s.text.strip())
        return segments, []
    feats = np.stack([_segment_mel_feature(audio, sr, s.start, s.end) for s in segments])
    try:
        km = KMeans(n_clusters=2, random_state=42, n_init=10)
        labels = km.fit_predict(feats)
    except Exception as e:
        log.warning("k-means diarization failed: %s", e)
        return segments, []

    # First segment cluster ? Profissional (consultation heuristic)
    first_label = int(labels[0])
    pro_cluster = first_label
    labeled: list[Segment] = []
    for seg, lab in zip(segments, labels):
        sid = int(lab)
        labeled.append(
            Segment(
                start=seg.start,
                end=seg.end,
                text=seg.text,
                speaker_id=sid,
            )
        )

    blocks: dict[int, list[str]] = {0: [], 1: []}
    for seg in labeled:
        blocks.setdefault(seg.speaker_id, []).append(seg.text.strip())

    speaker_blocks: list[SpeakerBlock] = []
    for sid in sorted(blocks.keys()):
        label = LABEL_PRO if sid == pro_cluster else LABEL_PAC
        joined = " ".join(t for t in blocks[sid] if t)
        if joined:
            speaker_blocks.append(SpeakerBlock(id=sid, label=label, text=joined))

    return labeled, speaker_blocks


def format_diarized_text(speaker_blocks: list[SpeakerBlock]) -> str:
    if not speaker_blocks:
        return ""
    lines: list[str] = []
    for b in speaker_blocks:
        lines.append(f"[{b.label}] {b.text}")
    return "\n".join(lines)
