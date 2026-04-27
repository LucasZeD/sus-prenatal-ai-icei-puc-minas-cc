# Contexto e Arquitetura: Sistema STT Clínico Modular

Este documento serve como referência técnica e contexto de desenvolvimento para o pipeline de processamento de áudio clínico (Speech-to-Text), desenhado com foco em rigor científico (TCC) e componentização via Clean Architecture.

---

## 1. Visão Geral do Pipeline (Alto Nível)

```text
Áudio bruto
   ↓
[1] Captura + Bufferização
   ↓
[2] VAD (Segmentação por fala real)
   ↓
[3] STT principal (Whisper large-v3)
   ↓
[4] Alinhamento fino (Word-level)
   ↓
[5] Diarização (Identificação de falantes)
   ↓
[6] Pós-processamento linguístico (Normalização clínica)
   ↓
[7] Estruturação (JSON para prontuário)
```

> ❗ **PRINCÍPIO FUNDAMENTAL:** NÃO utilize streaming contínuo para gerar o resultado final. O streaming atua apenas como preview visual. O resultado oficial e clinicamente válido exige processamento em lote (segmentos de 30–90s) para garantir o contexto.

### Stack Recomendado
* **STT Principal:** `faster-whisper` (large-v3)
* **Alinhamento e Diarização (Fino):** WhisperX
* **Diarização Base:** `pyannote.audio`
* **VAD:** `silero-vad` (Superior ao VAD nativo do Whisper)

---

## 2. Detalhamento das Etapas de Processamento

### Etapa 1 — Captura de Áudio
* **Requisitos:** 16kHz, mono, float32, WAV sem compressão.
* **Implementação:** Buffer circular retendo os últimos 120 segundos.
```python
BUFFER_DURATION = 120  # Segundos (manter os últimos 2 minutos contínuos)
```

### Etapa 2 — VAD (Voice Activity Detection)
Essencial para evitar quebras de frases e perda de contexto clínico que prejudicam reconhecimento de numéricos.
```python
# pip install silero-vad
# Parâmetros recomendados para contexto clínico
threshold = 0.5
min_speech_duration_ms = 500
min_silence_duration_ms = 1000
```

### Etapa 3 — STT (Whisper)
Transcreve blocos inteiros contendo fala (filtrados pelo VAD).
```python
model = WhisperModel("large-v3", device="cuda", compute_type="float16")

segments, _ = model.transcribe(
    audio_segment,
    language="pt",
    beam_size=10,
    best_of=5,
    temperature=0,
    condition_on_previous_text=False,
    vad_filter=False # Delegado ao Silero
)
```

### Etapa 4 e 5 — Alinhamento e Diarização (WhisperX / Pyannote)
Crucial para assinalar a palavra correta a cada falante.
```python
# Alinhamento
model_a, metadata = whisperx.load_align_model(language_code="pt", device="cuda")
aligned = whisperx.align(segments, model_a, metadata, audio_segment)

# Diarização
diarize_model = whisperx.DiarizationPipeline(device="cuda")
diarize_segments = diarize_model(audio_segment)

# Merge
final = whisperx.assign_word_speakers(diarize_segments, aligned)
```

### Etapa 6 — Pós-processamento Clínico
O diferencial do projeto. Corrige erros de interpretação do Whisper.
* **Numéricos:** `"cinquenta miligramas"` → `"50 mg"`
* **Dicionários:** Padronização de medicamentos (ex: `"dipirona sódica"` → `"Dipirona"`).
* **Regex:** Casamentos exatos de exames, pressão arterial e posologias.

---

## 3. Arquitetura Modular (Clean Architecture)

A infraestrutura é orientada a eventos e rigorosamente desacoplada.

### Árvore de Diretórios
```text
stt_system/
├── app/                  # main.py, config.py
├── application/          # Orquestração (pipeline_orchestrator.py)
├── domain/               # Entidades e Interfaces de Contrato
├── infrastructure/       # Implementações (Whisper, Silero, Pyannote)
├── evaluation/           # Métricas e Benchmarks (WER, DER)
└── tests/                # Testes automatizados
```

### Domain: Entidades e Contratos
```python
class Transcription:
    def __init__(self, text, start, end, speaker=None):
        self.text = text; self.start = start; self.end = end; self.speaker = speaker

class STTEngine:
    def transcribe(self, audio: np.ndarray) -> list: raise NotImplementedError

class DiarizationEngine:
    def diarize(self, audio: np.ndarray) -> list: raise NotImplementedError

class VADEngine:
    def detect_speech(self, audio: np.ndarray) -> list: raise NotImplementedError
```

### Application: Orquestração do Pipeline
```python
class PipelineOrchestrator:
    def __init__(self, vad, stt, aligner, diarizer, normalizer):
        self.vad = vad; self.stt = stt; self.aligner = aligner
        self.diarizer = diarizer; self.normalizer = normalizer

    def process(self, audio: np.ndarray):
        segments = self.vad.detect_speech(audio)
        results = []
        for seg in segments:
            audio_chunk = audio[seg.start:seg.end]
            transcription = self.stt.transcribe(audio_chunk)
            aligned = self.aligner.align(transcription, audio_chunk)
            speakers = self.diarizer.diarize(audio_chunk)
            
            merged = self._merge(aligned, speakers) # ASSOCIAÇÃO: Palavra -> Speaker via Timestamp Overlap
            final = self.normalizer.process(merged)
            results.extend(final)
        return results
```

---

## 4. Avaliação Científica e Métricas (TCC)

> ❗ **REGRA CRÍTICA:** Nunca misture transcrição e identificação de falantes na mesma métrica.
* **STT Quality:** WER (Word Error Rate) via biblioteca `jiwer`.
* **Diarization Quality:** DER (Diarization Error Rate) via biblioteca `pyannote.metrics`.

### Alvos de Métricas (PT-BR Clínico)
| Cenário | WER | DER |
|---|---|---|
| Aceitável / Baseline | 0.25 - 0.35 | 0.25 - 0.40 |
| Bom | 0.15 - 0.25 | 0.15 - 0.25 |
| Excelente | < 0.15 | < 0.15 |

### Formato Strict de Dataset para Benchmark (`manifest.json`)
```json
{
  "samples": [
    {
      "id": "sample1",
      "audio": "data/sample1.wav",
      "transcript": "data/sample1.txt",
      "rttm": "data/sample1.rttm"
    }
  ]
}
```

### Benchmark Runner
```python
import soundfile as sf
from evaluation.metrics.wer import compute_wer
from evaluation.metrics.der import compute_der

class BenchmarkRunner:
    def __init__(self, pipeline): self.pipeline = pipeline

    def run(self, dataset_loader):
        results = []
        for sample in dataset_loader:
            audio, sr = sf.read(sample["audio"])
            output = self.pipeline.process(audio)

            predicted_text = self._extract_text(output)
            reference_text = open(sample["transcript"]).read()
            wer_score = compute_wer(reference_text, predicted_text)

            der_score = None
            if "rttm" in sample:
                reference_rttm = open(sample["rttm"]).readlines()
                predicted_rttm = self._to_rttm(output)
                der_score = compute_der(reference_rttm, predicted_rttm)

            results.append({"id": sample["id"], "wer": wer_score, "der": der_score})
        return results
```

---

## 5. Extensões e Diferenciais do TCC

### Clinical Error Rate (CER-clínico)
Criação de uma métrica customizada que aplique pesos maiores de penalização sobre erros que afetam diretamente o cuidado do paciente:
* Valores Numéricos Errados (ex: 15 vs 50).
* Medicamentos Errados.
* Dosagens Erradas.

---

## 6. Ambiente e Execução

Requisito obrigatório: Placa de vídeo **NVIDIA**, Drivers **CUDA** atualizados e token de acesso **HuggingFace** configurado.

**Build e Run com Docker:**
```bash
# Build da imagem
docker build -t stt-clinico .

# Rodar com arquivo WAV
docker run --gpus all -e HF_TOKEN="seu_token" -v ./audios:/app/audios stt-clinico audios/teste.wav

# Rodar com MICROFONE (Linux/WSL2 com suporte a áudio)
docker run --gpus all --device /dev/snd -e HF_TOKEN="seu_token" stt-clinico --mic
```

**Execução Local (Windows/Venv):**
```powershell
# Ativação e Execução via Microfone
.\.venv\Scripts\Activate.ps1
python app/main.py --mic
```
