import type { NarrationGranularity } from '../common'

export const SIX_HOURS_MS = 6 * 60 * 60 * 1000
export const DAY_MS = 24 * 60 * 60 * 1000
export const WEEK_MS = 7 * DAY_MS

/** Floors a date to the start of its 6-hour UTC block (00,06,12,18). */
export function floorTo6h(d: Date): Date {
  return new Date(Math.floor(d.getTime() / SIX_HOURS_MS) * SIX_HOURS_MS)
}

/** Floors a date to UTC midnight. */
export function floorToDay(d: Date): Date {
  const x = new Date(d)
  x.setUTCHours(0, 0, 0, 0)
  return x
}

/** Floors a date to the start (UTC Monday) of its ISO week. */
export function floorToWeek(d: Date): Date {
  const x = floorToDay(d)
  const dow = (x.getUTCDay() + 6) % 7 // 0 = Monday
  x.setUTCDate(x.getUTCDate() - dow)
  return x
}

/** Floors a date to the first day of its UTC month. */
export function floorToMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

/** The exclusive end of the period starting at `start` for the given granularity. */
export function periodEndOf(granularity: NarrationGranularity, start: Date): Date {
  switch (granularity) {
    case '6h':
      return new Date(start.getTime() + SIX_HOURS_MS)
    case 'day':
      return new Date(start.getTime() + DAY_MS)
    case 'week':
      return new Date(start.getTime() + WEEK_MS)
    case 'month':
      return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
  }
}

/**
 * Chooses the narration granularity that best fits a viewed time span — so a
 * 3-month view shows months, a 1-week view shows 6h blocks.
 */
export function pickGranularity(spanMs: number): NarrationGranularity {
  if (spanMs >= 60 * DAY_MS) return 'month'
  if (spanMs >= 14 * DAY_MS) return 'week'
  if (spanMs >= 2 * DAY_MS) return 'day'
  return '6h'
}

/** Floors a date to the start of its period for the given granularity. */
export function floorToPeriod(granularity: NarrationGranularity, d: Date): Date {
  switch (granularity) {
    case '6h':
      return floorTo6h(d)
    case 'day':
      return floorToDay(d)
    case 'week':
      return floorToWeek(d)
    case 'month':
      return floorToMonth(d)
  }
}
