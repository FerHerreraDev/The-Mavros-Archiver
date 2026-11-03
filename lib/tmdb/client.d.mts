export declare const TMDB_NOT_CONFIGURED: string
export declare function normalizeGenreList(names: string[]): string[]
export declare function pickLogo(logos?: { file_path?: string; iso_639_1?: string | null; vote_average?: number }[]): string | null
export declare function pickTrailer(videos?: { key?: string; site?: string; type?: string; iso_639_1?: string | null; official?: boolean }[]): string | null
export declare function pickCast(
  cast: { name?: string; character?: string; order?: number; profile_path?: string | null }[] | undefined,
  image: (size: string, path: string | null | undefined) => string | null,
): CastMember[]
export declare function isGenericEpisodeTitle(title: string | null | undefined): boolean
export type TmdbKind = 'movie' | 'tv'
export type TmdbResult = { tmdbId: number; title: string; originalTitle: string | null; year: number | null; posterUrl: string | null; overview: string | null }
export type TmdbDetails = {
  tmdb_id: number
  original_title: string | null
  synopsis: string | null
  release_year: number | null
  genres: string[]
  poster_url: string | null
  backdrop_url: string | null
  logo_url: string | null
  trailer_key: string | null
  cast: CastMember[]
}
export type CastMember = { name: string; character: string | null; profile_url: string | null }
export type TmdbEpisode = { title: string | null; synopsis: string | null; still_url: string | null }
export type Tmdb = {
  search(kind: TmdbKind, query: string, year?: number | null): Promise<TmdbResult[]>
  movie(id: number): Promise<TmdbDetails | null>
  series(id: number): Promise<TmdbDetails | null>
  season(id: number, season: number): Promise<Map<number, TmdbEpisode>>
}
export declare function createTmdb(env?: Record<string, string | undefined>, fetchImpl?: typeof fetch): Tmdb | null
export declare function fillEmpty<T extends Record<string, unknown>>(current: Record<string, unknown>, incoming: T): Partial<T>
