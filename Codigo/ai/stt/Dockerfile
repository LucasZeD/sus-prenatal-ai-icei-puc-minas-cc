# Usar imagem base da NVIDIA com suporte a CUDA e cuDNN
FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04

# Configurar diretório de trabalho
WORKDIR /app

# Instalar dependências do sistema (Python e bibliotecas de áudio)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    libsndfile1 \
    libasound2 \
    libportaudio2 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copiar arquivos de requisitos primeiro para aproveitar o cache de camadas
COPY requirements.txt .

# Instalar dependências do Python
RUN pip3 install --no-cache-dir -r requirements.txt

# Copiar o restante do código
COPY . .

# Definir variável de ambiente para o Hugging Face Token (opcional, pode ser passado no docker run)
ENV HF_TOKEN=""

# Ponto de entrada padrão
ENTRYPOINT ["python3", "app/main.py"]
