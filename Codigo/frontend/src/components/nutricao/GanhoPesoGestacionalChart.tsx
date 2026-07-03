import { useMemo } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  RODAPE_FONTE_MS,
  SEMANA_GESTACIONAL_EIXO_MAX,
  SEMANA_GESTACIONAL_EIXO_MIN,
} from '../../data/cadernetaPesoGestacional.js'
import type { BandaSemana, GanhoPesoPonto } from '../../lib/ganhoPesoGestacional.js'

type ChartRow = {
  semana: number
  yMin: number
  yMax: number
  ganhoKg?: number | null
  pesoKg?: number
  consultaId?: string
  data?: string
  isPonto: boolean
}

type Props = {
  banda: BandaSemana[]
  pontos: GanhoPesoPonto[]
}

function formatDataBr(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload?: ChartRow }>
}) {
  if (!active || !payload?.length) return null
  const row = payload.find((p) => p.payload?.isPonto)?.payload
  if (!row?.isPonto) return null
  const dash = '—'
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-lg">
      <p className="font-bold text-brand-navy">IG: {row.semana} semanas</p>
      <p className="mt-1 text-slate-600">Data: {row.data ? formatDataBr(row.data) : dash}</p>
      <p className="text-slate-600">Peso: {row.pesoKg != null ? `${row.pesoKg.toFixed(1)} kg` : dash}</p>
      <p className="font-semibold text-brand-pink">
        Ganho acumulado: {row.ganhoKg != null ? `${row.ganhoKg.toFixed(1)} kg` : dash}
      </p>
    </div>
  )
}

export function GanhoPesoGestacionalChart({ banda, pontos }: Props) {
  const chartData = useMemo(() => {
    const bySemana = new Map<number, ChartRow>()
    for (const b of banda) {
      bySemana.set(b.semana, {
        semana: b.semana,
        yMin: b.yMin,
        yMax: b.yMax,
        ganhoKg: null,
        isPonto: false,
      })
    }
    for (const p of pontos) {
      const existing = bySemana.get(p.semana)
      if (existing) {
        existing.ganhoKg = p.ganhoKg
        existing.pesoKg = p.pesoKg
        existing.consultaId = p.consultaId
        existing.data = p.data
        existing.isPonto = true
      } else {
        bySemana.set(p.semana, {
          semana: p.semana,
          yMin: 0,
          yMax: 0,
          ganhoKg: p.ganhoKg,
          pesoKg: p.pesoKg,
          consultaId: p.consultaId,
          data: p.data,
          isPonto: true,
        })
      }
    }
    return [...bySemana.values()].sort((a, b) => a.semana - b.semana)
  }, [banda, pontos])

  const yMax = useMemo(() => {
    const vals = chartData.flatMap((r) => [r.yMax, r.ganhoKg ?? 0])
    const m = Math.max(...vals, 1)
    return Math.ceil(m * 1.15 * 10) / 10
  }, [chartData])

  if (banda.length === 0 && pontos.length === 0) {
    return null
  }

  return (
    <div className="w-full">
      <div className="h-[320px] w-full min-h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 12, right: 16, left: 4, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              type="number"
              dataKey="semana"
              domain={[SEMANA_GESTACIONAL_EIXO_MIN, SEMANA_GESTACIONAL_EIXO_MAX]}
              ticks={[10, 15, 20, 25, 30, 35, 40]}
              label={{
                value: 'Idade gestacional (semanas)',
                position: 'insideBottom',
                offset: -4,
                style: { fill: '#1e3a5f', fontSize: 12, fontWeight: 700 },
              }}
              tick={{ fill: '#64748b', fontSize: 11 }}
            />
            <YAxis
              domain={[0, yMax]}
              label={{
                value: 'Ganho acumulado (kg)',
                angle: -90,
                position: 'insideLeft',
                style: { fill: '#1e3a5f', fontSize: 12, fontWeight: 700 },
              }}
              tick={{ fill: '#64748b', fontSize: 11 }}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="yMax"
              stroke="none"
              fill="#fba0a7"
              fillOpacity={0.25}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="yMin"
              stroke="none"
              fill="#ffffff"
              fillOpacity={1}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="yMax"
              stroke="#fba0a7"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="yMin"
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="ganhoKg"
              stroke="#1e3a5f"
              strokeWidth={0}
              connectNulls={false}
              dot={{ r: 6, fill: '#fba0a7', stroke: '#1e3a5f', strokeWidth: 2 }}
              activeDot={{ r: 8, fill: '#1e3a5f' }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-500">{RODAPE_FONTE_MS}</p>
    </div>
  )
}
