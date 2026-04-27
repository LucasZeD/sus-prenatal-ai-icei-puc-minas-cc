import torch
import numpy as np
from typing import List, Tuple
from domain.interfaces.vad_engine import VADEngine

class SileroVAD(VADEngine):
    def __init__(self, threshold: float = 0.5, sampling_rate: int = 16000):
        self.threshold = threshold
        self.sampling_rate = sampling_rate
        # Carrega o modelo via torch hub
        self.model, self.utils = torch.hub.load(repo_or_dir='snakers4/silero-vad',
                                              model='silero_vad',
                                              force_reload=False,
                                              onnx=False)
        (self.get_speech_timestamps, _, _, _, _) = self.utils

    def detect_speech(self, audio: np.ndarray, sample_rate: int = 16000) -> List[Tuple[float, float]]:
        # O Silero espera um tensor float32
        if audio.dtype != np.float32:
            audio = audio.astype(np.float32)
        
        audio_tensor = torch.from_numpy(audio)
        
        # Detecta timestamps de fala
        speech_timestamps = self.get_speech_timestamps(audio_tensor, 
                                                      self.model, 
                                                      sampling_rate=sample_rate,
                                                      threshold=self.threshold)
        
        # Converte de samples para segundos
        results = []
        for ts in speech_timestamps:
            start_sec = ts['start'] / sample_rate
            end_sec = ts['end'] / sample_rate
            results.append((start_sec, end_sec))
            
        return results
