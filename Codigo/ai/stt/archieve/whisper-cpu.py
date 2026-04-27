import os
import queue
import threading
import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel

os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

# Configurações Técnicas
MODEL_SIZE = "large-v3"
FS = 16000
BLOCK_SIZE = FS  # 1 segundo de áudio
CHUNK_DURATION = 5  # Janela de 5 segundos
OVERLAP_PERCENT = 0.15 
OVERLAP_SAMPLES = int(CHUNK_DURATION * FS * OVERLAP_PERCENT)

audio_queue = queue.Queue(maxsize=10) # Limite para evitar OOM se o processamento atrasar

def callback(indata, frames, time, status):
    if status:
        print(f"Status: {status}") # Aqui você verá o 'input overflow'
    try:
        audio_queue.put_nowait(indata.copy())
    except queue.Full:
        pass # Ignora frames novos se a fila estiver cheia para não travar a thread de áudio

def process_worker(model):
    print(f"--- Processando com 8 P-Cores & Overlap ---")
    audio_buffer = []
    previous_overlap = np.zeros(OVERLAP_SAMPLES, dtype=np.float32)
    
    while True:
        chunk = audio_queue.get()
        audio_buffer.append(chunk)
        
        # Processa quando acumular CHUNK_DURATION
        if len(audio_buffer) >= CHUNK_DURATION:
            current_data = np.concatenate(audio_buffer).flatten()
            
            # Concatena o final do áudio anterior no início do atual
            input_data = np.concatenate([previous_overlap, current_data])
            
            # VAD_FILTER=True elimina a "sujeira" (hallucinations em silêncio)
            segments, _ = model.transcribe(
                input_data, 
                beam_size=5, 
                language="pt",
                vad_filter=True, # ESSENCIAL para remover os "Vamos lá" do silêncio
                vad_parameters=dict(min_silence_duration_ms=500)
            )
            
            for segment in segments:
                print(f"[CPU][{segment.start:.2f}s] {segment.text}")
            
            # Atualiza o overlap para a próxima rodada
            previous_overlap = current_data[-OVERLAP_SAMPLES:]
            audio_buffer = []

if __name__ == "__main__":
    # Otimização para i7-14700K: 8 P-Cores
    model = WhisperModel(
        MODEL_SIZE, 
        device="cpu", 
        compute_type="int8", 
        cpu_threads=8, 
        num_workers=4 
    )
    
    worker_thread = threading.Thread(target=process_worker, args=(model,), daemon=True)
    worker_thread.start()

    try:
        with sd.InputStream(samplerate=FS, channels=1, callback=callback, blocksize=BLOCK_SIZE):
            print("Monitorando áudio...")
            while True:
                sd.sleep(1000)
    except KeyboardInterrupt:
        print("\nEncerrado.")