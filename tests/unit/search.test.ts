import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { normalizeSearch, searchCatalog, type Searchable } from '@/lib/search'

// Mismos casos que Android (SearchRulesTest) y el iPad (SharedCasesTests)
const { cases } = JSON.parse(readFileSync(path.join(__dirname, '../fixtures/search-cases.json'), 'utf8')) as {
  cases: { name: string; items: Searchable[]; query: string; expected: number[] }[]
}

describe('SRCH-01 búsqueda', () => {
  it.each(cases)('$name', ({ items, query, expected }) => {
    expect(searchCatalog(items, query)).toEqual(expected.map((i) => items[i]))
  })

  it('normaliza acentos, mayúsculas y signos', () => {
    expect(normalizeSearch('  Spider-Man: ¡Él!  ')).toBe('spider man el')
  })
})
