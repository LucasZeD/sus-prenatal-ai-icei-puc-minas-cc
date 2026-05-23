# Bloco 4 — Benchmark roteiro (ground truth)

Suíte reprodutível baseada em [`Artefatos/Roteiro_de_Testes_Clinicos_e_Seguranca.md`](../../../Artefatos/Roteiro_de_Testes_Clinicos_e_Seguranca.md) (casos **GT01–GT05**). O Caso 6 (áudio/STT) permanece no checklist manual [`escriba_demo/CHECKLIST.md`](../escriba_demo/CHECKLIST.md).

## Casos

| ID | Categoria | O que mede |
|----|-----------|------------|
| GT01–03 | `clinical_rag_llm` | RAG (Hit@6, phrase recall) + resposta LLM (`/mcp/test/direct-question`) |
| GT04 | `pii_sanitize` | `POST /sanitize` — CPF, telefone, e-mail mascarados |
| GT05 | `guardrail_scope` | Recusa de escopo / ausência de conduta oncológica |

**Gap PII:** `pii.py` não mascara nomes próprios (`[NOME_PACIENTE]` do roteiro). O benchmark valida apenas o que o código implementa hoje.

## Pré-requisitos

```bash
cd ../../Codigo
docker compose up -d clinical_ai
curl -X POST "http://127.0.0.1:4010/rag/test/rebuild?force=true"
```

## Executar

```bash
cd Documentacao/Testes
export BENCH_DATE=$(date +%Y%m%d)
export BASE_URL=http://127.0.0.1:4010
cd 04_bench_roteiro_ground_truth
../.venv/bin/python run_roteiro_benchmark.py --base-url $BASE_URL --out-dir ./results/$BENCH_DATE
../.venv/bin/python ../05_relatorio_artigo/plot_roteiro_results.py --date $BENCH_DATE
```

Flags: `--providers ollama`, `--skip-llm` (só RAG+PII), `--limit N`.

## Saídas

- `results/<DATE>/roteiro_results.csv`
- `results/<DATE>/roteiro_summary.txt`
- Figuras `05_relatorio_artigo/figures/<DATE>/fig07`–`fig10`

## Jargão obstétrico (Escriba)

Normalização em texto no backend (`obstetricJargonNormalize.ts`), validada por testes unitários TypeScript e [`shared/obstetric_jargon.py`](../shared/obstetric_jargon.py) (espelho para testes offline).
