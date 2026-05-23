# STT Service (faster-whisper)

Serviço FastAPI compatível com `POST /v1/audio/transcriptions` (OpenAI-style) para o Escriba Digital.

## Modelos

| Modelo | VRAM aprox. | Uso |
|--------|-------------|-----|
| `large-v3` (default) | ~6–8 GB com `float16` | Demo / qualidade PT clínico |
| `medium` | ~3–4 GB | Máquinas com GPU limitada |

## Variáveis de ambiente

| Variável | Default | Descrição |
|----------|---------|-----------|
| `WHISPER_MODEL` | `large-v3` | Modelo faster-whisper |
| `WHISPER_COMPUTE_TYPE` | `float16` | Quantização (GPU moderna). Use `int8` em fallback e `int8_float16` só se necessário |
| `WHISPER_DEVICE` | `cuda` | `cuda` ou `cpu` |
| `STT_PREPROCESS_ENABLED` | `true` | Normalização + high-pass 80 Hz |
| `STT_NOISE_REDUCE` | `false` | noisereduce (mais CPU) |
| `STT_DIARIZATION_ENABLED` | `true` | 2 falantes (k-means simples) |
| `STT_LANGUAGE` | `pt` | Idioma Whisper |

## Pré-processamento

Pipeline: ffmpeg decode (WebM/opus) → mono 16 kHz → high-pass ~80 Hz → normalização RMS → (opcional) noisereduce.

**Nota qualitativa:** em microfone de consultório com ruído de fundo, o preprocess tende a melhorar legibilidade vs. áudio bruto (menos clipping e hiss em graves).

## API

- `GET /health` — status, modelo, cuda
- `POST /v1/audio/transcriptions` — multipart `file`, opcional header `X-STT-Preprocess: 1`

Resposta: `{ "text", "segments": [...], "speakers": [{ "id", "label", "text" }] }`

## Diarização MVP

Modo `simple`: features de energia/espectral por segmento Whisper + k-means (k=2). Primeiro cluster ativo → `[Profissional]`, outro → `[Paciente]`. Desative com `STT_DIARIZATION_ENABLED=false`.

Limitação: sobreposição de vozes e mais de 2 falantes degradam a precisão.

## Build

```bash
docker build -t prenatal-stt ./stt-service
docker run --gpus all -p 8000:8000 -e WHISPER_MODEL=large-v3 prenatal-stt
```
