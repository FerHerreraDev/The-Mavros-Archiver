import Foundation

/// Lista personal (PL-01)
public struct Playlist: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var name: String
    public init(id: String, name: String) { self.id = id; self.name = name }
}

public struct PlaylistSummary: Hashable, Sendable {
    public var playlist: Playlist
    public var count: Int
    public init(playlist: Playlist, count: Int) { self.playlist = playlist; self.count = count }
}

/// Elemento de la lista: una película/episodio o una serie (PL-02)
public struct PlaylistItem: Hashable, Identifiable, Sendable {
    public var id: String
    public var position: Int
    public var movie: Movie?
    public var series: Series?
    public init(id: String, position: Int, movie: Movie?, series: Series?) { self.id = id; self.position = position; self.movie = movie; self.series = series }
    public var title: String { movie?.title ?? series?.title ?? "" }
}

public struct PlaylistMembership: Hashable, Sendable {
    public var playlist: Playlist
    public var contains: Bool
    public init(playlist: Playlist, contains: Bool) { self.playlist = playlist; self.contains = contains }
}

public enum PlaylistTarget: Hashable, Sendable {
    case movie(String)
    case series(String)
}

/// Elemento ya resuelto para las reglas: una película, o una serie con sus episodios visibles
public enum ListEntry: Sendable {
    case movie(Movie)
    case series(id: String, episodes: [Movie])
}

/// Qué se reproduce y desde dónde
public struct ListPick: Hashable, Sendable {
    public var episode: Movie
    public var startAt: Double
    public init(episode: Movie, startAt: Double) { self.episode = episode; self.startAt = startAt }
}

public struct PlaylistDetail: Hashable, Sendable {
    public var playlist: Playlist
    public var items: [PlaylistItem]
    public var start: ListPick?
    public init(playlist: Playlist, items: [PlaylistItem], start: ListPick?) { self.playlist = playlist; self.items = items; self.start = start }
}

/// Reglas de listas (PL-05, PL-06). Mismas que lib/playlist.ts y PlaylistRules.kt.
public enum PlaylistRules {
    /// "Reproducir lista": el primer elemento que tenga algo que ver
    public static func start(_ entries: [ListEntry], progress: [EpisodeProgress]) -> ListPick? {
        for entry in entries { if let pick = entryStart(entry, progress) { return pick } }
        return nil
    }

    /// Lo que sigue al terminar `currentId`: dentro de una serie de la lista, su siguiente episodio; si no, el siguiente elemento
    public static func next(_ entries: [ListEntry], after currentId: String, progress: [EpisodeProgress]) -> ListPick? {
        guard let i = entries.firstIndex(where: {
            switch $0 {
            case .movie(let m): return m.id == currentId
            case .series(_, let eps): return eps.contains { $0.id == currentId }
            }
        }) else { return nil }
        if case .series(_, let eps) = entries[i], let following = SeriesRules.nextEpisode(eps, after: currentId) {
            return ListPick(episode: following, startAt: 0)
        }
        return start(Array(entries.dropFirst(i + 1)), progress: progress)
    }

    private static func entryStart(_ entry: ListEntry, _ progress: [EpisodeProgress]) -> ListPick? {
        switch entry {
        case .movie(let movie):
            let saved = progress.first { $0.movieId == movie.id }?.position
            return ListPick(episode: movie, startAt: ProgressRules.resumePosition(saved, duration: movie.durationSeconds))
        case .series(_, let episodes):
            return SeriesRules.nextUp(episodes, progress: progress).map { ListPick(episode: $0.episode, startAt: $0.startAt) }
        }
    }
}
