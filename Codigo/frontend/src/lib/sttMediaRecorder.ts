/** STT: cada envio deve ser um WebM completo (dados obtidos no MediaRecorder.stop). */

export function pickWebmMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus'
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm'
  return ''
}

export type SttRecorderSession = {
  recorder: MediaRecorder
  mimeType: string
  chunks: Blob[]
}

/** Grava sem timeslice; o blob fica pronto no stop(). */
export function startSttMediaRecorder(stream: MediaStream, mimeType: string): SttRecorderSession {
  const chunks: Blob[] = []
  const recorder = new MediaRecorder(stream, { mimeType })
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data)
  }
  recorder.start()
  return { recorder, mimeType, chunks }
}

export function stopSttMediaRecorderSession(session: SttRecorderSession): Promise<Blob | null> {
  const { recorder, mimeType, chunks } = session
  if (recorder.state === 'inactive') {
    return Promise.resolve(chunks.length > 0 ? new Blob(chunks, { type: mimeType }) : null)
  }
  return new Promise((resolve, reject) => {
    recorder.onstop = () => {
      resolve(chunks.length > 0 ? new Blob(chunks, { type: mimeType }) : null)
    }
    recorder.onerror = () => reject(new Error('MediaRecorder stop failed'))
    try {
      recorder.stop()
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)))
    }
  })
}

/** Encerra a sessao atual (blob completo) e opcionalmente abre outra no mesmo stream. */
export async function cutSttMediaRecorderSegment(
  stream: MediaStream,
  mimeType: string,
  session: SttRecorderSession | null,
  restart: boolean,
): Promise<{ blob: Blob | null; session: SttRecorderSession | null }> {
  let blob: Blob | null = null
  if (session && session.recorder.state !== 'inactive') {
    blob = await stopSttMediaRecorderSession(session)
  } else if (session && session.chunks.length > 0) {
    blob = new Blob(session.chunks, { type: session.mimeType })
  }
  if (!restart) {
    return { blob, session: null }
  }
  return { blob, session: startSttMediaRecorder(stream, mimeType) }
}
