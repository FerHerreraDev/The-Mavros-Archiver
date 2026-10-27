// Reglas de series (SER-10, SER-11, SER-13). Funciones puras, con los mismos casos que Android
// (tests/fixtures/series-cases.json ↔ SeriesRules.kt).
import { FINISHED_RATIO, isInProgress, resumePosition } from './progress'

export type EpisodeRef = { id: string; season: number; episode: number; duration: number }
export type EpisodeProgress = { movieId: string; position: number; updatedAt: string }

/** start = nunca vista ("Reproducir"), continue = a medias, play = siguiente o recién empezado, rewatch = ya se terminó toda */
export type NextUpAction = 'start' | 'continue' | 'play' | 'rewatch'
export type NextUp<E extends EpisodeRef> = { episode: E; action: NextUpAction; startAt: number }

/** "T1:E2" */
export function episodeLabel(season: number, episode: number) {
  return `T${season}:E${episode}`
}

/** Temporada ascendente con la 0 (especiales) al final; luego episodio ascendente (SER-13) */
export function sortEpisodes<E extends EpisodeRef>(episodes: E[]): E[] {
  const seasonKey = (s: number) => (s === 0 ? Number.MAX_SAFE_INTEGER : s)
  return [...episodes].sort((a, b) => seasonKey(a.season) - seasonKey(b.season) || a.episode - b.episode)
}

/** El que sigue en orden (cruza temporadas); null si es el último o no está */
export function nextEpisode<E extends EpisodeRef>(episodes: E[], currentId: string): E | null {
  const ordered = sortEpisodes(episodes)
  const i = ordered.findIndex((e) => e.id === currentId)
  return i >= 0 && i < ordered.length - 1 ? ordered[i + 1] : null
}

const isFinished = (position: number, duration: number) => duration > 0 && position / duration >= FINISHED_RATIO

function latestWatched<E extends EpisodeRef>(episodes: E[], progress: EpisodeProgress[]) {
  const byId = new Map(episodes.map((e) => [e.id, e]))
  let latest: { episode: E; entry: EpisodeProgress } | null = null
  for (const entry of progress) {
    const episode = byId.get(entry.movieId)
    if (!episode) continue
    if (!latest || Date.parse(entry.updatedAt) > Date.parse(latest.entry.updatedAt)) latest = { episode, entry }
  }
  return latest
}

/** Qué sigue en la serie: el botón principal de su página (SER-10). null si no tiene episodios. */
export function nextUp<E extends EpisodeRef>(episodes: E[], progress: EpisodeProgress[]): NextUp<E> | null {
  const ordered = sortEpisodes(episodes)
  if (ordered.length === 0) return null

  const latest = latestWatched(ordered, progress)
  if (!latest) return { episode: ordered[0], action: 'start', startAt: 0 }

  const { episode, entry } = latest
  if (!isFinished(entry.position, episode.duration)) {
    const startAt = resumePosition(entry.position, episode.duration)
    return { episode, action: startAt > 0 ? 'continue' : 'play', startAt }
  }
  const next = nextEpisode(ordered, episode.id)
  return next ? { episode: next, action: 'play', startAt: 0 } : { episode: ordered[0], action: 'rewatch', startAt: 0 }
}

/**
 * Entrada de la serie en "Seguir viendo" (SER-11): el episodio de nextUp si va a medias (5–95 %)
 * o si es el siguiente de uno terminado. updatedAt = la última vez que se vio la serie.
 */
export function seriesContinue<E extends EpisodeRef>(episodes: E[], progress: EpisodeProgress[]) {
  const latest = latestWatched(episodes, progress)
  if (!latest) return null
  const { episode, entry } = latest

  if (!isFinished(entry.position, episode.duration)) {
    return isInProgress(entry.position, episode.duration)
      ? { episode, positionSeconds: entry.position, updatedAt: entry.updatedAt }
      : null
  }
  const next = nextEpisode(episodes, episode.id)
  return next ? { episode: next, positionSeconds: 0, updatedAt: entry.updatedAt } : null
}
