from faster_whisper import WhisperModel
import numpy as np
from typing import List
from domain.interfaces.stt_engine import STTEngine
from domain.entities.transcription import Transcription

class WhisperEngine(STTEngine):
    def __init__(self, model_size: str = "large-v3", device: str = "cuda", compute_type: str = "float16"):
        self.model = WhisperModel(model_size, device=device, compute_type=compute_type)

    def transcribe(self, audio: np.ndarray, initial_prompt: str = "") -> List[Transcription]:
        segments, _ = self.model.transcribe(
            audio,
            language="pt",
            beam_size=5,
            best_of=5,
            initial_prompt=initial_prompt,
            vad_filter=False # VAD já foi feito externamente pelo Silero
        )

        results = []
        for segment in segments:
            results.append(Transcription(
                text=segment.text.strip(),
                start=segment.start,
                end=segment.end,
                confidence=getattr(segment, 'avg_logprob', 0.0) # Simplificado
            ))
        
        return results
