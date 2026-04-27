import sys
import os
import queue
import threading
import soundfile as sf
import numpy as np
import sounddevice as sd
from app.config import Config
from infrastructure.vad.silero_vad import SileroVAD
from infrastructure.stt.whisper_engine import WhisperEngine
from infrastructure.diarization.pyannote_engine import PyannoteEngine
from infrastructure.postprocessing.clinical_normalizer import ClinicalNormalizer
from application.services.pipeline_orchestrator import PipelineOrchestrator

audio_queue = queue.Queue()

def audio_callback(indata, frames, time, status):
    """Callback para capturar áudio do microfone."""
    if status:
        print(status, file=sys.stderr)
    audio_queue.put(indata.copy())

def mic_stream(orchestrator):
    """Processa o stream do microfone em blocos."""
    print("\n>>> Escriba Ativo: Monitorando Microfone (Ctrl+C para parar) <<<")
    
    # Buffer para acumular áudio (ex: 30 segundos conforme README)
    CHUNK_DURATION = 30  # segundos
    audio_buffer = []
    
    try:
        with sd.InputStream(samplerate=Config.SAMPLE_RATE, 
                          channels=1, 
                          callback=audio_callback,
                          blocksize=int(Config.SAMPLE_RATE * 2)): # blocos de 2s
            
            while True:
                chunk = audio_queue.get()
                audio_buffer.append(chunk)
                
                # Verifica se acumulamos o tempo necessário para o lote
                total_duration = len(audio_buffer) * 2 # 2s por bloco
                if total_duration >= CHUNK_DURATION:
                    full_audio = np.concatenate(audio_buffer).flatten().astype(np.float32)
                    
                    print(f"\n[Processando Lote de {CHUNK_DURATION}s...]")
                    results = orchestrator.process(full_audio, sample_rate=Config.SAMPLE_RATE)
                    
                    for trans in results:
                        print(trans)
                    
                    # Limpa buffer para o próximo lote
                    audio_buffer = []
                    
    except KeyboardInterrupt:
        print("\nMonitoramento encerrado pelo usuário.")
    except Exception as e:
        print(f"\nErro no stream de áudio: {e}")

def main():
    use_mic = "--mic" in sys.argv
    
    print(f"--- Carregando Modelos ({Config.WHISPER_MODEL_SIZE}) ---")
    
    # Inicializa Engines
    vad = SileroVAD()
    stt = WhisperEngine(model_size=Config.WHISPER_MODEL_SIZE, device=Config.DEVICE, compute_type=Config.COMPUTE_TYPE)
    diarizer = PyannoteEngine(hf_token=Config.HF_TOKEN, model_id=Config.DIARIZATION_MODEL, device=Config.DEVICE)
    normalizer = ClinicalNormalizer()
    
    # Inicializa Orquestrador
    orchestrator = PipelineOrchestrator(vad, stt, diarizer, normalizer)
    
    if use_mic:
        mic_stream(orchestrator)
    else:
        if len(sys.argv) < 2:
            print("Uso: python main.py <arquivo_audio.wav> OU python main.py --mic")
            return

        audio_path = sys.argv[1]
        if not os.path.exists(audio_path):
            print(f"Erro: Arquivo {audio_path} não encontrado.")
            return

        print(f"--- Processando Arquivo: {audio_path} ---")
        audio, sr = sf.read(audio_path)
        results = orchestrator.process(audio, sample_rate=sr)
        
        print("\n--- Transcrição Final ---")
        for trans in results:
            print(trans)

if __name__ == "__main__":
    # Ajuste de PYTHONPATH para permitir imports relativos
    current_dir = os.path.dirname(os.path.abspath(__file__))
    sys.path.append(os.path.join(current_dir, ".."))
    main()
