# Escriba — STT e streaming

## Arquitetura

1. **Frontend** (`ConsultaStreamPanel`, variant `streamOnly`): MediaRecorder WebM 400 ms, `getUserMedia` com AGC/NS/eco.
2. **WebSocket** `GET /ws/consultation/:id?token=JWT`: frames binários (WebM) + JSON `vad_pause`, `mic_state`.
3. **Backend** (`ConsultationStreamSession`): acumula chunks (`STT_CHUNK_MIN_MS`, default 2500 ms) → `FasterWhisperClient`.
4. **stt-service** (FastAPI): ffmpeg → pré-processamento → faster-whisper `large-v3` → diarização simples (2 falantes).

## Variáveis (backend / Compose)

| Variável | Descrição |
|----------|-----------|
| `WHISPER_HTTP_URL` | Base do serviço STT (ex.: `http://stt:8000`) |
| `WHISPER_MODEL` | Modelo (default `large-v3`) |
| `STT_CHUNK_MIN_MS` | Janela de acúmulo WebM antes do POST |
| `STT_USE_PREPROCESS` | Header/form para pipeline no serviço |
| `STT_CONCURRENCY_LIMIT` | Demo: `1` |
| `GPU_DEMO_MODE` | `time_slice` \| `exclusive_stt` \| `livia_cloud` |
| `STREAM_RAG_DEBOUNCE_MS` | Debounce insight LLM (demo: `1500`) |

## Eventos WebSocket (servidor → cliente)

- `stt_partial` — texto acumulado (pode incluir `[Profissional]` / `[Paciente]`)
- `ia_token` / `ia_done` — insight Ollama após sanitização MCP
- `error`

## LGPD

Áudio bruto não é persistido; apenas trechos **sanitizados** (`TRANSCRICAO_SANITIZADA`) e insight (`IA_INSIGHT_COMPLETO`).

## Limitações MVP

- O frontend envia um WebM **completo** por janela (`MediaRecorder.stop()` a cada ~`STT_CHUNK_MIN_MS`), não concatena slices de 400 ms; o backend trata um frame WS grande como janela cheia.
- Diarização 2 falantes é heurística (k-means em segmentos Whisper).
- Mutex GPU no Node não controla Ollama usado diretamente pelo Lívia no host — ver `STT_GPU_DEMO.md`.
