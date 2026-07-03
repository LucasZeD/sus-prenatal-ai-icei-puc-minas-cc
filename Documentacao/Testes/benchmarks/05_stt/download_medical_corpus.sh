#!/usr/bin/env bash
# Baixa juliasdata/medical-audio-sample-brazilian-portuguese via venv (evita PEP 668).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
TESTS_ROOT="$(cd "$ROOT/.." && pwd)"
PY="${PY:-$TESTS_ROOT/.venv/bin/python}"

if [[ ! -x "$PY" ]]; then
  echo "Crie o venv: cd Documentacao/Testes && python3 -m venv .venv && .venv/bin/pip install -r requirements-bench.txt" >&2
  exit 1
fi

"$PY" "$ROOT/import_external_corpus.py" --source medical --download "$@"
