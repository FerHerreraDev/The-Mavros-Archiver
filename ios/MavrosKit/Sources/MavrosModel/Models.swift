import Foundation

/// Lo que necesita un póster: película, episodio o serie
public protocol HasPoster {
    var id: String { get }
    var title: String { get }
    var posterSrc: String? { get }
    var posterThumbhash: String? { get }
}

/// Película o episodio tal como lo devuelve Supabase (columnas de `movies`)
public struct Movie: Codable, Hashable, Identifiable, HasPoster, Sendable {
    public var id: String
    public var slug: String
    public var title: String
    public var originalTitle: String?
    public var synopsis: String?
    public var releaseYear: Int?
    public var durationSeconds: Int
    public var genres: [String]
    public var posterUrl: String?
    /// Copia optimizada en el bucket `posters` (LOAD-07); si no hay, se usa `posterUrl`
    public var posterImageUrl: String?
    public var posterThumbhash: String?
    public var hlsPath: String?
    public var status: String
    public var publishedAt: String?
    /// Episodio (SER-03): serie, temporada y número juntos o nil
    public var seriesId: String?
    public var seasonNumber: Int?
    public var episodeNumber: Int?

    enum CodingKeys: String, CodingKey {
        case id, slug, title, synopsis, genres, status
        case originalTitle = "original_title", releaseYear = "release_year", durationSeconds = "duration_seconds"
        case posterUrl = "poster_url", posterImageUrl = "poster_image_url", posterThumbhash = "poster_thumbhash"
        case hlsPath = "hls_path", publishedAt = "published_at"
        case seriesId = "series_id", seasonNumber = "season_number", episodeNumber = "episode_number"
    }

    public init(
        id: String, slug: String = "", title: String, originalTitle: String? = nil, synopsis: String? = nil, releaseYear: Int? = nil,
        durationSeconds: Int, genres: [String] = [], posterUrl: String? = nil, posterImageUrl: String? = nil, posterThumbhash: String? = nil,
        hlsPath: String? = nil, status: String = "published", publishedAt: String? = nil,
        seriesId: String? = nil, seasonNumber: Int? = nil, episodeNumber: Int? = nil
    ) {
        self.id = id; self.slug = slug; self.title = title; self.originalTitle = originalTitle; self.synopsis = synopsis
        self.releaseYear = releaseYear; self.durationSeconds = durationSeconds; self.genres = genres; self.posterUrl = posterUrl
        self.posterImageUrl = posterImageUrl; self.posterThumbhash = posterThumbhash; self.hlsPath = hlsPath; self.status = status
        self.publishedAt = publishedAt; self.seriesId = seriesId; self.seasonNumber = seasonNumber; self.episodeNumber = episodeNumber
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        slug = try c.decodeIfPresent(String.self, forKey: .slug) ?? ""
        title = try c.decode(String.self, forKey: .title)
        originalTitle = try c.decodeIfPresent(String.self, forKey: .originalTitle)
        synopsis = try c.decodeIfPresent(String.self, forKey: .synopsis)
        releaseYear = try c.decodeIfPresent(Int.self, forKey: .releaseYear)
        durationSeconds = try c.decode(Int.self, forKey: .durationSeconds)
        genres = try c.decodeIfPresent([String].self, forKey: .genres) ?? []
        posterUrl = try c.decodeIfPresent(String.self, forKey: .posterUrl)
        posterImageUrl = try c.decodeIfPresent(String.self, forKey: .posterImageUrl)
        posterThumbhash = try c.decodeIfPresent(String.self, forKey: .posterThumbhash)
        hlsPath = try c.decodeIfPresent(String.self, forKey: .hlsPath)
        status = try c.decodeIfPresent(String.self, forKey: .status) ?? "published"
        publishedAt = try c.decodeIfPresent(String.self, forKey: .publishedAt)
        seriesId = try c.decodeIfPresent(String.self, forKey: .seriesId)
        seasonNumber = try c.decodeIfPresent(Int.self, forKey: .seasonNumber)
        episodeNumber = try c.decodeIfPresent(Int.self, forKey: .episodeNumber)
    }

    /// La imagen que se carga: la copia propia si existe
    public var posterSrc: String? { posterImageUrl ?? posterUrl }
    public var isEpisode: Bool { seriesId != nil && seasonNumber != nil && episodeNumber != nil }
    /// "T1:E2" de un episodio; nil en películas
    public var episodeTag: String? {
        guard isEpisode, let s = seasonNumber, let e = episodeNumber else { return nil }
        return episodeLabel(season: s, episode: e)
    }
}

/// Serie tal como la devuelve Supabase (columnas de `series`)
public struct Series: Codable, Hashable, Identifiable, HasPoster, Sendable {
    public var id: String
    public var slug: String
    public var title: String
    public var originalTitle: String?
    public var synopsis: String?
    public var releaseYear: Int?
    public var genres: [String]
    public var posterUrl: String?
    public var posterImageUrl: String?
    public var posterThumbhash: String?
    /// Imagen horizontal de fondo de su página (SER-17)
    public var backdropUrl: String?
    public var backdropImageUrl: String?
    public var backdropThumbhash: String?
    public var tmdbId: Int?
    public var status: String

    enum CodingKeys: String, CodingKey {
        case id, slug, title, synopsis, genres, status
        case originalTitle = "original_title", releaseYear = "release_year"
        case posterUrl = "poster_url", posterImageUrl = "poster_image_url", posterThumbhash = "poster_thumbhash"
        case backdropUrl = "backdrop_url", backdropImageUrl = "backdrop_image_url", backdropThumbhash = "backdrop_thumbhash"
        case tmdbId = "tmdb_id"
    }

    public init(id: String, slug: String = "", title: String, originalTitle: String? = nil, synopsis: String? = nil, releaseYear: Int? = nil,
                genres: [String] = [], posterUrl: String? = nil, posterImageUrl: String? = nil, posterThumbhash: String? = nil,
                backdropUrl: String? = nil, backdropImageUrl: String? = nil, backdropThumbhash: String? = nil, tmdbId: Int? = nil, status: String = "published") {
        self.id = id; self.slug = slug; self.title = title; self.originalTitle = originalTitle; self.synopsis = synopsis
        self.releaseYear = releaseYear; self.genres = genres; self.posterUrl = posterUrl; self.posterImageUrl = posterImageUrl
        self.posterThumbhash = posterThumbhash; self.backdropUrl = backdropUrl; self.backdropImageUrl = backdropImageUrl
        self.backdropThumbhash = backdropThumbhash; self.tmdbId = tmdbId; self.status = status
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        slug = try c.decodeIfPresent(String.self, forKey: .slug) ?? ""
        title = try c.decode(String.self, forKey: .title)
        originalTitle = try c.decodeIfPresent(String.self, forKey: .originalTitle)
        synopsis = try c.decodeIfPresent(String.self, forKey: .synopsis)
        releaseYear = try c.decodeIfPresent(Int.self, forKey: .releaseYear)
        genres = try c.decodeIfPresent([String].self, forKey: .genres) ?? []
        posterUrl = try c.decodeIfPresent(String.self, forKey: .posterUrl)
        posterImageUrl = try c.decodeIfPresent(String.self, forKey: .posterImageUrl)
        posterThumbhash = try c.decodeIfPresent(String.self, forKey: .posterThumbhash)
        backdropUrl = try c.decodeIfPresent(String.self, forKey: .backdropUrl)
        backdropImageUrl = try c.decodeIfPresent(String.self, forKey: .backdropImageUrl)
        backdropThumbhash = try c.decodeIfPresent(String.self, forKey: .backdropThumbhash)
        tmdbId = try c.decodeIfPresent(Int.self, forKey: .tmdbId)
        status = try c.decodeIfPresent(String.self, forKey: .status) ?? "published"
    }

    public var posterSrc: String? { posterImageUrl ?? posterUrl }

    /// Fondo de la página: la imagen horizontal o, si no hay, el póster (SER-17)
    public var background: (src: String?, thumbhash: String?, isWide: Bool) {
        if let wide = backdropImageUrl ?? backdropUrl { return (wide, backdropThumbhash, true) }
        return (posterSrc, posterThumbhash, false)
    }
}

/// Serie en el catálogo con cuántas temporadas y episodios visibles tiene (SER-08)
public struct CatalogSeries: Hashable, Sendable {
    public var series: Series
    public var seasons: Int
    public var episodes: Int
    public init(series: Series, seasons: Int, episodes: Int) { self.series = series; self.seasons = seasons; self.episodes = episodes }
    /// "2 temporadas" o, si es una sola, "8 episodios"
    public var countLabel: String {
        if seasons > 1 { return "\(seasons) temporadas" }
        return episodes == 1 ? "1 episodio" : "\(episodes) episodios"
    }
}

/// En "Seguir viendo": película, o episodio con su serie (SER-11)
public struct ContinueItem: Hashable, Sendable {
    public var movie: Movie
    public var positionSeconds: Double
    public var series: Series?
    public init(movie: Movie, positionSeconds: Double, series: Series? = nil) { self.movie = movie; self.positionSeconds = positionSeconds; self.series = series }
}

public struct Catalog: Hashable, Sendable {
    public var genres: [String]
    public var recent: [Movie]
    public var continueWatching: [ContinueItem]
    public var series: [CatalogSeries]
    public init(genres: [String], recent: [Movie], continueWatching: [ContinueItem], series: [CatalogSeries] = []) {
        self.genres = genres; self.recent = recent; self.continueWatching = continueWatching; self.series = series
    }
}

/// `series` solo si es un episodio (SER-12)
public struct MovieDetail: Hashable, Sendable {
    public var movie: Movie
    public var positionSeconds: Double?
    public var series: Series?
    public init(movie: Movie, positionSeconds: Double?, series: Series? = nil) { self.movie = movie; self.positionSeconds = positionSeconds; self.series = series }
}

/// Página de la serie (SER-09, SER-10)
public struct SeriesDetail: Hashable, Sendable {
    public var series: Series
    public var episodes: [Movie]
    public var progress: [String: Double]
    public var next: NextUp?
    public init(series: Series, episodes: [Movie], progress: [String: Double], next: NextUp?) {
        self.series = series; self.episodes = episodes; self.progress = progress; self.next = next
    }
    public var seasons: [Int] {
        var seen: [Int] = []
        for s in episodes.compactMap(\.seasonNumber) where !seen.contains(s) { seen.append(s) }
        return seen
    }
}

/// "1 h 39 min", "25 min", "22 s" (igual que formatDuration de la web)
public func formatDuration(_ seconds: Int) -> String {
    if seconds < 60 { return "\(seconds) s" }
    let h = seconds / 3600
    let m = Int((Double(seconds % 3600) / 60).rounded())
    return h > 0 ? "\(h) h \(m) min" : "\(m) min"
}

/// 754.2 -> "12:34", 3725 -> "1:02:05"
public func formatTimestamp(_ seconds: Double) -> String {
    let total = Int(seconds)
    let h = total / 3600, m = (total % 3600) / 60, s = total % 60
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
}
