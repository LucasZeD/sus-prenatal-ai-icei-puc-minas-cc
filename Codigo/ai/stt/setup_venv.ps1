# Script para configurar o ambiente virtual no Windows

Write-Host "--- Iniciando Configuração do Ambiente Virtual (venv) ---" -ForegroundColor Cyan

# 1. Criar o venv
if (!(Test-Path ".venv")) {
    Write-Host "[1/3] Criando ambiente virtual..."
    python -m venv .venv
} else {
    Write-Host "[1/3] Ambiente virtual já existe."
}

# 2. Ativar e Instalar Dependências
Write-Host "[2/3] Instalando dependências (isso pode demorar devido aos pacotes CUDA)..."
& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt

# 3. Verificação
Write-Host "[3/3] Verificando instalação..."
& .\.venv\Scripts\python.exe -c "import torch; print('PyTorch CUDA disponível:', torch.cuda.is_available())"

Write-Host "`n--- Configuração Concluída! ---" -ForegroundColor Green
Write-Host "Para ativar o ambiente, use: .\.venv\Scripts\Activate.ps1"
Write-Host "Para rodar o sistema: python app/main.py <arquivo.wav>"
