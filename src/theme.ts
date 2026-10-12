// Color tokens for the HUD.
//
// Source: the design project's Alrest UI design system,
// `_ds/alrest-ui-design-system-16088f68-.../tokens/themes.css` (themes `pyra`
// and `pyra-light`), plus the HUD-specific cell colors the mockup's renderer
// (`Claude HUD Mockup.dc.html`, its `C` table) draws with. Every role below
// names the token it came from, so a change to the design system maps 1:1.

/** The Alrest `pyra` theme (dark), verbatim from themes.css. */
export const PYRA = {
  bgApp: '#121010',
  bgSunken: '#0C0A09',
  surface1: '#1C1918',
  surface2: '#231F1E',
  surface3: '#2B2A29',
  surfaceRaised: '#36302E',
  text1: '#F7EFEC',
  text2: '#C4B5AF',
  text3: '#A08F89',
  textDisabled: '#5A4E4A',
  textAccent: '#00E5A3',
  textAmber: '#D4A038',
  textRed: '#FF7D8B',
  lineNeutral: '#3E3532',
  signature: '#C83B4A',
  signature2: '#D15B75',
  signature3: '#D4A038',
  core: '#00E5A3',
  colorDanger: '#E8475A',
  colorWarning: '#D4A038',
  colorSuccess: '#B8F23A',
  statusRunning: '#00E5A3',
  statusIdle: '#A08F89',
  statusWaiting: '#D4A038',
  statusError: '#E8475A',
  statusDone: '#B8F23A',
} as const

/** The Alrest `pyra-light` theme, verbatim from themes.css. */
export const PYRA_LIGHT = {
  bgApp: '#F7F2EF',
  bgSunken: '#EFE8E4',
  surface1: '#FDFAF8',
  surface2: '#F4EEEB',
  surface3: '#ECE4E0',
  surfaceRaised: '#FFFFFF',
  text1: '#1A1514',
  text2: '#4F4440',
  text3: '#6B5E59',
  textDisabled: '#A89B96',
  textAccent: '#007A58',
  textAmber: '#8A6410',
  textRed: '#C02435',
  lineNeutral: '#CFC4BF',
  signature: '#C83B4A',
  signature2: '#D15B75',
  signature3: '#B8862A',
  core: '#007A58',
  colorDanger: '#C02435',
  colorWarning: '#8A6410',
  colorSuccess: '#437000',
  statusRunning: '#007A58',
  statusIdle: '#6B5E59',
  statusWaiting: '#8A6410',
  statusError: '#C02435',
  statusDone: '#437000',
} as const

/**
 * The roles the HUD paints with, keyed as the mockup's renderer keys them
 * (`C.R`, `C.G`, ...), so each screen reads like the board it ports.
 */
export type Palette = {
  /** Fire red: brand, active tab, titles. `--theme-signature`. */
  R: string
  /** Magenta: secondary series, focus. `--theme-signature-2`. */
  M: string
  /** Gold: borders, labels, warning. `--theme-signature-3`. */
  G: string
  /** Emerald: live, running, healthy. `--theme-core`. */
  E: string
  /** Panel surface. `--surface-3`. */
  S: string
  /** Primary text. */
  T: string
  /** Dim text, labels. */
  D: string
  /** Deep background: chip text on a filled chip, field wells. */
  BG: string
  /** Meter track, selected row. */
  TR: string
  /** Rules and tree lines. */
  LN: string
  /** Faded text, autocompact buffer. */
  FD: string
  /** Meter track while critical. */
  critTrack: string
  /** Radar: inner rings and spokes. */
  radarGrid: string
  /** Radar: polygon fill, and fill over a grid line. */
  radarFill: string
  radarFillOver: string
  /** Radar: polygon outline and vertex points. */
  radarEdge: string
  radarPoint: string
  /** The glow under the avatar. */
  glow: string
  /** Every color a sprite paints: Clawd's own, independent of the theme. */
  sprite: SpritePalette
}

export type SpritePalette = {
  body: string
  eye: string
  bulb: string
  bulbLight: string
  bulbBase1: string
  bulbBase2: string
  handle: string
  heart: string
  heartLight: string
}

/** Clawd's colors, from the mockup's `sprite()` (`C.O`, `C.BG`, `C.G`, ...). */
export const SPRITE: SpritePalette = {
  body: '#D97757',
  eye: '#1C1B1A',
  bulb: '#D4A038',
  bulbLight: '#F2D58A',
  bulbBase1: '#8A8580',
  bulbBase2: '#B5AFA8',
  handle: '#9A6B4A',
  heart: '#C83B4A',
  heartLight: '#E8798A',
}

/** The dark board exactly as the mockup draws it. */
export const DARK: Palette = {
  R: PYRA.signature,
  M: PYRA.signature2,
  G: PYRA.signature3,
  E: PYRA.core,
  S: PYRA.surface3,
  T: '#E8E4E0',
  D: '#8A8580',
  BG: '#1C1B1A',
  TR: '#3A3836',
  LN: '#4A4744',
  FD: '#625D58',
  critTrack: '#8E2733',
  radarGrid: '#3C3A38',
  radarFill: '#793239',
  radarFillOver: '#94404A',
  radarEdge: PYRA.signature3,
  radarPoint: '#F2D58A',
  glow: '#1F5C49',
  sprite: SPRITE,
}

/** The same roles on `pyra-light`'s tokens, for light terminals. */
export const LIGHT: Palette = {
  R: PYRA_LIGHT.signature,
  M: PYRA_LIGHT.signature2,
  G: PYRA_LIGHT.textAmber,
  E: PYRA_LIGHT.core,
  S: PYRA_LIGHT.surface3,
  T: PYRA_LIGHT.text1,
  D: PYRA_LIGHT.text3,
  BG: PYRA_LIGHT.bgApp,
  TR: '#DDD2CD',
  LN: PYRA_LIGHT.lineNeutral,
  FD: '#A89B96',
  critTrack: '#E8475A',
  radarGrid: '#DDD2CD',
  radarFill: '#F0C2C8',
  radarFillOver: '#E39AA4',
  radarEdge: PYRA_LIGHT.signature3,
  radarPoint: PYRA_LIGHT.signature,
  glow: '#A8E2CF',
  sprite: SPRITE,
}

export type ThemeName = 'pyra' | 'pyra-light'

export function paletteOf(theme: unknown): Palette {
  return theme === 'pyra-light' ? LIGHT : DARK
}

/** `#RRGGBB` to the `0x00RRGGBB` a Raster cell takes. */
export function rgb(hex: string): number {
  return parseInt(hex.slice(1, 7), 16)
}

/** The Raster value that means "the terminal's default color". */
export const DEFAULT_COLOR = 0x01000000
