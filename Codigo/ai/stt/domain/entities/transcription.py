class Transcription:
    def __init__(self, text: str, start: float, end: float, speaker: str = "Unknown", confidence: float = 0.0):
        self.text = text
        self.start = start
        self.end = end
        self.speaker = speaker
        self.confidence = confidence

    def __repr__(self):
        return f"[{self.start:.2f}s - {self.end:.2f}s] ({self.speaker}): {self.text}"
