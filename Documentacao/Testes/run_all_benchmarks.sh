#!/usr/bin/env bash
echo "DEPRECATED: use ./scripts/run_pipeline.sh" >&2
exec "$(cd "$(dirname "$0")" && pwd)/scripts/run_pipeline.sh" "$@"
