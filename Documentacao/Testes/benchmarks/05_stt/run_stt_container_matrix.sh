#!/usr/bin/env bash
# Matriz de ablações STT que exigem recriar o container `stt`.
# Uso: ./run_stt_container_matrix.sh [STAMP]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
TESTS_ROOT="$(cd "$ROOT/.." && pwd)"
CODIGO_DIR="$(cd "$TESTS_ROOT/../../Codigo" && pwd)"
STAMP="${1:-$(date +%Y%m%d_%H%M%S)}"
OUT_BASE="$ROOT/results/matrix_$STAMP"
STT_URL="${STT_URL:-http://127.0.0.1:8000}"
PY="${PY:-$TESTS_ROOT/.venv/bin/python}"
PRESETS="${STT_CONTAINER_PRESETS:-model_large_v3,hp_noise_reduce,model_medium}"
INCLUDE_CPU="${INCLUDE_CPU:-0}"

if [[ ! -x "$PY" ]]; then
  echo "Crie o venv em Documentacao/Testes: python3 -m venv .venv && pip install -r requirements-bench.txt" >&2
  exit 1
fi

mkdir -p "$OUT_BASE"

IFS=',' read -ra PRESET_IDS <<< "$PRESETS"

get_env_from_yaml() {
  local preset_id="$1"
  local key="$2"
  "$PY" - <<PY
import yaml
from pathlib import Path
data = yaml.safe_load(Path("$ROOT/stt_ablation_presets.yaml").read_text(encoding="utf-8"))
for p in data.get("container", []):
    if p.get("id") == "$preset_id":
        env = p.get("env") or {}
        print(env.get("$key", ""))
        break
PY
}

wait_stt_healthy() {
  local attempts="${1:-60}"
  local i
  for ((i = 1; i <= attempts; i++)); do
    if curl -sf "${STT_URL%/}/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 5
  done
  echo "STT não ficou healthy em ${STT_URL}" >&2
  return 1
}

run_preset() {
  local preset_id="$1"
  local out_dir="$OUT_BASE/$preset_id"
  echo "=== Preset: $preset_id ==="

  local model compute device noise preprocess initial_prompt vad
  model="$(get_env_from_yaml "$preset_id" WHISPER_MODEL)"
  compute="$(get_env_from_yaml "$preset_id" WHISPER_COMPUTE_TYPE)"
  device="$(get_env_from_yaml "$preset_id" WHISPER_DEVICE)"
  noise="$(get_env_from_yaml "$preset_id" STT_NOISE_REDUCE)"
  preprocess="$(get_env_from_yaml "$preset_id" STT_PREPROCESS_ENABLED)"
  initial_prompt="$(get_env_from_yaml "$preset_id" STT_INITIAL_PROMPT)"
  vad="$(get_env_from_yaml "$preset_id" STT_VAD_FILTER)"

  if [[ -z "$model" ]]; then
    echo "Preset desconhecido: $preset_id" >&2
    return 1
  fi

  (
    cd "$CODIGO_DIR"
    WHISPER_MODEL="$model" \
    WHISPER_COMPUTE_TYPE="$compute" \
    WHISPER_DEVICE="$device" \
    STT_NOISE_REDUCE="$noise" \
    STT_PREPROCESS_ENABLED="$preprocess" \
    STT_INITIAL_PROMPT="$initial_prompt" \
    STT_VAD_FILTER="${vad:-true}" \
    COMPOSE_PROFILES=ai \
    docker compose --profile ai up -d --force-recreate stt
  )

  wait_stt_healthy 90

  "$PY" "$ROOT/run_stt_benchmark.py" \
    --stt-url "$STT_URL" \
    --out-dir "$out_dir" \
    --ablation none

  cp "$ROOT/stt_ablation_presets.yaml" "$out_dir/preset_snapshot.yaml"
  echo "$preset_id" >"$out_dir/preset_id.txt"
}

for preset in "${PRESET_IDS[@]}"; do
  preset="$(echo "$preset" | xargs)"
  [[ -z "$preset" ]] && continue
  run_preset "$preset"
done

if [[ "$INCLUDE_CPU" == "1" ]]; then
  echo "=== CPU fallback manual (WHISPER_DEVICE=cpu) - opcional ==="
  (
    cd "$CODIGO_DIR"
    WHISPER_MODEL=large-v3 \
    WHISPER_COMPUTE_TYPE=int8 \
    WHISPER_DEVICE=cpu \
    COMPOSE_PROFILES=ai \
    docker compose --profile ai up -d --force-recreate stt
  )
  wait_stt_healthy 120
  "$PY" "$ROOT/run_stt_benchmark.py" \
    --stt-url "$STT_URL" \
    --out-dir "$OUT_BASE/cpu_int8" \
    --ablation none
fi

echo "Matriz concluída em $OUT_BASE"
echo "Compare cada preset: $PY compare_stt_ablation.py --results-dir $OUT_BASE/<preset_id>"
