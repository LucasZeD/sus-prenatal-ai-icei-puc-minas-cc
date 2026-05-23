# Gráfico de ganho de peso gestacional (Caderneta MS 2024)

## Referência normativa

- **Fonte:** Caderneta da Gestante, 8ª edição revista 2024 (Ministério da Saúde), páginas 18–22.
- **PDF no repositório:** `Artefatos/CartilhasSUS/CadernetaGestante/CadernetaGestante_8ed_rev_2024.pdf` (não versionar PDFs grandes novos no Git).

## Tabela IMC pré-gestacional (até 40 semanas)

| IMC (kg/m²) | Classificação | Ganho total recomendado |
|-------------|---------------|-------------------------|
| < 18,5 | Baixo peso | 9,7 – 12,2 kg |
| ≥ 18,5 e < 25 | Eutrofia | 8 – 12 kg |
| ≥ 25 e < 30 | Sobrepeso | 7 – 9 kg |
| ≥ 30 | Obesidade | 5 – 7,2 kg |

Implementação: [`frontend/src/data/cadernetaPesoGestacional.ts`](../frontend/src/data/cadernetaPesoGestacional.ts)

## Fórmulas (MVP)

- `imc = peso_pre_gestacional_kg / (altura_m ** 2)`
- `ganho_kg = peso_consulta_kg - peso_pre_gestacional_kg`
- Eixo X: `idade_gestacional` (semanas); eixo Y: ganho acumulado (kg)
- Pontos: consultas com `peso` e `idade_gestacional` válidos (filtro 1–42 sem no plot)

## Simplificação da faixa recomendada

No gráfico, a faixa MS é desenhada como proporção **linear** da semana até 40:

- `y_min(semana) = ganho_min_40sem * (semana / 40)`
- `y_max(semana) = ganho_max_40sem * (semana / 40)`

Isso é suficiente para demonstração do MVP; **não** reproduz as curvas de percentil P10–P90 (Kac 2021) do PDF completo.

## Arquitetura no código

| Camada | Arquivo |
|--------|---------|
| Constantes MS | `frontend/src/data/cadernetaPesoGestacional.ts` |
| Cálculos | `frontend/src/lib/ganhoPesoGestacional.ts` |
| UI | `frontend/src/components/nutricao/*` |
| Integração | `frontend/src/pages/PacienteDetailPage.tsx` |

Dados via API existente (sem endpoint dedicado):

- `GET /api/v1/pacientes/:id/full` (altura, peso pré)
- `GET /api/v1/consultas?gestacao_id=` (série de peso/IG)

## Seed de demonstração

- Variável: `SEED_DEMO_GESTANTE=1` (padrão em DB local)
- Paciente: **An\*\*\* Demo** — altura 1,62 m, peso pré 68 kg, 4 consultas (IG 12/18/24/30)
- Doc de teste: [`Documentacao/Testes/nutricao_grafico_demo.md`](../../Documentacao/Testes/nutricao_grafico_demo.md)

## Limitações conhecidas

- Gestação gemelar, gestante adolescente e outras exceções do instrumento MS **não** foram validadas neste MVP.
- Curvas de percentil completas, altura uterina, odontograma e export sobre PDF oficial: **fora de escopo**.
- Não altera contrato WebSocket do Escriba.

## Texto para o artigo (Resultados / Implementação)

O protótipo incorpora acompanhamento nutricional alinhado à Caderneta da Gestante (MS, 2024): classificação do IMC pré-gestacional, faixa de ganho total até 40 semanas e gráfico interativo de ganho acumulado por idade gestacional, alimentado pelos pesos e IG registrados nas consultas do Escriba. A faixa recomendada no gráfico usa proporção linear por semana (simplificação para o MVP); curvas de percentil completas ficam como evolução futura.
