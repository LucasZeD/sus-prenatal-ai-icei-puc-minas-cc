# Migracao de artefatos (git rm --cached)

Quando for commitar a reorganizacao, remova do indice git os artefatos de execucao (mantem localmente):

```bash
cd Documentacao/Testes

git rm -r --cached \
  05_relatorio_artigo/figures \
  05_relatorio_artigo/dashboard \
  05_relatorio_artigo/ARTIGO_RESULTADOS.md \
  05_relatorio_artigo/article_metrics.json \
  05_relatorio_artigo/stt_metrics.json \
  05_relatorio_artigo/TESTES_SECAO_ARTIGO.md \
  02_bench_modelos_llm/results \
  03_bench_rag_retrieval/results \
  04_bench_roteiro_ground_truth/results \
  06_gateway_privacidade/results \
  07_bench_escriba_stt/results \
  01_validacao_dataset/reports/validation_report.txt \
  2>/dev/null || true

# Remover pastas legadas vazias apos git mv
git rm -r --cached \
  01_validacao_dataset \
  02_bench_modelos_llm \
  03_bench_rag_retrieval \
  04_bench_roteiro_ground_truth \
  05_relatorio_artigo \
  06_gateway_privacidade \
  07_bench_escriba_stt \
  shared \
  dataset \
  2>/dev/null || true
```

Novas execucoes escrevem apenas em `artifacts/` (gitignored).
