# Diarização (pyannote.audio 3.1)  CPU por padrão; GPU opcional (DIARIZATION_DEVICE=cuda).
#
# Os modelos (segmentation + embedding) são baixados em BUILD TIME e cacheados na imagem.
# O token HF é passado apenas no build via BuildKit secret (NUNCA fica embutido na imagem):
#
#   DOCKER_BUILDKIT=1 docker build \
#     --secret id=hf_token,src=./hf_token.txt \
#     -t prenatal-diarization ./diarization
#
# (ou via compose: ver `docker-compose.yml`, build.secrets). Em runtime: HF_HUB_OFFLINE=1.
FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PORT=8001
# Cache padrão do Hugging Face dentro da imagem/volume.
ENV HF_HOME=/models/huggingface

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ./
COPY download_models.py ./

# Baixa e cacheia os modelos pyannote em build time usando o secret `hf_token`.
# O secret é montado só durante este RUN e não persiste em nenhuma camada.
ARG DIARIZATION_MODEL=pyannote/speaker-diarization-3.1
ENV DIARIZATION_MODEL=${DIARIZATION_MODEL}
RUN --mount=type=secret,id=hf_token \
    HF_TOKEN="$(cat /run/secrets/hf_token 2>/dev/null || true)" \
    python download_models.py || \
    echo "WARN: pré-download dos modelos pulado (sem secret hf_token). Configure no build para uso offline."

# Runtime: 100% offline. Os modelos vêm do cache acima.
ENV HF_HUB_OFFLINE=1
ENV TRANSFORMERS_OFFLINE=1
ENV DIARIZATION_DEVICE=cpu
ENV DIARIZATION_BACKEND=auto

EXPOSE 8001

HEALTHCHECK --interval=15s --timeout=10s --start-period=120s --retries=5 \
    CMD curl -f http://127.0.0.1:8001/health || exit 1

CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001"]
