# Pipeline de benchmarks

## Ordem de execucao

`./scripts/run_pipeline.sh` executa os blocos na ordem numerica `01` a `06`, depois `reporting` (steps 7 e 8).

Step 8 gera `RELATORIO_BENCHMARK_<BENCH_DATE>.pdf` via LaTeX (`latexmk`). Use `SKIP_PDF=1` se LaTeX nao estiver instalado.

## Pre-requisitos Docker

```bash
cd ../../Codigo
docker compose up -d clinical_ai
curl -X POST "http://127.0.0.1:4010/rag/test/rebuild?force=true"
```

STT (opt-in): `docker compose --profile ai up -d stt` em `:8000`.

## Corpus CartilhasSUS

O indice RAG le `Codigo/clinical-ai/corpus/CartilhasSUS`. Apos trocar PDFs: rebuild da imagem + `POST /rag/test/rebuild?force=true`.

`benchmarks/01_validate_dataset/extract_corpus_text.py` gera `corpus_extracted/` (gitignored) para grounding do CSV.

## Variaveis de ambiente

| Variavel | Padrao | Descricao |
|----------|--------|-----------|
| `BENCH_DATE` | `YYYYMMDD_HHMMSS` | Stamp da pasta em `artifacts/runs/` |
| `BASE_URL` | `http://127.0.0.1:4010` | URL do clinical_ai |
| `PROVIDERS` | `ollama,gemini` | Providers LLM |
| `RAG_MODES` | `on,off` | Modos RAG no bench LLM |
| `SLEEP_GEMINI` | `25` | Pausa entre chamadas Gemini |
| `SKIP_LLM` | `0` | `1` pula bench LLM |
| `SKIP_GATEWAY` | `0` | `1` pula gateway PII |
| `SKIP_STT` | `1` | `1` pula STT (padrao) |
| `SKIP_ROTEIRO` | `1` | `1` pula roteiro GT |
| `STT_FULL_MATRIX` | `0` | `1` roda `./scripts/run_stt_matrix.sh` |
| `STT_URL` | `http://127.0.0.1:8000` | URL do stt-service |
| `STT_CORPORA` | `tts,medical,coraa` | Corpora na matriz STT |
| `STT_PRESETS` | ver `run_stt_matrix.sh` | Presets YAML |
| `STT_LIMIT` | `0` | Limite de clips (`0` = todos) |
| `STT_ABLATIONS` | `per_request` | Modo ablation STT smoke |
| `SKIP_PDF` | `0` | `1` pula relatorio PDF LaTeX (step 8) |
| `PY` | `.venv/bin/python` | Interpretador |

## Pre-requisitos LaTeX (step 8)

```bash
sudo apt install texlive-latex-base texlive-latex-extra texlive-fonts-recommended latexmk
```

Compilacao manual:

```bash
.venv/bin/python reporting/render_benchmark_pdf.py --date <BENCH_DATE>
```

## Comandos uteis

```bash
# Smoke offline (~10s)
./scripts/run_smoke.sh

# Pipeline sem STT/roteiro, so ollama
PROVIDERS=ollama SKIP_STT=1 SKIP_ROTEIRO=1 ./scripts/run_pipeline.sh

# Matriz STT completa (GPU)
SKIP_STT=0 STT_FULL_MATRIX=1 ./scripts/run_pipeline.sh

# Comparativo RAG ablation (apos pipeline)
.venv/bin/python benchmarks/03_llm_end_to_end/compare_rag_ablation.py \
  --results artifacts/runs/<STAMP>/llm/results.csv \
  --rag-results artifacts/runs/<STAMP>/rag/rag_results.csv
```

## Layout de artefatos

```
artifacts/runs/<BENCH_DATE>/
  validation/validation_report.txt
  rag/rag_results.csv
  llm/results.csv
  gateway/gateway_results.csv
  stt/...
  roteiro/roteiro_results.csv
artifacts/figures/<BENCH_DATE>/
artifacts/dashboard/<BENCH_DATE>/index.html
artifacts/reports/ARTIGO_RESULTADOS_<BENCH_DATE>.md
artifacts/reports/RELATORIO_BENCHMARK_<BENCH_DATE>.pdf
artifacts/reports/RELATORIO_BENCHMARK_latest.pdf
```

## CI (opcional)

```bash
cd Documentacao/Testes && ./scripts/setup.sh && .venv/bin/pytest tests/ -q
```
