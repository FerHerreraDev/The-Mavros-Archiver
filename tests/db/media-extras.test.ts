import { describe, it, expect, afterAll } from 'vitest'
import { adminClient } from '../helpers/users'

// Migración 0013 (TMDB-06, TMDB-07): imagen horizontal en películas; logo, tráiler, reparto y color
// en películas y series. Las columnas solo aceptan valores con forma válida.
const tag = Math.random().toString(36).slice(2, 8)
afterAll(async () => {
  await adminClient().from('movies').delete().like('slug', `test-extras-%-${tag}`)
  await adminClient().from('series').delete().like('slug', `test-extras-%-${tag}`)
})

let n = 0
const insert = async (table: 'movies' | 'series', fields: Record<string, unknown>) => {
  const slug = `test-extras-${n++}-${tag}`
  const base = table === 'movies' ? { slug, title: 'Extras', duration_seconds: 60, hls_path: 'movies/t/master.m3u8' } : { slug, title: 'Extras' }
  const { error } = await adminClient().from(table).insert({ ...base, ...fields })
  return error
}

describe.each(['movies', 'series'] as const)('%s: datos de la portada', (table) => {
  it('sin nada: reparto vacío, lo demás null', async () => {
    const slug = `test-extras-default-${table}-${tag}`
    const base = table === 'movies' ? { slug, title: 'X', duration_seconds: 60, hls_path: 'movies/t/master.m3u8' } : { slug, title: 'X' }
    const { data } = await adminClient().from(table).insert(base).select('backdrop_url, logo_url, logo_image_url, trailer_key, cast, accent_color').single()
    expect(data).toEqual({ backdrop_url: null, logo_url: null, logo_image_url: null, trailer_key: null, cast: [], accent_color: null })
  })

  it.each([
    { backdrop_url: 'https://image.tmdb.org/t/p/w1280/b.jpg', backdrop_thumbhash: 'IxgKDQQ1ePd/Z4eHd4iHd3eI' },
    { logo_url: 'https://image.tmdb.org/t/p/w500/l.png', logo_image_url: 'http://127.0.0.1:54321/storage/v1/object/public/posters/a.webp' },
    { trailer_key: 'CTB15PPtMyA' },
    { cast: [{ name: 'Sam Neill', character: 'Mark', profile_url: null }] },
    { accent_color: '#c81e1e' },
  ])('acepta %j', async (fields) => {
    expect(await insert(table, fields)).toBeNull()
  })

  it.each([
    { backdrop_url: 'http://inseguro/b.jpg' },
    { backdrop_thumbhash: 'no es base64 !!' },
    { logo_url: 'javascript:alert(1)' },
    { logo_image_url: 'ftp://x/l.webp' },
    { trailer_key: 'abc' },
    { trailer_key: '"><script>' },
    { cast: { name: 'no es lista' } },
    { cast: Array.from({ length: 21 }, (_, i) => ({ name: `A${i}` })) },
    { accent_color: 'red' },
    { accent_color: '#C81E1E' },
  ])('rechaza %j', async (fields) => {
    expect((await insert(table, fields))?.code).toBe('23514')
  })
})
