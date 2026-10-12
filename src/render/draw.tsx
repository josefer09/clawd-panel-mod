// Assembles the pane from data the engine read: chrome around the open tab.
// Pure: the engine's `ui.render` hook reads state and hands it here.

import type { RenderElement } from 'claude-code'

import type { TabId } from '../../types'
import { footer, header, tabs } from './pane'
import { k } from './format'
import { len, Line, rule } from './ui'
import type { Ctx } from './ui'

export type Chrome = {
  name: string
  version: string
  isWorking: boolean
  tab: TabId
  selectTab: (id: TabId) => void
  /** The context alert while it stands and was not dismissed. */
  alert?: AlertBanner
}

export type AlertBanner = {
  percent: number
  tokens?: number
  window: number
  /** Where auto-compaction runs, as a % of the window, when it is on. */
  autoCompactAt?: number
  compact: () => void
  dismiss: () => void
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
      {chrome.alert ? alertBanner(ctx, chrome.alert) : null}
      {body}
      {rule(ctx)}
      {footer(ctx)}
    </Box>
  )
}

/** The alert of board 2a, inside the pane: inverse red, never red text alone. */
export function alertBanner(ctx: Ctx, a: AlertBanner): RenderElement {
  const p = ctx.pal
  const { Box, Button, Text } = ctx.el
  const head = `▲ Context at ${Math.round(a.percent)}% — compaction soon`
  const facts = [`${k(a.tokens)} / ${k(a.window)}`, ...(a.autoCompactAt !== undefined ? [`auto-compact at ${Math.round(a.autoCompactAt)}%`] : [])].join(' · ')
  return (
    <Box key="alert" flexDirection="column" width={ctx.width}>
      {Line(ctx, [{ t: head, fg: p.T, bg: p.R, b: true }, { t: ' '.repeat(Math.max(0, ctx.width - len(head))), bg: p.R }], 'alert-head')}
      {Line(ctx, [{ t: facts, fg: p.D }], 'alert-facts')}
      <Box flexDirection="row" columnGap={2}>
        <Button key="alert-compact" plain onPress={a.compact}>
          <Text color={p.G} bold>
            [ /compact now ]
          </Text>
        </Button>
        <Button key="alert-dismiss" plain onPress={a.dismiss}>
          <Text color={p.D}>[ Dismiss ]</Text>
        </Button>
      </Box>
      {rule(ctx)}
    </Box>
  )
}

export function placeholder(ctx: Ctx, text: string): RenderElement {
  return Line(ctx, [{ t: text, fg: ctx.pal.D }], 'body')
}
