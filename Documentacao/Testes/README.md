# Testes e benchmark (TCC)

Manual operacional para rodar os **três blocos de avaliação**, gerar **gráficos Python** (matplotlib) e montar o relatório [`05_relatorio_artigo/TESTES_SECAO_ARTIGO.md`](05_relatorio_artigo/TESTES_SECAO_ARTIGO.md) para a seção *Testes e Resultados* do artigo.

| Bloco | Pasta | Saída principal |
|-------|-------|-----------------|
| 1 | [`01_validacao_dataset/`](01_validacao_dataset/) | `reports/validation_report.txt` |
| 2 | [`02_bench_modelos_llm/`](02_bench_modelos_llm/) | `results/<DATA>/results.csv` |
| 3 | [`03_bench_rag_retrieval/`](03_bench_rag_retrieval/) | `results/<DATA>/rag_results.csv` |
| 4 | [`04_bench_roteiro_ground_truth/`](04_bench_roteiro_ground_truth/) | `results/<DATA>/roteiro_results.csv` |
| Figuras | [`05_relatorio_artigo/figures/`](05_relatorio_artigo/figures/) | `fig01`…`fig06` + `fig07`…`fig10` roteiro |

## Estrutura

```
Documentacao/Testes/
├── README.md                    ← este arquivo (pipeline completo)
├── run_all_benchmarks.sh        ← atalho opcional (passos 1–6)
├── requirements-bench.txt
├── shared/bench_scoring.py
├── dataset/
├── corpus_extracted/            # gerado (gitignored)
├── 01_validacao_dataset/
├── 02_bench_modelos_llm/
├── 03_bench_rag_retrieval/
├── 04_bench_roteiro_ground_truth/
└── 05_relatorio_artigo/
    ├── plot_benchmark_results.py
    ├── assemble_article_report.py
    ├── figures/<YYYYMMDD>/
    └── TESTES_SECAO_ARTIGO.md
```

## Setup (uma vez)

```bash
cd Documentacao/Testes
python3 -m venv .venv
.venv/bin/pip install -r requirements-bench.txt

cd ../../Codigo
docker compose up -d clinical_ai
curl -X POST "http://127.0.0.1:4010/rag/test/rebuild?force=true"
curl http://127.0.0.1:4010/health
```

Configure em `Codigo/.env`: `GEMINI_API_KEY`, `GEMINI_MODEL`, `OLLAMA_MODEL`. Após alterar o `.env`, recrie o container: `docker compose up -d clinical_ai`.

Defina a data dos resultados (exemplo abaixo usa `20260520`):

```bash
export BENCH_DATE=20260520
export PY=.venv/bin/python
export BASE_URL=http://127.0.0.1:4010
```

## Pipeline completo (passos 1–6)

Execute na ordem. Os gráficos (passo 5) exigem os CSVs dos passos 2–4.

### 1 — Corpus extraído + validação do instrumento

```bash
cd Documentacao/Testes
$PY dataset/extract_corpus_text.py
$PY dataset/validate_benchmark.py --report-out 01_validacao_dataset/reports/validation_report.txt
```

### 2b — Benchmark roteiro (GT01–GT05)

```bash
cd 04_bench_roteiro_ground_truth
$PY run_roteiro_benchmark.py --base-url $BASE_URL --out-dir ./results/$BENCH_DATE
$PY test_jargon_normalize.py
cd ..
$PY 05_relatorio_artigo/plot_roteiro_results.py --date $BENCH_DATE
```

Ver [`04_bench_roteiro_ground_truth/README.md`](04_bench_roteiro_ground_truth/README.md). Variável `SKIP_ROTEIRO=1` no `run_all_benchmarks.sh` pula este bloco.

### 2 — Benchmark RAG (retrieval only, 110 perguntas)

```bash
cd 03_bench_rag_retrieval
$PY run_rag_benchmark.py --base-url $BASE_URL --limit 5          # smoke
$PY run_rag_benchmark.py --base-url $BASE_URL --out-dir ./results/$BENCH_DATE
cd ..
```

### 3 — Benchmark modelos (end-to-end, 110×2 providers)

```bash
cd 02_bench_modelos_llm
$PY run_benchmark.py \
  --base-url $BASE_URL \
  --out-dir ./results/$BENCH_DATE \
  --providers ollama,gemini \
  --sleep-secs 25 \
  --resume
cd ..
```

Use `--sleep-secs 25` (ou 15–30) para reduzir **HTTP 429** no Gemini. O bench completo pode levar **várias horas**.

### 4 — Gráficos Python (obrigatório para o artigo)

```bash
$PY 05_relatorio_artigo/plot_benchmark_results.py --date $BENCH_DATE
```

Gera em `05_relatorio_artigo/figures/$BENCH_DATE/`:

| Arquivo | Conteúdo |
|---------|----------|
| `fig01_instrumento_dificuldade.png` | 110 QAs por dificuldade |
| `fig02_instrumento_modos.png` | Modos de avaliação |
| `fig03_rag_hit_at_6.png` | Hit@6 e MRR (RAG) |
| `fig04_rag_mrr.png` | MRR por dificuldade |
| `fig05_llm_pass_provider.png` | Acerto % por provider × dificuldade |
| `fig06_llm_pass_global.png` | Taxa global Ollama vs Gemini |
| `figures_manifest.json` | Índice das figuras |

### 5 — Relatório Markdown para o artigo

```bash
$PY 05_relatorio_artigo/assemble_article_report.py --date $BENCH_DATE
```

### 6 — Atalho: script único (opcional)

```bash
./run_all_benchmarks.sh
```

Variáveis: `BENCH_DATE`, `BASE_URL`, `SLEEP_GEMINI` (ver cabeçalho do script).

---

## Status dos testes (o que pode estar incompleto)

| Teste | Como verificar | Válido? | Comando para completar |
|-------|----------------|---------|------------------------|
| Gráficos Python | `ls 05_relatorio_artigo/figures/$BENCH_DATE/*.png` | — | Passo 4 acima |
| Bloco 1 — Validação | `validate_benchmark.py` exit 0 | Sim* | Só rerodar se mudar CSV/corpus |
| Bloco 3 — RAG | `wc -l 03_.../rag_results.csv` → 111 | Sim* | Passo 2; rerodar se RAG mudar |
| Bloco 2 — Ollama | 110 linhas `llm_provider=ollama` | Sim* | Passo 3 (Ollama ok na run atual) |
| Bloco 2 — Gemini | `notes` sem `HTTP 429` | **Verificar** | Ver seção Gemini abaixo |
| human_judge (6 Qs) | Q012,Q016,Q028,Q082,Q096,Q110 | Revisão manual | Template `05_relatorio_artigo/human_judge_template.csv` |
| Relatório artigo | `TESTES_SECAO_ARTIGO.md` com figuras | Após passos 4–5 | `assemble_article_report.py` |

\*Na execução de referência (`20260520`): validação e RAG OK; Gemini teve **109/110** falhas por **HTTP 429** — rerodar antes de publicar números do Gemini.

---

## Completar bench Gemini (HTTP 429)

1. Confira quota em [Google AI Studio](https://aistudio.google.com/).
2. Remova linhas `gemini` do CSV (ou use pasta nova):

```bash
cd 02_bench_modelos_llm
# backup
cp results/$BENCH_DATE/results.csv results/$BENCH_DATE/results.csv.bak
$PY -c "
import csv
from pathlib import Path
p=Path('results/$BENCH_DATE/results.csv')
rows=[r for r in csv.DictReader(p.open(encoding='utf-8')) if r['llm_provider']!='gemini']
with p.open('w',encoding='utf-8',newline='') as f:
    w=csv.DictWriter(f,fieldnames=rows[0].keys())
    w.writeheader(); w.writerows(rows)
print('Removidas linhas gemini:', len(rows), 'ollama mantidas')
"
```

3. Rerode só Gemini com pausa:

```bash
$PY run_benchmark.py \
  --base-url $BASE_URL \
  --out-dir ./results/$BENCH_DATE \
  --providers gemini \
  --sleep-secs 25 \
  --resume
```

4. Valide: poucas ou nenhuma linha com `429` em `notes`; `response_preview_chars` preenchido.

5. Regerar gráficos e relatório (passos 4–5).

---

## Revisão manual (human_judge)

Seis perguntas com `pass_auto=review` (não entram na taxa automática):

`Q012`, `Q016`, `Q028`, `Q082`, `Q096`, `Q110`

1. Abra `02_bench_modelos_llm/results/$BENCH_DATE/results_full.jsonl`.
2. Preencha [`05_relatorio_artigo/human_judge_template.csv`](05_relatorio_artigo/human_judge_template.csv) (`pass_manual`: sim/nao).

---

## Saídas esperadas (`BENCH_DATE=20260520`)

| Caminho | Artefato |
|---------|----------|
| `01_validacao_dataset/reports/validation_report.txt` | Validação do dataset |
| `03_bench_rag_retrieval/results/20260520/rag_results.csv` | Métricas RAG |
| `02_bench_modelos_llm/results/20260520/results.csv` | Scoring LLM |
| `05_relatorio_artigo/figures/20260520/fig*.png` | Gráficos para o artigo |
| `05_relatorio_artigo/TESTES_SECAO_ARTIGO.md` | Texto + figuras embutidas |

Artefatos em `corpus_extracted/` e `**/results/**` estão no `.gitignore`; **figuras** em `05_relatorio_artigo/figures/` podem ser versionadas após gerar.

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| RAG `n_chunks=0` | `curl -X POST "$BASE_URL/rag/test/rebuild?force=true"` |
| Gemini HTTP 429 | `--sleep-secs 25`; rodar em lotes com `--question-ids Q001,Q002,...` |
| `plot_benchmark_results.py` falha | Instale deps; confira caminhos `--date` e CSVs |
| Encoding UTF-8 | Scripts com `# -*- coding: utf-8 -*-`; terminal `LANG=C.UTF-8` |

---

## Demo Escriba + STT (opcional)

Teste manual de interface (não gera gráficos de benchmark): [`escriba_demo/CHECKLIST.md`](escriba_demo/CHECKLIST.md).

---

## Referência rápida por pasta

- Detalhes do bench LLM: [`02_bench_modelos_llm/README.md`](02_bench_modelos_llm/README.md)
- Detalhes do bench RAG: [`03_bench_rag_retrieval/README.md`](03_bench_rag_retrieval/README.md)
- Validação: [`01_validacao_dataset/README.md`](01_validacao_dataset/README.md)
