from abc import ABC, abstractmethod
import numpy as np
from typing import List, Tuple

class DiarizationEngine(ABC):
    @abstractmethod
    def diarize(self, audio: np.ndarray, sample_rate: int = 16000) -> List[Tuple[float, float, str]]:
        """
        Realiza a diarização do áudio.
        Retorna uma lista de tuplas (início, fim, speaker_id).
        """
        pass
