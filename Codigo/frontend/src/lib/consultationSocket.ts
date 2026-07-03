export type StreamHistoryItem = {
  tipo: string
  payload: string
  createdAt: string
}

export type DiarizedSegment = { speaker: string; role: string; text: string }

/** Campos clinicos extraidos pela IA (RF04) — chaves alinhadas a API. */
export type ConsultaClinicalFieldsPatch = {
  queixa?: string | null
  peso?: number | null
  pa_sistolica?: number | null
  pa_diastolica?: number | null
  idade_gestacional?: number | null
  au?: number | null
  bfc?: number | null
  mov_fetal?: string | null
  apresentacao_fetal?: string | null
  is_edema?: boolean
  is_exantema?: boolean
}

export type ConsultationServerMessage =
  | { type: 'ready'; consultaId: string; diarizationAvailable: boolean }
  | { type: 'history'; eventos: StreamHistoryItem[] }
  | { type: 'stt_partial'; text: string }
  | { type: 'stt_diarized'; segments: DiarizedSegment[] }
  | { type: 'ia_reset' }
  | { type: 'ia_token'; token: string }
  | { type: 'ia_done' }
  | {
      type: 'form_patch'
      patch: Partial<ConsultaClinicalFieldsPatch>
      source: 'ai_extract'
    }
  | { type: 'error'; message: string }

export type ConsultationSocketCallbacks = {
  onOpen?: () => void
  onClose?: (ev: CloseEvent) => void
  onSocketError?: () => void
  onEvent: (msg: ConsultationServerMessage) => void
}

import { getWsBaseUrl } from './apiBase.js'

export type ConsultationSocketHandle = {
  close: () => void
  sendVadPause: () => void
  sendMicState: (active: boolean) => void
  sendDiarizationState: (enabled: boolean) => void
  sendProntuarioDraft: (fields: Partial<ConsultaClinicalFieldsPatch>) => void
  sendBinary: (data: ArrayBuffer | Blob) => void
  readyState: () => number
}

function parseMessage(raw: string): ConsultationServerMessage | null {
  try {
    const v = JSON.parse(raw) as { type?: string }
    if (typeof v.type !== 'string') return null
    switch (v.type) {
      case 'ready':
        return typeof (v as { consultaId?: string }).consultaId === 'string'
          ? {
              type: 'ready',
              consultaId: (v as { consultaId: string }).consultaId,
              diarizationAvailable: (v as { diarizationAvailable?: boolean }).diarizationAvailable === true,
            }
          : null
      case 'history': {
        const eventos = (v as { eventos?: StreamHistoryItem[] }).eventos
        return Array.isArray(eventos)
          ? { type: 'history', eventos }
          : null
      }
      case 'stt_partial':
        return typeof (v as { text?: string }).text === 'string'
          ? { type: 'stt_partial', text: (v as { text: string }).text }
          : null
      case 'stt_diarized': {
        const raw = (v as { segments?: unknown }).segments
        if (!Array.isArray(raw)) return null
        const segments: DiarizedSegment[] = raw
          .filter(
            (s): s is DiarizedSegment =>
              typeof s === 'object' &&
              s !== null &&
              typeof (s as { speaker?: unknown }).speaker === 'string' &&
              typeof (s as { role?: unknown }).role === 'string' &&
              typeof (s as { text?: unknown }).text === 'string',
          )
          .map((s) => ({ speaker: s.speaker, role: s.role, text: s.text }))
        return { type: 'stt_diarized', segments }
      }
      case 'ia_reset':
        return { type: 'ia_reset' }
      case 'ia_token':
        return typeof (v as { token?: string }).token === 'string'
          ? { type: 'ia_token', token: (v as { token: string }).token }
          : null
      case 'ia_done':
        return { type: 'ia_done' }
      case 'form_patch': {
        const patch = (v as { patch?: unknown }).patch
        const source = (v as { source?: string }).source
        if (source !== 'ai_extract' || !patch || typeof patch !== 'object' || Array.isArray(patch)) {
          return null
        }
        return {
          type: 'form_patch',
          patch: patch as Partial<ConsultaClinicalFieldsPatch>,
          source: 'ai_extract',
        }
      }
      case 'error':
        return typeof (v as { message?: string }).message === 'string'
          ? { type: 'error', message: (v as { message: string }).message }
          : null
      default:
        return null
    }
  } catch {
    return null
  }
}

export function openConsultationSocket(
  consultaId: string,
  token: string,
  cb: ConsultationSocketCallbacks,
): ConsultationSocketHandle {
  const base = getWsBaseUrl()
  const q = new URLSearchParams({ token })
  const ws = new WebSocket(`${base}/ws/consultation/${encodeURIComponent(consultaId)}?${q.toString()}`)

  ws.onopen = () => {
    cb.onOpen?.()
  }
  ws.onclose = (ev) => {
    cb.onClose?.(ev)
  }
  ws.onerror = () => {
    cb.onSocketError?.()
  }
  ws.onmessage = (evt) => {
    if (typeof evt.data !== 'string') return
    const msg = parseMessage(evt.data)
    if (msg) {
      cb.onEvent(msg)
    }
  }

  return {
    close: () => {
      try {
        ws.close()
      } catch {
        /* noop */
      }
    },
    sendVadPause: () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'vad_pause' }))
      }
    },
    sendMicState: (active: boolean) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'mic_state', active }))
      }
    },
    sendDiarizationState: (enabled: boolean) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'diarization_state', enabled }))
      }
    },
    sendProntuarioDraft: (fields) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'prontuario_draft', fields }))
      }
    },
    sendBinary: (data) => {
      if (ws.readyState !== WebSocket.OPEN) return
      if (data instanceof Blob) {
        void data.arrayBuffer().then((buf) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(buf)
        })
        return
      }
      ws.send(data)
    },
    readyState: () => ws.readyState,
  }
}
