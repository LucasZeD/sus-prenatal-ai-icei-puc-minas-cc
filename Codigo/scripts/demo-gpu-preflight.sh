#!/usr/bin/env bash
# Preflight para demo Escriba + GPU única (STT + Ollama no host).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

echo "=== GPU Demo Preflight ==="
echo "GPU_DEMO_MODE=${GPU_DEMO_MODE:-time_slice}"
echo "WHISPER_HTTP_URL=${WHISPER_HTTP_URL:-<vazio>}"
echo "OLLAMA_HTTP_URL=${OLLAMA_HTTP_URL:-<vazio>}"
echo "CLINICAL_AI_URL=${CLINICAL_AI_URL:-http://clinical_ai:4010}"
echo ""

if command -v nvidia-smi >/dev/null 2>&1; then
  echo "--- nvidia-smi ---"
  nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free --format=csv,noheader || true
else
  echo "WARN: nvidia-smi não encontrado (STT GPU pode falhar no container)"
fi
echo ""

if command -v ollama >/dev/null 2>&1; then
  echo "--- ollama ps ---"
  ollama ps 2>/dev/null || echo "(ollama ps indisponível)"
  echo ""
fi

probe() {
  local name="$1"
  local url="$2"
  if [[ -z "$url" ]]; then
    echo "[$name] não configurado"
    return
  fi
  if curl -sf --max-time 5 "$url" >/dev/null 2>&1; then
    echo "[$name] OK $url"
  else
    echo "[$name] FALHOU $url"
  fi
}

WHISPER_BASE="${WHISPER_HTTP_URL%/}"
OLLAMA_BASE="${OLLAMA_HTTP_URL%/}"
CLINICAL_BASE="${CLINICAL_AI_URL:-http://127.0.0.1:4010}"
CLINICAL_BASE="${CLINICAL_BASE%/}"

probe "STT" "${WHISPER_BASE:+$WHISPER_BASE/health}"
probe "Ollama" "${OLLAMA_BASE:+$OLLAMA_BASE/api/tags}"
probe "clinical-ai" "${CLINICAL_BASE}/health"

BACKEND_PORT="${BACKEND_PUBLISH_PORT:-3000}"
probe "backend" "http://127.0.0.1:${BACKEND_PORT}/health"

echo ""
echo "Subida sugerida (profile ai):"
echo "  docker compose --profile ai up -d --build db clinical_ai stt backend frontend"
echo "  # .env: WHISPER_HTTP_URL=http://stt:8000"
