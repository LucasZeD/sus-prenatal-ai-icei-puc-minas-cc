import re
from typing import List
from domain.entities.transcription import Transcription

class ClinicalNormalizer:
    def __init__(self):
        # Dicionário básico de correções (exemplo TCC)
        self.replacements = {
            r"\bcinquenta miligramas\b": "50 mg",
            r"\bparacetamol\b": "Paracetamol",
            r"\bdipirona\b": "Dipirona",
            r"\bpressão doze por oito\b": "PA 120/80 mmHg",
            r"\bexame de sangue\b": "Hemograma completo"
        }

    def process(self, transcriptions: List[Transcription]) -> List[Transcription]:
        for trans in transcriptions:
            normalized_text = trans.text
            for pattern, replacement in self.replacements.items():
                normalized_text = re.sub(pattern, replacement, normalized_text, flags=re.IGNORECASE)
            trans.text = normalized_text
        return transcriptions
