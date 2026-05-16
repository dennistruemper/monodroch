import { Option as O } from 'effect'
import { Story } from 'foldkit'
import { describe, expect, test } from 'vitest'

import { DEFAULT_COLOR, normalizeHexColor } from '../../shared/protocol'
import {
  ClickedResetColor,
  PickedColor,
  type Model,
  update,
} from './main'

const offline = (color: string): Model => ({
  color,
  sync: O.none(),
})

const initialModel = offline(normalizeHexColor(DEFAULT_COLOR) ?? DEFAULT_COLOR)

describe('update', () => {
  test('PickedColor updates hex when offline', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(PickedColor({ color: '#00ff00' })),
      Story.Command.expectNone(),
      Story.model((model) => {
        expect(model.color).toBe('#00ff00')
      }),
    )
  })

  test('PickedColor with invalid input leaves model unchanged', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(PickedColor({ color: 'not-a-color' })),
      Story.Command.expectNone(),
      Story.model((model) => {
        expect(model.color).toBe(initialModel.color)
      }),
    )
  })

  test('ClickedResetColor restores default when offline', () => {
    Story.story(
      update,
      Story.with(offline('#000000')),
      Story.message(ClickedResetColor()),
      Story.Command.expectNone(),
      Story.model((model) => {
        expect(model.color).toBe(normalizeHexColor(DEFAULT_COLOR) ?? DEFAULT_COLOR)
      }),
    )
  })
})
