import os
import sys
import queue
import threading
import site
import numpy as np
import sounddevice as sd

def setup_cuda_environment():
    if sys.platform != 'win32': return

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

    if found_paths:
        os.environ['PATH'] = ";".join(found_paths) + ";" + os.environ.get('PATH', '')
        print(f"[INFO] {len(found_paths)} diretórios CUDA injetados no sistema.")
    else:
        print("[AVISO] Nenhuma DLL NVIDIA encontrada.")

setup_cuda_environment()
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

from faster_whisper import WhisperModel

# --- CONFIGURAÇÕES DO SISTEMA ---
MODEL_SIZE = "large-v3"
DEVICE = "cuda"
COMPUTE_TYPE = "float16"

FS = 16000
CHUNK_LENGTH_S = 30          
OVERLAP_S = 5              
BATCH_SIZE = 4              

audio_queue = queue.Queue(maxsize=200)

# --- AUDIO CALLBACK ---
def audio_callback(indata, frames, time, status):
    if status:
        print(f"[Hardware]: {status}", file=sys.stderr)
    audio_queue.put(indata.copy())

# --- WORKER ---
def process_worker(model):
    initial_prompt = "Um diálogo em português brasileiro com uso intensivo de aliteração na letra F."

    last_text = ""

    audio_buffer = []   # lista eficiente
    batch_chunks = []

    print(f"--- Worker Ativo: | GPU {DEVICE.upper()} | {COMPUTE_TYPE} ---")

    while True:
        chunk = audio_queue.get()
        batch_chunks.append(chunk.flatten().astype(np.float32))

        # quando junta N blocos → forma batch
        if len(batch_chunks) >= BATCH_SIZE:
            combined = np.concatenate(batch_chunks)
            audio_buffer.append(combined)

            # limpa batch
            batch_chunks = []

        # quando buffer atinge tamanho alvo
        total_samples = sum(len(x) for x in audio_buffer)

        if total_samples >= FS * CHUNK_LENGTH_S:
            audio_input = np.concatenate(audio_buffer)

            segments, _ = model.transcribe(
                audio_input,
                language="pt",
                beam_size=8,
                best_of=5,
                initial_prompt=initial_prompt,
                vad_filter=False,
                temperature=0,
                condition_on_previous_text=False,
                repetition_penalty=1.0,
            )

            full_text = " ".join([seg.text.strip() for seg in segments if seg.text.strip()])

            if full_text.startswith(last_text):
                new_text = full_text[len(last_text):].strip()
            else:
                new_text = full_text

            if new_text:
                print(new_text)
                last_text = full_text

            # --- mantém OVERLAP ---
            keep_samples = int(FS * OVERLAP_S)
            if len(audio_input) > keep_samples:
                audio_buffer = [audio_input[-keep_samples:]]
            else:
                audio_buffer = [audio_input]

# --- MAIN ---
if __name__ == "__main__":
    try:
        print(f"Carregando {MODEL_SIZE} na GPU...")

        model = WhisperModel(
            MODEL_SIZE,
            device=DEVICE,
            compute_type=COMPUTE_TYPE
        )

        worker_thread = threading.Thread(
            target=process_worker,
            args=(model,),
            daemon=True
        )
        worker_thread.start()

        with sd.InputStream(
            samplerate=FS,
            channels=1,
            blocksize=int(FS * 1.0),  # 🔥 controle real do chunk de entrada
            callback=audio_callback
        ):
            print("Monitorando... (Ctrl+C para sair)")
            while True:
                sd.sleep(1000)

    except KeyboardInterrupt:
        print("\nEncerrado pelo usuário.")

    except Exception as e:
        print(f"\n[ERRO CRÍTICO]: {e}")