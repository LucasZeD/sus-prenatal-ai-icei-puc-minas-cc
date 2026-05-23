# Relatório e gráficos para o artigo

Ver o **[README principal](../README.md)**.

```bash
export BENCH_DATE=20260520
../.venv/bin/python plot_benchmark_results.py --date $BENCH_DATE
../.venv/bin/python assemble_article_report.py --date $BENCH_DATE
```

- Figuras: `figures/<DATA>/fig01`…`fig06` (.png + .pdf)
- Relatório: [`TESTES_SECAO_ARTIGO.md`](TESTES_SECAO_ARTIGO.md)
- Revisão manual: [`human_judge_template.csv`](human_judge_template.csv)
