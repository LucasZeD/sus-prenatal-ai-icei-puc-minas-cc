# STT Service (faster-whisper)

Serviço FastAPI compatível com `POST /v1/audio/transcriptions` (OpenAI-style) para o Escriba Digital.

**Diarização de locutores:** não faz parte deste serviço. Use o microsserviço dedicado `Codigo/diarization/` (`DIARIZATION_HTTP_URL` no backend).

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
| `STT_LANGUAGE` | `pt` | Idioma Whisper |

## Pré-processamento

Pipeline: ffmpeg decode (WebM/opus) → mono 16 kHz → high-pass ~80 Hz → normalização RMS → (opcional) noisereduce.

**Nota qualitativa:** em microfone de consultório com ruído de fundo, o preprocess tende a melhorar legibilidade vs. áudio bruto (menos clipping e hiss em graves).

## API

- `GET /health` — status, modelo, cuda
- `POST /v1/audio/transcriptions` — multipart `file`, opcional header `X-STT-Preprocess: 1`

Resposta: `{ "text": string, "segments": [{ "start", "end", "text" }, ...] }`

## Build

```bash
docker build -t prenatal-stt ./stt-service
docker run --gpus all -p 8000:8000 -e WHISPER_MODEL=large-v3 prenatal-stt
```
