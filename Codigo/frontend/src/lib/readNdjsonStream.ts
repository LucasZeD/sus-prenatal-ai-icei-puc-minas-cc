/**
 * Reads an `application/x-ndjson` body (one JSON object per line), e.g. clinical-ai stream.
 */
export async function readNdjsonStream(
  res: Response,
  onRow: (row: Record<string, unknown>) => void,
  onRawLine?: (line: string) => void,
): Promise<void> {
  if (!res.body) {
    throw new Error('Resposta sem corpo (stream).')
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n')
    buffer = parts.pop() ?? ''
    for (const line of parts) {
      const t = line.trim()
      if (!t) continue
      onRawLine?.(t)
      try {
        onRow(JSON.parse(t) as Record<string, unknown>)
      } catch {
        /* incomplete line or noise */
      }
    }
  }
  const tail = buffer.trim()
  if (tail) {
    onRawLine?.(tail)
    try {
      onRow(JSON.parse(tail) as Record<string, unknown>)
    } catch {
      /* ignore */
    }
  }
}
