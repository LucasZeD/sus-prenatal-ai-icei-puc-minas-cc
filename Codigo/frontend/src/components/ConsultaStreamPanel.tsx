import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.js'
import { getWsBaseUrl } from '../lib/apiBase.js'
import {
  openConsultationSocket,
  type ConsultationServerMessage,
  type ConsultationSocketHandle,
  type StreamHistoryItem,
} from '../lib/consultationSocket.js'

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type AudioInputDevice = { deviceId: string; label: string }

async function readJsonBody(res: Response): Promise<Record<string, unknown>> {
  const raw = await res.text()
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return { message: raw.slice(0, 400) }
  }
}

function apiErrorMessage(body: Record<string, unknown>, status: number): string {
  const msg = typeof body.message === 'string' ? body.message : ''
  const code = typeof body.code === 'string' ? body.code : ''
  if (msg && code) return `${msg} (${code})`
  if (msg) return msg
  if (code) return code
  return `HTTP ${status}`
}

type StreamStatus = 'desconectado' | 'conectando' | 'conectado' | 'erro'

export type ConsultaStreamPanelProps = {
  /** `embedded`: worklist + cadastro + stream (área técnica na agenda). `streamOnly`: só captura WS/mic. */
  variant?: 'embedded' | 'streamOnly'
  /** Em `streamOnly`, UUID da consulta vindo da rota. */
  initialConsultaId?: string
  /** Espelha STT/IA para a aba de revisão da escriba. */
  onStreamTexts?: (stt: string, ia: string) => void
}

type PacienteRow = {
  id: string
  nome_mascarado: string
  cpf_ultimos4?: string | null
  cartao_sus_ultimos4?: string | null
}

type GestacaoRow = { id: string; paciente_id: string; tipo_risco?: string }

type UnidadeRow = { id: string; nome: string }

type WorklistRow = {
  id: string
  status: string
  data: string
  gestacao_id: string
  unidade: { id: string; nome: string }
  paciente: {
    id: string
    nome_mascarado: string
    cpf_ultimos4?: string | null
    cartao_sus_ultimos4?: string | null
  }
  tipo_risco_gestacao: string
}

function todayIsoDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function ConsultaStreamPanel({
  variant = 'embedded',
  initialConsultaId = '',
  onStreamTexts,
}: ConsultaStreamPanelProps) {
  const wsBase = getWsBaseUrl()
  const { token, authFetch } = useAuth()

  const [consultaId, setConsultaId] = useState(() => (variant === 'streamOnly' ? initialConsultaId : ''))
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('desconectado')
  const [streamError, setStreamError] = useState<string | null>(null)
  const [sttText, setSttText] = useState('')
  const [iaText, setIaText] = useState('')
  const [history, setHistory] = useState<StreamHistoryItem[]>([])
  const [logLines, setLogLines] = useState<string[]>([])

  const [micDevices, setMicDevices] = useState<AudioInputDevice[]>([])
  const [micDeviceId, setMicDeviceId] = useState<string>('')
  const [micBusy, setMicBusy] = useState(false)

  const [worklist, setWorklist] = useState<WorklistRow[]>([])
  const [unidades, setUnidades] = useState<UnidadeRow[]>([])
  const [pacientes, setPacientes] = useState<PacienteRow[]>([])
  const [gestacoes, setGestacoes] = useState<GestacaoRow[]>([])
  const [selPacienteId, setSelPacienteId] = useState('')
  const [selGestacaoId, setSelGestacaoId] = useState('')
  const [selUnidadeId, setSelUnidadeId] = useState('')
  const [dataConsulta, setDataConsulta] = useState(todayIsoDate)
  const [novoPacienteNome, setNovoPacienteNome] = useState('')
  const [novoPacienteCpf, setNovoPacienteCpf] = useState('')
  const [novoPacienteCartaoSus, setNovoPacienteCartaoSus] = useState('')
  const [clinicalBusy, setClinicalBusy] = useState(false)
  const [clinicalNote, setClinicalNote] = useState<string | null>(null)
  const [verificacaoMsg, setVerificacaoMsg] = useState<string | null>(null)

  const socketRef = useRef<ConsultationSocketHandle | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)

  useEffect(() => {
    if (variant === 'streamOnly' && initialConsultaId && initialConsultaId !== consultaId) {
      setConsultaId(initialConsultaId)
    }
  }, [variant, initialConsultaId, consultaId])

  useEffect(() => {
    onStreamTexts?.(sttText, iaText)
  }, [sttText, iaText, onStreamTexts])

  const pushLog = useCallback((line: string) => {
    setLogLines((prev) => [...prev.slice(-80), `${new Date().toISOString().slice(11, 19)} ${line}`])
  }, [])

  const refreshMicDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setMicDevices([])
      return
    }
    try {
      const list = await navigator.mediaDevices.enumerateDevices()
      const mics = list
        .filter((d) => d.kind === 'audioinput')
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label || `Microfone ${idx + 1}`,
        }))
      setMicDevices(mics)
      setMicDeviceId((curr) => (curr && mics.some((m) => m.deviceId === curr) ? curr : ''))
    } catch {
      setMicDevices([])
    }
  }, [])

  const requestMicPermissionAndRefresh = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return
    setMicBusy(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
      await refreshMicDevices()
      pushLog('Permissão de microfone OK; lista atualizada.')
      setStreamError(null)
    } catch {
      setStreamError('Permissão de microfone negada ou indisponível.')
    } finally {
      setMicBusy(false)
    }
  }, [pushLog, refreshMicDevices])

  useEffect(() => {
    void refreshMicDevices()
  }, [refreshMicDevices])

  const loadWorklist = useCallback(async () => {
    if (!token) return
    try {
      const res = await authFetch('/api/v1/consultas/disponiveis-stream')
      if (!res.ok) {
        setClinicalNote(`Worklist: HTTP ${res.status}`)
        return
      }
      const json = (await res.json()) as WorklistRow[]
      setWorklist(Array.isArray(json) ? json : [])
      setClinicalNote(null)
    } catch {
      setClinicalNote('Falha ao carregar consultas disponíveis.')
    }
  }, [authFetch, token])

  const loadUnidades = useCallback(async () => {
    if (!token) return
    try {
      const res = await authFetch('/api/v1/unidades')
      if (!res.ok) return
      const json = (await res.json()) as UnidadeRow[]
      if (Array.isArray(json) && json.length > 0) {
        setUnidades(json)
        setSelUnidadeId((u) => u || json[0].id)
      }
    } catch {
      /* noop */
    }
  }, [authFetch, token])

  const loadPacientes = useCallback(async () => {
    if (!token) return
    try {
      const res = await authFetch('/api/v1/pacientes')
      if (!res.ok) return
      const json = (await res.json()) as PacienteRow[]
      setPacientes(Array.isArray(json) ? json : [])
    } catch {
      /* noop */
    }
  }, [authFetch, token])

  const loadGestacoes = useCallback(
    async (pacienteId: string) => {
      if (!token || !pacienteId) {
        setGestacoes([])
        return
      }
      try {
        const res = await authFetch(`/api/v1/gestacoes?paciente_id=${encodeURIComponent(pacienteId)}`)
        if (!res.ok) {
          setGestacoes([])
          return
        }
        const json = (await res.json()) as GestacaoRow[]
        setGestacoes(Array.isArray(json) ? json : [])
        setSelGestacaoId('')
      } catch {
        setGestacoes([])
      }
    },
    [authFetch, token],
  )

  useEffect(() => {
    if (!token || variant === 'streamOnly') {
      setWorklist([])
      if (!token) {
        setUnidades([])
        setPacientes([])
        setGestacoes([])
      }
      return
    }
    void loadUnidades()
    void loadPacientes()
    void loadWorklist()
  }, [token, variant, loadUnidades, loadPacientes, loadWorklist])

  useEffect(() => {
    if (selPacienteId) {
      void loadGestacoes(selPacienteId)
    } else {
      setGestacoes([])
      setSelGestacaoId('')
    }
  }, [selPacienteId, loadGestacoes])

  const disconnect = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop()
      } catch {
        /* noop */
      }
    }
    recorderRef.current = null
    socketRef.current?.close()
    socketRef.current = null
    setStreamStatus('desconectado')
    pushLog('WebSocket fechado.')
  }, [pushLog])

  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  const onServerEvent = useCallback(
    (msg: ConsultationServerMessage) => {
      switch (msg.type) {
        case 'ready':
          pushLog(`ready consulta=${msg.consultaId}`)
          setStreamStatus('conectado')
          setStreamError(null)
          break
        case 'history':
          setHistory(msg.eventos)
          pushLog(`history: ${msg.eventos.length} evento(s)`)
          break
        case 'stt_partial':
          setSttText(msg.text)
          break
        case 'ia_token':
          setIaText((t) => t + msg.token)
          break
        case 'ia_done':
          setIaText((t) => (t ? `${t}\n` : t))
          pushLog('ia_done')
          break
        case 'error':
          setStreamError(msg.message)
          pushLog(`error: ${msg.message}`)
          break
        default:
          break
      }
    },
    [pushLog],
  )

  const connect = useCallback(() => {
    if (!token.trim()) {
      setStreamError('Faça login para obter o token.')
      return
    }
    const id = consultaId.trim()
    if (!uuidRe.test(id)) {
      setStreamError('Informe um UUID de consulta válido.')
      return
    }

    disconnect()
    setStreamStatus('conectando')
    setStreamError(null)
    setSttText('')
    setIaText('')
    setHistory([])
    pushLog(`Conectando… ${wsBase}/ws/consultation/…`)

    const handle = openConsultationSocket(id, token, {
      onOpen: () => pushLog('socket open'),
      onClose: (ev: CloseEvent) => {
        pushLog(`socket close code=${ev.code}`)
        setStreamStatus((s) => (s === 'conectando' ? 'erro' : 'desconectado'))
        socketRef.current = null
      },
      onSocketError: () => {
        setStreamError('Erro de transporte no WebSocket.')
        setStreamStatus('erro')
      },
      onEvent: onServerEvent,
    })
    socketRef.current = handle
  }, [consultaId, disconnect, onServerEvent, pushLog, token, wsBase])

  const sendVad = useCallback(() => {
    socketRef.current?.sendVadPause()
    pushLog('vad_pause enviado')
  }, [pushLog])

  const startMic = useCallback(async (opts?: { deviceId?: string; forceBrowserPrompt?: boolean }) => {
    if (!socketRef.current || socketRef.current.readyState() !== WebSocket.OPEN) {
      setStreamError('Conecte o stream antes de capturar áudio.')
      return
    }
    try {
      const deviceId = opts?.deviceId?.trim() || ''
      const forceBrowserPrompt = opts?.forceBrowserPrompt === true
      const audioConstraint: MediaTrackConstraints | boolean =
        !forceBrowserPrompt && deviceId ? ({ deviceId: { exact: deviceId } } as MediaTrackConstraints) : true

      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint })
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : ''
      if (!mime) {
        setStreamError('MediaRecorder WebM indisponível neste navegador.')
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      const rec = new MediaRecorder(stream, { mimeType: mime })
      recorderRef.current = rec
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          socketRef.current?.sendBinary(ev.data)
        }
      }
      rec.start(400)
      pushLog(`Gravação iniciada (${mime})${deviceId && !forceBrowserPrompt ? ` · mic=${deviceId.slice(0, 8)}…` : ''}.`)
    } catch {
      setStreamError('Permissão de microfone negada ou indisponível.')
    }
  }, [pushLog])

  const stopMic = useCallback(() => {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') {
      rec.stop()
      rec.stream.getTracks().forEach((t) => t.stop())
      pushLog('Gravação parada.')
    }
    recorderRef.current = null
  }, [pushLog])

  const verificarIdentificadores = useCallback(async () => {
    const cpf = novoPacienteCpf.trim()
    const cartao = novoPacienteCartaoSus.trim()
    if (!token || (!cpf && !cartao)) {
      setVerificacaoMsg('Informe CPF e/ou Cartão SUS para verificar duplicidade.')
      return
    }
    setVerificacaoMsg(null)
    try {
      const res = await authFetch('/api/v1/pacientes/verificar-identificadores', {
        method: 'POST',
        body: JSON.stringify({ ...(cpf ? { cpf } : {}), ...(cartao ? { cartao_sus: cartao } : {}) }),
      })
      const body = await readJsonBody(res)
      if (!res.ok) {
        setVerificacaoMsg(apiErrorMessage(body, res.status))
        return
      }
      const parts: string[] = []
      if (body.cpf_em_uso === true) {
        parts.push(`CPF já cadastrado (paciente_id ${String(body.paciente_id_cpf ?? '?')})`)
      }
      if (body.cartao_em_uso === true) {
        parts.push(`Cartão SUS já cadastrado (paciente_id ${String(body.paciente_id_cartao ?? '?')})`)
      }
      setVerificacaoMsg(parts.length ? parts.join(' · ') : 'Nenhum conflito: CPF/Cartão ainda não vistos na base.')
    } catch {
      setVerificacaoMsg('Falha ao verificar identificadores.')
    }
  }, [authFetch, novoPacienteCartaoSus, novoPacienteCpf, token])

  const criarPaciente = useCallback(async () => {
    const nome = novoPacienteNome.trim()
    const cpf = novoPacienteCpf.trim()
    const cartao = novoPacienteCartaoSus.trim()
    if (!token || !nome) {
      setClinicalNote('Informe um nome mascarado para o novo paciente.')
      return
    }
    if (!cpf && !cartao) {
      setClinicalNote('Informe CPF e/ou Cartão SUS (só os últimos 4 dígitos ficam gravados).')
      return
    }
    setClinicalBusy(true)
    setClinicalNote(null)
    try {
      const res = await authFetch('/api/v1/pacientes', {
        method: 'POST',
        body: JSON.stringify({
          nome_mascarado: nome,
          ...(cpf ? { cpf } : {}),
          ...(cartao ? { cartao_sus: cartao } : {}),
        }),
      })
      const body = await readJsonBody(res)
      if (!res.ok) {
        setClinicalNote(apiErrorMessage(body, res.status))
        return
      }
      const id = typeof body.id === 'string' ? body.id : ''
      const nomeResp = typeof body.nome_mascarado === 'string' ? body.nome_mascarado : nome
      if (!id) {
        setClinicalNote('Resposta inesperada do servidor (sem id do paciente).')
        return
      }
      setNovoPacienteNome('')
      setNovoPacienteCpf('')
      setNovoPacienteCartaoSus('')
      await loadPacientes()
      setSelPacienteId(id)
      setClinicalNote(`Paciente criado: ${nomeResp} (${id}).`)
      pushLog(`paciente criado id=${id}`)
    } catch {
      setClinicalNote('Falha ao criar paciente.')
    } finally {
      setClinicalBusy(false)
    }
  }, [authFetch, loadPacientes, novoPacienteCartaoSus, novoPacienteCpf, novoPacienteNome, pushLog, token])

  const criarGestacaoVazia = useCallback(async () => {
    if (!token || !selPacienteId) {
      setClinicalNote('Selecione um paciente antes de criar a gestação.')
      return
    }
    setClinicalBusy(true)
    setClinicalNote(null)
    try {
      const res = await authFetch('/api/v1/gestacoes', {
        method: 'POST',
        body: JSON.stringify({ paciente_id: selPacienteId }),
      })
      const body = await readJsonBody(res)
      if (!res.ok) {
        setClinicalNote(apiErrorMessage(body, res.status))
        return
      }
      const gid = typeof body.id === 'string' ? body.id : ''
      if (!gid) {
        setClinicalNote('Resposta inesperada do servidor (sem id da gestação).')
        return
      }
      await loadGestacoes(selPacienteId)
      setSelGestacaoId(gid)
      setClinicalNote(`Gestação (perfil) criada: ${gid}`)
      pushLog(`gestacao criada id=${gid}`)
    } catch {
      setClinicalNote('Falha ao criar gestação.')
    } finally {
      setClinicalBusy(false)
    }
  }, [authFetch, loadGestacoes, selPacienteId, pushLog, token])

  const criarConsulta = useCallback(async () => {
    if (!token || !selGestacaoId || !selUnidadeId) {
      setClinicalNote('Selecione gestação e unidade.')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataConsulta)) {
      setClinicalNote('Data da consulta inválida (use AAAA-MM-DD).')
      return
    }
    setClinicalBusy(true)
    setClinicalNote(null)
    try {
      const res = await authFetch('/api/v1/consultas', {
        method: 'POST',
        body: JSON.stringify({
          gestacao_id: selGestacaoId,
          unidade_id: selUnidadeId,
          data: dataConsulta,
        }),
      })
      const body = await readJsonBody(res)
      if (!res.ok) {
        setClinicalNote(apiErrorMessage(body, res.status))
        return
      }
      const cid = typeof body.id === 'string' ? body.id : ''
      if (!cid) {
        setClinicalNote(apiErrorMessage(body, res.status))
        return
      }
      setConsultaId(cid)
      await loadWorklist()
      setClinicalNote(`Consulta criada. UUID (campo id): ${cid} — já preenchido abaixo para o stream.`)
      pushLog(`consulta criada id=${cid}`)
    } catch {
      setClinicalNote('Falha ao criar consulta.')
    } finally {
      setClinicalBusy(false)
    }
  }, [authFetch, dataConsulta, loadWorklist, selGestacaoId, selUnidadeId, pushLog, token])

  const showClinicalChrome = token && variant !== 'streamOnly'

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {variant === 'streamOnly' ? 'Escriba — captura em tempo real' : 'Área técnica — stream e cadastro rápido'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            UUID da consulta no <code className="rounded bg-slate-100 px-1">POST /api/v1/consultas</code> ou na
            worklist. WebSocket: <span className="font-mono text-xs">{wsBase}/ws/consultation/:id</span>.
          </p>
        </div>
        {variant === 'streamOnly' ? (
          <Link
            to="/dashboard"
            className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
          >
            Voltar à agenda
          </Link>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 border-t border-slate-100 pt-6">
        {variant !== 'streamOnly' && !token ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            Sessão necessária para carregar dados clínicos.{' '}
            <Link className="font-medium underline" to="/login">
              Ir para login
            </Link>
            .
          </div>
        ) : null}

        {showClinicalChrome && clinicalNote ? (
          <div className="rounded-md border border-amber-200 bg-amber-50/90 px-3 py-2 text-sm text-amber-950">
            {clinicalNote}
          </div>
        ) : null}

        {showClinicalChrome ? (
          <div className="rounded-md border border-rose-100 bg-rose-50/50 p-4">
            <h3 className="text-sm font-semibold text-slate-800">Consultas disponíveis (worklist)</h3>
            <p className="mt-1 text-xs text-slate-600">
              Consultas com status diferente de <code className="rounded bg-white px-1">CONFIRMADA</code>. Clique em
              &quot;Usar&quot; para copiar o UUID no campo do stream.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={clinicalBusy}
                onClick={() => void loadWorklist()}
                className="rounded-md border border-rose-200 bg-white px-3 py-1.5 text-sm text-rose-900 hover:bg-rose-50 disabled:opacity-50"
              >
                Atualizar lista
              </button>
            </div>
            <div className="mt-3 max-h-56 overflow-auto rounded-md border border-rose-100 bg-white">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-rose-100/80 text-rose-950">
                  <tr>
                    <th className="px-2 py-2">Data</th>
                    <th className="px-2 py-2">Paciente / id</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">UUID consulta</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {worklist.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-2 py-3 text-slate-500">
                        Nenhuma consulta aberta. Crie paciente → gestação → consulta na seção seguinte.
                      </td>
                    </tr>
                  ) : null}
                  {worklist.map((w) => {
                    const idLine = [
                      w.paciente.cpf_ultimos4 ? `CPF …${w.paciente.cpf_ultimos4}` : null,
                      w.paciente.cartao_sus_ultimos4 ? `SUS …${w.paciente.cartao_sus_ultimos4}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                    return (
                    <tr key={w.id} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 whitespace-nowrap">{w.data}</td>
                      <td className="px-2 py-1.5">
                        <div className="font-medium">{w.paciente.nome_mascarado}</div>
                        {idLine ? <div className="text-[10px] text-slate-500">{idLine}</div> : null}
                      </td>
                      <td className="px-2 py-1.5">{w.status}</td>
                      <td className="px-2 py-1.5 font-mono text-[10px] text-slate-700">{w.id}</td>
                      <td className="px-2 py-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setConsultaId(w.id)
                            pushLog(`UUID selecionado: ${w.id}`)
                          }}
                          className="rounded bg-rose-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-rose-500"
                        >
                          Usar
                        </button>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {showClinicalChrome ? (
          <div className="rounded-md border border-slate-200 bg-slate-50/80 p-4">
            <h3 className="text-sm font-semibold text-slate-800">Criar perfil (gestação vazia) e nova consulta</h3>
            <p className="mt-1 text-xs text-slate-600">
              A gestação liga-se ao paciente (a gestante). CPF/Cartão ficam como hash em{' '}
              <code className="rounded bg-white px-1">paciente_ids</code> (mesmo pepper do backend) para evitar
              homônimos; só os últimos 4 dígitos ficam em <code className="rounded bg-white px-1">paciente</code> para
              leitura rápida na agenda.
            </p>
            <div className="mt-3 grid max-w-2xl gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2 flex flex-wrap items-end gap-2">
                <div className="min-w-[12rem] flex-1">
                  <label className="text-xs font-medium text-slate-500">Novo paciente (nome mascarado)</label>
                  <input
                    value={novoPacienteNome}
                    onChange={(e) => setNovoPacienteNome(e.target.value)}
                    placeholder="ex.: Maria S***"
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="min-w-[10rem] flex-1">
                  <label className="text-xs font-medium text-slate-500">CPF (completo na digitação; só ***4 gravado)</label>
                  <input
                    value={novoPacienteCpf}
                    onChange={(e) => setNovoPacienteCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    autoComplete="off"
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="min-w-[10rem] flex-1">
                  <label className="text-xs font-medium text-slate-500">Cartão SUS (completo; só ***4 gravado)</label>
                  <input
                    value={novoPacienteCartaoSus}
                    onChange={(e) => setNovoPacienteCartaoSus(e.target.value)}
                    placeholder="15+ dígitos"
                    autoComplete="off"
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <button
                  type="button"
                  disabled={clinicalBusy}
                  onClick={() => void verificarIdentificadores()}
                  className="rounded-md border border-slate-400 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                >
                  Verificar CPF/SUS
                </button>
                <button
                  type="button"
                  disabled={clinicalBusy}
                  onClick={() => void criarPaciente()}
                  className="rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  Criar paciente
                </button>
              </div>
              {verificacaoMsg ? <p className="text-sm text-rose-900">{verificacaoMsg}</p> : null}
              <div>
                <label className="text-xs font-medium text-slate-500">Paciente</label>
                <select
                  value={selPacienteId}
                  onChange={(e) => setSelPacienteId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value="">— selecione —</option>
                  {pacientes.map((p) => {
                    const idf = [p.cpf_ultimos4 ? `CPF …${p.cpf_ultimos4}` : null, p.cartao_sus_ultimos4 ? `SUS …${p.cartao_sus_ultimos4}` : null]
                      .filter(Boolean)
                      .join(' · ')
                    return (
                      <option key={p.id} value={p.id}>
                        {p.nome_mascarado}
                        {idf ? ` (${idf})` : ''}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label className="text-xs font-medium text-slate-500">Gestação (perfil)</label>
                  <select
                    value={selGestacaoId}
                    onChange={(e) => setSelGestacaoId(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">— selecione ou crie —</option>
                    {gestacoes.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.id.slice(0, 8)}… (risco {g.tipo_risco ?? '—'})
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  disabled={clinicalBusy || !selPacienteId}
                  onClick={() => void criarGestacaoVazia()}
                  className="shrink-0 rounded-md border border-slate-400 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                >
                  + Gestação vazia
                </button>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Unidade</label>
                <select
                  value={selUnidadeId}
                  onChange={(e) => setSelUnidadeId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value="">— sem unidade no banco —</option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Data da consulta</label>
                <input
                  type="date"
                  value={dataConsulta}
                  onChange={(e) => setDataConsulta(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  disabled={clinicalBusy || !selGestacaoId || !selUnidadeId}
                  onClick={() => void criarConsulta()}
                  className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  Criar consulta (sessão) e preencher UUID
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎙️</span>
              <h3 className="text-sm font-black text-slate-800">Stream</h3>
              <span className="text-xs text-slate-500">
                status <span className="font-bold text-slate-800">{streamStatus}</span>
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={connect}
                disabled={!token || streamStatus === 'conectando'}
                className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-black text-white shadow-sm hover:bg-rose-500 disabled:opacity-50"
                title="Conectar WebSocket"
              >
                🔌 {streamStatus === 'conectando' ? 'Conectando…' : 'Conectar'}
              </button>
              <button
                type="button"
                onClick={disconnect}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-black text-slate-800 shadow-sm hover:bg-slate-50"
                title="Desconectar"
              >
                ⛔ Desconectar
              </button>
              <button
                type="button"
                onClick={sendVad}
                className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-black text-amber-950 shadow-sm hover:bg-amber-100"
                title="Pausa VAD"
              >
                ⏸️ VAD
              </button>
              <button
                type="button"
                onClick={() => void startMic({ deviceId: micDeviceId || undefined, forceBrowserPrompt: !micDeviceId })}
                className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-950 shadow-sm hover:bg-emerald-100"
                title="Iniciar microfone"
              >
                🎙️ Iniciar
              </button>
              <button
                type="button"
                onClick={stopMic}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-black text-slate-800 shadow-sm hover:bg-slate-50"
                title="Parar microfone"
              >
                ⏹️ Parar
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">UUID</label>
                <input
                  placeholder="550e8400-e29b-41d4-a716-446655440000"
                  value={consultaId}
                  onChange={(e) => setConsultaId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm bg-white shadow-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => void requestMicPermissionAndRefresh()}
                disabled={micBusy}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-black text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                title="Permitir/atualizar microfones"
              >
                🔄 Atualizar mics
              </button>
            </div>

            <div className="grid gap-2 md:grid-cols-[1fr_auto] items-end">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Microfone</label>
                <select
                  value={micDeviceId}
                  onChange={(e) => setMicDeviceId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white shadow-sm"
                  title="Selecionar microfone"
                >
                  <option value="">Automático (navegador)</option>
                  {micDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMicDeviceId('')
                  void startMic({ forceBrowserPrompt: true })
                }}
                className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm font-black text-emerald-800 shadow-sm hover:bg-emerald-50"
                title="Usar escolha do navegador"
              >
                🧭 Usar navegador
              </button>
            </div>

            {streamError ? <p className="text-sm font-bold text-rose-700">{streamError}</p> : null}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border border-slate-100 bg-slate-50 p-4">
            <h4 className="text-xs font-semibold uppercase text-slate-500">Histórico persistido</h4>
            <ul className="mt-2 max-h-40 overflow-auto font-mono text-xs text-slate-800">
              {history.length === 0 ? <li className="text-slate-500">(vazio até o servidor enviar history)</li> : null}
              {history.map((h, i) => (
                <li key={`${h.createdAt}-${h.tipo}-${i}`} className="border-b border-slate-200 py-1">
                  <span className="text-slate-500">{h.tipo}</span> · {h.payload.slice(0, 120)}
                  {h.payload.length > 120 ? '…' : ''}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border border-slate-100 bg-slate-50 p-4">
            <h4 className="text-xs font-semibold uppercase text-slate-500">STT parcial (efêmero)</h4>
            <p className="mt-2 min-h-[3rem] whitespace-pre-wrap text-sm text-slate-900">{sttText || '—'}</p>
            <h4 className="mt-4 text-xs font-semibold uppercase text-slate-500">Insight IA (stream)</h4>
            <p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-sm text-rose-950">{iaText || '—'}</p>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase text-slate-500">Log</h4>
          <pre className="mt-2 max-h-36 overflow-auto rounded-md bg-slate-900 p-3 font-mono text-[11px] text-slate-100">
            {logLines.length ? logLines.join('\n') : '—'}
          </pre>
        </div>
      </div>
    </section>
  )
}
