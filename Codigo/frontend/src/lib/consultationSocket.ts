export type StreamHistoryItem = {
  tipo: string
  payload: string
  createdAt: string
}

export type ConsultationServerMessage =
  | { type: 'ready'; consultaId: string }
  | { type: 'history'; eventos: StreamHistoryItem[] }
  | { type: 'stt_partial'; text: string }
  | { type: 'ia_token'; token: string }
  | { type: 'ia_done' }
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
          ? { type: 'ready', consultaId: (v as { consultaId: string }).consultaId }
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
      case 'ia_token':
        return typeof (v as { token?: string }).token === 'string'
          ? { type: 'ia_token', token: (v as { token: string }).token }
          : null
      case 'ia_done':
        return { type: 'ia_done' }
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
