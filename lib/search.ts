// Búsqueda en el catálogo (SRCH-01). Misma regla en Android (SearchRules.kt) y el iPad (SearchRules.swift),
// probada con los casos de tests/fixtures/search-cases.json.

export type Searchable = { title: string; original_title?: string | null }

/** minúsculas, sin acentos y con signos como espacios: "Spider-Man: Él" → "spider man el" */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Lo que coincide con [query], mejor primero; empates en el orden recibido */
export function searchCatalog<T extends Searchable>(items: readonly T[], query: string): T[] {
  const q = normalizeSearch(query)
  if (!q) return []
  const words = q.split(' ')
  const ranked: { item: T; rank: number; index: number }[] = []
  items.forEach((item, index) => {
    const names = [item.title, item.original_title ?? ''].map(normalizeSearch).filter(Boolean)
    const all = names.join(' ')
    if (!words.every((w) => all.includes(w))) return
    const rank = names.some((n) => n.startsWith(q)) ? 0 : names.some((n) => n.split(' ').some((w) => w.startsWith(words[0]))) ? 1 : 2
    ranked.push({ item, rank, index })
  })
  return ranked.sort((a, b) => a.rank - b.rank || a.index - b.index).map((r) => r.item)
}
