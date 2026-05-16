import { Option as O } from 'effect'
import { Scene } from 'foldkit'
import { describe, test } from 'vitest'

import { type Model, update, view } from './main'

const initialModel: Model = { count: 0, sync: O.none() }

describe('scene', () => {
  test('renders the initial count and three buttons', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel),
      Scene.expect(Scene.text('0')).toExist(),
      Scene.expect(Scene.role('button', { name: '+' })).toExist(),
      Scene.expect(Scene.role('button', { name: '-' })).toExist(),
      Scene.expect(Scene.role('button', { name: 'Reset' })).toExist(),
    )
  })

  test('clicking + increments the displayed count', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel),
      Scene.click(Scene.role('button', { name: '+' })),
      Scene.expect(Scene.text('1')).toExist(),
      Scene.click(Scene.role('button', { name: '+' })),
      Scene.expect(Scene.text('2')).toExist(),
    )
  })

  test('clicking - decrements the displayed count', () => {
    Scene.scene(
      { update, view },
      Scene.with({ count: 3, sync: O.none() }),
      Scene.click(Scene.role('button', { name: '-' })),
      Scene.expect(Scene.text('2')).toExist(),
    )
  })

  test('clicking - past zero produces a negative count', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel),
      Scene.click(Scene.role('button', { name: '-' })),
      Scene.expect(Scene.text('-1')).toExist(),
    )
  })

  test('Reset returns the count to zero', () => {
    Scene.scene(
      { update, view },
      Scene.with({ count: 42, sync: O.none() }),
      Scene.click(Scene.role('button', { name: 'Reset' })),
      Scene.expect(Scene.text('0')).toExist(),
    )
  })
})
