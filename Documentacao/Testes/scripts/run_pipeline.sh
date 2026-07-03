#!/usr/bin/env bash
# Pipeline do artigo: validacao, RAG, LLM, gateway PII, graficos e relatorio.
# Uso: ./scripts/run_pipeline.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BENCH_DATE="${BENCH_DATE:-$(date +%Y%m%d_%H%M%S)}"
BASE_URL="${BASE_URL:-http://127.0.0.1:4010}"
PROVIDERS="${PROVIDERS:-ollama,gemini}"
RAG_MODES="${RAG_MODES:-on,off}"
SLEEP_GEMINI="${SLEEP_GEMINI:-25}"
SKIP_LLM="${SKIP_LLM:-0}"
SKIP_GATEWAY="${SKIP_GATEWAY:-0}"
SKIP_ROTEIRO="${SKIP_ROTEIRO:-1}"
SKIP_STT="${SKIP_STT:-1}"
SKIP_PDF="${SKIP_PDF:-0}"
STT_FULL_MATRIX="${STT_FULL_MATRIX:-0}"
STT_URL="${STT_URL:-http://127.0.0.1:8000}"
STT_ABLATIONS="${STT_ABLATIONS:-per_request}"
STT_CORPORA="${STT_CORPORA:-tts,medical,coraa}"
STT_PRESETS="${STT_PRESETS:-model_medium,model_large_v3,model_large_v3_turbo,hp_beam_5,hp_vad_off,hp_int8_float16,hp_initial_prompt,hp_noise_reduce,hp_condition_off}"
STT_LIMIT="${STT_LIMIT:-0}"
PY="${PY:-$ROOT/.venv/bin/python}"

RUN_DIR="$ROOT/artifacts/runs/$BENCH_DATE"
VALIDATION_DIR="$RUN_DIR/validation"
RAG_DIR="$RUN_DIR/rag"
LLM_DIR="$RUN_DIR/llm"
GATEWAY_DIR="$RUN_DIR/gateway"
STT_DIR="$RUN_DIR/stt"
ROTEIRO_DIR="$RUN_DIR/roteiro"

if [[ ! -x "$PY" ]]; then
  echo "Crie o venv: ./scripts/setup.sh" >&2
  exit 1
fi

mkdir -p "$RUN_DIR"
"$PY" - <<PY
import json
from datetime import datetime, timezone
from pathlib import Path

meta = {
    "bench_date": "$BENCH_DATE",
    "base_url": "$BASE_URL",
    "providers": "$PROVIDERS",
    "rag_modes": "$RAG_MODES",
    "skip_llm": "$SKIP_LLM",
    "skip_gateway": "$SKIP_GATEWAY",
    "skip_stt": "$SKIP_STT",
    "skip_roteiro": "$SKIP_ROTEIRO",
    "generated_at": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
}
path = Path("$RUN_DIR/run_meta.json")
path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {path}")
PY

echo "=== BENCH_DATE=$BENCH_DATE BASE_URL=$BASE_URL PROVIDERS=$PROVIDERS RAG_MODES=$RAG_MODES ==="

echo "[1/8] extract_corpus_text + validate_benchmark (N=100)"
"$PY" benchmarks/01_validate_dataset/extract_corpus_text.py
"$PY" benchmarks/01_validate_dataset/validate_benchmark.py \
  --report-out "$VALIDATION_DIR/validation_report.txt"

echo "[2/8] RAG benchmark (100 perguntas)"
"$PY" benchmarks/02_rag_retrieval/run_rag_benchmark.py \
  --base-url "$BASE_URL" \
  --out-dir "$RAG_DIR"

if [[ "$SKIP_LLM" != "1" ]]; then
  echo "[3/8] LLM benchmark (providers=$PROVIDERS rag_modes=$RAG_MODES)"
  "$PY" benchmarks/03_llm_end_to_end/run_benchmark.py \
    --base-url "$BASE_URL" \
    --out-dir "$LLM_DIR" \
    --providers "$PROVIDERS" \
    --rag-modes "$RAG_MODES" \
    --sleep-secs "$SLEEP_GEMINI" \
    --resume
else
  echo "[3/8] SKIP_LLM=1 - pulando bench de modelos"
fi

if [[ "$SKIP_GATEWAY" != "1" ]]; then
  echo "[4/8] Gateway benchmark (50 frases PII)"
  "$PY" benchmarks/04_gateway_pii/run_gateway_benchmark.py \
    --base-url "$BASE_URL" \
    --out-dir "$GATEWAY_DIR"
else
  echo "[4/8] SKIP_GATEWAY=1 - pulando bench do gateway"
fi

if [[ "$SKIP_STT" != "1" ]]; then
  if [[ "$STT_FULL_MATRIX" == "1" ]]; then
    echo "[5/8] STT matriz comparativa (corpora=$STT_CORPORA presets=$STT_PRESETS)"
    export STT_CORPORA STT_PRESETS STT_LIMIT STT_URL BENCH_DATE
    ./scripts/run_stt_matrix.sh "$BENCH_DATE"
  else
    echo "[5/8] STT smoke (verify + medical corpus)"
    "$PY" benchmarks/05_stt/verify_stt_corpus.py --probe-id M003 || true
    if [[ -f data/stt/stt_corpus_medical.jsonl ]]; then
      "$PY" benchmarks/05_stt/run_stt_benchmark.py \
        --stt-url "$STT_URL" \
        --corpus data/stt/stt_corpus_medical.jsonl \
        --out-dir "$STT_DIR" \
        --ablation "$STT_ABLATIONS" \
        --corpus-tag medical
    fi
  fi
else
  echo "[5/8] SKIP_STT=1 - pulando bench STT (GPU; SKIP_STT=0 STT_FULL_MATRIX=1 para matriz)"
fi

if [[ "$SKIP_ROTEIRO" != "1" ]]; then
  echo "[6/8] Roteiro GT01-GT05 (opcional)"
  "$PY" benchmarks/06_roteiro_gt/run_roteiro_benchmark.py \
    --base-url "$BASE_URL" \
    --out-dir "$ROTEIRO_DIR"
  "$PY" reporting/plot_roteiro_results.py --date "$BENCH_DATE"
else
  echo "[6/8] SKIP_ROTEIRO=1 - pulando roteiro"
fi

echo "[7/8] Graficos + dashboard + relatorio"
"$PY" reporting/plot_benchmark_results.py --date "$BENCH_DATE"

STT_COMPARISON_DIR="$STT_DIR"
if [[ -f "$STT_COMPARISON_DIR/stt_results_all.csv" ]]; then
  echo "[7b/8] Graficos STT comparativo"
  "$PY" reporting/plot_stt_results.py \
    --results-root "$STT_COMPARISON_DIR" \
    --date "$BENCH_DATE"
fi

"$PY" reporting/assemble_article_report.py --date "$BENCH_DATE"

if [[ "$SKIP_PDF" != "1" ]]; then
  echo "[8/8] Relatorio PDF LaTeX"
  "$PY" reporting/render_benchmark_pdf.py --date "$BENCH_DATE"
else
  echo "[8/8] SKIP_PDF=1 - pulando relatorio PDF"
fi

echo "Concluido."
echo "  Runs:      artifacts/runs/$BENCH_DATE/"
echo "  Figuras:   artifacts/figures/$BENCH_DATE/"
echo "  Dashboard: artifacts/dashboard/$BENCH_DATE/index.html"
echo "  Relatorio: artifacts/reports/ARTIGO_RESULTADOS_${BENCH_DATE}.md"
if [[ "$SKIP_PDF" != "1" ]]; then
  echo "  PDF:       artifacts/reports/RELATORIO_BENCHMARK_${BENCH_DATE}.pdf"
fi
