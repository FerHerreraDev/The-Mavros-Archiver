// Funciones puras de la carpeta de entrada (VID-09). Probadas en tests/unit/movie-inbox.test.ts.

export const VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.mov', '.m4v', '.avi']
export const STABLE_MS = 30_000

/** Igual que slugify de lib/movies.ts (la prueba compara ambos) */
export function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/, '')
}

/** "Perfect Blue (1997).mkv" → { title: "Perfect Blue", year: 1997, slug: "perfect-blue" } */
export function parseFileName(fileName) {
  const base = fileName.replace(/\.[^.]+$/, '')
  const m = base.match(/^(.*?)[\s._-]*[([]?((?:19|20)\d{2})[)\]]?[\s._-]*$/)
  const rawTitle = (m && m[1].trim() ? m[1] : base).replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim()
  const year = m && m[1].trim() ? Number(m[2]) : null
  return { title: rawTitle, year, slug: slugify(rawTitle) }
}

export const isVideo = (fileName) => !fileName.startsWith('.') && VIDEO_EXTENSIONS.includes(fileName.slice(fileName.lastIndexOf('.')).toLowerCase())

/** Terminó de copiarse: mismo tamaño que en la revisión anterior y sin cambios hace ≥ 30 s */
export function isStable(previous, current, nowMs) {
  return Boolean(previous) && previous.size === current.size && current.size > 0 && nowMs - current.mtimeMs >= STABLE_MS
}

/** perfect-blue → perfect-blue-2 → perfect-blue-3… si ya existe */
export function uniqueSlug(slug, taken) {
  if (!taken.has(slug)) return slug
  for (let n = 2; ; n++) if (!taken.has(`${slug}-${n}`)) return `${slug}-${n}`
}
