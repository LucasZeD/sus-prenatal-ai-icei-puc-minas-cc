import numpy as np

class AudioSegment:
    def __init__(self, audio: np.ndarray, start: float, end: float, sample_rate: int = 16000):
        self.audio = audio
        self.start = start
        self.end = end
        self.sample_rate = sample_rate

    @property
    def duration(self) -> float:
        return self.end - self.start
