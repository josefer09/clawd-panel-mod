// The pane's chrome: the header row, the tab row and the shortcut footer, as
// the mockup's `panel()` draws them around each tab. Pure: data in, tree out.

import type { RenderElement } from 'claude-code'

import type { TabId } from '../../types'
import { Line, spread } from './ui'
import type { Ctx, Span } from './ui'

export const TABS: readonly { id: TabId; label: string; hotkey: string }[] = [
  { id: 'home', label: 'Home', hotkey: '1' },
  { id: 'context', label: 'Context', hotkey: '2' },
  { id: 'agents', label: 'Agents', hotkey: '3' },
  { id: 'git', label: 'Git', hotkey: '4' },
  { id: 'avatar', label: 'Avatar', hotkey: '5' },
]

export function isTab(value: string): value is TabId {
  return TABS.some(t => t.id === value)
}

/** The header: the HUD's name and version, and whether a turn is running. */
export function header(ctx: Ctx, name: string, version: string, isWorking: boolean): RenderElement {
  const p = ctx.pal
  const live: Span = isWorking ? { t: '● live', fg: p.E } : { t: '○ idle', fg: p.D }
  return Line(ctx, spread(ctx.width, [{ t: name.toUpperCase(), fg: p.R, b: true }, { t: ` v${version}`, fg: p.D }], [live]), 'header')
}

/** The tab row: five plain buttons on hotkeys 1 to 5, the open one inverse red. */
export function tabs(ctx: Ctx, active: TabId, select: (id: TabId) => void): RenderElement {
  const { Box, Button, Text } = ctx.el
  const p = ctx.pal
  return (
    <Box key="tabs" flexDirection="row">
      {TABS.map(t => (
        <Button key={`tab-${t.id}`} plain hotkey={t.hotkey} onPress={() => select(t.id)}>
          {t.id === active ? (
            <Text color={p.T} backgroundColor={p.R} bold>
              {` ${t.label} `}
            </Text>
          ) : (
            <Text color={p.D}>{` ${t.label} `}</Text>
          )}
        </Button>
      ))}
    </Box>
  )
}

/** The footer of shortcuts, on the last row of every panel. */
export function footer(ctx: Ctx): RenderElement {
  const p = ctx.pal
  const keys: Span[] = [
    { t: 'Tab', fg: p.T },
    { t: ' next · ', fg: p.D },
    { t: '↑↓', fg: p.T },
    { t: ' scroll · ', fg: p.D },
    { t: 'Ctrl+X ←→', fg: p.T },
    { t: ' resize · ', fg: p.D },
    { t: 'Esc', fg: p.T },
    { t: ' close', fg: p.D },
  ]
  return Line(ctx, keys, 'footer')
}
