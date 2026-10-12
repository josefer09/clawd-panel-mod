// Assembles the pane from data the engine read: chrome around the open tab.
// Pure: the engine's `ui.render` hook reads state and hands it here.

import type { RenderElement } from 'claude-code'

import type { TabId } from '../../types'
import { footer, header, tabs } from './pane'
import { Line, rule } from './ui'
import type { Ctx } from './ui'

export type Chrome = {
  name: string
  version: string
  isWorking: boolean
  tab: TabId
  selectTab: (id: TabId) => void
}

/** The body columns the layout draws to: the pane's own, within what the boards were drawn for. */
export function bodyWidth(columns: number): number {
  return Math.max(30, Math.min(columns, 120))
}

export function pane(ctx: Ctx, chrome: Chrome, body: RenderElement): RenderElement {
  const { Box } = ctx.el
  return (
    <Box flexDirection="column" width={ctx.width}>
      {header(ctx, chrome.name, chrome.version, chrome.isWorking)}
      {tabs(ctx, chrome.tab, chrome.selectTab)}
      {rule(ctx)}
      {body}
      {rule(ctx)}
      {footer(ctx)}
    </Box>
  )
}

export function placeholder(ctx: Ctx, text: string): RenderElement {
  return Line(ctx, [{ t: text, fg: ctx.pal.D }], 'body')
}
