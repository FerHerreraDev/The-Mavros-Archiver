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

// --- Avance (VID-10) -------------------------------------------------------------

/** Fracción convertida: segmentos de 6 s ya escritos de la primera calidad / duración del original */
export function encodeFraction(segmentsWritten, sourceSeconds, segmentSeconds = 6) {
  if (!(sourceSeconds > 0)) return 0
  return Math.min(1, Math.max(0, (segmentsWritten * segmentSeconds) / sourceSeconds))
}

/** Tiempo restante a partir de lo que tardó lo hecho: null si aún no hay con qué estimar */
export function remainingMs(fraction, elapsedMs) {
  if (!(fraction > 0.01) || fraction >= 1) return fraction >= 1 ? 0 : null
  return (elapsedMs * (1 - fraction)) / fraction
}

/** 95 s → "~2 min", 3 h 5 min → "~3 h 5 min", null → "calculando…" */
export function formatRemaining(ms) {
  if (ms === null || ms === undefined) return 'calculando…'
  const min = Math.max(1, Math.round(ms / 60_000))
  if (min < 60) return `~${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `~${h} h ${m} min` : `~${h} h`
}

/** ▓▓▓▓░░░░░░ de 10 casillas */
export function bar(fraction, width = 10) {
  const full = Math.round(Math.min(1, Math.max(0, fraction)) * width)
  return '▓'.repeat(full) + '░'.repeat(width - full)
}

/** Línea de rclone (--stats-one-line): "… 1.2 GiB / 3.4 GiB, 35%, 10 MiB/s, ETA 3m40s" → { fraction, eta } */
export function parseRcloneStats(line) {
  const m = line.match(/,\s*(\d+)%/)
  if (!m) return null
  const eta = line.match(/ETA\s+([0-9hms.-]+)/)?.[1] ?? null
  return { fraction: Number(m[1]) / 100, eta }
}

/** Nombre del archivo de estado que se ve en Finder (sin caracteres prohibidos en macOS) */
export function statusFileName(title, step, fraction, remaining) {
  const pct = `${Math.round(fraction * 100)}%`
  return `⏳ ${title.replace(/[/:]/g, '-')} — ${step} ${bar(fraction)} ${pct} · faltan ${formatRemaining(remaining)}.txt`
}
