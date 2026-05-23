# Bloco 2 — Benchmark de modelos (end-to-end)

Ver o **[README principal](../README.md)** (pipeline, gráficos e rerodagem Gemini).

```bash
export BENCH_DATE=20260520
../.venv/bin/python run_benchmark.py \
  --base-url http://127.0.0.1:4010 \
  --out-dir ./results/$BENCH_DATE \
  --providers ollama,gemini \
  --sleep-secs 25 \
  --resume
```

Saídas: `results/<DATA>/results.csv`, `results_full.jsonl`, `summary.txt`
