// Flattens a drawn tree into text rows, roughly as the terminal lays it out:
// a column Box stacks its children, a row Box sets them side by side, a Text
// joins its spans, a Raster shows its glyphs. For reading a board in a test's
// output against the mockup; it is not the terminal's paint.

type Node = { type: string; props: Record<string, unknown>; children?: unknown[] } | string

function unbase64(text: string): Uint8Array {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '')
  const out: number[] = []
  for (let i = 0; i < clean.length; i += 4) {
    const n = (A.indexOf(clean[i] ?? 'A') << 18) | (A.indexOf(clean[i + 1] ?? 'A') << 12) | ((A.indexOf(clean[i + 2] ?? 'A') & 63) << 6) | (A.indexOf(clean[i + 3] ?? 'A') & 63)
    out.push((n >> 16) & 255)
    if (i + 2 < clean.length) out.push((n >> 8) & 255)
    if (i + 3 < clean.length) out.push(n & 255)
  }
  return Uint8Array.from(out)
}

function raster(props: Record<string, unknown>): string[] {
  const cols = Number(props.columns)
  const rows = Number(props.rows)
  const bytes = unbase64(String(props.cells))
  const view = new DataView(bytes.buffer)
  const lines: string[] = []
  for (let y = 0; y < rows; y++) {
    let line = ''
    for (let x = 0; x < cols; x++) {
      const at = (y * cols + x) * 12
      const cp = at + 4 <= bytes.length ? view.getUint32(at, true) : 32
      line += String.fromCodePoint(cp)
    }
    lines.push(line)
  }
  return lines
}

function textOf(n: unknown): string {
  if (typeof n === 'string') return n
  if (typeof n === 'number') return String(n)
  if (Array.isArray(n)) return n.map(textOf).join('')
  if (n && typeof n === 'object') {
    const node = n as { type: string; props: Record<string, unknown>; children?: unknown[] }
    if (node.type === 'Button' && node.props.label && !(node.children && node.children.length)) {
      return node.props.plain ? String(node.props.label) : `[ ${node.props.label} ]`
    }
    return (node.children ?? []).map(textOf).join('')
  }
  return ''
}

const w = (s: string) => Array.from(s).length

export function textify(n: unknown): string[] {
  if (n === null || n === undefined || n === false) return []
  if (typeof n === 'string' || typeof n === 'number') return [String(n)]
  if (Array.isArray(n)) return n.flatMap(textify)
  const node = n as { type: string; props: Record<string, unknown>; children?: unknown[] }
  switch (node.type) {
    case 'Text':
    case 'Button':
      return [textOf(node)]
    case 'Raster':
      return raster(node.props)
    case 'Image':
      return [`[image ${node.props.columns}×${node.props.rows}: ${node.props.alt}]`]
    case 'Svg':
      return [`[svg: ${node.props.alt}]`]
    case 'Input':
      return [`${node.props.label ?? ''}: ${node.props.value || node.props.placeholder || ''}`]
    case 'Select': {
      const opts = (node.props.options as { value: string; label?: string }[]) ?? []
      const cur = opts.find(o => o.value === node.props.value)
      return [`${node.props.label ?? ''}: ${cur?.label ?? cur?.value ?? ''} ▾`]
    }
    case 'Box': {
      const kids = (node.children ?? []).flatMap(c => (Array.isArray(c) ? c : [c]))
      const blocks = kids.map(textify)
      if (node.props.flexDirection === 'row') {
        const height = Math.max(0, ...blocks.map(b => b.length))
        const widths = blocks.map(b => Math.max(0, ...b.map(w)))
        const out: string[] = []
        for (let y = 0; y < height; y++) {
          out.push(blocks.map((b, i) => (b[y] ?? '') + ' '.repeat((widths[i] ?? 0) - w(b[y] ?? ''))).join('').replace(/\s+$/, ''))
        }
        return out
      }
      return blocks.flat()
    }
    default:
      return (node.children ?? []).flatMap(textify)
  }
}

export function board(tree: unknown): string {
  return textify(tree).join('\n')
}

declare const console: { log: (...args: unknown[]) => void }

/** Prints a board to the test's output, when CLAWD_SHOW is not empty in the board's own check. */
export function show(label: string, tree: unknown): void {
  console.log(`\n── ${label}\n${board(tree)}`)
}
