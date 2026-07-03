# Metricas do protocolo

Definicoes alinhadas ao artigo (`main.tex`). A logica de scoring esta em `lib/` e nao deve ser alterada sem revisao do protocolo.

## Hit@6 (RAG)

Proporcao de perguntas em que o documento-fonte esperado aparece entre os top-6 chunks retornados por `/rag/test/query`. Calculado em `lib/rag_metrics.py`; agregado em `lib/article_metrics.py`.

## APR (Automatic Pass Rate)

Taxa de respostas aprovadas automaticamente pelo scoring (`lib/bench_scoring.py`) entre perguntas elegiveis (exclui `human_judge`). Modos: `contains_all`, `contains_any`, `boolean_exact`.

## TFR (Trap Failure Rate)

Taxa de falha em perguntas com `tag=trap` (devem conter termos proibidos ou nao satisfazer criterio). Usa `must_not_contain_pt` quando definido.

## PII Leak Rate (gateway)

Proporcao de entidades sinteticas (50 frases em `data/pii_gateway_corpus_50.jsonl`) cujo valor original ainda aparece apos `/sanitize`.

## WER / phrase recall (STT)

- **WER:** Word Error Rate entre transcricao e referencia (`lib/stt_scoring.py`, via `jiwer`).
- **Phrase recall:** % de frases-chave do corpus encontradas na hipotese.
- **Jargon hits:** termos obstetricos esperados preservados.

## Latencia

- `retrieve_ms` — tempo de recuperacao RAG
- `ttft_ms` — time to first token (LLM stream)
- `gen_tokens_per_sec` — taxa de geracao

Consolidadas em `reporting/article_metrics.json` apos `plot_benchmark_results.py`.
