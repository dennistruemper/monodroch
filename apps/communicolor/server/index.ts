import type { ClientMessage, ServerMessage } from '../shared/protocol.ts'
import {
  DEFAULT_COLOR,
  normalizeHexColor,
  parseClientMessage,
} from '../shared/protocol.ts'

const PORT = Number(process.env.PORT ?? 3002)

let color = normalizeHexColor(DEFAULT_COLOR) ?? DEFAULT_COLOR

const clients = new Set<WebSocket>()

function broadcast(state: ServerMessage) {
  const payload = JSON.stringify(state)
  for (const ws of clients) {
    try {
      ws.send(payload)
    } catch {
      clients.delete(ws)
    }
  }
}

function applyClientMessage(msg: ClientMessage): void {
  switch (msg._tag) {
    case 'ClientResetColor':
      color = normalizeHexColor(DEFAULT_COLOR) ?? DEFAULT_COLOR
      break
    case 'ClientSetColor': {
      const next = normalizeHexColor(msg.color)
      if (next === undefined) return
      color = next
      break
    }
    default:
      return
  }
  broadcast({ _tag: 'ServerState', color })
}

console.log(`communicolor WS listening on ws://localhost:${PORT}/ws`)

Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url)
    if (url.pathname !== '/ws') {
      return new Response('communicolor websocket server', { status: 200 })
    }
    const upgraded = server.upgrade(req)
    if (!upgraded) return new Response('expected websocket', { status: 400 })
    return undefined
  },
  websocket: {
    open(ws) {
      clients.add(ws)
      ws.send(JSON.stringify({ _tag: 'ServerState', color } satisfies ServerMessage))
    },
    message(ws, message) {
      const raw = typeof message === 'string' ? message : new TextDecoder().decode(message)
      const parsed = parseClientMessage(raw)
      if (parsed) applyClientMessage(parsed)
    },
    close(ws) {
      clients.delete(ws)
    },
  },
})
