#!/usr/bin/env bash
# Validacao rapida offline: pytest + schema do dataset (sem Docker).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PY="${PY:-$ROOT/.venv/bin/python}"

if [[ ! -x "$PY" ]]; then
  echo "Execute ./scripts/setup.sh primeiro" >&2
  exit 1
fi

echo "=== pytest (offline) ==="
"$PY" -m pytest tests/ -q

echo "=== validate_benchmark (schema; grounding se corpus_extracted existir) ==="
VALIDATION_OUT="$ROOT/artifacts/runs/smoke/validation/validation_report.txt"
"$PY" benchmarks/01_validate_dataset/validate_benchmark.py --report-out "$VALIDATION_OUT" || {
  echo "AVISO: validacao falhou (corpus_extracted ausente? rode extract_corpus_text com clinical-ai)" >&2
}

BASE_URL="${BASE_URL:-http://127.0.0.1:4010}"
if curl -sf "${BASE_URL%/}/health" >/dev/null 2>&1; then
  echo "clinical_ai OK em $BASE_URL"
else
  echo "AVISO: clinical_ai nao responde em $BASE_URL (esperado no smoke offline)" >&2
fi

echo "Smoke concluido."
