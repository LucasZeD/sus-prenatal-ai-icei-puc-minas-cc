import os

class Config:
    # Modelos
    WHISPER_MODEL_SIZE = "large-v3"
    DIARIZATION_MODEL = "pyannote/speaker-diarization-3.1"
    
    # Dispositivo (cuda ou cpu)
    DEVICE = "cuda"
    COMPUTE_TYPE = "float16"
    
    # Hugging Face Token (Obrigatório para Pyannote)
    HF_TOKEN = os.getenv("HF_TOKEN", "SEU_TOKEN_AQUI")
    
    # Configurações de Áudio
    SAMPLE_RATE = 16000
    
    # Prompt Clínico Inicial
    CLINICAL_PROMPT = (
        "Consulta de pré-natal. Anamnese médica, paciente relata sintomas, "
        "prescrição de medicamentos, exames laboratoriais, pressão arterial, "
        "batimentos cardíacos fetais."
    )
