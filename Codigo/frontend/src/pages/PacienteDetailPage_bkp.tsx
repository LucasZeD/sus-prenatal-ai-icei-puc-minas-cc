import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.js'
import { useLiviaDesktopAsideOpen } from '../hooks/useLiviaDesktopAsideOpen.js'
import { isUuid } from '../lib/uuid.js'
import { LiviaAssistantPanel } from '../components/LiviaAssistantPanel.js'
import { BoolTriState } from '../components/BoolTriState.js'
import { DerModulosProntuario, type DerModulosPersistHandle } from './paciente-detail/DerModulosProntuario.js'
import { useProntuarioDrafts } from './paciente-detail/useProntuarioDrafts.js'
import {
  addCalendarDaysLocal,
  calcIgAtualFromDum,
  formatApiDateOnlyPtBr,
  formatLocalDatePtBr,
  impliedDumForIg,
  NAEGELE_DAYS,
  parseApiDateOnlyToLocalDate,
  parsePtBrDateOnlyToLocalDate,
  primaryDppFromDumAndEco,
  toIsoDateOnlyLocal,
} from '../lib/gestacaoDpp.js'

type UnidadeRow = { id: string; nome: string }

type PacienteRow = {
  id: string
  nome_mascarado: string
  nome_social?: string | null
  cpf_ultimos4?: string | null
  cartao_sus_ultimos4?: string | null
  data_nascimento?: string | null
  idade?: number | null
  etnia?: string | null
  escolaridade?: string | null
  estado_civil?: string | null
  ocupacao?: string | null
  telefone?: string | null
  email?: string | null
  localizacao?: string | null
  abo_rh?: string | null
  altura?: number | null
  peso_pre_gestacional?: number | null
  is_particip_atvd_educativa?: boolean | null
}

type GestacaoRow = {
  id: string
  paciente_id: string
  tipo_risco?: string
  dum?: string | null
  dpp?: string | null
  dpp_eco?: string | null
  ig_inicial?: number | null
  idade_gestac_confirmada?: number | null
  coombs?: string | null
  tipo_gravidez?: string | null
  is_planejada?: boolean | null
  is_visita_maternidade?: boolean | null
  is_ativa?: boolean | null
  is_colocar_diu?: boolean | null
  is_did_consulta_odontologica?: boolean | null
  concluida_em?: string | null
}

type ConsultaRow = {
  id: string
  gestacao_id: string
  data: string
  status: string
  validacao_medica?: boolean
  idade_gestacional?: number
  peso?: number | null
  pa_sistolica?: number | null
  pa_diastolica?: number | null
  au?: number | null
  bfc?: number | null
  is_edema?: boolean
  mov_fetal?: string | null
  apresentacao_fetal?: string | null
  queixa?: string | null
  conduta?: string | null
  is_exantema?: boolean
  ia?: { sugestao_conduta?: string | null } | null
}

export function PacienteDetailPage() {
  const { id } = useParams()
  const { authFetch } = useAuth()
  const [liviaAsideOpen, setLiviaAsideOpen] = useLiviaDesktopAsideOpen()
  const [paciente, setPaciente] = useState<PacienteRow | null>(null)
  const [pacienteFull, setPacienteFull] = useState<Record<string, unknown> | null>(null)
  const [gestacoes, setGestacoes] = useState<GestacaoRow[]>([])
  const [selG, setSelG] = useState('')
  const [selUnidade, setSelUnidade] = useState('')
  const [consultas, setConsultas] = useState<ConsultaRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ConsultaRow | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [savingPaciente, setSavingPaciente] = useState(false)
  const [pacienteDraft, setPacienteDraft] = useState({
    nome_social: '',
    data_nascimento: '',
    etnia: '',
    escolaridade: '',
    estado_civil: '',
    ocupacao: '',
    abo_rh: '' as '' | 'A_POS' | 'A_NEG' | 'B_POS' | 'B_NEG' | 'AB_POS' | 'AB_NEG' | 'O_POS' | 'O_NEG',
    altura: '',
    peso_pre_gestacional: '',
    is_particip_atvd_educativa: '' as '' | 'true' | 'false',
    telefone: '',
    email: '',
    localizacao: '',
  })

  const [savingGestacao, setSavingGestacao] = useState(false)

  const [novaGestOpen, setNovaGestOpen] = useState(false)
  const [novaGestDum, setNovaGestDum] = useState('')
  const [novaGestSemanas, setNovaGestSemanas] = useState('')
  const [novaGestBusy, setNovaGestBusy] = useState(false)
  const [novaGestErr, setNovaGestErr] = useState<string | null>(null)

  const [isEditing, setIsEditing] = useState(false)
  const [savingDer, setSavingDer] = useState(false)
  const derRef = useRef<DerModulosPersistHandle | null>(null)
  const [savingAntecedentes, setSavingAntecedentes] = useState(false)
  const [antecedentesDraft, setAntecedentesDraft] = useState({
    n_gestas_anteriores: '',
    n_partos: '',
    n_abortos: '',
    n_nascidos_vivos: '',
    n_vivem: '',
    n_mortos_primeira_semana: '',
    n_mortos_apos_primeira_semana: '',
    n_nascidos_mortos: '',
    n_cesarea: '',
    n_parto_normal: '',
    n_parto_prematuro: '',
    n_bebe_menos_dois_kilos_e_meio: '',
    n_bebe_mais_quatro_kilos_e_meio: '',
    is_gesta_ectopica: '' as '' | 'true' | 'false',
    is_gesta_molar: '' as '' | 'true' | 'false',
    is_hipertensao_familiar: '' as '' | 'true' | 'false',
    is_gravidez_gemelar_familiar: '' as '' | 'true' | 'false',
    is_diabetes_familiar: '' as '' | 'true' | 'false',
    is_fumo: '' as '' | 'true' | 'false',
    is_alcool: '' as '' | 'true' | 'false',
    is_drogas: '' as '' | 'true' | 'false',
    is_cardiopatia: '' as '' | 'true' | 'false',
    is_tromboembolismo: '' as '' | 'true' | 'false',
    is_infertilidade: '' as '' | 'true' | 'false',
    is_isoimunizacao_rh: '' as '' | 'true' | 'false',
    is_cirurgia_pelvica_uterina: '' as '' | 'true' | 'false',
    is_final_gestacao_anterior_1_ano: '' as '' | 'true' | 'false',
    is_sifilis: '' as '' | 'true' | 'false',
  })
  const [gestacaoDraft, setGestacaoDraft] = useState({
    dum: '',
    dpp: '',
    dpp_eco: '',
    ig_inicial: '',
    coombs: '',
    tipo_gravidez: '' as '' | 'unica' | 'gemelar' | 'tripla_ou_mais' | 'ignorada',
    idade_gestac_confirmada: '',
    is_planejada: '' as '' | 'true' | 'false',
    is_visita_maternidade: '' as '' | 'true' | 'false',
    is_ativa: '' as '' | 'true' | 'false',
    is_colocar_diu: '' as '' | 'true' | 'false',
    is_did_consulta_odontologica: '' as '' | 'true' | 'false',
    // Novos campos
    is_diabetes_gestacional: '' as '' | 'true' | 'false',
    is_infeccao_urinaria: '' as '' | 'true' | 'false',
    is_infertilidade: '' as '' | 'true' | 'false',
    is_dificuldade_alimentar: '' as '' | 'true' | 'false',
    is_cardiopatia: '' as '' | 'true' | 'false',
    is_tromboembolismo: '' as '' | 'true' | 'false',
    is_hipertensao_arterial: '' as '' | 'true' | 'false',
    is_cirurgia_elvica_uterina: '' as '' | 'true' | 'false',
    is_cirugia: '' as '' | 'true' | 'false',
    tratamento_sifilis_dose_1: '',
    tratamento_sifilis_dose_2: '',
    tratamento_sifilis_dose_3: '',
    suplementacao_ferro: '' as '' | 'true' | 'false',
    suplementacao_acido_folico: '' as '' | 'true' | 'false',
  })
  
  // Controle de estado do "Ver Mais" (accordion) das consultas
  const [expandedConsultas, setExpandedConsultas] = useState<Set<string>>(new Set())
  const [showMorePerfil, setShowMorePerfil] = useState(false)
  const [showMoreGestacao, setShowMoreGestacao] = useState(false)
  /** `<details>` de Antecedentes: ao editar, abrimos para os tri-states não ficarem “invisíveis”. */
  const [antecedentesDetailsOpen, setAntecedentesDetailsOpen] = useState(false)

  const validId = useMemo(() => (id && isUuid(id) ? id : null), [id])

  const selectedGestacao = useMemo(() => gestacoes.find((g) => g.id === selG) ?? null, [gestacoes, selG])
  const selectedGestacaoFull = useMemo(() => {
    const list = pacienteFull && Array.isArray((pacienteFull as any).gestacoes) ? ((pacienteFull as any).gestacoes as any[]) : []
    return list.find((g) => String(g.id) === selG) ?? null
  }, [pacienteFull, selG])

  const temGestacaoAtiva = useMemo(() => gestacoes.some((g) => g.is_ativa === true), [gestacoes])

  /** Apenas dígitos (campos Int no Prisma / contagens). */
  const digitsOnly = (raw: string) => raw.replace(/\D/g, '')

  const snapshotPacienteDraftFromFull = useCallback(() => {
    const pf = pacienteFull as any
    if (!pf) return
    setPacienteDraft({
      nome_social: typeof pf.nome_social === 'string' ? pf.nome_social : '',
      data_nascimento: formatApiDateOnlyPtBr(pf.data_nascimento),
      etnia: typeof pf.etnia === 'string' ? pf.etnia : '',
      escolaridade: typeof pf.escolaridade === 'string' ? pf.escolaridade : '',
      estado_civil: typeof pf.estado_civil === 'string' ? pf.estado_civil : '',
      ocupacao: typeof pf.ocupacao === 'string' ? pf.ocupacao : '',
      abo_rh: typeof pf.abo_rh === 'string' ? pf.abo_rh : '',
      altura: pf.altura != null ? String(pf.altura) : '',
      peso_pre_gestacional: pf.peso_pre_gestacional != null ? String(pf.peso_pre_gestacional) : '',
      is_particip_atvd_educativa:
        typeof pf.is_particip_atvd_educativa === 'boolean' ? (pf.is_particip_atvd_educativa ? 'true' : 'false') : '',
      telefone: typeof pf.telefone === 'string' ? pf.telefone : '',
      email: typeof pf.email === 'string' ? pf.email : '',
      localizacao: typeof pf.localizacao === 'string' ? pf.localizacao : '',
    })
  }, [pacienteFull])

  const snapshotGestacaoDraftFromFull = useCallback(() => {
    const list = pacienteFull && Array.isArray((pacienteFull as any).gestacoes) ? ((pacienteFull as any).gestacoes as any[]) : []
    const g = list.find((x) => String(x?.id) === selG) as any
    if (!g) return

    const toBoolStr = (v: unknown): '' | 'true' | 'false' =>
      typeof v === 'boolean' ? (v ? 'true' : 'false') : ''

    setGestacaoDraft({
      dum: formatApiDateOnlyPtBr(g.dum),
      dpp: formatApiDateOnlyPtBr(g.dpp),
      dpp_eco: formatApiDateOnlyPtBr(g.dpp_eco),
      ig_inicial: g.ig_inicial != null ? String(g.ig_inicial) : '',
      coombs: typeof g.coombs === 'string' ? g.coombs : '',
      tipo_gravidez:
        typeof g.tipo_gravidez === 'string'
          ? (g.tipo_gravidez === 'tripla ou mais' ? 'tripla_ou_mais' : g.tipo_gravidez)
          : '',
      idade_gestac_confirmada: g.idade_gestac_confirmada != null ? String(g.idade_gestac_confirmada) : '',
      is_planejada: toBoolStr(g.is_planejada),
      is_visita_maternidade: toBoolStr(g.is_visita_maternidade),
      is_ativa: toBoolStr(g.is_ativa),
      is_colocar_diu: toBoolStr(g.is_colocar_diu),
      is_did_consulta_odontologica: toBoolStr(g.is_did_consulta_odontologica),
      is_diabetes_gestacional: toBoolStr(g.is_diabetes_gestacional),
      is_infeccao_urinaria: toBoolStr(g.is_infeccao_urinaria),
      is_infertilidade: toBoolStr(g.is_infertilidade),
      is_dificuldade_alimentar: toBoolStr(g.is_dificuldade_alimentar),
      is_cardiopatia: toBoolStr(g.is_cardiopatia),
      is_tromboembolismo: toBoolStr(g.is_tromboembolismo),
      is_hipertensao_arterial: toBoolStr(g.is_hipertensao_arterial),
      is_cirurgia_elvica_uterina: toBoolStr(g.is_cirurgia_elvica_uterina),
      is_cirugia: toBoolStr(g.is_cirugia),
      tratamento_sifilis_dose_1: formatApiDateOnlyPtBr(g.tratamento_sifilis_dose_1),
      tratamento_sifilis_dose_2: formatApiDateOnlyPtBr(g.tratamento_sifilis_dose_2),
      tratamento_sifilis_dose_3: formatApiDateOnlyPtBr(g.tratamento_sifilis_dose_3),
      suplementacao_ferro: toBoolStr(g.suplementacao_ferro),
      suplementacao_acido_folico: toBoolStr(g.suplementacao_acido_folico),
    })
  }, [pacienteFull, selG])

  const snapshotAntecedentesDraftFromFull = useCallback(() => {
    const a = (selectedGestacaoFull as any)?.antecedentes
    if (!a) {
      setAntecedentesDraft({
        n_gestas_anteriores: '',
        n_partos: '',
        n_abortos: '',
        n_nascidos_vivos: '',
        n_vivem: '',
        n_mortos_primeira_semana: '',
        n_mortos_apos_primeira_semana: '',
        n_nascidos_mortos: '',
        n_cesarea: '',
        n_parto_normal: '',
        n_parto_prematuro: '',
        n_bebe_menos_dois_kilos_e_meio: '',
        n_bebe_mais_quatro_kilos_e_meio: '',
        is_gesta_ectopica: '',
        is_gesta_molar: '',
        is_hipertensao_familiar: '',
        is_gravidez_gemelar_familiar: '',
        is_diabetes_familiar: '',
        is_fumo: '',
        is_alcool: '',
        is_drogas: '',
        is_cardiopatia: '',
        is_tromboembolismo: '',
        is_infertilidade: '',
        is_isoimunizacao_rh: '',
        is_cirurgia_pelvica_uterina: '',
        is_final_gestacao_anterior_1_ano: '',
        is_sifilis: '',
      })
      return
    }

    const toIntStr = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : v == null ? '' : String(v))
    const toBoolStr = (v: unknown): '' | 'true' | 'false' => (typeof v === 'boolean' ? (v ? 'true' : 'false') : '')

    setAntecedentesDraft({
      n_gestas_anteriores: toIntStr(a.n_gestas_anteriores),
      n_partos: toIntStr(a.n_partos),
      n_abortos: toIntStr(a.n_abortos),
      n_nascidos_vivos: toIntStr(a.n_nascidos_vivos),
      n_vivem: toIntStr(a.n_vivem),
      n_mortos_primeira_semana: toIntStr(a.n_mortos_primeira_semana),
      n_mortos_apos_primeira_semana: toIntStr(a.n_mortos_apos_primeira_semana),
      n_nascidos_mortos: toIntStr(a.n_nascidos_mortos),
      n_cesarea: toIntStr(a.n_cesarea),
      n_parto_normal: toIntStr(a.n_parto_normal),
      n_parto_prematuro: toIntStr(a.n_parto_prematuro),
      n_bebe_menos_dois_kilos_e_meio: toIntStr(a.n_bebe_menos_dois_kilos_e_meio),
      n_bebe_mais_quatro_kilos_e_meio: toIntStr(a.n_bebe_mais_quatro_kilos_e_meio),
      is_gesta_ectopica: toBoolStr(a.is_gesta_ectopica),
      is_gesta_molar: toBoolStr(a.is_gesta_molar),
      is_hipertensao_familiar: toBoolStr(a.is_hipertensao_familiar),
      is_gravidez_gemelar_familiar: toBoolStr(a.is_gravidez_gemelar_familiar),
      is_diabetes_familiar: toBoolStr(a.is_diabetes_familiar),
      is_fumo: toBoolStr(a.is_fumo),
      is_alcool: toBoolStr(a.is_alcool),
      is_drogas: toBoolStr(a.is_drogas),
      is_cardiopatia: toBoolStr(a.is_cardiopatia),
      is_tromboembolismo: toBoolStr(a.is_tromboembolismo),
      is_infertilidade: toBoolStr(a.is_infertilidade),
      is_isoimunizacao_rh: toBoolStr(a.is_isoimunizacao_rh),
      is_cirurgia_pelvica_uterina: toBoolStr(a.is_cirurgia_pelvica_uterina),
      is_final_gestacao_anterior_1_ano: toBoolStr(a.is_final_gestacao_anterior_1_ano),
      is_sifilis: toBoolStr(a.is_sifilis),
    })
  }, [selectedGestacaoFull])

  const loadPaciente = useCallback(async () => {
    if (!validId) return
    setErr(null)
    try {
      const res = await authFetch(`/api/v1/pacientes/${validId}/full`)
      if (!res.ok) {
        setErr(`Paciente: HTTP ${res.status}`)
        setPaciente(null)
        setPacienteFull(null)
        return
      }
      const json = (await res.json()) as Record<string, unknown>
      setPacienteFull(json)
      setPaciente({
        id: String(json.id),
        nome_mascarado: String(json.nome_mascarado ?? ''),
        nome_social: typeof json.nome_social === 'string' ? json.nome_social : null,
        cpf_ultimos4: typeof json.cpf_ultimos4 === 'string' ? json.cpf_ultimos4 : null,
        cartao_sus_ultimos4: typeof json.cartao_sus_ultimos4 === 'string' ? json.cartao_sus_ultimos4 : null,
        data_nascimento: typeof (json as any).data_nascimento === 'string' ? ((json as any).data_nascimento as string) : null,
        idade: typeof (json as any).idade === 'number' ? ((json as any).idade as number) : null,
        etnia: typeof (json as any).etnia === 'string' ? ((json as any).etnia as string) : null,
        escolaridade: typeof (json as any).escolaridade === 'string' ? ((json as any).escolaridade as string) : null,
        estado_civil: typeof (json as any).estado_civil === 'string' ? ((json as any).estado_civil as string) : null,
        ocupacao: typeof (json as any).ocupacao === 'string' ? ((json as any).ocupacao as string) : null,
        telefone: typeof json.telefone === 'string' ? json.telefone : null,
        email: typeof json.email === 'string' ? json.email : null,
        localizacao: typeof json.localizacao === 'string' ? json.localizacao : null,
        abo_rh: typeof (json as any).abo_rh === 'string' ? ((json as any).abo_rh as string) : null,
        altura: typeof (json as any).altura === 'number' ? ((json as any).altura as number) : null,
        peso_pre_gestacional:
          typeof (json as any).peso_pre_gestacional === 'number' ? ((json as any).peso_pre_gestacional as number) : null,
        is_particip_atvd_educativa:
          typeof (json as any).is_particip_atvd_educativa === 'boolean' ? ((json as any).is_particip_atvd_educativa as boolean) : null,
      })
    } catch {
      setErr('Falha ao carregar paciente.')
    }
  }, [authFetch, validId])

  const loadUnidades = useCallback(async () => {
    try {
      const res = await authFetch('/api/v1/unidades')
      if (!res.ok) {
        setSelUnidade('')
        return
      }
      const json = (await res.json()) as UnidadeRow[]
      const list = Array.isArray(json) ? json : []
      setSelUnidade((prev) => prev || list[0]?.id || '')
    } catch {
      setSelUnidade('')
    }
  }, [authFetch])

  const loadConsultas = useCallback(
    async (gestacaoId: string) => {
      if (!gestacaoId) {
        setConsultas([])
        return
      }
      try {
        const res = await authFetch(`/api/v1/consultas?gestacao_id=${encodeURIComponent(gestacaoId)}`)
        if (!res.ok) {
          setConsultas([])
          return
        }
        const raw = (await res.json()) as Record<string, unknown>[]
        const mapped: ConsultaRow[] = (Array.isArray(raw) ? raw : []).map((c) => ({
          id: String(c.id),
          gestacao_id: String(c.gestacao_id),
          data: typeof c.data === 'string' ? c.data : String(c.data ?? ''),
          status: String(c.status ?? ''),
          validacao_medica: typeof c.validacao_medica === 'boolean' ? c.validacao_medica : undefined,
          idade_gestacional: typeof c.idade_gestacional === 'number' ? c.idade_gestacional : undefined,
          peso: typeof c.peso === 'number' ? c.peso : null,
          pa_sistolica: typeof c.pa_sistolica === 'number' ? c.pa_sistolica : null,
          pa_diastolica: typeof c.pa_diastolica === 'number' ? c.pa_diastolica : null,
          au: typeof c.au === 'number' ? c.au : null,
          bfc: typeof c.bfc === 'number' ? c.bfc : null,
          is_edema: typeof c.is_edema === 'boolean' ? c.is_edema : undefined,
          mov_fetal: typeof c.mov_fetal === 'string' ? c.mov_fetal : null,
          apresentacao_fetal: typeof c.apresentacao_fetal === 'string' ? c.apresentacao_fetal : null,
          queixa: typeof c.queixa === 'string' ? c.queixa : null,
          conduta: typeof (c as any).conduta === 'string' ? (c as any).conduta : null,
          is_exantema: typeof (c as any).is_exantema === 'boolean' ? (c as any).is_exantema : undefined,
          ia:
            c &&
            typeof (c as any).ia === 'object' &&
            (c as any).ia &&
            typeof (c as any).ia.sugestao_conduta === 'string'
              ? { sugestao_conduta: (c as any).ia.sugestao_conduta }
              : null,
        }))
        setConsultas(mapped)
      } catch {
        setConsultas([])
      }
    },
    [authFetch],
  )

  const createConsulta = useCallback(async () => {
    if (!selG) return
    // limite: até 14 consultas por gestação (42 semanas)
    if (consultas.length >= 14) return
    setErr(null)
    try {
      if (!selUnidade) {
        setErr('Selecione uma unidade para criar a consulta.')
        return
      }
      const res = await authFetch('/api/v1/consultas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gestacao_id: selG,
          unidade_id: selUnidade,
          data: new Date().toISOString(),
        }),
      })
      if (!res.ok) {
        setErr(`Criar consulta: HTTP ${res.status}`)
        return
      }
      await loadConsultas(selG)
    } catch {
      setErr('Falha ao criar consulta.')
    }
  }, [authFetch, consultas.length, loadConsultas, selG, selUnidade])

  const criarNovaGestacao = useCallback(async () => {
    if (!validId) return
    setNovaGestBusy(true)
    setNovaGestErr(null)
    const body: Record<string, unknown> = { paciente_id: validId }
    if (novaGestDum.trim() && /^\d{4}-\d{2}-\d{2}$/.test(novaGestDum.trim())) {
      body.dum = novaGestDum.trim()
    }
    const sem = novaGestSemanas.trim() ? Number.parseInt(novaGestSemanas.trim(), 10) : NaN
    if (Number.isFinite(sem) && sem >= 0 && sem <= 45) {
      body.idade_gestac_confirmada = sem
    }
    try {
      const res = await authFetch('/api/v1/gestacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = (await res.json()) as { id?: string; message?: string }
      if (!res.ok) {
        setNovaGestErr(typeof j.message === 'string' ? j.message : `Não foi possível registrar (${res.status}).`)
        return
      }
      const newId = typeof j.id === 'string' ? j.id : ''
      await loadPaciente()
      if (newId) setSelG(newId)
      setNovaGestOpen(false)
      setNovaGestDum('')
      setNovaGestSemanas('')
    } catch {
      setNovaGestErr('Falha de rede ao registrar nova gravidez.')
    } finally {
      setNovaGestBusy(false)
    }
  }, [authFetch, loadPaciente, novaGestDum, novaGestSemanas, validId])

  useEffect(() => {
    void loadPaciente()
    void loadUnidades()
  }, [loadPaciente, loadUnidades])

  /** Deriva `gestacoes` de `pacienteFull` (evita loop: `loadGestacoes` não pode depender de `pacienteFull` e estar no mesmo efeito que `loadPaciente`). */
  useEffect(() => {
    if (!validId) return
    if (!pacienteFull || !Array.isArray((pacienteFull as any).gestacoes)) {
      setGestacoes([])
      return
    }
    const fullId = String((pacienteFull as any).id ?? '')
    if (fullId !== validId) {
      setGestacoes([])
      return
    }
    const list: GestacaoRow[] = ((pacienteFull as any).gestacoes as any[]).map((g) => ({
      id: String(g.id),
      paciente_id: String(g.paciente_id),
      tipo_risco: typeof g.tipo_risco === 'string' ? g.tipo_risco : String(g.tipo_risco ?? ''),
      dum: typeof g.dum === 'string' ? g.dum : null,
      dpp: typeof g.dpp === 'string' ? g.dpp : null,
      dpp_eco: typeof g.dpp_eco === 'string' ? g.dpp_eco : null,
      ig_inicial: typeof g.ig_inicial === 'number' ? g.ig_inicial : null,
      idade_gestac_confirmada: typeof g.idade_gestac_confirmada === 'number' ? g.idade_gestac_confirmada : null,
      coombs: typeof g.coombs === 'string' ? g.coombs : null,
      tipo_gravidez: typeof g.tipo_gravidez === 'string' ? g.tipo_gravidez : null,
      is_planejada: typeof g.is_planejada === 'boolean' ? g.is_planejada : null,
      is_visita_maternidade: typeof g.is_visita_maternidade === 'boolean' ? g.is_visita_maternidade : null,
      is_ativa: typeof g.is_ativa === 'boolean' ? g.is_ativa : null,
      is_colocar_diu: typeof g.is_colocar_diu === 'boolean' ? g.is_colocar_diu : null,
      is_did_consulta_odontologica:
        typeof g.is_did_consulta_odontologica === 'boolean' ? g.is_did_consulta_odontologica : null,
      concluida_em: typeof g.concluida_em === 'string' ? g.concluida_em : null,
    }))
    setGestacoes(list)
    setSelG((prev) => prev || list[0]?.id || '')
  }, [pacienteFull, validId])

  useEffect(() => {
    if (selG) void loadConsultas(selG)
    else setConsultas([])
  }, [selG, loadConsultas])

  useEffect(() => {
    if (isEditing) return
    snapshotPacienteDraftFromFull()
  }, [isEditing, snapshotPacienteDraftFromFull])

  useEffect(() => {
    if (isEditing) return
    snapshotGestacaoDraftFromFull()
  }, [isEditing, snapshotGestacaoDraftFromFull])

  useEffect(() => {
    if (isEditing) return
    snapshotAntecedentesDraftFromFull()
  }, [isEditing, snapshotAntecedentesDraftFromFull])

  const { prepareEnterEdit } = useProntuarioDrafts(
    snapshotPacienteDraftFromFull,
    snapshotGestacaoDraftFromFull,
    snapshotAntecedentesDraftFromFull,
    setShowMorePerfil,
    setShowMoreGestacao,
    setAntecedentesDetailsOpen,
  )

  const fmtDateOnly = (v: unknown): string => {
    const s = formatApiDateOnlyPtBr(v)
    return s || '—'
  }
  const fmtBool = (v: unknown): string => (v === true ? 'Sim' : v === false ? 'Não' : '—')
  const fmtDateTime = (v: unknown): string => {
    if (typeof v !== 'string' || !v) return '—'
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  }

  const dumBaseDate = useMemo(() => {
    if (isEditing) return parsePtBrDateOnlyToLocalDate(gestacaoDraft.dum)
    return parseApiDateOnlyToLocalDate(selectedGestacao?.dum ?? null)
  }, [gestacaoDraft.dum, isEditing, selectedGestacao?.dum])

  const dppEcoBaseDate = useMemo(() => {
    if (isEditing) return parsePtBrDateOnlyToLocalDate(gestacaoDraft.dpp_eco)
    return parseApiDateOnlyToLocalDate(selectedGestacao?.dpp_eco ?? null)
  }, [gestacaoDraft.dpp_eco, isEditing, selectedGestacao?.dpp_eco])

  const primaryDppDate = useMemo(
    () => primaryDppFromDumAndEco(dumBaseDate, dppEcoBaseDate),
    [dumBaseDate, dppEcoBaseDate],
  )

  const naegeleDppDate = useMemo(
    () => (dumBaseDate ? addCalendarDaysLocal(dumBaseDate, NAEGELE_DAYS) : null),
    [dumBaseDate],
  )

  const primaryDppBr = useMemo(() => formatLocalDatePtBr(primaryDppDate) || '—', [primaryDppDate])

  const impliedDumIg = useMemo(() => impliedDumForIg(dumBaseDate, dppEcoBaseDate), [dumBaseDate, dppEcoBaseDate])

  const igAtualAuto = useMemo(() => calcIgAtualFromDum(impliedDumIg), [impliedDumIg])

  useEffect(() => {
    if (!isEditing) return
    const next = primaryDppDate ? formatLocalDatePtBr(primaryDppDate) : ''
    setGestacaoDraft((p) => (p.dpp === next ? p : { ...p, dpp: next }))
  }, [primaryDppDate, isEditing])

  const calcIdadeEmAnos = (isoDateOnlyOrIso: string): number | null => {
    const d = new Date(isoDateOnlyOrIso)
    if (Number.isNaN(d.getTime())) return null
    const now = new Date()
    const y = now.getFullYear() - d.getFullYear()
    const m = now.getMonth() - d.getMonth()
    const day = now.getDate() - d.getDate()
    const hadBirthday = m > 0 || (m === 0 && day >= 0)
    return Math.max(0, hadBirthday ? y : y - 1)
  }

  const hasSifilisExamePositivo = useMemo(() => {
    const exames = (pacienteFull as any)?.exames
    if (!Array.isArray(exames)) return false

    return exames.some((e: any) => {
      const tipo = String(e?.tipo ?? '').toUpperCase()
      if (tipo !== 'SIFILIS' && tipo !== 'VDRL') return false

      if (e?.is_alterado === true) return true

      const valor = typeof e?.valor === 'string' ? e.valor : ''
      return /positiv/i.test(valor)
    })
  }, [pacienteFull])

  const toggleConsulta = (cid: string) => {
    setExpandedConsultas(prev => {
      const next = new Set(prev)
      if (next.has(cid)) next.delete(cid)
      else next.add(cid)
      return next
    })
  }

  const isConsultaEmpty = (c: ConsultaRow): boolean => {
    const hasVitals =
      c.idade_gestacional != null ||
      c.peso != null ||
      c.pa_sistolica != null ||
      c.pa_diastolica != null ||
      c.au != null ||
      c.bfc != null
    const hasFlags = Boolean(c.is_edema) || Boolean(c.is_exantema)
    const hasText =
      (c.mov_fetal ?? '').trim() !== '' ||
      (c.apresentacao_fetal ?? '').trim() !== '' ||
      (c.queixa ?? '').trim() !== '' ||
      (c.conduta ?? '').trim() !== '' ||
      ((c.ia?.sugestao_conduta ?? '').trim() !== '')
    const hasWorkflow = Boolean(c.validacao_medica) || (c.status ?? '') !== 'RASCUNHO'
    return !hasVitals && !hasFlags && !hasText && !hasWorkflow
  }

  const deleteConsulta = useCallback(
    async (consultaId: string) => {
      if (!selG) return
      setErr(null)
      try {
        const res = await authFetch(`/api/v1/consultas/${consultaId}`, { method: 'DELETE' })
        if (!res.ok) {
          setErr(`Apagar consulta: HTTP ${res.status}`)
          return
        }
        await loadConsultas(selG)
      } catch {
        setErr('Falha ao apagar consulta.')
      }
    },
    [authFetch, loadConsultas, selG],
  )

  // Ordena a timeline cronologicamente (crescente)
  const cronologico = useMemo(() => {
    return [...consultas].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
  }, [consultas])

  const patchPaciente = useCallback(async (): Promise<boolean> => {
    if (!validId) return true
    const pf = pacienteFull as any
    if (!pf) return false

    const payload: Record<string, unknown> = {}
    const setIfChanged = (key: keyof typeof pacienteDraft, current: unknown) => {
      const v = pacienteDraft[key]
      if (typeof v !== 'string') return
      const next = v.trim()
      const cur = current == null ? '' : String(current).trim()
      if (next === cur) return
      payload[key] = next === '' ? null : next
    }
    const setNumberIfChanged = (key: 'altura' | 'peso_pre_gestacional', current: unknown) => {
      const v = pacienteDraft[key]
      const cur = typeof current === 'number' ? current : current == null ? null : Number.parseFloat(String(current))
      const next = v.trim() === '' ? null : Number.parseFloat(v)
      if (v.trim() !== '' && !Number.isFinite(next)) return
      if ((cur ?? null) === (Number.isFinite(next) ? next : null)) return
      payload[key] = Number.isFinite(next) ? next : null
    }

    const parseBrDate = (v: string): string | null => {
      const parts = v.split('/')
      if (parts.length !== 3) return null
      const d = parts[0].padStart(2, '0')
      const m = parts[1].padStart(2, '0')
      const y = parts[2]
      if (y.length !== 4) return null
      return `${y}-${m}-${d}`
    }

    setIfChanged('nome_social', pf.nome_social)
    const nextNasc = parseBrDate(pacienteDraft.data_nascimento)
    const curNasc = pf.data_nascimento ? String(pf.data_nascimento).slice(0, 10) : ''
    if (nextNasc !== null && nextNasc !== curNasc) {
      payload.data_nascimento = nextNasc
    }
    setIfChanged('etnia', pf.etnia)
    setIfChanged('escolaridade', pf.escolaridade)
    setIfChanged('estado_civil', pf.estado_civil)
    setIfChanged('ocupacao', pf.ocupacao)
    if ((pacienteDraft.abo_rh || '') !== (pf.abo_rh ?? '')) payload.abo_rh = pacienteDraft.abo_rh || null
    setNumberIfChanged('altura', pf.altura)
    setNumberIfChanged('peso_pre_gestacional', pf.peso_pre_gestacional)
    {
      const d = pacienteDraft.is_particip_atvd_educativa
      const cur = pf.is_particip_atvd_educativa
      if (d === 'true' || d === 'false') {
        const next = d === 'true'
        if (cur !== next) payload.is_particip_atvd_educativa = next
      }
    }
    setIfChanged('telefone', pf.telefone)
    setIfChanged('email', pf.email)
    setIfChanged('localizacao', pf.localizacao)

    if (Object.keys(payload).length === 0) return true

    setSavingPaciente(true)
    setErr(null)
    try {
      const res = await authFetch(`/api/v1/pacientes/${validId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        setErr(`Atualizar paciente: HTTP ${res.status}`)
        return false
      }
      return true
    } catch {
      setErr('Falha ao atualizar paciente.')
      return false
    } finally {
      setSavingPaciente(false)
    }
  }, [authFetch, pacienteDraft, pacienteFull, validId])

  const patchGestacao = useCallback(async (): Promise<boolean> => {
    if (!selG) return true
    if (!selectedGestacaoFull) return false

    const current = selectedGestacaoFull as any
    const payload: Record<string, unknown> = {}

    const parseBrDate = (v: string): string | null => {
      const parts = v.split('/')
      if (parts.length !== 3) return null
      const d = parts[0].padStart(2, '0')
      const m = parts[1].padStart(2, '0')
      const y = parts[2]
      if (y.length !== 4) return null
      return `${y}-${m}-${d}`
    }

    const setDate = (
      key: 'dum' | 'dpp_eco' | 'tratamento_sifilis_dose_1' | 'tratamento_sifilis_dose_2' | 'tratamento_sifilis_dose_3',
      opts?: { allowNull?: boolean },
    ) => {
      const raw = (gestacaoDraft[key] || '').trim()
      const cur = current[key] ? String(current[key]).slice(0, 10) : ''
      if (raw === '') {
        if (opts?.allowNull && cur !== '') payload[key] = null
        return
      }
      const next = parseBrDate(raw)
      if (next === null) return
      if (next === cur) return
      payload[key] = next
    }
    const setInt = (key: 'ig_inicial' | 'idade_gestac_confirmada') => {
      const raw = (gestacaoDraft[key] || '').trim()
      const next = raw === '' ? null : Number.parseInt(raw, 10)
      if (raw !== '' && (!Number.isFinite(next) || Number.isNaN(next))) return
      const cur = typeof current[key] === 'number' ? current[key] : current[key] == null ? null : Number.parseInt(String(current[key]), 10)
      if ((cur ?? null) === (Number.isFinite(next) ? next : null)) return
      payload[key] = Number.isFinite(next) ? next : null
    }
    const setBool = (
      key:
        | 'is_planejada'
        | 'is_visita_maternidade'
        | 'is_ativa'
        | 'is_colocar_diu'
        | 'is_did_consulta_odontologica'
        | 'is_diabetes_gestacional'
        | 'is_infeccao_urinaria'
        | 'is_infertilidade'
        | 'is_dificuldade_alimentar'
        | 'is_cardiopatia'
        | 'is_tromboembolismo'
        | 'is_hipertensao_arterial'
        | 'is_cirurgia_elvica_uterina'
        | 'is_cirugia'
        | 'suplementacao_ferro'
        | 'suplementacao_acido_folico',
    ) => {
      const raw = gestacaoDraft[key]
      if (raw !== 'true' && raw !== 'false') return
      const next = raw === 'true'
      if (typeof current[key] === 'boolean' && current[key] === next) return
      payload[key] = next
    }

    setDate('dum')
    setDate('dpp_eco')
    setDate('tratamento_sifilis_dose_1', { allowNull: true })
    setDate('tratamento_sifilis_dose_2', { allowNull: true })
    setDate('tratamento_sifilis_dose_3', { allowNull: true })

    // DPP de referência: DPP-Eco se informada; senão Naegele (DUM + 280 dias).
    const dumDate = parsePtBrDateOnlyToLocalDate((gestacaoDraft.dum || '').trim())
    const ecoDate = parsePtBrDateOnlyToLocalDate((gestacaoDraft.dpp_eco || '').trim())
    const primaryDate = primaryDppFromDumAndEco(dumDate, ecoDate)
    const curDpp = current.dpp ? String(current.dpp).slice(0, 10) : ''
    if (primaryDate) {
      const dppIso = toIsoDateOnlyLocal(primaryDate)
      if (dppIso !== curDpp) payload.dpp = dppIso
    }
    setInt('ig_inicial')
    setInt('idade_gestac_confirmada')
    if ((gestacaoDraft.coombs || '').trim() !== (current.coombs ?? '')) payload.coombs = gestacaoDraft.coombs.trim() || null

    const tipoGravidezCur = (current.tipo_gravidez ?? '').toString()
    const tipoGravidezNext =
      gestacaoDraft.tipo_gravidez === 'tripla_ou_mais' ? 'tripla ou mais' : gestacaoDraft.tipo_gravidez
    if (gestacaoDraft.tipo_gravidez && tipoGravidezNext !== tipoGravidezCur) payload.tipo_gravidez = tipoGravidezNext

    setBool('is_planejada')
    setBool('is_visita_maternidade')
    setBool('is_ativa')
    setBool('is_colocar_diu')
    setBool('is_did_consulta_odontologica')
    setBool('is_diabetes_gestacional')
    setBool('is_infeccao_urinaria')
    setBool('is_infertilidade')
    setBool('is_dificuldade_alimentar')
    setBool('is_cardiopatia')
    setBool('is_tromboembolismo')
    setBool('is_hipertensao_arterial')
    setBool('is_cirurgia_elvica_uterina')
    setBool('is_cirugia')
    setBool('suplementacao_ferro')
    setBool('suplementacao_acido_folico')

    if (Object.keys(payload).length === 0) return true

    setSavingGestacao(true)
    setErr(null)
    try {
      const res = await authFetch(`/api/v1/gestacoes/${selG}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        setErr(`Atualizar gestação: HTTP ${res.status}`)
        return false
      }
      return true
    } catch {
      setErr('Falha ao atualizar gestação.')
      return false
    } finally {
      setSavingGestacao(false)
    }
  }, [authFetch, gestacaoDraft, selG, selectedGestacaoFull])

  const patchAntecedentes = useCallback(async (): Promise<boolean> => {
    if (!selG) return true

    const current = (selectedGestacaoFull as any)?.antecedentes ?? {}
    const payload: Record<string, unknown> = {}

    const setInt = (key: keyof typeof antecedentesDraft) => {
      const raw = (antecedentesDraft as any)[key]
      if (typeof raw !== 'string') return
      const t = raw.trim()
      if (t === '') {
        if (current[key] != null) payload[key as string] = null
        return
      }
      const n = Number.parseInt(t, 10)
      if (!Number.isFinite(n) || Number.isNaN(n)) return
      if (typeof current[key] === 'number' && current[key] === n) return
      payload[key as string] = n
    }

    const setBool = (key: keyof typeof antecedentesDraft) => {
      const raw = (antecedentesDraft as any)[key] as '' | 'true' | 'false'
      if (raw !== 'true' && raw !== 'false') return
      const next = raw === 'true'
      if (typeof current[key] === 'boolean' && current[key] === next) return
      payload[key as string] = next
    }

    ;[
      'n_gestas_anteriores',
      'n_partos',
      'n_abortos',
      'n_nascidos_vivos',
      'n_vivem',
      'n_mortos_primeira_semana',
      'n_mortos_apos_primeira_semana',
      'n_nascidos_mortos',
      'n_cesarea',
      'n_parto_normal',
      'n_parto_prematuro',
      'n_bebe_menos_dois_kilos_e_meio',
      'n_bebe_mais_quatro_kilos_e_meio',
    ].forEach((k) => setInt(k as any))

    ;[
      'is_gesta_ectopica',
      'is_gesta_molar',
      'is_hipertensao_familiar',
      'is_gravidez_gemelar_familiar',
      'is_diabetes_familiar',
      'is_fumo',
      'is_alcool',
      'is_drogas',
      'is_cardiopatia',
      'is_tromboembolismo',
      'is_infertilidade',
      'is_isoimunizacao_rh',
      'is_cirurgia_pelvica_uterina',
      'is_final_gestacao_anterior_1_ano',
      'is_sifilis',
    ].forEach((k) => setBool(k as any))

    if (Object.keys(payload).length === 0) return true

    setSavingAntecedentes(true)
    setErr(null)
    try {
      const res = await authFetch(`/api/v1/gestacoes/${selG}/antecedentes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        setErr(`Atualizar antecedentes: HTTP ${res.status}`)
        return false
      }
      return true
    } catch {
      setErr('Falha ao atualizar antecedentes.')
      return false
    } finally {
      setSavingAntecedentes(false)
    }
  }, [antecedentesDraft, authFetch, selG, selectedGestacaoFull])

  const savePerfis = useCallback(async () => {
    const okP = await patchPaciente()
    if (!okP) return
    const okG = selG ? await patchGestacao() : true
    if (!okG) return
    const okA = selG ? await patchAntecedentes() : true
    if (!okA) return
    setSavingDer(true)
    setErr(null)
    try {
      await derRef.current?.persist()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao salvar modulos do prontuario (DER).')
      return
    } finally {
      setSavingDer(false)
    }
    await loadPaciente()
    setIsEditing(false)
  }, [loadPaciente, patchAntecedentes, patchGestacao, patchPaciente, selG])

  if (!validId) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900 m-8">
        <p className="font-bold">Identificador de paciente inválido no painel principal.</p>
        <Link to="/pacientes" className="mt-3 inline-block font-bold py-2 px-4 bg-white rounded-xl shadow-sm border border-red-200">
          Voltar à lista
        </Link>
      </div>
    )
  }

  return (
    <div className="flex relative items-start">
      {/* Container Principal */}
      <div className="relative flex-1 w-full min-w-0 lg:pr-[calc(var(--livia-aside-width)+1.5rem)]">
        <div className="space-y-8 max-w-7xl mx-auto px-4 lg:max-w-none lg:mx-0 lg:px-6 py-8">
          
          {/* Cabeçalho */}
          <div className="flex items-center gap-4">
            <Link to="/pacientes" className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm border border-slate-200 text-slate-500 hover:text-brand-pink hover:border-brand-pink transition-colors">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>

            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!isEditing) {
                    prepareEnterEdit()
                  }
                  setIsEditing((v) => !v)
                }}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-black transition-all ${
                  isEditing
                    ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-sm'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-brand-pink hover:text-brand-pink'
                }`}
              >
                {isEditing ? (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Cancelar
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H11v-.828l8.586-8.586z"
                      />
                    </svg>
                    Editar prontuário
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => void savePerfis()}
                disabled={savingPaciente || savingGestacao || savingAntecedentes || savingDer || !isEditing}
                className="rounded-xl bg-brand-pink px-4 py-2 text-[11px] font-black text-white shadow-sm hover:bg-[#e88d94] disabled:opacity-50"
              >
                {savingPaciente || savingGestacao || savingAntecedentes || savingDer ? 'Salvando...' : 'Salvar dados'}
              </button>
            </div>
          </div>

          {err ? <p className="text-sm rounded-xl p-4 bg-red-50 text-red-700 font-bold border border-red-100">{err}</p> : null}

          {/* Cartão de Identidade Maior (Unified Identity Card) */}
          <section className="rounded-3xl border border-brand-pink/20 bg-white p-8 shadow-sm flex flex-col md:flex-row gap-8 items-start justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-brand-pink rounded-full blur-[80px] opacity-15"></div>
            <div className="flex items-start gap-6 relative z-10 w-full">
               <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-brand-pink text-white text-3xl font-black border border-white shadow-sm">
                 {paciente?.nome_mascarado?.charAt(0) ?? 'P'}
               </div>
               <div className="space-y-1 w-full min-w-0">
                 <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                   <h2 className="text-2xl font-black text-brand-navy">
                     {paciente?.nome_mascarado ?? '—'}
                     {(() => {
                       const idade =
                         typeof paciente?.idade === 'number'
                           ? paciente.idade
                           : paciente?.data_nascimento
                             ? calcIdadeEmAnos(paciente.data_nascimento)
                             : null
                       return idade != null ? <span className="text-slate-500 font-black">{`, ${idade} anos`}</span> : null
                     })()}
                   </h2>
                  {isEditing ? (
                    <input
                      value={pacienteDraft.nome_social}
                      onChange={(e) => setPacienteDraft((p) => ({ ...p, nome_social: e.target.value }))}
                      placeholder="Nome social"
                      className="w-56 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm focus:ring-2 focus:ring-brand-pink/30 focus:border-brand-pink/50"
                    />
                  ) : paciente?.nome_social ? (
                    <span className="inline-flex items-center rounded-lg bg-slate-100 border border-slate-200 px-3 py-1 text-[11px] font-bold text-slate-600">
                      Social: {paciente.nome_social}
                    </span>
                  ) : null}

                  <span
                    className={`sm:ml-auto inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                      (!selectedGestacao?.tipo_risco || String(selectedGestacao.tipo_risco).toUpperCase() === 'HABITUAL')
                        ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
                        : String(selectedGestacao?.tipo_risco ?? '').toUpperCase() === 'ALTO'
                          ? 'border-red-300 bg-red-100 text-red-800'
                          : 'border-rose-200 bg-rose-100 text-rose-800'
                    }`}
                    title="Risco gestacional"
                  >
                    {(selectedGestacao?.tipo_risco ?? 'HABITUAL').toString().replace('_', ' ')}
                  </span>
                 </div>
                 
                 <div className="flex flex-col sm:flex-row gap-3 sm:gap-8 mt-4">
                   <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">CPF (últimos 4)</span>
                      <span className="text-sm font-black text-slate-700 tracking-wider mt-0.5">{paciente?.cpf_ultimos4 ?? '—'}</span>
                   </div>
                   <div className="hidden sm:block w-px h-8 bg-slate-200 my-auto"></div>
                   <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Cartão SUS (últimos 4)</span>
                      <span className="text-sm font-black text-slate-700 tracking-wider mt-0.5">{paciente?.cartao_sus_ultimos4 ?? '—'}</span>
                   </div>
                 </div>

                 <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-slate-600">
                  {!isEditing && paciente?.telefone ? (
                     <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5">Tel: {paciente.telefone}</span>
                  ) : isEditing ? (
                     <input
                       value={pacienteDraft.telefone}
                       onChange={(e) => setPacienteDraft((p) => ({ ...p, telefone: e.target.value }))}
                       placeholder="Telefone"
                       className="w-44 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm focus:ring-2 focus:ring-brand-pink/30 focus:border-brand-pink/50"
                     />
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5">Tel: —</span>
                   )}
                  {!isEditing && paciente?.email ? (
                     <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5">E-mail: {paciente.email}</span>
                  ) : isEditing ? (
                     <input
                       value={pacienteDraft.email}
                       onChange={(e) => setPacienteDraft((p) => ({ ...p, email: e.target.value }))}
                       placeholder="E-mail"
                       className="w-52 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm focus:ring-2 focus:ring-brand-pink/30 focus:border-brand-pink/50"
                     />
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5">E-mail: —</span>
                   )}
                  {!isEditing && paciente?.localizacao ? (
                     <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5">Localização: {paciente.localizacao}</span>
                  ) : isEditing ? (
                     <input
                       value={pacienteDraft.localizacao}
                       onChange={(e) => setPacienteDraft((p) => ({ ...p, localizacao: e.target.value }))}
                       placeholder="Localização"
                       className="w-60 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm focus:ring-2 focus:ring-brand-pink/30 focus:border-brand-pink/50"
                     />
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5">Localização: —</span>
                   )}
                  {selG ? (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5"
                      title="Data provável do parto (referência principal: ultrassom se houver; senão Naegele pela DUM)"
                    >
                      DPP: {primaryDppBr}
                      {dppEcoBaseDate ? ' · USG' : dumBaseDate ? ' · Naegele' : ''}
                    </span>
                  ) : null}
                 </div>

                {/* Acompanhamento da gravidez (histórico + atual) */}
                <div className="mt-5">
                  <div className="flex flex-wrap items-end justify-between gap-2 mb-2">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Acompanhamento da gravidez</div>
                    <button
                      type="button"
                      disabled={temGestacaoAtiva}
                      title={
                        temGestacaoAtiva
                          ? 'So e possivel uma gravidez em acompanhamento por vez. Desative a gestacao atual (campo Ativa) antes de registrar outra.'
                          : undefined
                      }
                      onClick={() => {
                        if (temGestacaoAtiva) return
                        setNovaGestErr(null)
                        setNovaGestDum('')
                        setNovaGestSemanas('')
                        setNovaGestOpen(true)
                      }}
                      className="rounded-lg border border-brand-pink/40 bg-brand-pink/10 px-3 py-1.5 text-[11px] font-black text-brand-navy hover:bg-brand-pink/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Registrar nova gravidez
                    </button>
                  </div>
                  <select
                    value={selG}
                    onChange={(e) => setSelG(e.target.value)}
                    className="block w-full max-w-md rounded-xl border-slate-200 bg-slate-50 py-2.5 pl-4 pr-10 text-slate-900 focus:ring-2 focus:ring-brand-pink focus:border-brand-pink font-bold text-sm shadow-sm transition-colors"
                  >
                    {gestacoes.length === 0 ? <option value="">(Nenhum acompanhamento cadastrado)</option> : null}
                    {gestacoes.map((g, idx) => (
                      <option key={g.id} value={g.id}>
                        {`Gravidez ${idx + 1} (${g.dum ? `DUM ${fmtDateOnly(g.dum)}` : 'sem data da última menstruação'})`}
                      </option>
                    ))}
                  </select>
                  {novaGestOpen ? (
                    <div
                      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="nova-gravidez-titulo"
                    >
                      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
                        <h3 id="nova-gravidez-titulo" className="text-lg font-black text-brand-navy">
                          Nova gravidez neste prontuário
                        </h3>
                        <p className="mt-2 text-xs text-slate-600">
                          So pode haver uma gravidez em acompanhamento por paciente. Opcional: preencha DUM e semanas agora ou depois no
                          prontuario.
                        </p>
                        <div className="mt-4 space-y-3">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600">Data da última menstruação (opcional)</label>
                            <input
                              type="date"
                              value={novaGestDum}
                              onChange={(e) => setNovaGestDum(e.target.value)}
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold shadow-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600">Idade gestacional em semanas hoje (opcional)</label>
                            <input
                              value={novaGestSemanas}
                              onChange={(e) => setNovaGestSemanas(e.target.value.replace(/\D/g, ''))}
                              inputMode="numeric"
                              placeholder="Ex.: 8"
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold shadow-sm"
                            />
                          </div>
                        </div>
                        {novaGestErr ? <p className="mt-3 text-sm font-medium text-rose-700">{novaGestErr}</p> : null}
                        <div className="mt-6 flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            disabled={novaGestBusy}
                            onClick={() => setNovaGestOpen(false)}
                            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            disabled={novaGestBusy}
                            onClick={() => void criarNovaGestacao()}
                            className="rounded-xl bg-brand-navy px-4 py-2 text-sm font-bold text-white hover:opacity-95 disabled:opacity-50"
                          >
                            {novaGestBusy ? 'Salvando…' : 'Confirmar'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
               </div>
            </div>

          </section>

          {/* Mapeamento DER: Perfil + módulos da gestação */}
          <section className="space-y-6 mt-8">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Perfil</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowMorePerfil((v) => !v)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 shadow-sm hover:border-brand-pink/40"
                  >
                    {showMorePerfil ? 'Ocultar' : 'Ver mais'}
                  </button>
                </div>
              </div>
              {showMorePerfil ? (
                <dl className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Data nascimento</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <input
                          placeholder="DD/MM/YYYY"
                          value={pacienteDraft.data_nascimento}
                          onChange={(e) => setPacienteDraft((p) => ({ ...p, data_nascimento: e.target.value }))}
                          className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-brand-pink/30 focus:border-brand-pink/50"
                        />
                      ) : (
                        <span className="text-sm font-black text-brand-navy">
                          {paciente?.data_nascimento ? new Date(paciente.data_nascimento).toLocaleDateString('pt-BR') : '—'}
                        </span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Etnia</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <select
                          value={pacienteDraft.etnia}
                          onChange={(e) => setPacienteDraft((p) => ({ ...p, etnia: e.target.value as any }))}
                          className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-brand-pink/30 focus:border-brand-pink/50"
                        >
                          <option value="">Selecionar</option>
                          <option value="BRANCA">Branca</option>
                          <option value="PRETA">Preta</option>
                          <option value="PARDA">Parda</option>
                          <option value="AMARELA">Amarela</option>
                          <option value="INDIGENA">Indígena</option>
                        </select>
                      ) : (
                        <span className="text-sm font-black text-brand-navy">{paciente?.etnia ?? '—'}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Escolaridade</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <select
                          value={pacienteDraft.escolaridade}
                          onChange={(e) => setPacienteDraft((p) => ({ ...p, escolaridade: e.target.value as any }))}
                          className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-brand-pink/30 focus:border-brand-pink/50"
                        >
                          <option value="">Selecionar</option>
                          <option value="ANALFABETO">Analfabeto</option>
                          <option value="FUNDAMENTAL_INCOMPLETO">Fundamental Incompleto</option>
                          <option value="FUNDAMENTAL_COMPLETO">Fundamental Completo</option>
                          <option value="MEDIO_INCOMPLETO">Médio Incompleto</option>
                          <option value="MEDIO_COMPLETO">Médio Completo</option>
                          <option value="SUPERIOR_INCOMPLETO">Superior Incompleto</option>
                          <option value="SUPERIOR_COMPLETO">Superior Completo</option>
                        </select>
                      ) : (
                        <span className="text-sm font-black text-brand-navy">{paciente?.escolaridade?.replace('_', ' ') ?? '—'}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Estado civil</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <select
                          value={pacienteDraft.estado_civil}
                          onChange={(e) => setPacienteDraft((p) => ({ ...p, estado_civil: e.target.value as any }))}
                          className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-brand-pink/30 focus:border-brand-pink/50"
                        >
                          <option value="">Selecionar</option>
                          <option value="SOLTEIRA">Solteira</option>
                          <option value="CASADA">Casada</option>
                          <option value="UNIAO_ESTAVEL">União Estável</option>
                          <option value="DIVORCIADA">Divorciada</option>
                          <option value="VIUVA">Viúva</option>
                        </select>
                      ) : (
                        <span className="text-sm font-black text-brand-navy">{paciente?.estado_civil?.replace('_', ' ') ?? '—'}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Ocupação</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <input
                          value={pacienteDraft.ocupacao}
                          onChange={(e) => setPacienteDraft((p) => ({ ...p, ocupacao: e.target.value }))}
                          placeholder="Preencher"
                          className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-brand-pink/30 focus:border-brand-pink/50"
                        />
                      ) : (
                        <span className="text-sm font-black text-brand-navy">{paciente?.ocupacao ?? '—'}</span>
                      )}
                    </dd>
                  </div>

                  {/* Campos adicionais do DER (PACIENTE) */}
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">ABO/Rh</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <select
                          value={pacienteDraft.abo_rh}
                          onChange={(e) => setPacienteDraft((p) => ({ ...p, abo_rh: e.target.value as any }))}
                          className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-brand-pink/30 focus:border-brand-pink/50"
                        >
                          <option value="">Selecionar</option>
                          <option value="A_POS">A+</option>
                          <option value="A_NEG">A-</option>
                          <option value="B_POS">B+</option>
                          <option value="B_NEG">B-</option>
                          <option value="AB_POS">AB+</option>
                          <option value="AB_NEG">AB-</option>
                          <option value="O_POS">O+</option>
                          <option value="O_NEG">O-</option>
                        </select>
                      ) : (
                        <span className="text-sm font-black text-brand-navy">
                          {paciente?.abo_rh?.replace('_POS', '+').replace('_NEG', '-') ?? '—'}
                        </span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Altura</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            inputMode="decimal"
                            value={pacienteDraft.altura}
                            onChange={(e) => setPacienteDraft((p) => ({ ...p, altura: e.target.value }))}
                            placeholder="Ex.: 1.62"
                            className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-brand-pink/30 focus:border-brand-pink/50"
                          />
                          <span className="text-xs font-black text-slate-400">m</span>
                        </div>
                      ) : (
                        <span className="text-sm font-black text-brand-navy">{paciente?.altura ? `${paciente.altura} m` : '—'}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Peso pré-gestacional</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            inputMode="decimal"
                            value={pacienteDraft.peso_pre_gestacional}
                            onChange={(e) => setPacienteDraft((p) => ({ ...p, peso_pre_gestacional: e.target.value }))}
                            placeholder="Ex.: 62.5"
                            className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-brand-pink/30 focus:border-brand-pink/50"
                          />
                          <span className="text-xs font-black text-slate-400">kg</span>
                        </div>
                      ) : (
                        <span className="text-sm font-black text-brand-navy">
                          {paciente?.peso_pre_gestacional != null ? `${paciente.peso_pre_gestacional} kg` : '—'}
                        </span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Atvd. educativa</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <select
                          value={pacienteDraft.is_particip_atvd_educativa}
                          onChange={(e) => setPacienteDraft((p) => ({ ...p, is_particip_atvd_educativa: e.target.value as any }))}
                          className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-brand-pink/30 focus:border-brand-pink/50"
                        >
                          <option value="">Selecionar</option>
                          <option value="true">Sim</option>
                          <option value="false">Não</option>
                        </select>
                      ) : (
                        <span className="text-sm font-black text-brand-navy">{fmtBool(paciente?.is_particip_atvd_educativa)}</span>
                      )}
                    </dd>
                  </div>
                </dl>
              ) : null}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Gestação</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowMoreGestacao((v) => !v)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 shadow-sm hover:border-brand-pink/40"
                  >
                    {showMoreGestacao ? 'Ocultar' : 'Ver mais'}
                  </button>
                </div>
              </div>
              {showMoreGestacao ? (
              <div className="mt-4 space-y-4">
                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Dados da gestação</h3>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">DUM</dt>
                      <dd className="mt-1">
                        {isEditing ? (
                          <input
                            placeholder="DD/MM/YYYY"
                            value={gestacaoDraft.dum}
                            onChange={(e) => setGestacaoDraft((p) => ({ ...p, dum: e.target.value }))}
                            className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-brand-pink/30 focus:border-brand-pink/50"
                          />
                        ) : (
                          <span className="text-sm font-black text-brand-navy">
                            {formatApiDateOnlyPtBr(selectedGestacao?.dum ?? null)}
                          </span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        DPP <span className="font-normal normal-case text-slate-400">(referência principal)</span>
                      </dt>
                      <dd className="mt-1">
                        {isEditing ? (
                          <div>
                            <input
                              placeholder="DD/MM/YYYY"
                              value={gestacaoDraft.dpp}
                              disabled
                              className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800 shadow-sm disabled:opacity-80 disabled:cursor-not-allowed"
                            />
                            {dppEcoBaseDate ? (
                              <p className="mt-1 text-[10px] font-semibold text-slate-500">Calculada a partir da DPP ecográfica</p>
                            ) : dumBaseDate ? (
                              <p className="mt-1 text-[10px] font-semibold text-slate-500">
                                Calculada pela DUM + {NAEGELE_DAYS} dias (Naegele)
                              </p>
                            ) : (
                              <p className="mt-1 text-[10px] text-slate-500">Informe DUM ou DPP ecográfica</p>
                            )}
                          </div>
                        ) : (
                          <div>
                            <span className="text-sm font-black text-brand-navy">{primaryDppBr}</span>
                            {dppEcoBaseDate ? (
                              <p className="mt-0.5 text-[10px] font-semibold text-slate-500">Prioridade: DPP ecográfica</p>
                            ) : dumBaseDate ? (
                              <p className="mt-0.5 text-[10px] font-semibold text-slate-500">
                                Regra de Naegele: DUM + {NAEGELE_DAYS} dias (40 semanas)
                              </p>
                            ) : null}
                            {dppEcoBaseDate && naegeleDppDate ? (
                              <p className="mt-0.5 text-[10px] text-slate-500">
                                Naegele pela DUM: {formatLocalDatePtBr(naegeleDppDate) || '—'}
                              </p>
                            ) : null}
                          </div>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">IG atual</dt>
                      <dd className="mt-1">
                        <span className="text-sm font-black text-brand-navy">{igAtualAuto}</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">IG inicial</dt>
                      <dd className="mt-1">
                        {isEditing ? (
                          <input
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={gestacaoDraft.ig_inicial}
                            onChange={(e) =>
                              setGestacaoDraft((p) => ({ ...p, ig_inicial: digitsOnly(e.target.value) }))
                            }
                            placeholder="Semanas"
                            className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-brand-pink/30 focus:border-brand-pink/50"
                          />
                        ) : (
                          <span className="text-sm font-black text-brand-navy">{selectedGestacao?.ig_inicial ? `${selectedGestacao.ig_inicial} sem` : '—'}</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">DPP-Eco</dt>
                      <dd className="mt-1">
                        {isEditing ? (
                          <input
                            placeholder="DD/MM/YYYY"
                            value={gestacaoDraft.dpp_eco}
                            onChange={(e) => setGestacaoDraft((p) => ({ ...p, dpp_eco: e.target.value }))}
                            className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-brand-pink/30 focus:border-brand-pink/50"
                          />
                        ) : (
                          <span className="text-sm font-black text-brand-navy">
                            {formatApiDateOnlyPtBr(selectedGestacao?.dpp_eco ?? null)}
                          </span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">IG confirmada</dt>
                      <dd className="mt-1">
                        {isEditing ? (
                          <input
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={gestacaoDraft.idade_gestac_confirmada}
                            onChange={(e) =>
                              setGestacaoDraft((p) => ({
                                ...p,
                                idade_gestac_confirmada: digitsOnly(e.target.value),
                              }))
                            }
                            placeholder="Semanas"
                            className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-brand-pink/30 focus:border-brand-pink/50"
                          />
                        ) : (
                          <span className="text-sm font-black text-brand-navy">
                            {selectedGestacao?.idade_gestac_confirmada != null ? `${selectedGestacao.idade_gestac_confirmada} sem` : '—'}
                          </span>
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Classificação</h3>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Tipo risco</dt>
                      <dd className="mt-1">
                        <span className={`text-sm font-black ${selectedGestacao?.tipo_risco === 'ALTO' ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {selectedGestacao?.tipo_risco === 'ALTO' ? 'Alto risco' : 'Habitual'}
                        </span>
                        <p className="mt-1 text-[10px] font-medium leading-snug text-slate-500">
                          Calculado automaticamente pelo sistema com base nos critérios do Guia MS (2024); altera ao salvar dados clínicos relevantes.
                        </p>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Tipo gravidez</dt>
                      <dd className="mt-1">
                        {isEditing ? (
                          <select
                            value={gestacaoDraft.tipo_gravidez}
                            onChange={(e) => setGestacaoDraft((p) => ({ ...p, tipo_gravidez: e.target.value as any }))}
                            className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-brand-pink/30 focus:border-brand-pink/50"
                          >
                            <option value="">Selecionar</option>
                            <option value="unica">Única</option>
                            <option value="gemelar">Gemelar</option>
                            <option value="tripla_ou_mais">Tripla ou mais</option>
                            <option value="ignorada">Ignorada</option>
                          </select>
                        ) : (
                          <span className="text-sm font-black text-brand-navy">{(selectedGestacao?.tipo_gravidez ?? '—').toString()}</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Ativa</dt>
                      <dd className="mt-1">
                        {isEditing ? (
                          <BoolTriState
                            name={`g-${selG}-is_ativa`}
                            value={gestacaoDraft.is_ativa}
                            disabled={!isEditing}
                            onChange={(next) => setGestacaoDraft((p) => ({ ...p, is_ativa: next }))}
                          />
                        ) : (
                          <span className="text-sm font-black text-brand-navy">{fmtBool(selectedGestacao?.is_ativa)}</span>
                        )}
                      </dd>
                    </div>
                    {showMoreGestacao ? (
                      <>
                        <div>
                          <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Gestação de risco</dt>
                          <dd className="mt-1 text-sm font-black text-brand-navy">{selectedGestacao?.tipo_risco === 'ALTO' ? 'Sim' : 'Não'}</dd>
                        </div>
                        <div className="col-span-2">
                          <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Concluída em</dt>
                          <dd className="mt-1 text-sm font-black text-brand-navy">{fmtDateTime((selectedGestacaoFull as any)?.concluida_em)}</dd>
                        </div>
                      </>
                    ) : null}
                  </dl>
                </div>

                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Planejamento e acompanhamento</h3>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Planejada</dt>
                      <dd className="mt-1">
                        {isEditing ? (
                          <BoolTriState
                            name={`g-${selG}-is_planejada`}
                            value={gestacaoDraft.is_planejada}
                            disabled={!isEditing}
                            onChange={(next) => setGestacaoDraft((p) => ({ ...p, is_planejada: next }))}
                          />
                        ) : (
                          <span className="text-sm font-black text-brand-navy">{fmtBool(selectedGestacao?.is_planejada)}</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Visita maternidade</dt>
                      <dd className="mt-1">
                        {isEditing ? (
                          <BoolTriState
                            name={`g-${selG}-is_visita_maternidade`}
                            value={gestacaoDraft.is_visita_maternidade}
                            disabled={!isEditing}
                            onChange={(next) => setGestacaoDraft((p) => ({ ...p, is_visita_maternidade: next }))}
                          />
                        ) : (
                          <span className="text-sm font-black text-brand-navy">{fmtBool(selectedGestacao?.is_visita_maternidade)}</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Deseja DIU</dt>
                      <dd className="mt-1">
                        {isEditing ? (
                          <BoolTriState
                            name={`g-${selG}-is_colocar_diu`}
                            value={gestacaoDraft.is_colocar_diu}
                            disabled={!isEditing}
                            onChange={(next) => setGestacaoDraft((p) => ({ ...p, is_colocar_diu: next }))}
                          />
                        ) : (
                          <span className="text-sm font-black text-brand-navy">{fmtBool(selectedGestacao?.is_colocar_diu)}</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Consulta odonto</dt>
                      <dd className="mt-1">
                        {isEditing ? (
                          <BoolTriState
                            name={`g-${selG}-is_did_consulta_odontologica`}
                            value={gestacaoDraft.is_did_consulta_odontologica}
                            disabled={!isEditing}
                            onChange={(next) => setGestacaoDraft((p) => ({ ...p, is_did_consulta_odontologica: next }))}
                          />
                        ) : (
                          <span className="text-sm font-black text-brand-navy">{fmtBool(selectedGestacao?.is_did_consulta_odontologica)}</span>
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
              ) : null}

              {/* Seção Sífilis & Suplementação (DER) */}
              {showMoreGestacao ? (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
                {hasSifilisExamePositivo ? (
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-brand-navy mb-3 flex items-center gap-2">
                      <svg className="h-4 w-4 text-brand-pink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.631.316a6 6 0 01-3.86.517l-2.387-.477a2 2 0 10-1.023 3.977l2.387.477a2 2 0 001.022.547l2.387.477a6 6 0 003.86-.517l.631-.316a6 6 0 013.86-.517l2.387.477a2 2 0 001.023-3.977z"
                        />
                      </svg>
                      Tratamento Sífilis
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Dose 1</dt>
                        <input
                          disabled={!isEditing}
                          placeholder="DD/MM/YYYY"
                          value={gestacaoDraft.tratamento_sifilis_dose_1}
                          onChange={(e) => setGestacaoDraft((p) => ({ ...p, tratamento_sifilis_dose_1: e.target.value }))}
                          className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-brand-pink/30 focus:border-brand-pink/50 disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Dose 2</dt>
                        <input
                          disabled={!isEditing}
                          placeholder="DD/MM/YYYY"
                          value={gestacaoDraft.tratamento_sifilis_dose_2}
                          onChange={(e) => setGestacaoDraft((p) => ({ ...p, tratamento_sifilis_dose_2: e.target.value }))}
                          className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-brand-pink/30 focus:border-brand-pink/50 disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Dose 3</dt>
                        <input
                          disabled={!isEditing}
                          placeholder="DD/MM/YYYY"
                          value={gestacaoDraft.tratamento_sifilis_dose_3}
                          onChange={(e) => setGestacaoDraft((p) => ({ ...p, tratamento_sifilis_dose_3: e.target.value }))}
                          className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-brand-pink/30 focus:border-brand-pink/50 disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                      </div>
                    </div>
                  </div>
                ) : null}

                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-brand-navy mb-3 flex items-center gap-2">
                    <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Suplementação
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5">
                      <div className="text-[11px] font-bold text-slate-600 mb-2">Sulfato Ferroso</div>
                      <BoolTriState
                        name={`g-${selG}-suplementacao_ferro`}
                        value={gestacaoDraft.suplementacao_ferro}
                        disabled={!isEditing}
                        onChange={(next) => setGestacaoDraft((p) => ({ ...p, suplementacao_ferro: next }))}
                      />
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5">
                      <div className="text-[11px] font-bold text-slate-600 mb-2">Ácido Fólico</div>
                      <BoolTriState
                        name={`g-${selG}-suplementacao_acido_folico`}
                        value={gestacaoDraft.suplementacao_acido_folico}
                        disabled={!isEditing}
                        onChange={(next) => setGestacaoDraft((p) => ({ ...p, suplementacao_acido_folico: next }))}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Comorbidades na gestação</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'is_diabetes_gestacional', label: 'Diabetes Gestacional' },
                      { key: 'is_infeccao_urinaria', label: 'Infecção Urinária' },
                      { key: 'is_infertilidade', label: 'Infertilidade' },
                      { key: 'is_dificuldade_alimentar', label: 'Dificuldade Alimentar' },
                      { key: 'is_cardiopatia', label: 'Cardiopatia' },
                      { key: 'is_tromboembolismo', label: 'Tromboembolismo' },
                      { key: 'is_hipertensao_arterial', label: 'Hipertensão Arterial' },
                      { key: 'is_cirurgia_elvica_uterina', label: 'Cirurgia Pélvica/Uterina' },
                      { key: 'is_cirugia', label: 'Outras Cirurgias' },
                    ].map((item) => (
                      <div key={item.key} className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5">
                        <div className="text-[11px] font-bold text-slate-600 mb-2">{item.label}</div>
                        <BoolTriState
                          name={`g-${selG}-${item.key}`}
                          value={(gestacaoDraft as any)[item.key]}
                          disabled={!isEditing}
                          onChange={(next) => setGestacaoDraft((p) => ({ ...p, [item.key]: next }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                </div>
              ) : null}
            </div>

          </section>

          {/* Antecedentes (DER) */}
          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <details
              className="group"
              open={antecedentesDetailsOpen}
              onToggle={(e) => setAntecedentesDetailsOpen(e.currentTarget.open)}
            >
              <summary className="cursor-pointer list-none px-4 py-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
                <div className="min-w-0">
                  <div className="text-xs font-bold uppercase tracking-widest text-slate-500">Antecedentes</div>
                </div>
                <div className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm">
                  <span className="group-open:hidden">Ver mais</span>
                  <span className="hidden group-open:inline">Ocultar</span>
                  
                </div>
              </summary>

              <div className="p-4">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Gestações</h3>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {[
                        { key: 'n_gestas_anteriores', label: 'Gestações anteriores' },
                        { key: 'n_partos', label: 'Partos' },
                        { key: 'n_abortos', label: 'Abortos' },
                        { key: 'n_nascidos_vivos', label: 'Nascidos vivos' },
                        { key: 'n_vivem', label: 'Vivem' },
                        { key: 'n_mortos_primeira_semana', label: 'Mortos 1ª semana' },
                        { key: 'n_mortos_apos_primeira_semana', label: 'Mortos após 1ª semana' },
                        { key: 'n_nascidos_mortos', label: 'Nascidos mortos' },
                        { key: 'n_cesarea', label: 'Cesáreas' },
                        { key: 'n_parto_normal', label: 'Parto normal' },
                        { key: 'n_parto_prematuro', label: 'Parto prematuro' },
                        { key: 'n_bebe_menos_dois_kilos_e_meio', label: `Bebê < 2.5kg` },
                        { key: 'n_bebe_mais_quatro_kilos_e_meio', label: `Bebê > 4.5kg` },
                      ].map((f) => (
                        <div key={f.key}>
                          <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{f.label}</dt>
                          <dd className="mt-1">
                            {isEditing ? (
                              <input
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={(antecedentesDraft as any)[f.key]}
                                onChange={(e) =>
                                  setAntecedentesDraft((p) => ({
                                    ...p,
                                    [f.key]: digitsOnly(e.target.value),
                                  }))
                                }
                                placeholder="—"
                                className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-brand-pink/30 focus:border-brand-pink/50"
                              />
                            ) : (
                              <span className="text-sm font-black text-brand-navy">{(selectedGestacaoFull as any)?.antecedentes?.[f.key] ?? '—'}</span>
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>

                  <div>
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Antecedentes familiares</h3>
                    {isEditing ? (
                    <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {[
                          { key: 'is_diabetes_familiar', label: 'Diabetes familiar' },
                          { key: 'is_hipertensao_familiar', label: 'Hipertensão familiar' },
                          { key: 'is_gravidez_gemelar_familiar', label: 'Gemelaridade familiar' },
                        ].map((m) => (
                        <div key={m.key} className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5">
                          <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{m.label}</dt>
                          <dd className="mt-2">
                            <BoolTriState
                              name={`ant-${selG}-${m.key}`}
                              value={(antecedentesDraft as any)[m.key]}
                              disabled={!isEditing}
                              onChange={(next) => setAntecedentesDraft((p) => ({ ...p, [m.key]: next }))}
                            />
                          </dd>
                        </div>
                        ))}
                    </dl>
                    ) : (
                      <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {[
                          { key: 'is_diabetes_familiar', label: 'Diabetes familiar' },
                          { key: 'is_hipertensao_familiar', label: 'Hipertensão familiar' },
                          { key: 'is_gravidez_gemelar_familiar', label: 'Gemelaridade familiar' },
                        ].map((m) => (
                          <div key={m.key} className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 flex items-center justify-between gap-3">
                            <dt className="text-[11px] font-bold text-slate-700">{m.label}</dt>
                            <dd className="text-[11px] font-black text-brand-navy">
                              {fmtBool((selectedGestacaoFull as any)?.antecedentes?.[m.key])}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>

                  <div>
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Antecedentes clínicos obstétricos</h3>
                    {isEditing ? (
                    <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {[
                          { key: 'is_gesta_ectopica', label: 'Gestação ectópica' },
                          { key: 'is_gesta_molar', label: 'Gestação molar' },
                          { key: 'is_cardiopatia', label: 'Cardiopatia' },
                          { key: 'is_tromboembolismo', label: 'Tromboembolismo' },
                          { key: 'is_infertilidade', label: 'Infertilidade' },
                          { key: 'is_isoimunizacao_rh', label: 'Isoimunização Rh' },
                          { key: 'is_cirurgia_pelvica_uterina', label: 'Cirurgia pélvica/uterina' },
                          { key: 'is_final_gestacao_anterior_1_ano', label: 'Gestação anterior < 1 ano' },
                          { key: 'is_sifilis', label: 'Histórico de sífilis' },
                        ].map((m) => (
                        <div key={m.key} className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5">
                          <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{m.label}</dt>
                          <dd className="mt-2">
                            <BoolTriState
                              name={`ant-${selG}-${m.key}`}
                              value={(antecedentesDraft as any)[m.key]}
                              disabled={!isEditing}
                              onChange={(next) => setAntecedentesDraft((p) => ({ ...p, [m.key]: next }))}
                            />
                          </dd>
                        </div>
                        ))}
                    </dl>
                    ) : (
                      <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {[
                          { key: 'is_gesta_ectopica', label: 'Gestação ectópica' },
                          { key: 'is_gesta_molar', label: 'Gestação molar' },
                          { key: 'is_cardiopatia', label: 'Cardiopatia' },
                          { key: 'is_tromboembolismo', label: 'Tromboembolismo' },
                          { key: 'is_infertilidade', label: 'Infertilidade' },
                          { key: 'is_isoimunizacao_rh', label: 'Isoimunização Rh' },
                          { key: 'is_cirurgia_pelvica_uterina', label: 'Cirurgia pélvica/uterina' },
                          { key: 'is_final_gestacao_anterior_1_ano', label: 'Gestação anterior < 1 ano' },
                          { key: 'is_sifilis', label: 'Histórico de sífilis' },
                        ].map((m) => (
                        <div key={m.key} className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 flex items-center justify-between gap-3">
                            <dt className="text-[11px] font-bold text-slate-700">{m.label}</dt>
                            <dd className="text-[11px] font-black text-brand-navy">
                              {fmtBool((selectedGestacaoFull as any)?.antecedentes?.[m.key])}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>

                  <div>
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Gestação atual</h3>
                    {isEditing ? (
                    <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {[
                          { key: 'is_fumo', label: 'Fumo' },
                          { key: 'is_alcool', label: 'Álcool' },
                          { key: 'is_drogas', label: 'Drogas' },
                        ].map((m) => (
                        <div key={m.key} className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5">
                          <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{m.label}</dt>
                          <dd className="mt-2">
                            <BoolTriState
                              name={`ant-${selG}-${m.key}`}
                              value={(antecedentesDraft as any)[m.key]}
                              disabled={!isEditing}
                              onChange={(next) => setAntecedentesDraft((p) => ({ ...p, [m.key]: next }))}
                            />
                          </dd>
                        </div>
                        ))}
                    </dl>
                    ) : (
                      <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {[
                          { key: 'is_fumo', label: 'Fumo' },
                          { key: 'is_alcool', label: 'Álcool' },
                          { key: 'is_drogas', label: 'Drogas' },
                        ].map((m) => (
                        <div key={m.key} className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 flex items-center justify-between gap-3">
                            <dt className="text-[11px] font-bold text-slate-700">{m.label}</dt>
                            <dd className="text-[11px] font-black text-brand-navy">
                              {fmtBool((selectedGestacaoFull as any)?.antecedentes?.[m.key])}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
              </div>

            <DerModulosProntuario
              ref={derRef}
              authFetch={authFetch}
              validId={validId}
              selG={selG}
              selUnidade={selUnidade}
              pacienteFull={pacienteFull}
              isEditing={isEditing}
            />
              </div>
            </details>
          </section>

          {/* Timeline Expandida de Consultas */}
          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden mt-8">
            <div className="border-b border-brand-pink/10 bg-brand-pink/5 px-8 py-6">
               <h2 className="text-xl font-black text-brand-navy">Timeline de consultas</h2>
               <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                 <p className="text-sm font-medium text-slate-500">Acompanhamento longitudinal dos eventos clínicos (até 14 consultas).</p>
                 <button
                   type="button"
                   disabled={!selG || consultas.length >= 14}
                   onClick={() => void createConsulta()}
                   className="rounded-xl bg-brand-pink px-5 py-2.5 text-sm font-black text-white shadow-md hover:bg-[#e88d94] disabled:opacity-50 disabled:hover:bg-brand-pink transition-colors"
                   title={consultas.length >= 14 ? 'Limite de 14 consultas atingido' : 'Criar nova consulta'}
                 >
                   + Criar consulta ({consultas.length}/14)
                 </button>
               </div>
            </div>
            
            <div className="p-8 space-y-6">
              {!selG ? <div className="text-center font-medium text-slate-500 py-10">Selecione uma gestação acima.</div> : null}
              {selG && cronologico.length === 0 ? (
                 <div className="text-center py-12">
                    <div className="mx-auto w-16 h-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center mb-5 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] text-2xl">🩺</div>
                    <p className="text-slate-600 font-bold text-lg">Nenhuma consulta iniciada para esta gestação.</p>
                 </div>
              ) : null}
              
              <div className="relative pl-6 border-l-[3px] border-brand-pink/20 space-y-8">
                {cronologico.map((c, idx) => {
                  const pa =
                    c.pa_sistolica != null && c.pa_diastolica != null ? `${c.pa_sistolica}/${c.pa_diastolica}` : '—'
                  
                  const isLast = idx === cronologico.length - 1
                  const isFinalized = c.status === 'FINALIZADA' || c.status === 'CONFIRMADA'
                  const isExpanded = expandedConsultas.has(c.id)

                  return (
                    <div key={c.id} className="relative">
                      {/* O Bullet Point da Timeline */}
                      <div className="absolute -left-[35px] top-4 h-5 w-5 rounded-full bg-brand-pink/30 border-4 border-white shadow-sm flex items-center justify-center ring-1 ring-brand-pink/50">
                         {isLast && !isFinalized && <div className="h-2 w-2 rounded-full bg-brand-pink"></div>}
                         {isFinalized && <div className="h-2 w-2 rounded-full bg-emerald-500"></div>}
                      </div>
                      
                      <div className={`rounded-3xl border shadow-sm transition-all overflow-hidden ${isLast && !isFinalized ? 'border-brand-pink ring-4 ring-brand-pink/10' : 'border-slate-200'} ${isExpanded ? 'bg-slate-50/50' : 'bg-white'}`}>
                         <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 gap-4 bg-white">
                            <div>
                               <h3 className="text-lg font-black text-brand-navy flex items-center gap-3">
                                 Consulta {idx + 1}
                                 <span className="rounded-xl bg-white border border-slate-200 px-3 py-1 text-[10px] font-bold text-slate-600 tracking-widest uppercase shadow-sm">{c.status.replace('_', ' ')}</span>
                               </h3>
                               <p className="text-sm text-slate-500 mt-1.5 font-bold">{fmtDateTime(c.data)}</p>
                               <p className="text-sm text-slate-500 mt-1.5 font-bold">Idade Gestacional: {c.idade_gestacional}</p>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                              <button
                                onClick={() => toggleConsulta(c.id)}
                                className={`text-center rounded-xl border px-5 py-2.5 text-sm font-bold shadow-sm transition-all focus:ring-2 focus:ring-brand-pink focus:ring-offset-2 flex-1 sm:flex-none ${isExpanded ? 'bg-slate-100 border-slate-200 text-slate-600' : 'bg-white border-slate-300 text-brand-navy hover:bg-slate-50'}`}
                              >
                                {isExpanded ? 'Ocultar Detalhes' : 'Ver Mais'}
                              </button>
                              
                              {!isFinalized && (
                                <Link
                                  to={`/consultas/${c.id}/escriba`}
                                  className="text-center rounded-xl bg-brand-pink px-5 py-2.5 text-sm font-bold text-white shadow-md hover:bg-[#e88d94] transition-all focus:ring-2 focus:ring-brand-pink focus:ring-offset-2 flex-1 sm:flex-none"
                                >
                                  Iniciar Escriba
                                </Link>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  if (isConsultaEmpty(c)) {
                                    void deleteConsulta(c.id)
                                  } else {
                                    setDeleteConfirmText('')
                                    setDeleteTarget(c)
                                  }
                                }}
                                className="text-center rounded-xl border border-rose-200 bg-white px-5 py-2.5 text-sm font-black text-rose-700 shadow-sm hover:bg-rose-50 transition-colors focus:ring-2 focus:ring-rose-300 focus:ring-offset-2 flex-1 sm:flex-none"
                                title={isConsultaEmpty(c) ? 'Apagar consulta vazia' : 'Apagar (exige confirmação)'}
                              >
                                X
                              </button>
                            </div>
                         </div>
                         
                         {/* Seção Acordeão de Dados (Ver Mais) */}
                         {isExpanded && (
                           <div className="bg-slate-50/70 p-6 border-t border-slate-100 animate-in fade-in slide-in-from-top-2">
                              {/* Indicadores Numéricos */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                  <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col items-center relative">
                                      <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Peso</span>
                                      <span className="text-xl font-black text-brand-navy mt-1">{c.peso != null ? c.peso : '—'}<span className="text-[10px] font-bold text-slate-400 ml-1">kg</span></span>
                                  </div>
                                  <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col items-center relative">
                                      <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">PA</span>
                                      <span className="text-xl font-black text-brand-navy mt-1">{pa}<span className="text-[10px] font-bold text-slate-400 ml-1">mmHg</span></span>
                                  </div>
                                  <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col items-center relative">
                                      <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">AU</span>
                                      <span className="text-xl font-black text-brand-navy mt-1">{c.au != null ? c.au : '—'}<span className="text-[10px] font-bold text-slate-400 ml-1">cm</span></span>
                                  </div>
                                  <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col items-center relative">
                                      <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">BFC</span>
                                      <span className="text-xl font-black text-brand-navy mt-1">{c.bfc != null ? c.bfc : '—'}<span className="text-[10px] font-bold text-slate-400 ml-1">bpm</span></span>
                                  </div>
                              </div>

                              {/* Condicionais (Tags) */}
                              <div className="flex flex-wrap gap-3 mb-6 relative">
                                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 shadow-sm">
                                     Apresentação: <span className="text-brand-navy font-black">{c.apresentacao_fetal ?? '—'}</span>
                                  </span>
                                  {c.is_edema ? (
                                     <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 px-3 py-1.5 text-[11px] font-bold text-rose-700 shadow-sm">⚠️ Edema Presente</span>
                                  ) : (
                                     <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-500 shadow-sm">Sem Edema</span>
                                  )}
                                  {(c.mov_fetal ?? '').toLowerCase() === 'preservado' ? (
                                     <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-[11px] font-bold text-emerald-700 shadow-sm">👣 Mov. Fetal Preservada</span>
                                  ) : (
                                     <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 px-3 py-1.5 text-[11px] font-bold text-rose-700 shadow-sm">⚠️ Redução de Mov. Fetal</span>
                                  )}
                                  {c.is_exantema && (
                                     <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 px-3 py-1.5 text-[11px] font-bold text-rose-700 shadow-sm">⚠️ Exantema Presente</span>
                                  )}
                              </div>

                              {/* Observações Livres */}
                              <div className="grid md:grid-cols-2 gap-4 relative">
                                  <div className="bg-white mt-1 rounded-2xl p-5 border border-slate-200 shadow-sm">
                                     <span className="text-[10px] uppercase font-bold tracking-widest text-brand-pink block mb-2">Queixa Principal / Evolução</span>
                                     <p className="text-sm font-medium text-slate-700 leading-relaxed">{c.queixa ?? '—'}</p>
                                  </div>
                                  <div className="bg-white mt-1 rounded-2xl p-5 border border-slate-200 shadow-sm">
                                     <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-600 block mb-2">Conduta Médica Adotada</span>
                                     <div className="flex items-center justify-between gap-3">
                                       <p className="text-sm font-medium text-slate-700 leading-relaxed">
                                         {c.conduta ?? c.ia?.sugestao_conduta ?? '—'}
                                       </p>
                                       {!c.conduta && c.ia?.sugestao_conduta ? (
                                         <span
                                           title="Texto gerado por IA (sugestão, não oficial)"
                                           className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-800"
                                         >
                                           ✨ IA
                                         </span>
                                       ) : null}
                                     </div>
                                  </div>
                              </div>

                              {/* Rodapé do card (Validação Medica) */}
                              <div className="mt-6 flex flex-wrap justify-between items-center gap-4 px-2 pt-4 border-t border-slate-200">
                                 <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wide">
                                   Dados estruturados via RAG (Mapeamento DER)
                                 </p>
                                 <p className="text-sm font-bold flex items-center gap-2">
                                   <span className="text-slate-500">Validação médica:</span>
                                   {c.validacao_medica ? (
                                     <span className="text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg">Concluída</span> 
                                   ) : (
                                     <span className="text-amber-700 bg-amber-100 px-2.5 py-1 rounded-lg">Pendente</span>
                                   )}
                                 </p>
                              </div>
                           </div>
                         )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Warning modal (estilo GitHub) para apagar consulta com dados */}
      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-xl rounded-3xl border border-rose-200 bg-white shadow-xl overflow-hidden">
            <div className="border-b border-rose-100 bg-rose-50 px-6 py-5">
              <h3 className="text-base font-black text-rose-900">Apagar consulta com dados</h3>
              <p className="mt-1 text-xs font-bold text-rose-700">
                Esta ação é permanente. Para confirmar, digite <span className="font-black">APAGAR</span>.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-bold text-slate-500">Consulta</div>
                <div className="mt-1 font-mono text-xs text-slate-700">
                  ID: <span className="font-bold">{deleteTarget.id}</span>
                </div>
                <div className="mt-1 font-mono text-xs text-slate-700">
                  Data: <span className="font-bold">{fmtDateTime(deleteTarget.data)}</span>
                </div>
                <div className="mt-1 font-mono text-xs text-slate-700">
                  IG: <span className="font-bold">{deleteTarget.idade_gestacional}</span></div>
                <div className="mt-1 font-mono text-xs text-slate-700">
                  PESO: <span className="font-bold">{deleteTarget.peso}</span></div>
                <div className="mt-1 font-mono text-xs text-slate-700">
                  Queixa: <span className="font-bold">{deleteTarget.queixa}</span></div>
                <div className="mt-1 font-mono text-xs text-slate-700">
                  Conduta: <span className="font-bold">{deleteTarget.conduta}</span></div>
                <div className="mt-1 font-mono text-xs text-slate-700">
                  Validacao Medica: <span className="font-bold">{deleteTarget.validacao_medica}</span></div>
                <div className="mt-1 font-mono text-xs text-slate-700">
                  Status: <span className="font-bold">{deleteTarget.status}</span></div>
              </div>

              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Digite APAGAR"
                className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm focus:border-rose-300 focus:ring-rose-300"
              />

              <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deleteConfirmText.trim().toUpperCase() !== 'APAGAR'}
                  onClick={() => {
                    const idToDelete = deleteTarget.id
                    setDeleteTarget(null)
                    void deleteConsulta(idToDelete)
                  }}
                  className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-black text-white shadow-sm hover:bg-rose-500 disabled:opacity-50"
                >
                  Eu entendo, apagar esta consulta
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Painel Lívia (desktop): recolhível; botão fixo reaparece quando fechado */}
      {liviaAsideOpen ? (
        <aside className="pointer-events-none fixed top-16 right-0 z-30 hidden h-[calc(100vh-4rem)] w-[var(--livia-aside-width)] min-w-0 shrink-0 border-l border-brand-pink/30 bg-white shadow-[-4px_0_15px_rgba(251,160,167,0.05)] lg:flex lg:flex-col">
          <LiviaAssistantPanel
            className="pointer-events-auto min-h-0 flex-1"
            pacienteId={validId ?? undefined}
            gestacaoId={isUuid(selG) ? selG : undefined}
            onDesktopPanelHide={() => setLiviaAsideOpen(false)}
          />
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setLiviaAsideOpen(true)}
          className="fixed bottom-6 right-6 z-40 hidden h-14 w-14 items-center justify-center rounded-full border border-rose-200/90 bg-white text-xl shadow-lg transition-[box-shadow,transform] hover:scale-[1.03] hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 lg:flex"
          aria-label="Mostrar assistente Lívia"
          title="Mostrar assistente Lívia"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-rose-600 text-base text-white shadow-inner">✨</span>
        </button>
      )}

      {/* Mobile-first: assistente Lívia expansível (mobile apenas) */}
      <div className="lg:hidden fixed bottom-4 right-4 z-40">
        <details className="rounded-2xl border border-brand-pink/50 bg-white shadow-[0_4px_25px_rgba(251,160,167,0.3)] w-[calc(100vw-2rem)] max-w-sm ml-auto origin-bottom-right group transition-all">
          <summary className="cursor-pointer list-none rounded-2xl px-5 py-4 text-sm font-bold text-brand-navy marker:content-none [&::-webkit-details-marker]:hidden bg-brand-pink/5 hover:bg-brand-pink/10 transition-colors">
            <span className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-3">
                 <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-pink text-white text-sm shadow-sm ring-2 ring-white">✨</span>
                 Conversar com LívIA
              </span>
              <span className="text-xs font-bold text-brand-pink/70 group-open:hidden">ABRIR</span>
              <span className="text-xs font-bold text-brand-pink/70 hidden group-open:block">FECHAR</span>
            </span>
          </summary>
          <div className="border-t border-brand-pink/20 bg-white rounded-b-2xl h-[min(65vh,36rem)] overflow-hidden flex flex-col">
            <LiviaAssistantPanel pacienteId={validId ?? undefined} gestacaoId={isUuid(selG) ? selG : undefined} />
          </div>
        </details>
      </div>

    </div>
  )
}
