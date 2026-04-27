from abc import ABC, abstractmethod
import numpy as np
from typing import List
from domain.entities.transcription import Transcription

class STTEngine(ABC):
    @abstractmethod
    def transcribe(self, audio: np.ndarray, initial_prompt: str = "") -> List[Transcription]:
        """
        Transcreve um segmento de áudio para texto.
        """
        pass
