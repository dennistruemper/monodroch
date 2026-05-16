import type { ClientMessage, ServerMessage } from '../shared/protocol.ts'
import { parseClientMessage } from '../shared/protocol.ts'

const PORT = Number(process.env.PORT ?? 3001)

let count = 0

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

function applyClientIntent(msg: ClientMessage): void {
  switch (msg._tag) {
    case 'ClientInc':
      count += 1
      break
    case 'ClientDec':
      count -= 1
      break
    case 'ClientReset':
      count = 0
      break
    default:
      return
  }
  broadcast({ _tag: 'ServerState', count })
}

console.log(`communicounter WS listening on ws://localhost:${PORT}/ws`)

Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url)
    if (url.pathname !== '/ws') {
      return new Response('communicounter websocket server', { status: 200 })
    }
    const upgraded = server.upgrade(req)
    if (!upgraded) return new Response('expected websocket', { status: 400 })
    return undefined
  },
  websocket: {
    open(ws) {
      clients.add(ws)
      ws.send(JSON.stringify({ _tag: 'ServerState', count } satisfies ServerMessage))
    },
    message(ws, message) {
      const raw = typeof message === 'string' ? message : new TextDecoder().decode(message)
      const parsed = parseClientMessage(raw)
      if (parsed) applyClientIntent(parsed)
    },
    close(ws) {
      clients.delete(ws)
    },
  },
})
