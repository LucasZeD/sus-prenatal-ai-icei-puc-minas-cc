#!/usr/bin/env bash
# Encadeia validacao, benches RAG/LLM, graficos e relatorio do artigo.
# Uso: ./run_all_benchmarks.sh
# Variaveis: BENCH_DATE, BASE_URL, SLEEP_GEMINI, SKIP_LLM (1=pula passo 3)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

BENCH_DATE="${BENCH_DATE:-$(date +%Y%m%d)}"
BASE_URL="${BASE_URL:-http://127.0.0.1:4010}"
SLEEP_GEMINI="${SLEEP_GEMINI:-25}"
PY="${PY:-$ROOT/.venv/bin/python}"

if [[ ! -x "$PY" ]]; then
  echo "Crie o venv: python3 -m venv .venv && .venv/bin/pip install -r requirements-bench.txt" >&2
  exit 1
fi

echo "=== BENCH_DATE=$BENCH_DATE BASE_URL=$BASE_URL ==="

echo "[1/6] extract_corpus_text + validate_benchmark"
"$PY" dataset/extract_corpus_text.py
"$PY" dataset/validate_benchmark.py \
  --report-out "01_validacao_dataset/reports/validation_report.txt"

echo "[2/6] RAG benchmark (110 perguntas)"
(
  cd 03_bench_rag_retrieval
  "$PY" run_rag_benchmark.py --base-url "$BASE_URL" --out-dir "./results/$BENCH_DATE"
)

echo "[2b/6] Roteiro ground truth (GT01-GT05)"
if [[ "${SKIP_ROTEIRO:-0}" != "1" ]]; then
  (
    cd 04_bench_roteiro_ground_truth
    ROTEIRO_ARGS=(--base-url "$BASE_URL" --out-dir "./results/$BENCH_DATE")
    if [[ "${SKIP_LLM:-0}" == "1" ]]; then
      ROTEIRO_ARGS+=(--skip-llm)
    fi
    "$PY" run_roteiro_benchmark.py "${ROTEIRO_ARGS[@]}"
  )
  "$PY" 04_bench_roteiro_ground_truth/test_jargon_normalize.py
else
  echo "  SKIP_ROTEIRO=1 ù pulando bench roteiro"
fi

if [[ "${SKIP_LLM:-0}" != "1" ]]; then
  echo "[3/6] LLM benchmark (110 x 2 providers; pode levar horas)"
  (
    cd 02_bench_modelos_llm
    "$PY" run_benchmark.py \
      --base-url "$BASE_URL" \
      --out-dir "./results/$BENCH_DATE" \
      --providers ollama,gemini \
      --sleep-secs "$SLEEP_GEMINI" \
      --resume
  )
else
  echo "[3/6] SKIP_LLM=1 ù pulando bench de modelos"
fi

echo "[4/6] Graficos matplotlib"
"$PY" 05_relatorio_artigo/plot_benchmark_results.py --date "$BENCH_DATE"
if [[ "${SKIP_ROTEIRO:-0}" != "1" ]] && [[ -f "04_bench_roteiro_ground_truth/results/$BENCH_DATE/roteiro_results.csv" ]]; then
  echo "[4b/6] Graficos roteiro (fig07-fig10)"
  "$PY" 05_relatorio_artigo/plot_roteiro_results.py --date "$BENCH_DATE"
fi

echo "[5/6] Relatorio TESTES_SECAO_ARTIGO.md"
"$PY" 05_relatorio_artigo/assemble_article_report.py --date "$BENCH_DATE"

echo "[6/6] Concluido."
echo "  Figuras: 05_relatorio_artigo/figures/$BENCH_DATE/"
echo "  Relatorio: 05_relatorio_artigo/TESTES_SECAO_ARTIGO.md"
echo "Se Gemini retornou HTTP 429, veja README secao 'Completar bench Gemini'."
