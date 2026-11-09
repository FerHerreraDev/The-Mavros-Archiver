// Bucket R2 falso respaldado por una carpeta local (misma forma que la API de R2 que usa el Worker)
import { readFile, readdir, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import type { VideoBucket, BucketRange } from '../../workers/video/src/handler.ts'

// Solo con `writable` se pueden borrar archivos (PLY-10): así nadie borra los fixtures por accidente.
export function fsBucket(root: string, reads: string[] = [], { writable = false } = {}): VideoBucket {
  const base = path.resolve(root)
  const inside = (key: string) => {
    const file = path.resolve(base, key)
    return file.startsWith(base + path.sep) ? file : null
  }
  return {
    async list({ prefix, limit = 1000 }) {
      const all = (await readdir(base, { recursive: true, withFileTypes: true }))
        .filter((d) => d.isFile())
        .map((d) => path.relative(base, path.join(d.parentPath, d.name)).split(path.sep).join('/'))
        .filter((key) => key.startsWith(prefix))
        .sort()
      return { objects: all.slice(0, limit).map((key) => ({ key })), truncated: all.length > limit }
    },
    async delete(keys: string[]) {
      if (!writable) throw new Error('fsBucket de solo lectura')
      for (const key of keys) {
        const file = inside(key)
        if (file) await rm(file, { force: true })
      }
    },
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
