import { Option as O } from 'effect'
import { Scene } from 'foldkit'
import { describe, test } from 'vitest'

import { DEFAULT_COLOR, normalizeHexColor } from '../../shared/protocol'
import { type Model, update, view } from './main'

const offline = (color: string): Model => ({
  color,
  sync: O.none(),
})

const initialModel = offline(normalizeHexColor(DEFAULT_COLOR) ?? DEFAULT_COLOR)

describe('scene', () => {
  test('renders color hex and color input', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel),
      Scene.expect(Scene.text(initialModel.color)).toExist(),
      Scene.expect(Scene.selector('input[type="color"]')).toExist(),
      Scene.expect(Scene.role('button', { name: 'Reset to default' })).toExist(),
    )
  })

  test('changing color via pick updates displayed hex (offline)', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel),
      Scene.type(
        Scene.selector('input[type="color"]'),
        '#ff0000',
      ),
      Scene.expect(Scene.text('#ff0000')).toExist(),
    )
  })
})
