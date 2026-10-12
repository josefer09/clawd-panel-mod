// How numbers read on the HUD: tokens in k, dollars, durations and reset times.

/** Tokens in thousands: `142k`, or with `digits` decimals `142.0k`; under 1000 as is. */
export function k(n: number | undefined, digits = 0): string {
  if (n === undefined) return '—'
  if (Math.abs(n) < 1000 && digits === 0) return String(Math.round(n))
  return `${(n / 1000).toFixed(digits)}k`
}

/** Tokens the way the agent rows show them: `38.2k`, `812`, `1.2M`. */
export function tok(n: number | undefined): string {
  if (n === undefined) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(Math.round(n))
}

export function usd(n: number | undefined): string {
  if (n === undefined) return '—'
  return `$${n.toFixed(2)}`
}

export function pct(n: number | undefined): string {
  return n === undefined ? '—' : `${Math.round(n)}%`
}

/** A span of time: `1h 42m`, `12m`, `45s`, `0m56s`-style for agents with `clock`. */
export function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m`
  return `${s}s`
}

/** Minutes and seconds, as the agent rows show elapsed time: `4m12s`. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`
  return `${m}m${String(sec).padStart(2, '0')}s`
}

/** How long until an ISO time: `2h 14m`; `now` once past. */
export function until(iso: string | undefined, now: number): string | undefined {
  if (iso === undefined) return undefined
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return undefined
  if (at <= now) return 'now'
  return duration(at - now)
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** A reset time as a weekday and local time: `Thu 09:00`. */
export function weekdayTime(iso: string | undefined): string | undefined {
  if (iso === undefined) return undefined
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return undefined
  return `${DAYS[d.getDay()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Seconds since a moment, for "updated 12s ago" stamps. */
export function ago(at: number | undefined, now: number): string {
  if (at === undefined || at === 0 || now === 0) return '—'
  return `${duration(Math.max(0, now - at))} ago`
}

/** A path with the home folder as `~`. */
export function tilde(path: string | undefined, home: string | undefined): string {
  if (path === undefined) return '—'
  if (home && (path === home || path.startsWith(home + '/'))) return '~' + path.slice(home.length)
  return path
}
