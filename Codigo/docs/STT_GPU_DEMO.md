# Demo GPU única — Escriba + Lívia

## Modos (`GPU_DEMO_MODE`)

| Modo | Comportamento |
|------|----------------|
| `time_slice` (default) | Fila in-process no backend: STT e insight Ollama não rodam ao mesmo tempo |
| `exclusive_stt` | Insight LLM enfileirado enquanto `mic_state.active=true`; flush ao parar mic |
| `livia_cloud` | Documentação: Lívia com `llm_provider=gemini` para liberar VRAM local |

## Recomendações operacionais

- `STT_CONCURRENCY_LIMIT=1`, `LLM_CONCURRENCY_LIMIT=1`
- Host Ollama: `OLLAMA_NUM_PARALLEL=1`
- Whisper: `WHISPER_COMPUTE_TYPE=float16` (recomendado em GPU recente); fallback para `int8`/`int8_float16` se necessário
- Durante gravação intensa: `OLLAMA_NUM_GPU=0` no host (modo manual) ou Lívia em Gemini

## Preflight

```bash
cd Codigo
./scripts/demo-gpu-preflight.sh
```

## Subida Compose (profile `ai`)

```bash
# .env: WHISPER_HTTP_URL=http://stt:8000
docker compose --profile ai up -d --build db clinical_ai stt backend frontend
```

Ordem: `db` → `clinical_ai` → `stt` (GPU) → `backend` → `frontend`.

## Checklist demo (~5 min)

1. Preflight OK (`nvidia-smi`, `/health` STT e backend)
2. Escriba → Atendimento → gravar ~30 s → ver `stt_partial` em PT
3. Finalizar trecho → insight IA sem OOM
4. Aba Prontuário → salvar rascunho
5. Lívia com Gemini se GPU cheia

## Limitações

O mutex Node **não** serializa chamadas Ollama feitas pelo `clinical-ai` fora do pipeline de consulta. Para demo estável, prefira `livia_cloud` + `time_slice`.
