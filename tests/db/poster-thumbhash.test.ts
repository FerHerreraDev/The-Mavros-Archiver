import { describe, it, expect, afterAll } from 'vitest'
import { adminClient } from '../helpers/users'

// Migración 0008: la columna solo acepta base64 de tamaño de ThumbHash (o null)
const created: string[] = []
afterAll(async () => {
  if (created.length) await adminClient().from('movies').delete().in('id', created)
})

const insert = async (poster_thumbhash: string | null) => {
  const { data, error } = await adminClient()
    .from('movies')
    .insert({
      slug: `test-thumb-${Math.random().toString(36).slice(2, 8)}`,
      title: 'Thumb',
      duration_seconds: 60,
      hls_path: 'movies/t/master.m3u8',
      poster_thumbhash,
    })
    .select('id')
    .single()
  if (data) created.push(data.id)
  return error
}

describe('movies.poster_thumbhash (LOAD-03)', () => {
  it.each([null, 'mAgOBYB2d3eHd4eIeHh3iHiHdwAAAAA=', 'IxgKDQQ1ePd/Z4eHd4iHd3eI'])('acepta %s', async (value) => {
    expect(await insert(value)).toBeNull()
  })

  it.each(['', 'corto', 'no es base64 !!', 'A'.repeat(65), '<script>alert(1)</script>'])('rechaza %j', async (value) => {
    expect((await insert(value))?.code).toBe('23514')
  })
})
