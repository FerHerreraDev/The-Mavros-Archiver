// Idioma de audio y subtítulos elegidos, recordados en el navegador (WATCH-05).

export const AUDIO_KEY = 'mavros.audioLang'
export const SUBTITLES_KEY = 'mavros.subtitlesLang'
/** Subtítulos apagados a propósito */
export const OFF = 'off'

const primary = (lang: string | null | undefined) => (lang ?? '').toLowerCase().split('-')[0]

/**
 * Índice de la pista con el idioma guardado ("es" también acepta "es-419"); -1 si no hay
 * preferencia, está apagada o la película no tiene ese idioma.
 */
export function pickTrack(tracks: readonly { lang?: string | null }[], saved: string | null): number {
  if (!saved || saved === OFF) return -1
  const want = primary(saved)
  return tracks.findIndex((t) => primary(t.lang) === want)
}

export function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function savePreference(key: string, value: string | null | undefined) {
  try {
    if (value) localStorage.setItem(key, value)
  } catch {
    // modo privado o almacenamiento bloqueado: no se recuerda, nada más
  }
}
