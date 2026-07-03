# Reporting

Scripts que leem `artifacts/runs/<BENCH_DATE>/` e geram figuras, dashboard e relatorio.

- `plot_benchmark_results.py` — figuras principais + `article_metrics.json`
- `plot_stt_results.py` — figuras STT (matriz comparativa)
- `plot_roteiro_results.py` — figuras GT01-GT05
- `assemble_article_report.py` — `artifacts/reports/ARTIGO_RESULTADOS_<stamp>.md`
- `render_benchmark_pdf.py` — `artifacts/reports/RELATORIO_BENCHMARK_<stamp>.pdf`

## Relatorio PDF (LaTeX)

Pre-requisito de compilacao:

```bash
sudo apt install texlive-latex-base texlive-latex-extra texlive-fonts-recommended latexmk
```

Compilacao manual (apos benchmarks e step 7):

```bash
.venv/bin/python reporting/render_benchmark_pdf.py --date 20260702_120000
```

Flags uteis:

- `--latex-only` / `--skip-compile` — gera `.tex` e assets sem compilar
- `--keep-aux` — preserva arquivos auxiliares LaTeX

No pipeline, use `SKIP_PDF=1` para pular o step 8 quando LaTeX nao estiver instalado.

Templates: `templates/benchmark_report.tex.j2`

Ver [docs/PIPELINE.md](../docs/PIPELINE.md).
