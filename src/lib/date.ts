export function todayISODate(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function toMMDDYYYY(isoDate: string): string {
  // isoDate expected: yyyy-mm-dd
  const [yyyy, mm, dd] = isoDate.split('-')
  if (!yyyy || !mm || !dd) return isoDate
  return `${mm}/${dd}/${yyyy}`
}

