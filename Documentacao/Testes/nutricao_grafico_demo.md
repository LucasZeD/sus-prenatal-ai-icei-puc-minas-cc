# Demo — gráfico de ganho de peso gestacional

Paciente criado pelo seed quando `SEED_DEMO_GESTANTE` está ativo (padrão em DB local).

## Pré-requisitos

```bash
cd Codigo
# PACIENTE_IDS_PEPPER e SEED_PROFISSIONAL_* no .env
docker compose exec backend npx prisma db seed
```

## Identificação na UI

- **Nome mascarado:** `An*** Demo`
- **CPF (demo):** termina em `4725` (`52998224725` no cadastro de desenvolvimento)

## Valores esperados no painel

| Campo | Valor |
|-------|-------|
| Altura | 1,62 m |
| Peso pré-gestacional | 68 kg |
| IMC pré-gestacional | ~25,9 kg/m² |
| Classificação | Sobrepeso |
| Faixa MS até 40 sem | 7 – 9 kg |

## Consultas (gestação ativa)

| IG (sem) | Peso (kg) | Ganho acumulado (kg) |
|----------|-----------|----------------------|
| 12 | 70,5 | 2,5 |
| 18 | 71,5 | 3,5 |
| 24 | 72,8 | 4,8 |
| 30 | 74,0 | 6,0 |

## Passos manuais

1. Login (`admin@local.dev` ou `SEED_PROFISSIONAL_EMAIL`)
2. Lista de gestantes → abrir **An*** Demo**
3. Garantir gestação ativa selecionada
4. Rolar até **Acompanhamento nutricional (Caderneta 2024)**
5. Verificar card IMC + gráfico com 4 pontos e faixa sombreada
6. (Opcional) Editar peso em consulta no Escriba → recarregar prontuário → ponto atualizado

## Desativar seed da gestante demo

```env
SEED_DEMO_GESTANTE=0
```
