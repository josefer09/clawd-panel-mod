// Shared test fixtures: the render inputs the engine would pass, and stubs
// for the `$` calls the mod makes, recording what it asked for.

import type { TestBody } from 'claude-code/testing'

type On = Parameters<TestBody>[1]

export const SURFACES = ['terminal', 'desktop'] as const

export function paneInput(placement: 'dock' | 'inline' = 'dock', bodyColumns = 52, bodyRows = 46) {
  return {
    plugin: 'clawd-panel',
    component: 'Pane',
    requestId: 'clawd',
    viewport: { columns: 200, rows: 50, isFullscreen: placement === 'dock' },
    props: {
      title: 'Claude HUD',
      isFocused: true,
      bodyColumns,
      placement,
      scroll: { offset: 0, bodyRows },
      view: {},
    },
  } as const
}

/** A `command.run` input as the person typing it at a fullscreen terminal raises it. */
export function cmd(command: string, args = '') {
  return { command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } } as const
}

export type Recorder = {
  store: Map<string, unknown>
  opened: unknown[]
  closed: unknown[]
  toasts: string[]
  panes: { id: string }[]
}

/** Stubs the UI and store calls every test needs. */
export function stubBasics(on: On): Recorder {
  const rec: Recorder = { store: new Map(), opened: [], closed: [], toasts: [], panes: [] }
  on('store.get', ($, e) => ({ value: rec.store.get(e.key) }))
  on('store.set', ($, e) => {
    rec.store.set(e.key, e.value)
    return { value: undefined }
  })
  on('ui.open', ($, e) => {
    rec.opened.push(e)
    if (!rec.panes.some(p => p.id === e.id)) rec.panes.push({ id: e.id })
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    rec.closed.push(e)
    rec.panes = rec.panes.filter(p => p.id !== e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: rec.panes.map(p => ({ id: p.id, title: 'Claude HUD', isShown: true, isFocused: true, isPlaced: true })),
  }))
  on('ui.toast', ($, e) => {
    rec.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  return rec
}
