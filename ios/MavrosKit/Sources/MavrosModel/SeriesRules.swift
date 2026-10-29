import Foundation

/// Progreso de un episodio, como sale de `watch_progress`
public struct EpisodeProgress: Hashable, Sendable {
    public var movieId: String
    public var position: Double
    public var updatedAt: String
    public init(movieId: String, position: Double, updatedAt: String) { self.movieId = movieId; self.position = position; self.updatedAt = updatedAt }
}

/// start = nunca vista, continue = a medias, play = siguiente o recién empezado, rewatch = ya se terminó toda
public enum NextUpAction: String, Sendable { case start, `continue`, play, rewatch }

public struct NextUp: Hashable, Sendable {
    public var episode: Movie
    public var action: NextUpAction
    public var startAt: Double
    public init(episode: Movie, action: NextUpAction, startAt: Double) { self.episode = episode; self.action = action; self.startAt = startAt }

    /// Texto del botón de la serie (SER-10)
    public var label: String {
        let tag = episode.episodeTag ?? ""
        switch action {
        case .continue: return "Continuar \(tag) desde \(formatTimestamp(startAt))"
        case .rewatch: return "Volver a ver \(tag)"
        default: return "Reproducir \(tag)"
        }
    }
}

public struct SeriesContinue: Hashable, Sendable {
    public var episode: Movie
    public var positionSeconds: Double
    public var updatedAt: String
}

/// "T1:E2"
public func episodeLabel(season: Int, episode: Int) -> String { "T\(season):E\(episode)" }

/// "Temporada 1", o "Especiales" para la 0
public func seasonName(_ season: Int) -> String { season == 0 ? "Especiales" : "Temporada \(season)" }

/// Reglas de series (SER-10, SER-11, SER-13). Mismas que lib/series.ts y SeriesRules.kt.
public enum SeriesRules {
    /// Temporada ascendente con la 0 (especiales) al final; luego episodio ascendente
    public static func sortEpisodes(_ episodes: [Movie]) -> [Movie] {
        func key(_ s: Int) -> Int { s == 0 ? Int.max : s }
        return episodes.sorted {
            let (a, b) = (key($0.seasonNumber ?? 0), key($1.seasonNumber ?? 0))
            return a != b ? a < b : ($0.episodeNumber ?? 0) < ($1.episodeNumber ?? 0)
        }
    }

    /// El que sigue en orden (cruza temporadas); nil si es el último o no está
    public static func nextEpisode(_ episodes: [Movie], after currentId: String) -> Movie? {
        let ordered = sortEpisodes(episodes)
        guard let i = ordered.firstIndex(where: { $0.id == currentId }), i < ordered.count - 1 else { return nil }
        return ordered[i + 1]
    }

    /// Qué sigue en la serie: el botón principal de su página. nil si no tiene episodios.
    public static func nextUp(_ episodes: [Movie], progress: [EpisodeProgress]) -> NextUp? {
        let ordered = sortEpisodes(episodes)
        guard let first = ordered.first else { return nil }
        guard let (episode, entry) = latestWatched(ordered, progress) else { return NextUp(episode: first, action: .start, startAt: 0) }
        if !isFinished(entry.position, episode.durationSeconds) {
            let startAt = ProgressRules.resumePosition(entry.position, duration: episode.durationSeconds)
            return NextUp(episode: episode, action: startAt > 0 ? .continue : .play, startAt: startAt)
        }
        if let next = nextEpisode(ordered, after: episode.id) { return NextUp(episode: next, action: .play, startAt: 0) }
        return NextUp(episode: first, action: .rewatch, startAt: 0)
    }

    /// Entrada de la serie en "Seguir viendo": a medias (5–95 %) o el siguiente de uno terminado
    public static func seriesContinue(_ episodes: [Movie], progress: [EpisodeProgress]) -> SeriesContinue? {
        guard let (episode, entry) = latestWatched(episodes, progress) else { return nil }
        if !isFinished(entry.position, episode.durationSeconds) {
            return ProgressRules.isInProgress(entry.position, duration: episode.durationSeconds)
                ? SeriesContinue(episode: episode, positionSeconds: entry.position, updatedAt: entry.updatedAt) : nil
        }
        guard let next = nextEpisode(episodes, after: episode.id) else { return nil }
        return SeriesContinue(episode: next, positionSeconds: 0, updatedAt: entry.updatedAt)
    }

    /// Para ordenar fechas de Supabase ("…+00:00", con microsegundos) y de los casos ("…Z")
    public static func instant(_ timestamp: String) -> Date {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = withFraction.date(from: timestamp) ?? ISO8601DateFormatter().date(from: timestamp) { return d }
        // Postgres manda 6 decimales; ISO8601DateFormatter solo entiende 3
        let trimmed = timestamp.replacingOccurrences(of: #"(\.\d{3})\d+"#, with: "$1", options: .regularExpression)
        return withFraction.date(from: trimmed) ?? .distantPast
    }

    private static func isFinished(_ position: Double, _ duration: Int) -> Bool { duration > 0 && position / Double(duration) >= ProgressRules.finishedRatio }

    private static func latestWatched(_ episodes: [Movie], _ progress: [EpisodeProgress]) -> (Movie, EpisodeProgress)? {
        let byId = Dictionary(uniqueKeysWithValues: episodes.map { ($0.id, $0) })
        return progress.compactMap { entry in byId[entry.movieId].map { ($0, entry) } }
            .max { instant($0.1.updatedAt) < instant($1.1.updatedAt) }
    }
}
