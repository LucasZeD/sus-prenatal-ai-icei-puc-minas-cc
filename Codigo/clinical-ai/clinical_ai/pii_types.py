from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PiiSpan:
    start: int
    end: int
    kind: str
    placeholder: str
    source: str
    priority: int
    score: float = 1.0

    def valid_for(self, text: str) -> bool:
        return 0 <= self.start < self.end <= len(text) and bool(self.placeholder)
