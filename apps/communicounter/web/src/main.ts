import {
  Effect,
  Match as M,
  Option as O,
  Queue,
  Schema as S,
  Stream,
  pipe,
} from 'effect'
import {
  Command,
  ManagedResource,
  Runtime,
  Subscription,
} from 'foldkit'
import type { ServiceOf } from 'foldkit/managedResource'
import { Document, html } from 'foldkit/html'
import { m } from 'foldkit/message'

import {
  encodeClientMessage,
  parseServerMessage,
} from '../../shared/protocol'

import { pushFromWs, subscribeRaw } from './wsInbox'

// MODEL

export const Model = S.Struct({
  count: S.Number,
  sync: S.Option(S.Struct({ url: S.String })),
})
export type Model = typeof Model.Type

// MESSAGE

export const ClickedDecrement = m('ClickedDecrement')
export const ClickedIncrement = m('ClickedIncrement')
export const ClickedReset = m('ClickedReset')
export const ClickedConnect = m('ClickedConnect')
export const ClickedDisconnect = m('ClickedDisconnect')

export const ReceivedState = m('ReceivedState', { count: S.Number })

export const SocketOpened = m('SocketOpened')
export const SocketClosed = m('SocketClosed')
export const SocketFailed = m('SocketFailed', { error: S.String })

export const SendOk = m('SendOk')
export const SendFailed = m('SendFailed')

export const Message = S.Union([
  ClickedDecrement,
  ClickedIncrement,
  ClickedReset,
  ClickedConnect,
  ClickedDisconnect,
  ReceivedState,
  SocketOpened,
  SocketClosed,
  SocketFailed,
  SendOk,
  SendFailed,
])
export type Message = typeof Message.Type

const ManagedResourceDeps = S.Struct({
  sync: S.Option(S.Struct({ url: S.String })),
})

const SubscriptionDeps = ManagedResourceDeps

export const SyncSocket = ManagedResource.tag<WebSocket>()('SyncSocket')

type WsResources = ServiceOf<typeof SyncSocket>

export const managedResources = ManagedResource.makeManagedResources(
  ManagedResourceDeps,
)<Model, Message>({
  sync: {
    resource: SyncSocket,
    modelToMaybeRequirements: (model) => model.sync,
    acquire: ({ url }) =>
      Effect.gen(function* () {
        const ws = yield* Effect.promise(
          () =>
            new Promise<WebSocket>((resolve, reject) => {
              const w = new WebSocket(url)
              w.onopen = () => resolve(w)
              w.onerror = () => reject(new Error('WebSocket connection failed'))
              w.onmessage = (ev) => {
                if (typeof ev.data === 'string') pushFromWs(ev.data)
              }
            }),
        )
        return ws
      }),
    release: (ws) =>
      Effect.sync(() => {
        ws.onmessage = null
        ws.close()
      }),
    onAcquired: () => SocketOpened(),
    onReleased: () => SocketClosed(),
    onAcquireError: (error) =>
      SocketFailed({ error: error instanceof Error ? error.message : String(error) }),
  },
})

export const subscriptions = Subscription.makeSubscriptions(SubscriptionDeps)<
  Model,
  Message
>({
  sync: {
    modelToDependencies: (model) => model.sync,
    dependenciesToStream: (deps) =>
      pipe(
        deps,
        O.match({
          onNone: () => Stream.empty,
          onSome: () =>
            Stream.callback<Message>((queue) =>
              Effect.acquireRelease(
                Effect.sync(() =>
                  subscribeRaw((data) => {
                    const parsed = parseServerMessage(data)
                    if (parsed) {
                      Queue.offerUnsafe(
                        queue,
                        ReceivedState({ count: parsed.count }),
                      )
                    }
                  }),
                ),
                (unsub) => Effect.sync(() => unsub()),
              ),
            ),
        }),
      ),
  },
})

const SendClientInc = Command.define('SendClientInc', SendOk, SendFailed)(
  Effect.gen(function* () {
    const ws = yield* SyncSocket.get
    ws.send(encodeClientMessage({ _tag: 'ClientInc' }))
    return SendOk()
  }).pipe(
    Effect.catchTag('ResourceNotAvailable', () => Effect.succeed(SendFailed())),
  ),
)

const SendClientDec = Command.define('SendClientDec', SendOk, SendFailed)(
  Effect.gen(function* () {
    const ws = yield* SyncSocket.get
    ws.send(encodeClientMessage({ _tag: 'ClientDec' }))
    return SendOk()
  }).pipe(
    Effect.catchTag('ResourceNotAvailable', () => Effect.succeed(SendFailed())),
  ),
)

const SendClientReset = Command.define('SendClientReset', SendOk, SendFailed)(
  Effect.gen(function* () {
    const ws = yield* SyncSocket.get
    ws.send(encodeClientMessage({ _tag: 'ClientReset' }))
    return SendOk()
  }).pipe(
    Effect.catchTag('ResourceNotAvailable', () => Effect.succeed(SendFailed())),
  ),
)

function defaultWsUrl(): string {
  const env = import.meta.env.VITE_WS_URL
  if (typeof env === 'string' && env.length > 0) return env
  const { protocol, host } = window.location
  const wsProto = protocol === 'https:' ? 'wss:' : 'ws:'
  return `${wsProto}//${host}/ws`
}

// UPDATE

export const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<Command.Command<Message, never, WsResources>>] =>
  M.value(message).pipe(
    M.withReturnType<
      readonly [
        Model,
        ReadonlyArray<Command.Command<Message, never, WsResources>>,
      ]
    >(),
    M.tagsExhaustive({
      ClickedConnect: () => [
        { ...model, sync: O.some({ url: defaultWsUrl() }) },
        [],
      ],
      ClickedDisconnect: () => [{ ...model, sync: O.none() }, []],
      ReceivedState: (m) => [{ ...model, count: m.count }, []],
      SocketOpened: () => [model, []],
      SocketClosed: () => [model, []],
      SocketFailed: () => [model, []],
      SendOk: () => [model, []],
      SendFailed: () => [model, []],
      ClickedIncrement: () =>
        O.isNone(model.sync)
          ? [{ ...model, count: model.count + 1 }, []]
          : [model, [SendClientInc()]],
      ClickedDecrement: () =>
        O.isNone(model.sync)
          ? [{ ...model, count: model.count - 1 }, []]
          : [model, [SendClientDec()]],
      ClickedReset: () =>
        O.isNone(model.sync)
          ? [{ ...model, count: 0 }, []]
          : [model, [SendClientReset()]],
    }),
  )

// INIT

export const init: Runtime.ProgramInit<Model, Message, void, never, WsResources> = () => [
  { count: 0, sync: O.some({ url: defaultWsUrl() }) },
  [],
]

// VIEW

const h = html<Message>()

const buttonStyle =
  'bg-black text-white hover:bg-gray-700 px-4 py-2 transition rounded'
const secondaryStyle =
  'border border-gray-400 text-gray-800 hover:bg-gray-100 px-4 py-2 transition rounded'

export const view = (model: Model): Document => ({
  title: `Counter: ${model.count}`,
  body: h.div(
    [
      h.Class(
        'min-h-screen bg-white flex flex-col items-center justify-center gap-6 p-6',
      ),
    ],
    [
      h.div(
        [h.Class('text-sm text-gray-500')],
        [
          O.isSome(model.sync)
            ? 'Multiplayer sync on'
            : 'Offline (clicks update locally only)',
        ],
      ),
      h.div(
        [h.Class('text-6xl font-bold text-gray-800')],
        [model.count.toString()],
      ),
      h.div(
        [h.Class('flex flex-wrap justify-center gap-4')],
        [
          h.button(
            [h.OnClick(ClickedDecrement()), h.Class(buttonStyle)],
            ['-'],
          ),
          h.button(
            [h.OnClick(ClickedReset()), h.Class(buttonStyle)],
            ['Reset'],
          ),
          h.button(
            [h.OnClick(ClickedIncrement()), h.Class(buttonStyle)],
            ['+'],
          ),
        ],
      ),
      h.div(
        [h.Class('flex flex-wrap justify-center gap-3')],
        O.isSome(model.sync)
          ? [
              h.button(
                [h.OnClick(ClickedDisconnect()), h.Class(secondaryStyle)],
                ['Disconnect live sync'],
              ),
            ]
          : [
              h.button(
                [h.OnClick(ClickedConnect()), h.Class(secondaryStyle)],
                ['Connect live sync'],
              ),
            ],
      ),
    ],
  ),
})
