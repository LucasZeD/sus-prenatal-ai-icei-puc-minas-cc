import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import { BoolTriState, type BoolTriValue } from '../../components/BoolTriState.js'
import { EXAME_TIPOS, VACINA_TIPOS } from './derEnums.js'
import {
  persistConsultasPosParto,
  persistExames,
  persistParceiro,
  persistUsgs,
  persistVacinas,
} from './derPersist.js'

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>

export type DerModulosPersistHandle = { persist: () => Promise<void> }

function fmtDateOnly(v: unknown): string {
  if (typeof v !== 'string' || !v) return '\u2014'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '\u2014'
  return d.toLocaleDateString('pt-BR')
}

function fmtBool(v: unknown): string {
  return v === true ? 'Sim' : v === false ? 'Não' : '—'
}

function isoDate(v: unknown): string {
  if (typeof v !== 'string' || !v) return ''
  return v.slice(0, 10)
}

type VacRow = { id?: string; tipo: string; data: string; data_aprazada: string }
type ExRow = {
  id?: string
  tipo: string
  trimestre: string
  valor: string
  is_alterado: boolean
  data_coleta: string
  categoria_sensibilidade: string
  coombs: string
}
type UsgRow = {
  id?: string
  data_exame: string
  ig_dum: string
  ig_usg: string
  peso_fetal_estimado: string
  localizacao_placenta: string
  idade_gestacional_usg: string
  is_liquido_amniotico_normal: boolean
  outros: string
}
type PpRow = { id?: string; data: string; avaliacao_amamentacao: string; involucao_uterina: string; metodo_contraceptivo: string }

type Baseline = {
  parceiro: { nome: string; vdrl: string; hiv: string }
  vacinas: VacRow[]
  exames: ExRow[]
  usgs: UsgRow[]
  odonto: { anotacoes: string; is_alta: boolean; is_sangramento_gengival: boolean; is_carie_detectada: boolean }
  plano: { acompanhante_nome: string; posicao_parto_pref: string; anestesia_alivio_dor: string; is_deseja_doula: boolean }
  desfecho: {
    unidade_id: string
    tipo_parto: string
    peso_nascimento: string
    sexo: string
    grau_laceracao: string
    apgar_1_minuto: string
    apgar_5_minuto: string
    is_indicacao_cesarea: boolean
    is_reanimacao: boolean
    is_laceracao: boolean
  }
  posParto: PpRow[]
}

function mapVacinasFromApi(list: unknown): VacRow[] {
  if (!Array.isArray(list)) return []
  return list.map((v: any) => ({
    id: String(v.id),
    tipo: String(v.tipo ?? 'OUTRAS'),
    data: isoDate(v.data),
    data_aprazada: isoDate(v.data_aprazada),
  }))
}

function mapExamesFromApi(list: unknown): ExRow[] {
  if (!Array.isArray(list)) return []
  return list.map((e: any) => ({
    id: String(e.id),
    tipo: String(e.tipo ?? 'OUTROS'),
    trimestre: e.trimestre != null ? String(e.trimestre) : '',
    valor: typeof e.valor === 'string' ? e.valor : '',
    is_alterado: Boolean(e.is_alterado),
    data_coleta: isoDate(e.data_coleta),
    categoria_sensibilidade: typeof e.categoria_sensibilidade === 'string' ? e.categoria_sensibilidade : '',
    coombs: typeof e.coombs === 'string' ? e.coombs : '',
  }))
}

function mapUsgsFromApi(list: unknown): UsgRow[] {
  if (!Array.isArray(list)) return []
  return list.map((u: any) => ({
    id: String(u.id),
    data_exame: isoDate(u.data_exame),
    ig_dum: typeof u.ig_dum === 'string' ? u.ig_dum : '',
    ig_usg: typeof u.ig_usg === 'string' ? u.ig_usg : '',
    peso_fetal_estimado: u.peso_fetal_estimado != null ? String(u.peso_fetal_estimado) : '',
    localizacao_placenta: typeof u.localizacao_placenta === 'string' ? u.localizacao_placenta : '',
    idade_gestacional_usg: u.idade_gestacional_usg != null ? String(u.idade_gestacional_usg) : '',
    is_liquido_amniotico_normal: u.is_liquido_amniotico_normal !== false,
    outros: typeof u.outros === 'string' ? u.outros : '',
  }))
}

function mapPpFromApi(list: unknown): PpRow[] {
  if (!Array.isArray(list)) return []
  return list.map((p: any) => ({
    id: String(p.id),
    data: isoDate(p.data),
    avaliacao_amamentacao: typeof p.avaliacao_amamentacao === 'string' ? p.avaliacao_amamentacao : '',
    involucao_uterina: typeof p.involucao_uterina === 'string' ? p.involucao_uterina : '',
    metodo_contraceptivo: typeof p.metodo_contraceptivo === 'string' ? p.metodo_contraceptivo : '',
  }))
}

function triFromBool(v: unknown): BoolTriValue {
  if (v === true) return 'true'
  if (v === false) return 'false'
  return ''
}

function boolFromTri(v: BoolTriValue, fallback: boolean): boolean {
  if (v === 'true') return true
  if (v === 'false') return false
  return fallback
}

export const DerModulosProntuario = forwardRef<
  DerModulosPersistHandle,
  {
    isEditing: boolean
    authFetch: AuthFetch
    validId: string
    selG: string
    selUnidade: string
    pacienteFull: Record<string, unknown> | null
  }
>(function DerModulosProntuario({ isEditing, authFetch, validId, selG, selUnidade, pacienteFull }, ref) {
  const prevEditing = useRef(false)
  const baselineRef = useRef<Baseline | null>(null)

  const [parceiro, setParceiro] = useState({ nome: '', vdrl: '', hiv: '' })
  const [vacinas, setVacinas] = useState<VacRow[]>([])
  const [exames, setExames] = useState<ExRow[]>([])
  const [usgs, setUsgs] = useState<UsgRow[]>([])
  const [odonto, setOdonto] = useState({
    anotacoes: '',
    is_alta: false,
    is_sangramento_gengival: false,
    is_carie_detectada: false,
  })
  const [plano, setPlano] = useState({
    acompanhante_nome: '',
    posicao_parto_pref: '',
    anestesia_alivio_dor: '',
    is_deseja_doula: false,
  })
  const [desfecho, setDesfecho] = useState({
    unidade_id: '',
    tipo_parto: '',
    peso_nascimento: '',
    sexo: '',
    grau_laceracao: '',
    apgar_1_minuto: '',
    apgar_5_minuto: '',
    is_indicacao_cesarea: false,
    is_reanimacao: false,
    is_laceracao: false,
  })
  const [posParto, setPosParto] = useState<PpRow[]>([])

  const selectedGestacaoFull = (() => {
    const list =
      pacienteFull && Array.isArray((pacienteFull as any).gestacoes) ? ((pacienteFull as any).gestacoes as any[]) : []
    return list.find((g) => String(g?.id) === selG) ?? null
  })()

  const buildSnapshotFromFull = useCallback((): Baseline => {
    const pf = pacienteFull as any
    const g = selectedGestacaoFull
    const p = pf?.parceiro
    const parceiroSnap = {
      nome: typeof p?.nome === 'string' ? p.nome : '',
      vdrl: typeof p?.vdrl === 'string' ? p.vdrl : '',
      hiv: typeof p?.hiv === 'string' ? p.hiv : '',
    }
    const ao = g?.avaliacao_odonto
    const odontoSnap = {
      anotacoes: typeof ao?.anotacoes === 'string' ? ao.anotacoes : '',
      is_alta: Boolean(ao?.is_alta),
      is_sangramento_gengival: Boolean(ao?.is_sangramento_gengival),
      is_carie_detectada: Boolean(ao?.is_carie_detectada),
    }
    const pp = g?.plano_parto
    const planoSnap = {
      acompanhante_nome: typeof pp?.acompanhante_nome === 'string' ? pp.acompanhante_nome : '',
      posicao_parto_pref: typeof pp?.posicao_parto_pref === 'string' ? pp.posicao_parto_pref : '',
      anestesia_alivio_dor: typeof pp?.anestesia_alivio_dor === 'string' ? pp.anestesia_alivio_dor : '',
      is_deseja_doula: Boolean(pp?.is_deseja_doula),
    }
    const d = g?.desfecho
    const desfechoSnap = {
      unidade_id: typeof d?.unidade_id === 'string' ? d.unidade_id : '',
      tipo_parto: typeof d?.tipo_parto === 'string' ? d.tipo_parto : '',
      peso_nascimento: d?.peso_nascimento != null ? String(d.peso_nascimento) : '',
      sexo: typeof d?.sexo === 'string' ? d.sexo : '',
      grau_laceracao: typeof d?.grau_laceracao === 'string' ? d.grau_laceracao : '',
      apgar_1_minuto: d?.apgar_1_minuto != null ? String(d.apgar_1_minuto) : '',
      apgar_5_minuto: d?.apgar_5_minuto != null ? String(d.apgar_5_minuto) : '',
      is_indicacao_cesarea: Boolean(d?.is_indicacao_cesarea),
      is_reanimacao: Boolean(d?.is_reanimacao),
      is_laceracao: Boolean(d?.is_laceracao),
    }
    return {
      parceiro: parceiroSnap,
      vacinas: mapVacinasFromApi(pf?.vacinas),
      exames: mapExamesFromApi(pf?.exames),
      usgs: mapUsgsFromApi(g?.usgs),
      odonto: odontoSnap,
      plano: planoSnap,
      desfecho: desfechoSnap,
      posParto: mapPpFromApi(g?.consultas_pos_parto),
    }
  }, [pacienteFull, selectedGestacaoFull])

  useEffect(() => {
    if (isEditing && !prevEditing.current) {
      const snap = buildSnapshotFromFull()
      baselineRef.current = {
        parceiro: { ...snap.parceiro },
        vacinas: snap.vacinas.map((v) => ({ ...v })),
        exames: snap.exames.map((e) => ({ ...e })),
        usgs: snap.usgs.map((u) => ({ ...u })),
        odonto: { ...snap.odonto },
        plano: { ...snap.plano },
        desfecho: { ...snap.desfecho },
        posParto: snap.posParto.map((p) => ({ ...p })),
      }
      setParceiro(snap.parceiro)
      setVacinas(snap.vacinas)
      setExames(snap.exames)
      setUsgs(snap.usgs)
      setOdonto(snap.odonto)
      setPlano(snap.plano)
      setDesfecho(snap.desfecho)
      setPosParto(snap.posParto)
    }
    if (!isEditing && prevEditing.current) {
      const snap = buildSnapshotFromFull()
      setParceiro(snap.parceiro)
      setVacinas(snap.vacinas)
      setExames(snap.exames)
      setUsgs(snap.usgs)
      setOdonto(snap.odonto)
      setPlano(snap.plano)
      setDesfecho(snap.desfecho)
      setPosParto(snap.posParto)
    }
    prevEditing.current = isEditing
  }, [isEditing, buildSnapshotFromFull])

  const persist = useCallback(async () => {
    const base = baselineRef.current
    if (!base || !validId) return

    const pf = pacienteFull as any
    const prevParceiro = pf?.parceiro
    await persistParceiro(authFetch, validId, prevParceiro, parceiro)

    await persistVacinas(authFetch, validId, base.vacinas, vacinas)
    await persistExames(authFetch, validId, base.exames, exames)

    if (!selG) return

    await persistUsgs(authFetch, selG, base.usgs, usgs)
    await persistConsultasPosParto(authFetch, selG, base.posParto, posParto)

    const odPatch: Record<string, unknown> = {}
    if (
      odonto.anotacoes !== base.odonto.anotacoes ||
      odonto.is_alta !== base.odonto.is_alta ||
      odonto.is_sangramento_gengival !== base.odonto.is_sangramento_gengival ||
      odonto.is_carie_detectada !== base.odonto.is_carie_detectada
    ) {
      odPatch.anotacoes = odonto.anotacoes.trim() || null
      odPatch.is_alta = odonto.is_alta
      odPatch.is_sangramento_gengival = odonto.is_sangramento_gengival
      odPatch.is_carie_detectada = odonto.is_carie_detectada
      const r = await authFetch(`/api/v1/gestacoes/${selG}/avaliacao-odonto`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(odPatch),
      })
      if (!r.ok) throw new Error(`odonto HTTP ${r.status}`)
    }

    const plChanged =
      plano.acompanhante_nome !== base.plano.acompanhante_nome ||
      plano.posicao_parto_pref !== base.plano.posicao_parto_pref ||
      plano.anestesia_alivio_dor !== base.plano.anestesia_alivio_dor ||
      plano.is_deseja_doula !== base.plano.is_deseja_doula
    if (plChanged) {
      const r = await authFetch(`/api/v1/gestacoes/${selG}/plano-parto`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acompanhante_nome: plano.acompanhante_nome.trim() || null,
          posicao_parto_pref: plano.posicao_parto_pref.trim() || null,
          anestesia_alivio_dor: plano.anestesia_alivio_dor.trim() || null,
          is_deseja_doula: plano.is_deseja_doula,
        }),
      })
      if (!r.ok) throw new Error(`plano HTTP ${r.status}`)
    }

    const desChanged =
      desfecho.unidade_id !== base.desfecho.unidade_id ||
      desfecho.tipo_parto !== base.desfecho.tipo_parto ||
      desfecho.peso_nascimento !== base.desfecho.peso_nascimento ||
      desfecho.sexo !== base.desfecho.sexo ||
      desfecho.grau_laceracao !== base.desfecho.grau_laceracao ||
      desfecho.apgar_1_minuto !== base.desfecho.apgar_1_minuto ||
      desfecho.apgar_5_minuto !== base.desfecho.apgar_5_minuto ||
      desfecho.is_indicacao_cesarea !== base.desfecho.is_indicacao_cesarea ||
      desfecho.is_reanimacao !== base.desfecho.is_reanimacao ||
      desfecho.is_laceracao !== base.desfecho.is_laceracao
    if (desChanged) {
      const uid = desfecho.unidade_id.trim() || selUnidade
      const body: Record<string, unknown> = {
        unidade_id: uid || undefined,
        tipo_parto: desfecho.tipo_parto.trim() || null,
        peso_nascimento: desfecho.peso_nascimento.trim() === '' ? null : Number.parseFloat(desfecho.peso_nascimento),
        sexo: desfecho.sexo.trim() || null,
        grau_laceracao: desfecho.grau_laceracao.trim() || null,
        apgar_1_minuto: desfecho.apgar_1_minuto.trim() === '' ? null : Number.parseInt(desfecho.apgar_1_minuto, 10),
        apgar_5_minuto: desfecho.apgar_5_minuto.trim() === '' ? null : Number.parseInt(desfecho.apgar_5_minuto, 10),
        is_indicacao_cesarea: desfecho.is_indicacao_cesarea,
        is_reanimacao: desfecho.is_reanimacao,
        is_laceracao: desfecho.is_laceracao,
      }
      const r = await authFetch(`/api/v1/gestacoes/${selG}/desfecho`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error(`desfecho HTTP ${r.status}`)
    }
  }, [
    authFetch,
    validId,
    selG,
    selUnidade,
    pacienteFull,
    parceiro,
    vacinas,
    exames,
    usgs,
    posParto,
    odonto,
    plano,
    desfecho,
  ])

  useImperativeHandle(ref, () => ({ persist }), [persist])

  const pf = pacienteFull as any
  const g = selectedGestacaoFull

  const section = (title: string, content: ReactNode) => (
    <details key={title} className="group rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <summary className="cursor-pointer list-none px-4 py-3 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <div className="text-[11px] font-black text-brand-navy truncate">{title}</div>
        </div>
        <div className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black text-slate-700 shadow-sm">
          <span className="group-open:hidden">Ver mais</span>
          <span className="hidden group-open:inline">Ocultar</span>
        </div>
      </summary>
      <div className="p-4">{content}</div>
    </details>
  )

  return (
    <div className="space-y-3">
      {section(
        'Vacinas & Exames (DER)',
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Vacinas</p>
            {isEditing ? (
              <div className="space-y-2">
                {vacinas.map((row, idx) => (
                  <div key={row.id ?? `nv-${idx}`} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-3 space-y-2">
                    <select
                      value={row.tipo}
                      onChange={(e) =>
                        setVacinas((list) => list.map((r, i) => (i === idx ? { ...r, tipo: e.target.value } : r)))
                      }
                      className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold"
                    >
                      {VACINA_TIPOS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={row.data}
                        onChange={(e) =>
                          setVacinas((list) => list.map((r, i) => (i === idx ? { ...r, data: e.target.value } : r)))
                        }
                        className="rounded-lg border px-2 py-1 text-xs"
                      />
                      <input
                        type="date"
                        value={row.data_aprazada}
                        onChange={(e) =>
                          setVacinas((list) =>
                            list.map((r, i) => (i === idx ? { ...r, data_aprazada: e.target.value } : r)),
                          )
                        }
                        className="rounded-lg border px-2 py-1 text-xs"
                      />
                    </div>
                    <button
                      type="button"
                      className="text-xs font-bold text-rose-600"
                      onClick={() => setVacinas((list) => list.filter((_, i) => i !== idx))}
                    >
                      Remover
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="rounded-lg border border-brand-pink/40 bg-brand-pink/10 px-3 py-1.5 text-xs font-black text-brand-navy"
                  onClick={() =>
                    setVacinas((list) => [...list, { tipo: 'OUTRAS', data: '', data_aprazada: '' }])
                  }
                >
                  + Vacina
                </button>
              </div>
            ) : Array.isArray(pf?.vacinas) && pf.vacinas.length > 0 ? (
              <div className="space-y-2">
                {pf.vacinas.map((v: any) => (
                  <div key={String(v.id)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                    <div className="font-black text-brand-navy">{String(v.tipo ?? '—')}</div>
                    <div className="text-[11px] font-bold text-slate-400">
                      {fmtDateOnly(v.data)}
                      {v.data_aprazada ? ` ? Aprazada: ${fmtDateOnly(v.data_aprazada)}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm font-medium text-slate-500">Sem vacinas registradas.</p>
            )}
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Exames laboratoriais</p>
            {isEditing ? (
              <div className="space-y-2">
                {exames.map((row, idx) => (
                  <div key={row.id ?? `ne-${idx}`} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-3 space-y-2">
                    <select
                      value={row.tipo}
                      onChange={(e) =>
                        setExames((list) => list.map((r, i) => (i === idx ? { ...r, tipo: e.target.value } : r)))
                      }
                      className="block w-full rounded-lg border bg-white px-2 py-1.5 text-xs font-bold"
                    >
                      {EXAME_TIPOS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <input
                      placeholder="Trimestre (1-3)"
                      value={row.trimestre}
                      onChange={(e) =>
                        setExames((list) =>
                          list.map((r, i) => (i === idx ? { ...r, trimestre: e.target.value.replace(/\D/g, '') } : r)),
                        )
                      }
                      className="w-full rounded-lg border px-2 py-1 text-xs"
                    />
                    <input
                      type="date"
                      value={row.data_coleta}
                      onChange={(e) =>
                        setExames((list) => list.map((r, i) => (i === idx ? { ...r, data_coleta: e.target.value } : r)))
                      }
                      className="w-full rounded-lg border px-2 py-1 text-xs"
                    />
                    <textarea
                      placeholder="Valor / resultado (texto)"
                      value={row.valor}
                      onChange={(e) =>
                        setExames((list) => list.map((r, i) => (i === idx ? { ...r, valor: e.target.value } : r)))
                      }
                      className="w-full rounded-lg border px-2 py-1 text-xs"
                      rows={2}
                    />
                    <label className="flex items-center gap-2 text-xs font-bold">
                      <input
                        type="checkbox"
                        checked={row.is_alterado}
                        onChange={(e) =>
                          setExames((list) =>
                            list.map((r, i) => (i === idx ? { ...r, is_alterado: e.target.checked } : r)),
                          )
                        }
                      />
                      Alterado
                    </label>
                    <button
                      type="button"
                      className="text-xs font-bold text-rose-600"
                      onClick={() => setExames((list) => list.filter((_, i) => i !== idx))}
                    >
                      Remover
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="rounded-lg border border-brand-pink/40 bg-brand-pink/10 px-3 py-1.5 text-xs font-black text-brand-navy"
                  onClick={() =>
                    setExames((list) => [
                      ...list,
                      {
                        tipo: 'OUTROS',
                        trimestre: '',
                        valor: '',
                        is_alterado: false,
                        data_coleta: '',
                        categoria_sensibilidade: '',
                        coombs: '',
                      },
                    ])
                  }
                >
                  + Exame
                </button>
              </div>
            ) : Array.isArray(pf?.exames) && pf.exames.length > 0 ? (
              <div className="space-y-2">
                {pf.exames.map((e: any) => (
                  <div key={String(e.id)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                    <div className="font-black text-brand-navy">{String(e.tipo ?? '—')}</div>
                    <div className="text-[11px] font-bold text-slate-400">
                      {fmtDateOnly(e.data_coleta)}
                      {e.trimestre != null ? ` ? T${e.trimestre}` : ''}
                      {e.is_alterado ? ' ? Alterado' : ''}
                    </div>
                    <div className="mt-2 text-xs text-slate-600">{e.valor ?? '—'}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm font-medium text-slate-500">Sem exames registrados.</p>
            )}
          </div>
        </div>,
      )}

      {section(
        'USG (DER)',
        isEditing ? (
          <div className="space-y-2">
            {usgs.map((row, idx) => (
              <div key={row.id ?? `nu-${idx}`} className="rounded-2xl border bg-slate-50/50 p-3 space-y-2">
                <input
                  type="date"
                  value={row.data_exame}
                  onChange={(e) =>
                    setUsgs((list) => list.map((r, i) => (i === idx ? { ...r, data_exame: e.target.value } : r)))
                  }
                  className="w-full rounded border px-2 py-1 text-xs"
                />
                <input
                  placeholder="IG DUM"
                  value={row.ig_dum}
                  onChange={(e) =>
                    setUsgs((list) => list.map((r, i) => (i === idx ? { ...r, ig_dum: e.target.value } : r)))
                  }
                  className="w-full rounded border px-2 py-1 text-xs"
                />
                <input
                  placeholder="IG USG"
                  value={row.ig_usg}
                  onChange={(e) =>
                    setUsgs((list) => list.map((r, i) => (i === idx ? { ...r, ig_usg: e.target.value } : r)))
                  }
                  className="w-full rounded border px-2 py-1 text-xs"
                />
                <input
                  placeholder="PFE (kg)"
                  value={row.peso_fetal_estimado}
                  onChange={(e) =>
                    setUsgs((list) => list.map((r, i) => (i === idx ? { ...r, peso_fetal_estimado: e.target.value } : r)))
                  }
                  className="w-full rounded border px-2 py-1 text-xs"
                />
                <input
                  placeholder="Placenta"
                  value={row.localizacao_placenta}
                  onChange={(e) =>
                    setUsgs((list) =>
                      list.map((r, i) => (i === idx ? { ...r, localizacao_placenta: e.target.value } : r)),
                    )
                  }
                  className="w-full rounded border px-2 py-1 text-xs"
                />
                <input
                  placeholder="IG USG (semanas)"
                  value={row.idade_gestacional_usg}
                  onChange={(e) =>
                    setUsgs((list) =>
                      list.map((r, i) =>
                        i === idx ? { ...r, idade_gestacional_usg: e.target.value.replace(/\D/g, '') } : r,
                      ),
                    )
                  }
                  className="w-full rounded border px-2 py-1 text-xs"
                />
                <label className="flex items-center gap-2 text-xs font-bold">
                  <input
                    type="checkbox"
                    checked={row.is_liquido_amniotico_normal}
                    onChange={(e) =>
                      setUsgs((list) =>
                        list.map((r, i) => (i === idx ? { ...r, is_liquido_amniotico_normal: e.target.checked } : r)),
                      )
                    }
                  />
                  Liquido amniotico normal
                </label>
                <textarea
                  placeholder="Outros"
                  value={row.outros}
                  onChange={(e) =>
                    setUsgs((list) => list.map((r, i) => (i === idx ? { ...r, outros: e.target.value } : r)))
                  }
                  className="w-full rounded border px-2 py-1 text-xs"
                  rows={2}
                />
                <button
                  type="button"
                  className="text-xs font-bold text-rose-600"
                  onClick={() => setUsgs((list) => list.filter((_, i) => i !== idx))}
                >
                  Remover
                </button>
              </div>
            ))}
            <button
              type="button"
              className="mt-2 rounded-lg border border-brand-pink/40 bg-brand-pink/10 px-3 py-1.5 text-xs font-black text-brand-navy"
              onClick={() =>
                setUsgs((list) => [
                  ...list,
                  {
                    data_exame: '',
                    ig_dum: '',
                    ig_usg: '',
                    peso_fetal_estimado: '',
                    localizacao_placenta: '',
                    idade_gestacional_usg: '',
                    is_liquido_amniotico_normal: true,
                    outros: '',
                  },
                ])
              }
            >
              + USG
            </button>
          </div>
        ) : Array.isArray(g?.usgs) && g.usgs.length > 0 ? (
          <div className="space-y-2">
            {g.usgs.map((u: any) => (
              <div key={String(u.id)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <div className="text-[11px] font-bold text-slate-400">
                  {u.idade_gestacional_usg != null ? `IG USG: ${u.idade_gestacional_usg} sem` : 'IG USG: ?'}
                  {u.peso_fetal_estimado != null ? ` ? PFE: ${u.peso_fetal_estimado}` : ''}
                </div>
                <div className="text-xs font-black text-brand-navy mt-1">
                  {u.localizacao_placenta ? `Placenta: ${u.localizacao_placenta}` : 'Placenta: ?'}
                </div>
                <div className="text-xs font-bold text-slate-500 mt-1">LA: {fmtBool(u.is_liquido_amniotico_normal)}</div>
                <div className="mt-2 text-xs">{fmtDateOnly(u.data_exame)}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm font-medium text-slate-500">Sem USG registrados.</p>
        ),
      )}

      {section(
        'Odonto & Plano de parto (DER)',
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Avaliacao odontologica</p>
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  value={odonto.anotacoes}
                  onChange={(e) => setOdonto((o) => ({ ...o, anotacoes: e.target.value }))}
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  rows={3}
                />
                <div className="flex flex-wrap gap-4">
                  <label className="text-xs font-bold flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={odonto.is_alta}
                      onChange={(e) => setOdonto((o) => ({ ...o, is_alta: e.target.checked }))}
                    />
                    Alta
                  </label>
                  <label className="text-xs font-bold flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={odonto.is_sangramento_gengival}
                      onChange={(e) => setOdonto((o) => ({ ...o, is_sangramento_gengival: e.target.checked }))}
                    />
                    Sangramento gengival
                  </label>
                  <label className="text-xs font-bold flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={odonto.is_carie_detectada}
                      onChange={(e) => setOdonto((o) => ({ ...o, is_carie_detectada: e.target.checked }))}
                    />
                    Carie
                  </label>
                </div>
              </div>
            ) : g?.avaliacao_odonto ? (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <dt className="text-[10px] font-bold uppercase text-slate-400">Alta</dt>
                  <dd className="text-sm font-black text-brand-navy mt-1">{fmtBool(g.avaliacao_odonto.is_alta)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase text-slate-400">Sangramento</dt>
                  <dd className="text-sm font-black text-brand-navy mt-1">{fmtBool(g.avaliacao_odonto.is_sangramento_gengival)}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-bold uppercase text-slate-400">Anotacoes</dt>
                  <dd className="text-sm mt-1 whitespace-pre-wrap">{g.avaliacao_odonto.anotacoes ?? '—'}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-slate-500">Sem avaliacao odontologica.</p>
            )}
          </div>
          <div className="pt-4 border-t border-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Plano de parto</p>
            {isEditing ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  placeholder="Acompanhante"
                  value={plano.acompanhante_nome}
                  onChange={(e) => setPlano((p) => ({ ...p, acompanhante_nome: e.target.value }))}
                  className="rounded-lg border px-2 py-1.5 text-sm"
                />
                <input
                  placeholder="Posicao preferida"
                  value={plano.posicao_parto_pref}
                  onChange={(e) => setPlano((p) => ({ ...p, posicao_parto_pref: e.target.value }))}
                  className="rounded-lg border px-2 py-1.5 text-sm"
                />
                <input
                  placeholder="Analgesia / alivio dor"
                  value={plano.anestesia_alivio_dor}
                  onChange={(e) => setPlano((p) => ({ ...p, anestesia_alivio_dor: e.target.value }))}
                  className="rounded-lg border px-2 py-1.5 text-sm sm:col-span-2"
                />
                <label className="flex items-center gap-2 text-xs font-bold sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={plano.is_deseja_doula}
                    onChange={(e) => setPlano((p) => ({ ...p, is_deseja_doula: e.target.checked }))}
                  />
                  Deseja doula
                </label>
              </div>
            ) : g?.plano_parto ? (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <dt className="text-[10px] font-bold uppercase text-slate-400">Acompanhante</dt>
                  <dd className="text-sm font-black text-brand-navy mt-1">{g.plano_parto.acompanhante_nome ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase text-slate-400">Doula</dt>
                  <dd className="text-sm font-black text-brand-navy mt-1">{fmtBool(g.plano_parto.is_deseja_doula)}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-slate-500">Sem plano de parto.</p>
            )}
          </div>
        </div>,
      )}

      {section(
        'Desfecho & pos-parto (DER)',
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Desfecho</p>
            {isEditing ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  placeholder="Unidade (UUID) ? obrigatorio na 1 gravacao"
                  value={desfecho.unidade_id}
                  onChange={(e) => setDesfecho((d) => ({ ...d, unidade_id: e.target.value }))}
                  className="rounded-lg border px-2 py-1.5 text-xs font-mono sm:col-span-2"
                />
                <input
                  placeholder="Tipo parto"
                  value={desfecho.tipo_parto}
                  onChange={(e) => setDesfecho((d) => ({ ...d, tipo_parto: e.target.value }))}
                  className="rounded-lg border px-2 py-1.5 text-sm"
                />
                <input
                  placeholder="Peso nascimento"
                  value={desfecho.peso_nascimento}
                  onChange={(e) => setDesfecho((d) => ({ ...d, peso_nascimento: e.target.value }))}
                  className="rounded-lg border px-2 py-1.5 text-sm"
                />
                <input
                  placeholder="Sexo"
                  value={desfecho.sexo}
                  onChange={(e) => setDesfecho((d) => ({ ...d, sexo: e.target.value }))}
                  className="rounded-lg border px-2 py-1.5 text-sm"
                />
                <input
                  placeholder="Apgar 1min"
                  value={desfecho.apgar_1_minuto}
                  onChange={(e) =>
                    setDesfecho((d) => ({ ...d, apgar_1_minuto: e.target.value.replace(/\D/g, '') }))
                  }
                  className="rounded-lg border px-2 py-1.5 text-sm"
                />
                <input
                  placeholder="Apgar 5min"
                  value={desfecho.apgar_5_minuto}
                  onChange={(e) =>
                    setDesfecho((d) => ({ ...d, apgar_5_minuto: e.target.value.replace(/\D/g, '') }))
                  }
                  className="rounded-lg border px-2 py-1.5 text-sm"
                />
                <div className="flex flex-wrap gap-3 sm:col-span-2">
                  <BoolTriState
                    name="desfecho-cesarea"
                    value={triFromBool(desfecho.is_indicacao_cesarea)}
                    disabled={!isEditing}
                    onChange={(v) => setDesfecho((d) => ({ ...d, is_indicacao_cesarea: boolFromTri(v, false) }))}
                  />
                  <span className="text-xs self-center font-bold text-slate-500">Indicacao cesarea</span>
                </div>
              </div>
            ) : g?.desfecho ? (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <dt className="text-[10px] font-bold uppercase text-slate-400">Tipo parto</dt>
                  <dd className="text-sm font-black text-brand-navy mt-1">{g.desfecho.tipo_parto ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase text-slate-400">Peso</dt>
                  <dd className="text-sm font-black text-brand-navy mt-1">{g.desfecho.peso_nascimento ?? '—'}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-slate-500">Sem desfecho registrado.</p>
            )}
          </div>
          <div className="pt-4 border-t border-slate-100">
            <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Consultas pos-parto</p>
            {isEditing ? (
              <div className="space-y-2">
                {posParto.map((row, idx) => (
                  <div key={row.id ?? `npp-${idx}`} className="rounded-xl border bg-slate-50/50 p-3 space-y-2">
                    <input
                      type="date"
                      value={row.data}
                      onChange={(e) =>
                        setPosParto((list) => list.map((r, i) => (i === idx ? { ...r, data: e.target.value } : r)))
                      }
                      className="w-full rounded border px-2 py-1 text-xs"
                    />
                    <textarea
                      placeholder="Amamentacao"
                      value={row.avaliacao_amamentacao}
                      onChange={(e) =>
                        setPosParto((list) =>
                          list.map((r, i) => (i === idx ? { ...r, avaliacao_amamentacao: e.target.value } : r)),
                        )
                      }
                      className="w-full rounded border px-2 py-1 text-xs"
                      rows={2}
                    />
                    <button
                      type="button"
                      className="text-xs font-bold text-rose-600"
                      onClick={() => setPosParto((list) => list.filter((_, i) => i !== idx))}
                    >
                      Remover
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="rounded-lg border border-brand-pink/40 bg-brand-pink/10 px-3 py-1.5 text-xs font-black text-brand-navy"
                  onClick={() =>
                    setPosParto((list) => [
                      ...list,
                      { data: '', avaliacao_amamentacao: '', involucao_uterina: '', metodo_contraceptivo: '' },
                    ])
                  }
                >
                  + Consulta pos-parto
                </button>
              </div>
            ) : Array.isArray(g?.consultas_pos_parto) && g.consultas_pos_parto.length > 0 ? (
              <div className="space-y-2">
                {g.consultas_pos_parto.map((pp: any) => (
                  <div key={String(pp.id)} className="rounded-2xl border bg-white px-4 py-3 text-sm">
                    <div className="font-black text-brand-navy">{fmtDateOnly(pp.data)}</div>
                    <div className="text-xs text-slate-700 mt-1">{pp.avaliacao_amamentacao ?? '—'}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Sem consultas pos-parto.</p>
            )}
          </div>
        </div>,
      )}

      {section(
        'Parceiro (DER)',
        isEditing ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              placeholder="Nome"
              value={parceiro.nome}
              onChange={(e) => setParceiro((p) => ({ ...p, nome: e.target.value }))}
              className="rounded-lg border px-3 py-2 text-sm sm:col-span-2"
            />
            <input
              placeholder="VDRL"
              value={parceiro.vdrl}
              onChange={(e) => setParceiro((p) => ({ ...p, vdrl: e.target.value }))}
              className="rounded-lg border px-3 py-2 text-sm"
            />
            <input
              placeholder="HIV"
              value={parceiro.hiv}
              onChange={(e) => setParceiro((p) => ({ ...p, hiv: e.target.value }))}
              className="rounded-lg border px-3 py-2 text-sm"
            />
          </div>
        ) : pf?.parceiro ? (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <dt className="text-[10px] font-bold uppercase text-slate-400">Nome</dt>
              <dd className="text-sm font-black text-brand-navy mt-1">{pf.parceiro.nome ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase text-slate-400">VDRL</dt>
              <dd className="text-sm font-black text-brand-navy mt-1">{pf.parceiro.vdrl ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase text-slate-400">HIV</dt>
              <dd className="text-sm font-black text-brand-navy mt-1">{pf.parceiro.hiv ?? '—'}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-slate-500">Sem dados de parceiro.</p>
        ),
      )}
    </div>
  )
})
