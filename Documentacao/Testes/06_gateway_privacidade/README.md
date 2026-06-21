# Bloco 6 - Corpus sintético para gateway de privacidade

Este diretório contém o corpus sintético usado para avaliar mascaramento de PII no pipeline de transcrição.

## Arquivo principal

- `dataset/pii_gateway_corpus_50.jsonl`

## Esquema por linha (JSONL)

- `id`: identificador (`P001`..`P050`)
- `text`: frase sintética de entrada (simula transcrição STT)
- `annotations`: entidades PII anotadas manualmente
  - `type`: `CPF`, `CNS`, `PHONE`, `EMAIL`, `FULL_NAME`, `LONG_NUMERIC_CHAIN`
  - `value`: valor exato presente em `text`
  - marcador esperado em sanitização: `[CPF]`, `[CNS]`, `[TELEFONE]`, `[EMAIL]`, `[NOME]`, `[NUM]`

## Observações

- Todas as frases são sintéticas (sem dados reais de pacientes).
- O corpus foi elaborado para medir **PII Leak Rate** no gateway.
- Há frases com 1 ou mais entidades para cobrir casos simples e compostos.
