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
  DEFAULT_COLOR,
  encodeClientMessage,
  normalizeHexColor,
  parseServerMessage,
} from '../../shared/protocol'

import { pushFromWs, subscribeRaw } from './wsInbox'

// MODEL

export const Model = S.Struct({
  color: S.String,
  sync: S.Option(S.Struct({ url: S.String })),
})
export type Model = typeof Model.Type

// MESSAGE

export const PickedColor = m('PickedColor', { color: S.String })
export const ClickedResetColor = m('ClickedResetColor')
export const ClickedConnect = m('ClickedConnect')
export const ClickedDisconnect = m('ClickedDisconnect')

export const ReceivedState = m('ReceivedState', { color: S.String })

export const SocketOpened = m('SocketOpened')
export const SocketClosed = m('SocketClosed')
export const SocketFailed = m('SocketFailed', { error: S.String })

export const SendOk = m('SendOk')
export const SendFailed = m('SendFailed')

export const Message = S.Union([
  PickedColor,
  ClickedResetColor,
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
                      const norm = normalizeHexColor(parsed.color)
                      if (norm) {
                        Queue.offerUnsafe(queue, ReceivedState({ color: norm }))
                      }
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

const SendClientColor = Command.define(
  'SendClientColor',
  { color: S.String },
  SendOk,
  SendFailed,
)(({ color }) =>
  Effect.gen(function* () {
    const ws = yield* SyncSocket.get
    ws.send(encodeClientMessage({ _tag: 'ClientSetColor', color }))
    return SendOk()
  }).pipe(
    Effect.catchTag('ResourceNotAvailable', () => Effect.succeed(SendFailed())),
  ),
)

const SendClientResetColor = Command.define(
  'SendClientResetColor',
  SendOk,
  SendFailed,
)(
  Effect.gen(function* () {
    const ws = yield* SyncSocket.get
    ws.send(encodeClientMessage({ _tag: 'ClientResetColor' }))
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

function defaultModelColor(): string {
  return normalizeHexColor(DEFAULT_COLOR) ?? DEFAULT_COLOR
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
      ReceivedState: (msg) => {
        const norm = normalizeHexColor(msg.color)
        if (norm === undefined) return [model, []]
        return [{ ...model, color: norm }, []]
      },
      SocketOpened: () => [model, []],
      SocketClosed: () => [model, []],
      SocketFailed: () => [model, []],
      SendOk: () => [model, []],
      SendFailed: () => [model, []],
      PickedColor: (msg) => {
        const norm = normalizeHexColor(msg.color)
        if (norm === undefined) return [model, []]
        const nextModel = { ...model, color: norm }
        if (O.isNone(model.sync)) {
          return [nextModel, []]
        }
        return [nextModel, [SendClientColor({ color: norm })]]
      },
      ClickedResetColor: () => {
        const norm = defaultModelColor()
        const nextModel = { ...model, color: norm }
        if (O.isNone(model.sync)) {
          return [nextModel, []]
        }
        return [nextModel, [SendClientResetColor()]]
      },
    }),
  )

// INIT

export const init: Runtime.ProgramInit<Model, Message, void, never, WsResources> = () => [
  { color: defaultModelColor(), sync: O.some({ url: defaultWsUrl() }) },
  [],
]

// VIEW

const h = html<Message>()

const buttonStyle =
  'bg-gray-900 text-white hover:bg-gray-700 px-4 py-2 transition rounded'
const secondaryStyle =
  'border border-gray-400 text-gray-800 hover:bg-gray-100 px-4 py-2 transition rounded'

export const view = (model: Model): Document => ({
  title: `Color: ${model.color}`,
  body: h.div(
    [
      h.Class(
        'min-h-screen flex flex-col items-center justify-center gap-6 p-6 text-gray-900',
      ),
      h.Style({ backgroundColor: model.color }),
    ],
    [
      h.div(
        [h.Class('rounded-2xl bg-white/90 shadow-lg px-8 py-6 flex flex-col items-center gap-6 max-w-md w-full')],
        [
          h.div(
            [h.Class('text-sm text-gray-600')],
            [
              O.isSome(model.sync)
                ? 'Multiplayer sync on'
                : 'Offline (picker updates this tab only)',
            ],
          ),
          h.div(
            [
              h.Class(
                'w-full h-32 rounded-xl border-2 border-gray-200 shadow-inner',
              ),
              h.Style({ backgroundColor: model.color }),
            ],
            [],
          ),
          h.p(
            [h.Class('font-mono text-lg tracking-wide')],
            [model.color],
          ),
          h.div(
            [h.Class('flex flex-col gap-4 w-full items-stretch')],
            [
              h.label([h.Class('text-sm font-medium text-gray-700')], [
                'Pick a color',
                h.input([
                  h.Type('color'),
                  h.Class('mt-2 w-full h-12 cursor-pointer rounded border border-gray-300'),
                  h.Value(model.color),
                  h.OnInput((value) => PickedColor({ color: value })),
                ]),
              ]),
              h.button(
                [h.OnClick(ClickedResetColor()), h.Class(buttonStyle)],
                ['Reset to default'],
              ),
            ],
          ),
          h.div(
            [h.Class('flex flex-wrap justify-center gap-3 w-full')],
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
    ],
  ),
})
