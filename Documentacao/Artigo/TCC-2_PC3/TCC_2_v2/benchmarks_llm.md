# Benchmarks de LLM (comparação rápida)

Este apêndice resume **benchmarks públicos** para apoiar a escolha do modelo local usado no MVP (trade-off entre capacidade e custo/latência).

Os números abaixo foram extraídos de um export HTML do comparador `llmbase.ai` (fonte indicada no próprio site como *Artificial Analysis*).

## Modelos comparados

- **Qwen3 14B (Reasoning)**
- **Qwen3.5 9B (Reasoning)**

## Índices compostos (visão de alto nível)

> Observação: o comparador apresenta “índices” agregados; valores ausentes no export aparecem como “—”.

| Índice | Qwen3 14B (Reasoning) | Qwen3.5 9B (Reasoning) |
|---|---:|---:|
| Intelligence | 16.2 | 32.4 |
| Coding | 13.1 | 25.3 |
| Math | 55.7 | — |

## Benchmarks detalhados (subset mostrado no comparador)

| Benchmark | Qwen3 14B (Reasoning) | Qwen3.5 9B (Reasoning) |
|---|---:|---:|
| GPQA | 60.4 | 80.6 |
| MMLU Pro | 77.4 | — |
| HLE | 4.3 | 13.3 |
| LiveCodeBench | 52.3 | — |
| MATH 500 | 96.1 | — |
| AIME 2025 | 55.7 | — |

## Como isso ajuda no artigo (interpretação prática)

- **Capacidade vs. footprint**: um modelo 9B tende a ser mais viável em hardware local, com menor consumo de VRAM e melhor latência, mantendo boa capacidade de raciocínio/código (conforme índices do comparador).
- **Justificativa de escolha**: a comparação serve como evidência de que a escolha do LLM não foi arbitrária, mas orientada por métricas públicas.
- **Limitações**: benchmarks não substituem validação no domínio (saúde materna). Por isso, a avaliação do MVP deve combinar benchmarks + métricas de uso + feedback humano (ex.: taxa de “down feedback” e tempos de resposta).

## Fonte (para citação)

- Página de comparação (export HTML local): `local_LLM_bench/benchs/Compare Qwen3 14B (Reasoning) vs Qwen3.5 9B (Reasoning) _ AI Model Comparison.html`
- Site: `llmbase.ai` (indica *Artificial Analysis* como origem dos dados de benchmark)

