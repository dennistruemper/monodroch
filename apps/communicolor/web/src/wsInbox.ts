/** Bridges WebSocket onmessage (managed resource) into Foldkit subscription Stream. */

const listeners = new Set<(data: string) => void>()

export function pushFromWs(data: string): void {
  for (const l of listeners) {
    l(data)
  }
}

export function subscribeRaw(handler: (data: string) => void): () => void {
  listeners.add(handler)
  return () => {
    listeners.delete(handler)
  }
}
