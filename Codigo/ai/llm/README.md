# Pull base models (Standard Tags)
ollama pull deepseek-r1:32b
ollama pull qwen3.5:35b

# Create custom models
ollama create ds-tcc -f deepseek.modelfile
ollama create qwen-tcc -f qwen35.modelfile

# Run and monitor
ollama run ds-tcc
ollama run qwen-tcc
nvidia-smi -l 1