import { useEffect, useState } from 'react'

/** Nível RMS 0–100 a partir de um MediaStream (domínio do tempo). */
export function useAudioLevel(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0)

  useEffect(() => {
    if (!stream) {
      setLevel(0)
      return
    }

    const ctx = new AudioContext()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.35
    source.connect(analyser)
    const data = new Uint8Array(analyser.fftSize)
    let raf = 0

    const tick = () => {
      analyser.getByteTimeDomainData(data)
      let sumSq = 0
      for (let i = 0; i < data.length; i += 1) {
        const n = (data[i] - 128) / 128
        sumSq += n * n
      }
      const rms = Math.sqrt(sumSq / data.length)
      setLevel(Math.min(100, Math.round(rms * 320)))
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      void ctx.close()
    }
  }, [stream])

  return level
}

export function audioLevelHint(level: number): { label: string; tone: 'muted' | 'low' | 'ok' | 'hot' } {
  if (level < 4) return { label: 'Silêncio', tone: 'muted' }
  if (level < 18) return { label: 'Baixo', tone: 'low' }
  if (level < 75) return { label: 'Captando', tone: 'ok' }
  return { label: 'Forte', tone: 'hot' }
}
