#!/usr/bin/env bash
# Pipeline do artigo: validacao, RAG, LLM, gateway PII, graficos e relatorio.
# Uso: ./run_all_benchmarks.sh
# Variaveis: BENCH_DATE (default YYYYMMDD_HHMMSS), BASE_URL, PROVIDERS, RAG_MODES, ...
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# Pasta ?nica por execu??o (evita colis?o com --resume). Sobrescreva com BENCH_DATE=20260601 se quiser s? o dia.
BENCH_DATE="${BENCH_DATE:-$(date +%Y%m%d_%H%M%S)}"
BASE_URL="${BASE_URL:-http://127.0.0.1:4010}"
# Matriz padrão: ollama on/off (efeito RAG) + gemini on (comparar com ollama on). Sem gemini+off.
PROVIDERS="${PROVIDERS:-ollama,gemini}"
RAG_MODES="${RAG_MODES:-on,off}"
SLEEP_GEMINI="${SLEEP_GEMINI:-25}"
SKIP_ROTEIRO="${SKIP_ROTEIRO:-1}"
PY="${PY:-$ROOT/.venv/bin/python}"

if [[ ! -x "$PY" ]]; then
  echo "Crie o venv: python3 -m venv .venv && .venv/bin/pip install -r requirements-bench.txt" >&2
  exit 1
fi

echo "=== BENCH_DATE=$BENCH_DATE BASE_URL=$BASE_URL PROVIDERS=$PROVIDERS RAG_MODES=$RAG_MODES ==="

echo "[1/6] extract_corpus_text + validate_benchmark (N=100)"
"$PY" dataset/extract_corpus_text.py
"$PY" dataset/validate_benchmark.py --report-out "01_validacao_dataset/reports/validation_report.txt"

echo "[2/6] RAG benchmark (100 perguntas)"
(
  cd 03_bench_rag_retrieval
  "$PY" run_rag_benchmark.py --base-url "$BASE_URL" --out-dir "./results/$BENCH_DATE"
)

if [[ "${SKIP_LLM:-0}" != "1" ]]; then
  echo "[3/6] LLM benchmark (providers=$PROVIDERS rag_modes=$RAG_MODES)"
  (
    cd 02_bench_modelos_llm
    "$PY" run_benchmark.py       --base-url "$BASE_URL"       --out-dir "./results/$BENCH_DATE"       --providers "$PROVIDERS"       --rag-modes "$RAG_MODES"       --sleep-secs "$SLEEP_GEMINI"       --resume
  )
else
  echo "[3/6] SKIP_LLM=1 - pulando bench de modelos"
fi

if [[ "${SKIP_GATEWAY:-0}" != "1" ]]; then
  echo "[4/6] Gateway benchmark (50 frases PII)"
  (
    cd 06_gateway_privacidade
    "$PY" run_gateway_benchmark.py --base-url "$BASE_URL" --out-dir "./results/$BENCH_DATE"
  )
else
  echo "[4/6] SKIP_GATEWAY=1 - pulando bench do gateway"
fi

echo "[5/6] Graficos + dashboard + article_metrics.json"
"$PY" 05_relatorio_artigo/plot_benchmark_results.py --date "$BENCH_DATE"

if [[ "$SKIP_ROTEIRO" != "1" ]]; then
  echo "[5b/6] Roteiro GT01-GT05 (opcional, fora do protocolo principal)"
  (
    cd 04_bench_roteiro_ground_truth
    "$PY" run_roteiro_benchmark.py --base-url "$BASE_URL" --out-dir "./results/$BENCH_DATE"
  )
  "$PY" 04_bench_roteiro_ground_truth/test_jargon_normalize.py
  "$PY" 05_relatorio_artigo/plot_roteiro_results.py --date "$BENCH_DATE"
fi

echo "[6/6] Relatorio ARTIGO_RESULTADOS.md"
"$PY" 05_relatorio_artigo/assemble_article_report.py --date "$BENCH_DATE"

echo "Concluido."
echo "  Figuras: 05_relatorio_artigo/figures/$BENCH_DATE/"
echo "  Dashboard: 05_relatorio_artigo/dashboard/$BENCH_DATE/index.html"
echo "  Metricas: 05_relatorio_artigo/article_metrics.json"
echo "  Relatorio: 05_relatorio_artigo/ARTIGO_RESULTADOS.md"
