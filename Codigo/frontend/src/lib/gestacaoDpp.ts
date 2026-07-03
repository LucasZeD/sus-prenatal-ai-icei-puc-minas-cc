/**
 * Calendar-only dates (Postgres DATE / ISO YYYY-MM-DD) and gestational DPP.
 *
 * - Naegele: DPP from DUM = DUM + 280 days (40 weeks). Do not use 281.
 * - When DPP-Eco is set, it is the primary clinical reference (overrides Naegele for display and `dpp` persistence).
 * - Avoid `new Date(fullIso).toLocaleDateString()` for DATE fields: UTC midnight becomes the previous calendar day in e.g. America/Sao_Paulo.
 */

export const NAEGELE_DAYS = 280

export function addCalendarDaysLocal(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Parse API value (ISO string, often ...T00:00:00.000Z) as local calendar date at noon. */
export function parseApiDateOnlyToLocalDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0, 0)
  }
  if (typeof value !== 'string' || !value) return null
  const t = value.slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (!m) return null
  const yyyy = Number.parseInt(m[1], 10)
  const mm = Number.parseInt(m[2], 10)
  const dd = Number.parseInt(m[3], 10)
  const d = new Date(yyyy, mm - 1, dd, 12, 0, 0, 0)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatLocalDatePtBr(d: Date | null): string {
  if (!d || Number.isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = String(d.getFullYear())
  return `${dd}/${mm}/${yyyy}`
}

export function formatApiDateOnlyPtBr(value: unknown): string {
  return formatLocalDatePtBr(parseApiDateOnlyToLocalDate(value))
}

export function parsePtBrDateOnlyToLocalDate(v: string): Date | null {
  const t = (v || '').trim()
  if (!t) return null
  const parts = t.split('/')
  if (parts.length !== 3) return null
  const dd = Number.parseInt(parts[0], 10)
  const mm = Number.parseInt(parts[1], 10)
  const yyyy = Number.parseInt(parts[2], 10)
  if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy)) return null
  const d = new Date(yyyy, mm - 1, dd, 12, 0, 0, 0)
  return Number.isNaN(d.getTime()) ? null : d
}

export function toIsoDateOnlyLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

export function naegeleDppFromDum(dum: Date | null): Date | null {
  if (!dum) return null
  return addCalendarDaysLocal(dum, NAEGELE_DAYS)
}

/** Primary DPP: ultrasound date if present; otherwise Naegele from DUM. */
export function primaryDppFromDumAndEco(dum: Date | null, dppEco: Date | null): Date | null {
  if (dppEco) return dppEco
  return naegeleDppFromDum(dum)
}

/** Effective LMP for GA: if eco DPP exists, back 280 days; else reported DUM. */
export function impliedDumForIg(dum: Date | null, dppEco: Date | null): Date | null {
  if (dppEco) return addCalendarDaysLocal(dppEco, -NAEGELE_DAYS)
  return dum
}

export function calcIgAtualFromDum(dum: Date | null, now = new Date()): string {
  if (!dum) return '\u2014'
  const today = new Date(now)
  today.setHours(12, 0, 0, 0)
  const base = new Date(dum)
  base.setHours(12, 0, 0, 0)
  const diffDays = Math.floor((today.getTime() - base.getTime()) / 86400000)
  if (!Number.isFinite(diffDays) || diffDays < 0) return '\u2014'
  const weeks = Math.floor(diffDays / 7)
  const days = diffDays % 7
  return `${weeks} sem ${days} d`
}
