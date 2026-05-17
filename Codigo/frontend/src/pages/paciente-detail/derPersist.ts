type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>

function iso(d: unknown): string {
  if (typeof d !== 'string' || !d) return ''
  return d.slice(0, 10)
}

function shallowDiff(a: Record<string, unknown> | null | undefined, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])
  for (const k of keys) {
    if ((a?.[k] ?? null) !== (b?.[k] ?? null)) return true
  }
  return false
}

export async function persistParceiro(
  authFetch: AuthFetch,
  pacienteId: string,
  prev: { nome?: string; vdrl?: string | null; hiv?: string | null } | null | undefined,
  next: { nome: string; vdrl: string; hiv: string },
): Promise<void> {
  const body = {
    nome: next.nome.trim() || (prev?.nome ?? ''),
    vdrl: next.vdrl.trim() || null,
    hiv: next.hiv.trim() || null,
  }
  if (!body.nome && !prev) return
  if (prev && !shallowDiff({ nome: prev.nome, vdrl: prev.vdrl ?? '', hiv: prev.hiv ?? '' }, { nome: body.nome, vdrl: body.vdrl ?? '', hiv: body.hiv ?? '' })) {
    return
  }
  const res = await authFetch(`/api/v1/pacientes/${pacienteId}/parceiro`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`parceiro HTTP ${res.status}`)
}

type VacRow = { id?: string; tipo: string; data: string; data_aprazada: string }
export async function persistVacinas(
  authFetch: AuthFetch,
  pacienteId: string,
  prev: VacRow[],
  next: VacRow[],
): Promise<void> {
  const prevById = new Map(prev.filter((r) => r.id).map((r) => [r.id!, r]))
  const nextById = new Map(next.filter((r) => r.id).map((r) => [r.id!, r]))
  for (const p of prev) {
    if (p.id && !nextById.has(p.id)) {
      const res = await authFetch(`/api/v1/vacinas/${p.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`vacina del HTTP ${res.status}`)
    }
  }
  for (const n of next) {
    const payload: Record<string, unknown> = {
      tipo: n.tipo,
      data: n.data.trim() || null,
      data_aprazada: n.data_aprazada.trim() || null,
    }
    if (!n.id) {
      const res = await authFetch(`/api/v1/pacientes/${pacienteId}/vacinas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`vacina post HTTP ${res.status}`)
      continue
    }
    const old = prevById.get(n.id)
    if (!old) continue
    if (old.tipo === n.tipo && iso(old.data) === (n.data.trim() || '') && iso(old.data_aprazada) === (n.data_aprazada.trim() || '')) continue
    const res = await authFetch(`/api/v1/vacinas/${n.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`vacina patch HTTP ${res.status}`)
  }
}

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
export async function persistExames(authFetch: AuthFetch, pacienteId: string, prev: ExRow[], next: ExRow[]): Promise<void> {
  const prevById = new Map(prev.filter((r) => r.id).map((r) => [r.id!, r]))
  const nextById = new Map(next.filter((r) => r.id).map((r) => [r.id!, r]))
  for (const p of prev) {
    if (p.id && !nextById.has(p.id)) {
      const res = await authFetch(`/api/v1/exames/${p.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`exame del HTTP ${res.status}`)
    }
  }
  for (const n of next) {
    const payload: Record<string, unknown> = {
      tipo: n.tipo,
      trimestre: n.trimestre.trim() === '' ? null : Number.parseInt(n.trimestre, 10),
      valor: n.valor.trim() || null,
      is_alterado: n.is_alterado,
      data_coleta: n.data_coleta.trim() || null,
      categoria_sensibilidade: n.categoria_sensibilidade.trim() || null,
      coombs: n.coombs.trim() || null,
    }
    if (!n.id) {
      const res = await authFetch(`/api/v1/pacientes/${pacienteId}/exames`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`exame post HTTP ${res.status}`)
      continue
    }
    const old = prevById.get(n.id)
    if (!old) continue
    const same =
      old.tipo === n.tipo &&
      String(old.trimestre == null ? '' : old.trimestre) === n.trimestre.trim() &&
      (old.valor ?? '') === n.valor &&
      old.is_alterado === n.is_alterado &&
      iso(old.data_coleta) === (n.data_coleta.trim() || '') &&
      (old.categoria_sensibilidade ?? '') === n.categoria_sensibilidade.trim() &&
      (old.coombs ?? '') === n.coombs.trim()
    if (same) continue
    const res = await authFetch(`/api/v1/exames/${n.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`exame patch HTTP ${res.status}`)
  }
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
export async function persistUsgs(authFetch: AuthFetch, gestacaoId: string, prev: UsgRow[], next: UsgRow[]): Promise<void> {
  const prevById = new Map(prev.filter((r) => r.id).map((r) => [r.id!, r]))
  const nextById = new Map(next.filter((r) => r.id).map((r) => [r.id!, r]))
  for (const p of prev) {
    if (p.id && !nextById.has(p.id)) {
      const res = await authFetch(`/api/v1/usgs/${p.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`usg del HTTP ${res.status}`)
    }
  }
  for (const n of next) {
    const payload: Record<string, unknown> = {
      data_exame: n.data_exame.trim() || null,
      ig_dum: n.ig_dum.trim() || null,
      ig_usg: n.ig_usg.trim() || null,
      peso_fetal_estimado: n.peso_fetal_estimado.trim() === '' ? null : Number.parseFloat(n.peso_fetal_estimado),
      localizacao_placenta: n.localizacao_placenta.trim() || null,
      idade_gestacional_usg: n.idade_gestacional_usg.trim() === '' ? null : Number.parseInt(n.idade_gestacional_usg, 10),
      is_liquido_amniotico_normal: n.is_liquido_amniotico_normal,
      outros: n.outros.trim() || null,
    }
    if (!n.id) {
      const res = await authFetch(`/api/v1/gestacoes/${gestacaoId}/usgs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`usg post HTTP ${res.status}`)
      continue
    }
    const old = prevById.get(n.id)
    if (!old) continue
    const same =
      iso(old.data_exame) === (n.data_exame.trim() || '') &&
      (old.ig_dum ?? '') === n.ig_dum.trim() &&
      (old.ig_usg ?? '') === n.ig_usg.trim() &&
      String(old.peso_fetal_estimado ?? '') === n.peso_fetal_estimado.trim() &&
      (old.localizacao_placenta ?? '') === n.localizacao_placenta.trim() &&
      String(old.idade_gestacional_usg ?? '') === n.idade_gestacional_usg.trim() &&
      old.is_liquido_amniotico_normal === n.is_liquido_amniotico_normal &&
      (old.outros ?? '') === n.outros.trim()
    if (same) continue
    const res = await authFetch(`/api/v1/usgs/${n.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`usg patch HTTP ${res.status}`)
  }
}

type PpRow = { id?: string; data: string; avaliacao_amamentacao: string; involucao_uterina: string; metodo_contraceptivo: string }
export async function persistConsultasPosParto(
  authFetch: AuthFetch,
  gestacaoId: string,
  prev: PpRow[],
  next: PpRow[],
): Promise<void> {
  const prevById = new Map(prev.filter((r) => r.id).map((r) => [r.id!, r]))
  const nextById = new Map(next.filter((r) => r.id).map((r) => [r.id!, r]))
  for (const p of prev) {
    if (p.id && !nextById.has(p.id)) {
      const res = await authFetch(`/api/v1/consultas-pos-parto/${p.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`pos-parto del HTTP ${res.status}`)
    }
  }
  for (const n of next) {
    const payload = {
      data: n.data.trim() || null,
      avaliacao_amamentacao: n.avaliacao_amamentacao.trim() || null,
      involucao_uterina: n.involucao_uterina.trim() || null,
      metodo_contraceptivo: n.metodo_contraceptivo.trim() || null,
    }
    if (!n.id) {
      const res = await authFetch(`/api/v1/gestacoes/${gestacaoId}/consultas-pos-parto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`pos-parto post HTTP ${res.status}`)
      continue
    }
    const old = prevById.get(n.id)
    if (!old) continue
    const same =
      iso(old.data) === (n.data.trim() || '') &&
      (old.avaliacao_amamentacao ?? '') === n.avaliacao_amamentacao.trim() &&
      (old.involucao_uterina ?? '') === n.involucao_uterina.trim() &&
      (old.metodo_contraceptivo ?? '') === n.metodo_contraceptivo.trim()
    if (same) continue
    const res = await authFetch(`/api/v1/consultas-pos-parto/${n.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`pos-parto patch HTTP ${res.status}`)
  }
}
