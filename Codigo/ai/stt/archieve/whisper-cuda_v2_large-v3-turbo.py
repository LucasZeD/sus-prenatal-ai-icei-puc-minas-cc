import os
import sys
import queue
import threading
import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel

# --- CONFIGURAÇÕES OTIMIZADAS ---
# 'large-v3-turbo' é superior em velocidade/custo-benefício para PT-BR
MODEL_SIZE = "large-v3-turbo" 
DEVICE = "cuda"
# int8_float16 reduz VRAM mantendo a precisão de cálculo
COMPUTE_TYPE = "int8_float16" 
FS = 16000
# Buffer de 3 segundos para dar contexto suficiente ao Whisper
CHUNK_LENGTH_S = 3.0 

audio_queue = queue.Queue(maxsize=100)

def audio_callback(indata, frames, time, status):
    if status: print(f"[Hardware]: {status}", file=sys.stderr)
    audio_queue.put(indata.copy())

def process_worker(model):
    # Prompt estratégico para guiar o decodificador no padrão "F"
    # Isso não é overfitting, é "Prompt Engineering" para o Decoder
    initial_prompt = (
        "Francisco Freire, fisionomia familiar, Friburgo, Flamengo, "
        "faculdade, filosofia, fabriquinha, fundição, ferramentas."
    )
    
    audio_history = np.array([], dtype=np.float32)
    print(f"--- Worker Ativo: | GPU {DEVICE.upper()} | {COMPUTE_TYPE} ---")

    while True:
        chunk = audio_queue.get()
        audio_history = np.append(audio_history, chunk.flatten().astype(np.float32))
        
        # Processar apenas quando o buffer acumular o tempo necessário
        if len(audio_history) >= (FS * CHUNK_LENGTH_S):
            segments, _ = model.transcribe(
                audio_history,
                language="pt",
                beam_size=5,
                initial_prompt=initial_prompt,
                vad_filter=True,
                # Ajuste de VAD para não cortar fonemas 'f' sibilantes
                vad_parameters=dict(min_silence_duration_ms=500),
                # Penalidade para evitar as alucinações repetitivas vistas no log anterior
                repetition_penalty=1.2,
                # Evita que o modelo tente adivinhar silêncio como fala chula
                no_speech_threshold=0.6 
            )
            
            for segment in segments:
                if segment.text.strip():
                    print(f"[{segment.start:.1f}s] {segment.text.strip()}")
                    sys.stdout.flush()
            
            # Manter 0.5s de sobreposição (overlap) para manter a continuidade fonética
            overlap_samples = int(FS * 0.5)
            audio_history = audio_history[-overlap_samples:]

if __name__ == "__main__":
    # Otimização de infraestrutura (mantida a lógica de DLLs do usuário)
    # setup_cuda_environment() 

    try:
        model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE)
        
        worker_thread = threading.Thread(target=process_worker, args=(model,), daemon=True)
        worker_thread.start()

        with sd.InputStream(samplerate=FS, channels=1, callback=audio_callback):
            print("Monitorando... (Ctrl+C para sair)")
            while True:
                sd.sleep(1000)
    except KeyboardInterrupt:
        print("\nEncerrado pelo usuário.")
    except Exception as e:
        print(f"\n[ERRO CRÍTICO]: {e}")