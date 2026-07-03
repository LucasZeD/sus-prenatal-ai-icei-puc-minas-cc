# Diarization Service (pyannote.audio 3.1)

Microsserviço FastAPI de **diarização de locutores** (quem falou e quando), 100% local,
espelhando o padrão do `stt-service`. Responsabilidade única: receber o áudio efêmero de
um trecho da consulta e devolver os turnos de locutor. Consumido pelo backend Node via
`DIARIZATION_HTTP_URL` (client `backend/src/lib/diarization/diarizationClient.ts`).

> Privacidade (LGPD): nenhum conteúdo de áudio/transcrição é logado; o áudio é processado
> em memória/arquivo temporário e descartado ao fim da requisição. Em runtime os modelos
> vêm do cache da imagem/volume (`HF_HUB_OFFLINE=1`), **sem acesso à internet**.

## API

- `GET /health`  `{ status, backend, model, device, concurrency_limit, offline }`
- `POST /v1/diarize`  `multipart/form-data`:
  - `file` (obrigatório): áudio. Aceita **WebM/Opus** (decodificado via ffmpeg), **WAV** e **PCM 16 kHz mono** (`.pcm`/`.raw`).
  - `num_speakers` (opcional), `min_speakers` (opcional), `max_speakers` (opcional).
  - Resposta: `{ "segments": [ { "start": float, "end": float, "speaker": "SPEAKER_00" }, ... ], "num_speakers": int }`

## Backends

| `DIARIZATION_BACKEND` | Descrição |
|-----------------------|-----------|
| `auto` (default) | Tenta `pyannote`; cai para `fallback` se o pipeline não carregar. |
| `pyannote` | `pyannote/speaker-diarization-3.1` (qualidade; PyTorch). |
| `fallback` | Agrupamento espectral 2-means em numpy puro (sem PyTorch). Usado offline/nos testes. |

O `fallback` mantém o **mesmo contrato** de API, então o backend Node não precisa saber qual
está ativo. Também serve de degradação graciosa caso o ambiente alvo não comporte o pyannote
(ver nota sobre `sherpa-onnx` no plano de evolução).

## Variáveis de ambiente

| Variável | Default | Descrição |
|----------|---------|-----------|
| `DIARIZATION_MODEL` | `pyannote/speaker-diarization-3.1` | Modelo pyannote. |
| `DIARIZATION_DEVICE` | `cpu` | `cpu` ou `cuda`. CPU é o default seguro (GPU de 16 GB compartilhada com o Ollama). |
| `DIARIZATION_BACKEND` | `auto` | `auto` \| `pyannote` \| `fallback`. |
| `DIARIZATION_CONCURRENCY_LIMIT` | `1` | Diarizações simultâneas (semaphore). Diarização é pesada; mantenha baixo. |
| `HF_HUB_OFFLINE` | `1` (na imagem) | Sem rede HF em runtime; usa o cache da build/volume. |
| `PORT` | `8001` | Porta HTTP. |

## Modelos: download em build time (offline em runtime)

Os modelos (segmentation + embedding) são baixados em **build time** e cacheados na imagem.
O token Hugging Face é passado **apenas no build** via BuildKit secret (nunca embutido na
imagem final). É necessário aceitar as condições de uso dos modelos no site do Hugging Face
com a sua conta:

- https://huggingface.co/pyannote/speaker-diarization-3.1
- https://huggingface.co/pyannote/segmentation-3.0

```bash
# token em arquivo (não comitar):
echo "hf_xxx_seu_token" > hf_token.txt

DOCKER_BUILDKIT=1 docker build \
  --secret id=hf_token,src=./hf_token.txt \
  -t prenatal-diarization ./diarization

# runtime (CPU, offline):
docker run -p 8001:8001 prenatal-diarization
```

Se o build for feito **sem** o secret, o pré-download é pulado e o serviço sobe no backend
`fallback` (sem pyannote). Para uso com pyannote, faça o build com o secret e monte o volume
de cache de modelos (ver `docker-compose.yml`, serviço `diarization`, perfil `ai`).

## Requisitos de hardware

- **CPU (default):** funciona; diarização de um trecho de ~1030 s leva alguns segundos.
- **GPU (opcional):** `DIARIZATION_DEVICE=cuda` acelera, mas divide a VRAM com o Ollama
  (Qwen ~10,5 GB em GPU de 16 GB). Prefira CPU na demo single-GPU.

## Testes (offline, sem PyTorch)

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q
```

Os testes geram um WAV sintético de 2 locutores e validam o backend `fallback`
(>= 2 falantes) e o contrato HTTP de `/v1/diarize`.

## Referência

pyannote.audio  Bredin et al. (Interspeech 2020/2023). Ver `references.bib` (`bredin2020pyannote`,
`plaquet2023powerset`) no artigo do projeto.
