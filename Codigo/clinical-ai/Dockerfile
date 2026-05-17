FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY clinical_ai ./clinical_ai
COPY corpus ./corpus

RUN mkdir -p /app/data

ENV RAG_CORPUS_DIR=/app/corpus/CartilhasSUS \
    RAG_VECTOR_STORE_PATH=/app/data/rag_store.sqlite \
    OLLAMA_BASE_URL=http://host.docker.internal:11434

EXPOSE 4010

CMD ["uvicorn", "clinical_ai.main:app", "--host", "0.0.0.0", "--port", "4010"]
