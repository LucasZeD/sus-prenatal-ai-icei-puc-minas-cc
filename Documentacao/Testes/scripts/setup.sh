#!/usr/bin/env bash
# Cria venv local e instala dependencias do benchmark.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

python3 -m venv .venv
.venv/bin/pip install -U pip
.venv/bin/pip install -r requirements-bench.txt

echo "Setup concluido. Ative: .venv/bin/python -m pytest tests/ -q"
