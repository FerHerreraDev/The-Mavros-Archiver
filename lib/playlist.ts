// Reglas de listas (PL-05, PL-06). Funciones puras, con los mismos casos que Android
// (tests/fixtures/playlist-cases.json ↔ PlaylistRules.kt).
import { resumePosition } from './progress'
import { nextEpisode, nextUp, type EpisodeProgress, type EpisodeRef } from './series'

/** Elemento de la lista ya resuelto: una película, o una serie con sus episodios visibles */
export type ListEntry<E extends EpisodeRef> = { movie: E } | { seriesId: string; episodes: E[] }
export type ListPick<E extends EpisodeRef> = { episode: E; startAt: number }

/** Qué se reproduce de un elemento: la película (donde se quedó) o el episodio de SER-10 */
function entryStart<E extends EpisodeRef>(entry: ListEntry<E>, progress: EpisodeProgress[]): ListPick<E> | null {
  if ('movie' in entry) {
    const saved = progress.find((p) => p.movieId === entry.movie.id)
    return { episode: entry.movie, startAt: resumePosition(saved?.position ?? null, entry.movie.duration) }
  }
  const up = nextUp(entry.episodes, progress)
  return up && { episode: up.episode, startAt: up.startAt }
}

/** "Reproducir lista": el primer elemento que tenga algo que ver (PL-05) */
export function playlistStart<E extends EpisodeRef>(entries: ListEntry<E>[], progress: EpisodeProgress[]) {
  for (const entry of entries) {
    const pick = entryStart(entry, progress)
    if (pick) return pick
  }
  return null
}

/**
 * Lo que sigue al terminar [currentId] reproduciendo la lista (PL-06): dentro de una serie de la
 * lista, su siguiente episodio; si no, el siguiente elemento. null si era lo último o no está.
 */
export function nextInPlaylist<E extends EpisodeRef>(entries: ListEntry<E>[], currentId: string, progress: EpisodeProgress[]) {
  const i = entries.findIndex((e) => ('movie' in e ? e.movie.id === currentId : e.episodes.some((ep) => ep.id === currentId)))
  if (i < 0) return null
  const current = entries[i]
  if (!('movie' in current)) {
    const following = nextEpisode(current.episodes, currentId)
    if (following) return { episode: following, startAt: 0 }
  }
  return playlistStart(entries.slice(i + 1), progress)
}
