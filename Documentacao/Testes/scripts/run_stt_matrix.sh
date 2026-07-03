#!/usr/bin/env bash
# Matriz comparativa STT: corpora x presets x ablacoes per_request.
# Uso: ./scripts/run_stt_matrix.sh [STAMP]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BENCH_DIR="$ROOT/benchmarks/05_stt"
CODIGO_DIR="$(cd "$ROOT/../../Codigo" && pwd)"
STAMP="${1:-${BENCH_DATE:-$(date +%Y%m%d_%H%M%S)}}"
OUT_BASE="$ROOT/artifacts/runs/$STAMP/stt"
STT_URL="${STT_URL:-http://127.0.0.1:8000}"
PY="${PY:-$ROOT/.venv/bin/python}"
PRESETS="${STT_PRESETS:-model_medium,model_large_v3,model_large_v3_turbo}"
CORPORA="${STT_CORPORA:-tts,medical,coraa}"
LIMIT="${STT_LIMIT:-0}"
SLEEP_BETWEEN="${STT_SLEEP_BETWEEN:-10}"

if [[ ! -x "$PY" ]]; then
  echo "Execute ./scripts/setup.sh" >&2
  exit 1
fi

mkdir -p "$OUT_BASE"

IFS=',' read -ra PRESET_IDS <<< "$PRESETS"
IFS=',' read -ra CORPUS_TAGS <<< "$CORPORA"

get_env_from_yaml() {
  local preset_id="$1"
  local key="$2"
  "$PY" - <<PY
import yaml
from pathlib import Path
data = yaml.safe_load(Path("$BENCH_DIR/stt_ablation_presets.yaml").read_text(encoding="utf-8"))
for p in data.get("container", []):
    if p.get("id") == "$preset_id":
        env = p.get("env") or {}
        print(env.get("$key", ""))
        break
PY
}

corpus_file() {
  case "$1" in
    tts) echo "$ROOT/data/stt/stt_corpus.jsonl" ;;
    medical) echo "$ROOT/data/stt/stt_corpus_medical.jsonl" ;;
    coraa) echo "$ROOT/data/stt/stt_corpus_coraa.jsonl" ;;
    *) echo "" ;;
  esac
}

wait_stt_healthy() {
  local attempts="${1:-90}"
  local i
  for ((i = 1; i <= attempts; i++)); do
    if curl -sf "${STT_URL%/}/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 5
  done
  echo "STT nao ficou healthy em ${STT_URL}" >&2
  return 1
}

run_preset_corpus() {
  local preset_id="$1"
  local corpus_tag="$2"
  local corpus_path
  corpus_path="$(corpus_file "$corpus_tag")"
  if [[ -z "$corpus_path" || ! -f "$corpus_path" ]]; then
    echo "[skip] corpus ausente: $corpus_tag ($corpus_path)" >&2
    return 0
  fi

  local out_dir="$OUT_BASE/${corpus_tag}/${preset_id}"
  echo "=== $corpus_tag / $preset_id ==="

  local model compute device noise preprocess beam vad initial condition
  model="$(get_env_from_yaml "$preset_id" WHISPER_MODEL)"
  compute="$(get_env_from_yaml "$preset_id" WHISPER_COMPUTE_TYPE)"
  device="$(get_env_from_yaml "$preset_id" WHISPER_DEVICE)"
  noise="$(get_env_from_yaml "$preset_id" STT_NOISE_REDUCE)"
  preprocess="$(get_env_from_yaml "$preset_id" STT_PREPROCESS_ENABLED)"
  beam="$(get_env_from_yaml "$preset_id" STT_BEAM_SIZE)"
  vad="$(get_env_from_yaml "$preset_id" STT_VAD_FILTER)"
  initial="$(get_env_from_yaml "$preset_id" STT_INITIAL_PROMPT)"
  condition="$(get_env_from_yaml "$preset_id" STT_CONDITION_ON_PREVIOUS_TEXT)"

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
    STT_BEAM_SIZE="${beam:-8}" \
    STT_VAD_FILTER="${vad:-true}" \
    STT_INITIAL_PROMPT="${initial:-}" \
    STT_CONDITION_ON_PREVIOUS_TEXT="${condition:-true}" \
    COMPOSE_PROFILES=ai \
    docker compose --profile ai up -d --force-recreate stt
  )

  wait_stt_healthy 120

  local limit_args=()
  if [[ "$LIMIT" != "0" ]]; then
    limit_args=(--limit "$LIMIT")
  fi

  "$PY" "$BENCH_DIR/run_stt_benchmark.py" \
    --stt-url "$STT_URL" \
    --corpus "$corpus_path" \
    --out-dir "$out_dir" \
    --ablation per_request \
    --preset-id "$preset_id" \
    --corpus-tag "$corpus_tag" \
    "${limit_args[@]}"

  echo "$preset_id" >"$out_dir/preset_id.txt"
  echo "$corpus_tag" >"$out_dir/corpus_tag.txt"
  sleep "$SLEEP_BETWEEN"
}

for preset in "${PRESET_IDS[@]}"; do
  preset="$(echo "$preset" | xargs)"
  [[ -z "$preset" ]] && continue
  for corpus in "${CORPUS_TAGS[@]}"; do
    corpus="$(echo "$corpus" | xargs)"
    [[ -z "$corpus" ]] && continue
    run_preset_corpus "$preset" "$corpus"
  done
done

"$PY" "$BENCH_DIR/merge_stt_results.py" --results-root "$OUT_BASE"
"$PY" "$ROOT/reporting/plot_stt_results.py" \
  --results-root "$OUT_BASE" \
  --date "$STAMP"

echo "Matriz concluida: $OUT_BASE"
