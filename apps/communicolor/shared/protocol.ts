/** Shared wire format for communicolor (JSON over WebSocket). */

export const DEFAULT_COLOR = '#3b82f6'

export type ClientMessage =
  | { readonly _tag: 'ClientSetColor'; readonly color: string }
  | { readonly _tag: 'ClientResetColor' }

export type ServerMessage = {
  readonly _tag: 'ServerState'
  readonly color: string
}

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
      'color' in v &&
      typeof (v as { color: unknown }).color === 'string'
    ) {
      return {
        _tag: 'ServerState',
        color: (v as { color: string }).color,
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
    if (tag === 'ClientResetColor') {
      return { _tag: 'ClientResetColor' }
    }
    if (
      tag === 'ClientSetColor' &&
      'color' in v &&
      typeof (v as { color: unknown }).color === 'string'
    ) {
      return { _tag: 'ClientSetColor', color: (v as { color: string }).color }
    }
  } catch {
    /* ignore */
  }
  return undefined
}

/** Returns lowercase #rrggbb or undefined. */
export function normalizeHexColor(raw: string): string | undefined {
  const s = raw.trim()
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s.toLowerCase()
  if (/^#[0-9A-Fa-f]{3}$/.test(s)) {
    const [, r, g, b] = s
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  return undefined
}
