# Checklist demo Escriba + STT

1. [ ] `cd Codigo && ./scripts/demo-gpu-preflight.sh` — STT e backend OK
2. [ ] `COMPOSE_PROFILES=ai` no `Codigo/.env` (ou `--profile ai`) e `docker compose up -d --build`
3. [ ] Login → abrir consulta → Escriba → aba **Atendimento**
4. [ ] Iniciar gravação ~30 s → texto em português em **O que foi dito**
5. [ ] Finalizar trecho → **Sugestão da IA** (sem OOM; `nvidia-smi` estável)
5b. [ ] Confirmar que a sugestão **não** entrou no prontuário oficial até salvar/confirmar manualmente
6. [ ] Aba **Prontuário** → salvar rascunho
7. [ ] Lívia (Gemini se `GPU_DEMO_MODE=livia_cloud`)
8. [ ] Prontuário da gestante demo (`An*** Demo`) → painel **Acompanhamento nutricional** com gráfico ([`nutricao_grafico_demo.md`](../nutricao_grafico_demo.md))

## Screenshots sugeridos (TCC)

- Barra inferior de gravação (estado Ouvindo)
- Painéis STT vs IA lado a lado
- Prontuário com sinais vitais
- Saída do preflight / `nvidia-smi` durante demo
