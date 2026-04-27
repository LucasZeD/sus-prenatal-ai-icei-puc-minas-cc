# Escriba STT: Transcrição Médica com Diarização

Sistema de transcrição em tempo real otimizado para ambientes clínicos (SUS), integrando o **Faster-Whisper** para Speech-to-Text e **Pyannote.Audio** para identificação de falantes (médico/paciente).

## 🚀 Requisitos de Hardware (Strain Analysis)

Para garantir assertividade clínica de >90% e latência aceitável (RTF < 0.4):

- **GPU:** NVIDIA RTX 3060 (12GB VRAM) ou superior. 
- **VRAM Breakdown:** - Whisper Large-v3 (float16): ~6.5 GB
  - Pyannote 3.1: ~2.5 GB
  - Overhead de sistema/CUDA: ~1.0 GB
  - **Mínimo seguro:** 10 GB VRAM.
- **Drivers:** CUDA 12.x e cuDNN 9.x instalados.

## 🛠 Configuração do Ambiente

### 1. Dependências do Sistema (Windows Fix)
O Python 3.14+ exige o carregamento explícito de DLLs da NVIDIA. O script utiliza `os.add_dll_directory` para injetar automaticamente os diretórios `bin` encontrados no `site-packages`.

### 2. Instalação
```bash
pip install faster-whisper pyannote.audio sounddevice torch torchaudio