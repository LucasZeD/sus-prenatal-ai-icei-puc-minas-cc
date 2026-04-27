import torch
from pyannote.audio import Pipeline
import numpy as np
from typing import List, Tuple
from domain.interfaces.diarization_engine import DiarizationEngine

class PyannoteEngine(DiarizationEngine):
    def __init__(self, hf_token: str, model_id: str = "pyannote/speaker-diarization-3.1", device: str = "cuda"):
        self.pipeline = Pipeline.from_pretrained(model_id, use_auth_token=hf_token)
        self.device = torch.device(device)
        self.pipeline.to(self.device)

    def diarize(self, audio: np.ndarray, sample_rate: int = 16000) -> List[Tuple[float, float, str]]:
        # Converte para formato esperado pelo Pyannote (tensor waveform)
        if audio.ndim == 1:
            audio = audio[np.newaxis, :]
        
        audio_tensor = torch.from_numpy(audio.astype(np.float32))
        
        diarization = self.pipeline({"waveform": audio_tensor, "sample_rate": sample_rate})
        
        results = []
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            results.append((turn.start, turn.end, speaker))
            
        return results
