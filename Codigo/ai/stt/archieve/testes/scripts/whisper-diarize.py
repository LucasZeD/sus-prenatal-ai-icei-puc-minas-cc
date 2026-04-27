import os
import sys
import queue
import threading
import site
import numpy as np
import sounddevice as sd
import torch

# --- INFRAESTRUTURA CUDA ---
def setup_cuda_environment():
    if sys.platform != 'win32': return
    potential_dirs = sys.path + site.getsitepackages()
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

setup_cuda_environment()

from faster_whisper import WhisperModel
from pyannote.audio import Pipeline

# --- CONFIGURAÇÕES CLÍNICAS ---
MODEL_SIZE = "large-v3"
DEVICE = "cuda"
HF_TOKEN = "SEU_TOKEN_AQUI" # Requisito para Pyannote
# Prompt focado em termos médicos (CID, anamnese, exames)
CLINICAL_PROMPT = "Anamnese médica, paciente relata sintomas de cefaleia, prescrição de paracetamol, exame de hemograma completo, pressão arterial 12 por 8."

audio_queue = queue.Queue()
FS = 16000
BLOCK_SIZE = FS * 2  # 2 segundos por bloco

def audio_callback(indata, frames, time, status):
    audio_queue.put(indata.copy())

def process_worker(whisper_model, diarization_pipeline):
    print("--- Escriba Ativo: Monitorando Consulta ---")
    audio_history = []
    
    while True:
        chunk = audio_queue.get()
        audio_history.append(chunk)
        
        # Processamento a cada 5 segundos para dar contexto à diarização
        if len(audio_history) >= 2.5: 
            full_audio = np.concatenate(audio_history).flatten().astype(np.float32)
            
            # 1. Transcrição Whisper
            segments, _ = whisper_model.transcribe(
                full_audio,
                language="pt",
                initial_prompt=CLINICAL_PROMPT,
                beam_size=5,
                vad_filter=True
            )
            
            # 2. Diarização (Transforma para o formato esperado pelo Torch)
            # Nota: Em produção, o áudio deve ser convertido para tensor e movido para GPU
            audio_tensor = torch.from_numpy(full_audio).unsqueeze(0)
            diarization = diarization_pipeline({"waveform": audio_tensor, "sample_rate": FS})
            
            # 3. Reconciliação (Atribui falante ao texto)
            for segment in segments:
                # Busca o falante predominante no timestamp do Whisper
                speaker = "Desconhecido"
                for turn, _, speaker_id in diarization.itertracks(yield_label=True):
                    if turn.start <= segment.start <= turn.end:
                        speaker = speaker_id
                        break
                
                if segment.text.strip():
                    print(f"[{speaker}] {segment.text.strip()}")
            
            # Limpa parte do buffer mantendo 1s de overlap para continuidade
            audio_history = audio_history[-1:]

if __name__ == "__main__":
    print("Carregando Modelos (Whisper + Pyannote)...")
    
    w_model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type="float16")
    d_pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token=HF_TOKEN)
    d_pipeline.to(torch.device(DEVICE))

    worker = threading.Thread(target=process_worker, args=(w_model, d_pipeline), daemon=True)
    worker.start()

    with sd.InputStream(samplerate=FS, channels=1, callback=audio_callback, blocksize=BLOCK_SIZE):
        while True: sd.sleep(1000)