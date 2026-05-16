/** Shared wire format for communicounter (JSON over WebSocket). */

export type ClientMessage =
  | { readonly _tag: 'ClientInc' }
  | { readonly _tag: 'ClientDec' }
  | { readonly _tag: 'ClientReset' }

export type ServerMessage = { readonly _tag: 'ServerState'; readonly count: number }

export function encodeClientMessage(msg: ClientMessage): string {
  return JSON.stringify(msg)
}

export function parseServerMessage(raw: string): ServerMessage | undefined {
  try {
    const v = JSON.parse(raw) as unknown
    if (
      typeof v === 'object' &&
      v !== null &&
      '_tag' in v &&
      (v as { _tag: unknown })._tag === 'ServerState' &&
      'count' in v &&
      typeof (v as { count: unknown }).count === 'number'
    ) {
      return {
        _tag: 'ServerState',
        count: (v as { count: number }).count,
      }
    }
  } catch {
    /* ignore */
  }
  return undefined
}

export function parseClientMessage(raw: string): ClientMessage | undefined {
  try {
    const v = JSON.parse(raw) as unknown
    if (typeof v !== 'object' || v === null || !('_tag' in v)) return undefined
    const tag = (v as { _tag: unknown })._tag
    if (tag === 'ClientInc' || tag === 'ClientDec' || tag === 'ClientReset') {
      return { _tag: tag } as ClientMessage
    }
  } catch {
    /* ignore */
  }
  return undefined
}
