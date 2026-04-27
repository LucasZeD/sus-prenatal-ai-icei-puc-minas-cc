from abc import ABC, abstractmethod
import numpy as np
from typing import List, Tuple

class VADEngine(ABC):
    @abstractmethod
    def detect_speech(self, audio: np.ndarray, sample_rate: int = 16000) -> List[Tuple[float, float]]:
        """
        Detecta segmentos de fala no áudio.
        Retorna uma lista de tuplas (início, fim) em segundos.
        """
        pass
