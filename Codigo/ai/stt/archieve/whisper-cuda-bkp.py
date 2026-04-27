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
COMPUTE_TYPE = "float16" # Otimizado para arquiteturas Ada Lovelace (RTX 40/50 series)
COMPUTE_TYPE = "int8_float16" # Otimizado para arquiteturas Ada Lovelace (RTX 40/50 series)
FS = 16000               # Frequência nativa do Whisper
BLOCK_SIZE = int(FS * 0.5)     # Captura blocos de 2 segundo
CHUNK_THRESHOLD = 2       # Processa a cada 5 segundos de áudio acumulado

audio_queue = queue.Queue(maxsize=100)

def audio_callback(indata, frames, time, status):
    if status: print(f"[Hardware]: {status}")
    audio_queue.put(indata.copy())

def process_worker(model):
    """Worker de processamento em thread separada para não bloquear o stream de áudio."""
    print(f"--- Worker Ativo: | GPU {DEVICE.upper()} | {COMPUTE_TYPE} ---")
    audio_history = np.array([], dtype=np.float32)
    stdout = sys.stdout
    
    while True:
        chunk = audio_queue.get()
        new_audio = chunk.flatten().astype(np.float32)
        audio_history = np.append(audio_history, new_audio)
        
        # Quando atingimos o tempo de chunk definido
        if len(audio_history) >= (FS * 1.5):
            segments, _ = model.transcribe(
                audio_history,
                beam_size=5,            # Aumenta busca por melhores palavras (melhora assertividade)
                language="pt",
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=300),
                condition_on_previous_text=True # Mantém o fio da meada entre frases
            )
            
            output_text = ""

            for segment in segments:
                if segment.text.strip():
                    output_text += f"[{segment.start:.1f}s] {segment.text.strip()}\n"
            
            if output_text:
                stdout.write(output_text)
                stdout.flush() 
            
            # Limpa o buffer para o próximo ciclo
            audio_history = audio_history[-int(FS * 0.5):]

if __name__ == "__main__":
    try:
        print(f"Carregando {MODEL_SIZE} na GPU...")
        model = WhisperModel(
            MODEL_SIZE, 
            device=DEVICE, 
            compute_type=COMPUTE_TYPE,
            local_files_only=False
        )
        
        thread = threading.Thread(target=process_worker, args=(model,), daemon=True)
        thread.start()

        with sd.InputStream(samplerate=FS, channels=1, callback=audio_callback, blocksize=BLOCK_SIZE):
            print("Monitorando... (Pressione Ctrl+C para encerrar)")
            while True:
                sd.sleep(1000)
                
    except Exception as e:
        print(f"\n[ERRO FATAL]: {e}")
        print("\nDICA: Se a DLL cublas64_12 ainda falhar, copie manualmente as DLLs de")
        print("'.venv/Lib/site-packages/nvidia/cublas/bin' para a pasta deste script.")