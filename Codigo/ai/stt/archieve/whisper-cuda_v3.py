import os
import sys
import queue
import threading
import site
import numpy as np
import sounddevice as sd

def setup_cuda_environment():
    """Força o carregamento das DLLs da NVIDIA para evitar o erro cublas64_12.dll."""
    if sys.platform != 'win32': return

    # 1. Mapeia diretórios de bibliotecas no venv e user-site
    potential_dirs = sys.path + site.getsitepackages()
    if hasattr(site, 'getusersitepackages'):
        potential_dirs.append(site.getusersitepackages())

    found_paths = []
    for base in potential_dirs:
        if not os.path.exists(base): continue
        for root, dirs, _ in os.walk(base):
            if 'bin' in dirs and 'nvidia' in root.lower():
                lib_path = os.path.abspath(os.path.join(root, 'bin'))
                if lib_path not in found_paths:
                    os.add_dll_directory(lib_path)
                    found_paths.append(lib_path)
    
    # 2. Hard Fix: Injeção direta no PATH para o processo atual
    # Isso resolve casos onde o add_dll_directory falha em threads.
    if found_paths:
        os.environ['PATH'] = ";".join(found_paths) + ";" + os.environ.get('PATH', '')
        print(f"[INFO] {len(found_paths)} diretórios CUDA injetados no sistema.")
    else:
        print("[AVISO] Nenhuma DLL NVIDIA encontrada. Verifique: pip install nvidia-cublas-cu12")

# Inicialização da infraestrutura antes de importar o modelo
setup_cuda_environment()
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

from faster_whisper import WhisperModel

# --- CONFIGURAÇÕES DO SISTEMA ---
MODEL_SIZE = "large-v3"
DEVICE = "cuda"
COMPUTE_TYPE = "float16"
FS = 16000
CHUNK_LENGTH_S = 4.0

audio_queue = queue.Queue(maxsize=100)

def audio_callback(indata, frames, time, status):
    if status: print(f"[Hardware]: {status}", file=sys.stderr)
    audio_queue.put(indata.copy())

def process_worker(model):
    """Worker de processamento em thread separada para não bloquear o stream de áudio."""
    
    initial_prompt = "Um diálogo em português brasileiro com uso intensivo de aliteração na letra F."
    audio_history = np.array([], dtype=np.float32)
    
    print(f"--- Worker Ativo: | GPU {DEVICE.upper()} | {COMPUTE_TYPE} ---")
    
    while True:
        chunk = audio_queue.get()
        audio_history = np.append(audio_history, chunk.flatten().astype(np.float32))
        
        # Quando atingimos o tempo de chunk definido
        if len(audio_history) >= (FS * CHUNK_LENGTH_S):
            segments, _ = model.transcribe(
                audio_history,
                language="pt",
                beam_size=5,
                #best_of=5,
                initial_prompt=initial_prompt,
                vad_filter=True,
                vad_parameters=dict(
                    threshold=0.35,
                    min_silence_duration_ms=800
                ),
                temperature=0,
                condition_on_previous_text=True,
                repetition_penalty=1.2,
                compression_ratio_threshold=2.4,
                no_speech_threshold=0.6,
                suppress_tokens=[-1]
            )
            
            for segment in segments:
                if segment.text.strip():
                    print(f"[{segment.start:.1f}s] {segment.text.strip()}")
                    sys.stdout.flush()
            
            audio_history = audio_history[-int(FS * 1.0):]

if __name__ == "__main__":
    try:
        print(f"Carregando {MODEL_SIZE} na GPU...")
        model = WhisperModel(
            MODEL_SIZE, 
            device=DEVICE, 
            compute_type=COMPUTE_TYPE
        )
        
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
        if "cublas64_12.dll" in str(e):
            print("\nDICA: Verifique se instalou o pacote 'nvidia-cublas-cu12' corretamente.")