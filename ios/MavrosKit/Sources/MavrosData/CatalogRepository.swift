import Foundation
import MavrosModel
import Supabase

let cardFields = "id, slug, title, release_year, duration_seconds, genres, poster_url, poster_image_url, poster_thumbhash, published_at, status, series_id, season_number, episode_number"
/// Episodios en la página de la serie: además su sinopsis (SER-18)
let episodeFields = cardFields + ", synopsis"
let seriesFields = "id, slug, title, release_year, genres, poster_url, poster_image_url, poster_thumbhash, status"

struct ProgressRow: Decodable {
    let positionSeconds: Double
    let updatedAt: String
    let movies: Movie
    enum CodingKeys: String, CodingKey { case positionSeconds = "position_seconds", updatedAt = "updated_at", movies }
}

struct ProgressEntry: Decodable {
    let movieId: String
    let positionSeconds: Double
    let updatedAt: String
    enum CodingKeys: String, CodingKey { case movieId = "movie_id", positionSeconds = "position_seconds", updatedAt = "updated_at" }
}

/// Mismas consultas y reglas que lib/data/catalog.ts y CatalogRepository.kt (IPAD-04, IPAD-05). Todo por RLS.
public final class CatalogRepository: Sendable {
    let client: SupabaseClient
    let auth: AuthService
    public init(client: SupabaseClient, auth: AuthService) { self.client = client; self.auth = auth }

    public func catalog(genre: String? = nil) async throws(DataError) -> Catalog {
        try await guarded {
            // Siempre `published`, aunque sea admin: los borradores viven en el panel web
            async let moviesQ: [Movie] = client.from("movies").select(cardFields).eq("status", value: "published")
                .order("published_at", ascending: false).execute().value
            async let seriesQ: [Series] = client.from("series").select(seriesFields).eq("status", value: "published")
                .order("published_at", ascending: false).execute().value
            async let progressQ: [ProgressRow] = client.from("watch_progress").select("position_seconds, updated_at, movies!inner(\(cardFields))")
                .eq("movies.status", value: "published").order("updated_at", ascending: false).execute().value
            let all = try await moviesQ, shows = try await seriesQ, rows = try await progressQ

            let films = all.filter { !$0.isEpisode }
            let episodesBySeries = Dictionary(grouping: all.filter(\.isEpisode)) { $0.seriesId! }
            let catalogSeries = shows.filter { episodesBySeries[$0.id] != nil }.map { show in
                let list = episodesBySeries[show.id]!
                return CatalogSeries(series: show, seasons: Set(list.compactMap(\.seasonNumber)).count, episodes: list.count)
            }
            let showsById = Dictionary(uniqueKeysWithValues: catalogSeries.map { ($0.series.id, $0.series) })

            // Seguir viendo: películas a medias (CAT-06) + una entrada por serie (SER-11), por última vez vista
            var items: [(ContinueItem, String)] = rows
                .filter { !$0.movies.isEpisode && ProgressRules.isInProgress($0.positionSeconds, duration: $0.movies.durationSeconds) }
                .map { (ContinueItem(movie: $0.movies, positionSeconds: $0.positionSeconds), $0.updatedAt) }
            let episodeRows = Dictionary(grouping: rows.filter { $0.movies.isEpisode && showsById[$0.movies.seriesId!] != nil }) { $0.movies.seriesId! }
            for (seriesId, entries) in episodeRows {
                let progress = entries.map { EpisodeProgress(movieId: $0.movies.id, position: $0.positionSeconds, updatedAt: $0.updatedAt) }
                guard let entry = SeriesRules.seriesContinue(episodesBySeries[seriesId] ?? [], progress: progress) else { continue }
                items.append((ContinueItem(movie: entry.episode, positionSeconds: entry.positionSeconds, series: showsById[seriesId]), entry.updatedAt))
            }
            items.sort { SeriesRules.instant($0.1) > SeriesRules.instant($1.1) }

            let genres = Array(Set(films.flatMap(\.genres) + catalogSeries.flatMap(\.series.genres)))
                .sorted { $0.compare($1, locale: Locale(identifier: "es")) == .orderedAscending }
            return Catalog(
                genres: genres,
                recent: genre.map { g in films.filter { $0.genres.contains(g) } } ?? films,
                continueWatching: items.map(\.0),
                series: genre.map { g in catalogSeries.filter { $0.series.genres.contains(g) } } ?? catalogSeries
            )
        }
    }

    /// nil = no existe o este usuario no la puede ver (borrador ajeno)
    public func movie(id: String) async throws(DataError) -> MovieDetail? {
        try await guarded { () async throws -> MovieDetail? in
            let movie: Movie? = try await client.from("movies").select().eq("id", value: id).maybeSingle().execute().value
            guard let movie else { return nil }
            let saved: [ProgressEntry] = try await client.from("watch_progress").select("movie_id, position_seconds, updated_at").eq("movie_id", value: id).execute().value
            var series: Series?
            if let sid = movie.seriesId {
                series = try await client.from("series").select(seriesFields).eq("id", value: sid).maybeSingle().execute().value
            }
            return MovieDetail(movie: movie, positionSeconds: saved.first?.positionSeconds, series: series)
        }
    }

    /// Serie con episodios, progreso y qué sigue (SER-09, SER-10). nil = no existe o no la puede ver.
    public func series(id: String) async throws(DataError) -> SeriesDetail? {
        try await guarded { () async throws -> SeriesDetail? in
            let show: Series? = try await client.from("series").select().eq("id", value: id).maybeSingle().execute().value
            guard let show else { return nil }
            let episodes = SeriesRules.sortEpisodes(try await client.from("movies").select(episodeFields).eq("series_id", value: id).execute().value)
            let entries: [ProgressEntry] = episodes.isEmpty ? [] : try await client.from("watch_progress")
                .select("movie_id, position_seconds, updated_at").in("movie_id", values: episodes.map(\.id)).execute().value
            let progress = entries.map { EpisodeProgress(movieId: $0.movieId, position: $0.positionSeconds, updatedAt: $0.updatedAt) }
            return SeriesDetail(
                series: show,
                episodes: episodes,
                progress: Dictionary(progress.map { ($0.movieId, $0.position) }, uniquingKeysWith: { a, _ in a }),
                // Qué sigue solo entre los publicados: lo que vería cualquier usuario (igual que la web)
                next: SeriesRules.nextUp(episodes.filter { $0.status == "published" }, progress: progress)
            )
        }
    }

    /// Siguiente episodio publicado de la misma serie (SER-12, IPAD-09); nil si no hay o es película
    public func nextEpisode(after movieId: String) async throws(DataError) -> Movie? {
        try await guarded { () async throws -> Movie? in
            let movie: Movie? = try await client.from("movies").select(cardFields).eq("id", value: movieId).maybeSingle().execute().value
            guard let seriesId = movie?.seriesId else { return nil }
            let episodes: [Movie] = try await client.from("movies").select(cardFields).eq("series_id", value: seriesId).execute().value
            return SeriesRules.nextEpisode(episodes.filter { $0.status == "published" || $0.id == movieId }, after: movieId)
        }
    }

    func guarded<T>(_ block: () async throws -> T) async throws(DataError) -> T {
        do { return try await block() } catch {
            let e = DataError.from(error)
            if e == .unauthorized { await auth.onUnauthorized() }
            throw e
        }
    }
}
