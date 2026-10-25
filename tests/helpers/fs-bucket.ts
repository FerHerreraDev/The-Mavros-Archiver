// Bucket R2 falso respaldado por una carpeta local (misma forma que la API de R2 que usa el Worker)
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import type { VideoBucket, BucketRange } from '../../workers/video/src/handler.ts'

export function fsBucket(root: string, reads: string[] = []): VideoBucket {
  const base = path.resolve(root)
  return {
    async get(key: string, options?: { range?: BucketRange }) {
      reads.push(key)
      const file = path.resolve(base, key)
      if (!file.startsWith(base + path.sep)) return null
      let data: Buffer
      try {
        data = await readFile(file)
      } catch {
        return null
      }

      const size = data.length
      let offset = 0
      let length = size
      const r = options?.range
      if (r && 'suffix' in r) {
        offset = Math.max(0, size - r.suffix)
        length = size - offset
      } else if (r) {
        offset = r.offset
        length = Math.min(r.length ?? size - offset, size - offset)
      }

      const slice = data.subarray(offset, offset + length)
      return {
        body: new Blob([new Uint8Array(slice)]).stream(),
        size,
        httpEtag: `"${createHash('md5').update(data).digest('hex')}"`,
        range: r ? { offset, length } : undefined,
      }
    },
  }
}
