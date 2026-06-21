# PII NER sidecar

Microserviço FastAPI para detecção de entidades PII com o modelo
`OpenMed/OpenMed-PII-Portuguese-SnowflakeMed-Large-568M-v1`.

## Rotas

- `GET /health`: status do carregamento do modelo.
- `POST /detect`: retorna entidades detectadas com `label`, `start`, `end`, `score` e `text`.

## Execução local

```bash
cd Codigo/pii-ner
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 4020
```
