# Suite de testes alinhada ao artigo

Este diretório executa o protocolo do artigo (`main.tex`):

- **N=100** perguntas (90 protocolo + 10 trap)
- **Hit@6** para RAG
- **APR/TFR** para geração de resposta
- **PII Leak Rate** no gateway (50 frases sintéticas)
- **Latência** (`retrieve_ms`, `ttft_ms`, `gen_tokens_per_sec`)
- **Gráficos + dashboard** para melhor visualização

## Estrutura relevante

- `dataset/prenatal_sus_benchmark.csv` - fonte oficial do conjunto N=100
- `dataset/validate_benchmark.py` - validação estrutural e grounding
- `03_bench_rag_retrieval/run_rag_benchmark.py` - benchmark retrieval (Hit@6)
- `02_bench_modelos_llm/run_benchmark.py` - benchmark end-to-end (APR/TFR + latência)
- `06_gateway_privacidade/run_gateway_benchmark.py` - benchmark de mascaramento PII
- `05_relatorio_artigo/plot_benchmark_results.py` - figuras + `article_metrics.json` + dashboard
- `05_relatorio_artigo/assemble_article_report.py` - gera `ARTIGO_RESULTADOS.md`
- `run_all_benchmarks.sh` - pipeline completo

## Setup

```bash
cd Documentacao/Testes
python3 -m venv .venv
.venv/bin/pip install -r requirements-bench.txt
```

Suba o serviço `clinical_ai` antes dos benchmarks:

```bash
cd ../../Codigo
docker compose up -d clinical_ai
curl -X POST "http://127.0.0.1:4010/rag/test/rebuild?force=true"
```

### Corpus (CartilhasSUS)

O índice vetorial lê **`Codigo/clinical-ai/corpus/CartilhasSUS`** (copiado na imagem Docker em `/app/corpus/CartilhasSUS`). A pasta **`Artefatos/CartilhasSUS`** deve estar sincronizada com essa cópia (mesmos 17 PDFs). O `extract_corpus_text.py` valida o grounding do benchmark contra `clinical-ai/corpus`, não contra `Artefatos/` diretamente.

Após trocar PDFs: sincronize para `clinical-ai/corpus`, `docker compose build clinical_ai`, suba o serviço e `POST /rag/test/rebuild?force=true`. A subpasta **`CadernetaGestante/`** (fichas/caderneta) **não é indexada** — só manuais e cartilhas de protocolo nas demais pastas. O health mostra `n_source_documents` após deduplicação por família/ano (`corpus.py`).

### Benchmark comparativo (matriz padrão)

O pipeline roda **3 blocos LLM** por execução:

| Provider | RAG | Objetivo |
|----------|-----|----------|
| ollama | on | baseline local com protocolo |
| ollama | off | efeito do RAG (sem trechos) |
| gemini | on | comparar nuvem vs local (ambos com RAG) |

Não roda `gemini` + `rag=off` (use `--no-skip-gemini-rag-off` no `run_benchmark.py` se precisar).

```bash
./run_all_benchmarks.sh
# PROVIDERS=ollama,gemini  RAG_MODES=on,off  (já é o padrão)

.venv/bin/python 02_bench_modelos_llm/compare_rag_ablation.py \
  --results "02_bench_modelos_llm/results/<STAMP>/results.csv" \
  --rag-results "03_bench_rag_retrieval/results/<STAMP>/rag_results.csv"
```

## Pipeline completo (recomendado)

```bash
cd Documentacao/Testes
export BASE_URL=http://127.0.0.1:4010
export PROVIDERS=ollama,gemini
./run_all_benchmarks.sh
```

### Variáveis úteis

- `BENCH_DATE=20260601_143052` — fixa o stamp da pasta (padrão: `date +%Y%m%d_%H%M%S` por execução)
- `PROVIDERS=ollama` para rodar apenas modelo local
- `RAG_MODES=on,off` para comparar geração com e sem trechos RAG (requer `clinical-ai` rebuild recente com `use_rag`)
- `SLEEP_GEMINI=25` para reduzir HTTP 429
- `SKIP_LLM=1` para pular bloco LLM
- `SKIP_GATEWAY=1` para pular bloco gateway
- `SKIP_ROTEIRO=1` (padrão) mantém GT01-GT05 fora do fluxo principal

## Saídas principais

- `01_validacao_dataset/reports/validation_report.txt`
- `03_bench_rag_retrieval/results/<DATE>/rag_results.csv`
- `02_bench_modelos_llm/results/<DATE>/results.csv`
- `02_bench_modelos_llm/results/<DATE>/summary_article.txt`
- `06_gateway_privacidade/results/<DATE>/gateway_results.csv`
- `05_relatorio_artigo/figures/<DATE>/fig01..fig08.(png|pdf)`
- `05_relatorio_artigo/article_metrics.json`
- `05_relatorio_artigo/dashboard/<DATE>/index.html`
- `05_relatorio_artigo/ARTIGO_RESULTADOS.md`

## Observações

- A pasta `conjunto_experimental_100/` está deprecada e mantida apenas como referência histórica.
- O benchmark de gateway mede o comportamento atual do `clinical-ai`; `FULL_NAME` pode vazar por ausência de máscara dedicada.
