# Interfaces — resumo executivo (código)

Wireframes PNG: [Documentacao/Interfaces](../../Documentacao/Interfaces/) (ver também `interfaces.md` na mesma pasta).

| Rota | Função | Descrição |
|------|--------|-----------|
| `/login` | Autenticação dos profissionais | E-mail e senha (RF14); seed `npm run db:seed`. |
| `/dashboard` | Agenda da unidade | Calendário semanal resumido, métricas, worklist de consultas para stream, área técnica embutida. |
| `/pacientes` | Lista de gestantes | Busca centralizada, filtros de risco, cartões com dados essenciais. |
| `/pacientes/:id` | Prontuário (caderneta) | Identificação em grade; gestação; timeline de consultas em acordeão. |
| `/consultas/:consultaId/escriba` | Escriba | Aba início: áudio + WebSocket; aba fim: revisão, PATCH na consulta, confirmação médica. |

Stack da SPA: **Vite, React, React Router, Tailwind v4** (não Next.js).
