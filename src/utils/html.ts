export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function formatDate(value: string): string {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${year}-${month}-${day}` : value
}
