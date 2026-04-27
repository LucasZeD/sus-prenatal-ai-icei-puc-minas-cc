import numpy as np
from typing import List
from domain.interfaces.stt_engine import STTEngine
from domain.interfaces.vad_engine import VADEngine
from domain.interfaces.diarization_engine import DiarizationEngine
from domain.entities.transcription import Transcription

class PipelineOrchestrator:
    def __init__(self, 
                 vad: VADEngine, 
                 stt: STTEngine, 
                 diarizer: DiarizationEngine, 
                 normalizer=None):
        self.vad = vad
        self.stt = stt
        self.diarizer = diarizer
        self.normalizer = normalizer

    def process(self, audio: np.ndarray, sample_rate: int = 16000) -> List[Transcription]:
        # 1. VAD: Detecta onde há fala
        speech_segments = self.vad.detect_speech(audio, sample_rate)
        
        # 2. Diarização: Identifica quem fala (em todo o áudio para melhor contexto)
        diarization_output = self.diarizer.diarize(audio, sample_rate)
        
        results = []
        
        # 3. Processa cada segmento de fala
        for start, end in speech_segments:
            # Extrai o chunk de áudio
            start_sample = int(start * sample_rate)
            end_sample = int(end * sample_rate)
            audio_chunk = audio[start_sample:end_sample]
            
            # 4. STT: Transcreve o chunk
            transcriptions = self.stt.transcribe(audio_chunk)
            
            # Ajusta os timestamps das transcrições (que são relativos ao início do chunk)
            for t in transcriptions:
                t.start += start
                t.end += start
                
                # 5. Atribui Speaker baseado no timestamp
                t.speaker = self._get_speaker(t.start, t.end, diarization_output)
                results.append(t)
        
        # 6. Normalização Clínica
        if self.normalizer:
            results = self.normalizer.process(results)
            
        return results

    def _get_speaker(self, start: float, end: float, diarization: list) -> str:
        # Busca o speaker que mais sobrepõe com o segmento
        # Simplificado: pega o speaker do primeiro overlap encontrado
        for d_start, d_end, speaker in diarization:
            if (start < d_end) and (end > d_start):
                return speaker
        return "Unknown"
