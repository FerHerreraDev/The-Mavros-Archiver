import Foundation
import MavrosModel
import Supabase

/// Listas personales (IPAD-10, PL-01..PL-07). Con la sesión del usuario: RLS garantiza que solo toca las suyas.
public final class PlaylistRepository: Sendable {
    let client: SupabaseClient
    let auth: AuthService
    public init(client: SupabaseClient, auth: AuthService) { self.client = client; self.auth = auth }

    struct Count: Decodable { let count: Int }
    struct ListRow: Decodable { let id: String; let name: String; let playlist_items: [Count] }
    struct ItemRow: Decodable { let id: String; let position: Int; let movie: Movie?; let series: Series? }
    struct IdRow: Decodable { let id: String }
    struct PlaylistIdRow: Decodable { let playlist_id: String }
    struct NewList: Encodable { let name: String }
    struct NewItem: Encodable { let playlist_id: String; let movie_id: String?; let series_id: String? }

    public func lists() async throws(DataError) -> [PlaylistSummary] {
        try await guarded {
            let rows: [ListRow] = try await client.from("playlists").select("id, name, created_at, playlist_items(count)").order("created_at").execute().value
            return rows.map { PlaylistSummary(playlist: Playlist(id: $0.id, name: $0.name), count: $0.playlist_items.first?.count ?? 0) }
        }
    }

    /// nil = no es mía o no existe
    public func playlist(id: String) async throws(DataError) -> PlaylistDetail? {
        try await guarded { () async throws -> PlaylistDetail? in
            let list: Playlist? = try await client.from("playlists").select("id, name").eq("id", value: id).maybeSingle().execute().value
            guard let list else { return nil }
            let items = try await items(id)
            let (entries, progress) = try await resolve(items)
            return PlaylistDetail(playlist: list, items: items, start: PlaylistRules.start(entries, progress: progress))
        }
    }

    public func membership(_ target: PlaylistTarget) async throws(DataError) -> [PlaylistMembership] {
        try await guarded {
            let (column, value) = column(target)
            let lists: [Playlist] = try await client.from("playlists").select("id, name").order("created_at").execute().value
            let inLists: [PlaylistIdRow] = try await client.from("playlist_items").select("playlist_id").eq(column, value: value).execute().value
            let ids = Set(inLists.map(\.playlist_id))
            return lists.map { PlaylistMembership(playlist: $0, contains: ids.contains($0.id)) }
        }
    }

    /// Agrega si no estaba, quita si estaba. true = quedó agregado
    @discardableResult
    public func toggle(playlistId: String, _ target: PlaylistTarget) async throws(DataError) -> Bool {
        try await guarded {
            let (column, value) = column(target)
            let removed: [IdRow] = try await client.from("playlist_items").delete().eq("playlist_id", value: playlistId).eq(column, value: value).select("id").execute().value
            if !removed.isEmpty { return false }
            let item = NewItem(playlist_id: playlistId, movie_id: column == "movie_id" ? value : nil, series_id: column == "series_id" ? value : nil)
            try await client.from("playlist_items").insert(item, returning: .minimal).execute()
            return true
        }
    }

    /// Crea una lista (y le agrega `add`); devuelve su id
    public func create(name: String, add: PlaylistTarget? = nil) async throws(DataError) -> String {
        let created: String = try await guarded {
            let row: IdRow = try await client.from("playlists").insert(NewList(name: name.trimmingCharacters(in: .whitespacesAndNewlines))).select("id").single().execute().value
            return row.id
        }
        if let add { try await toggle(playlistId: created, add) }
        return created
    }

    /// Lo que sigue en la lista al terminar `movieId` (PL-06)
    public func next(playlistId: String, after movieId: String) async throws(DataError) -> ListPick? {
        try await guarded { () async throws -> ListPick? in
            let (entries, progress) = try await resolve(try await items(playlistId))
            return PlaylistRules.next(entries, after: movieId, progress: progress)
        }
    }

    /// RLS: lo que dejó de estar publicado llega como null y no se muestra (PL-05)
    private func items(_ playlistId: String) async throws -> [PlaylistItem] {
        let rows: [ItemRow] = try await client.from("playlist_items")
            .select("id, position, movie:movies(\(cardFields)), series:series(\(seriesFields))")
            .eq("playlist_id", value: playlistId).order("position").execute().value
        return rows.filter { ($0.movie?.status == "published") || $0.series != nil }
            .map { PlaylistItem(id: $0.id, position: $0.position, movie: $0.movie, series: $0.series) }
    }

    private func resolve(_ items: [PlaylistItem]) async throws -> ([ListEntry], [EpisodeProgress]) {
        let seriesIds = items.compactMap { $0.series?.id }
        let episodes: [Movie] = seriesIds.isEmpty ? [] : try await client.from("movies").select(cardFields)
            .in("series_id", values: seriesIds).eq("status", value: "published").execute().value
        let ids = items.compactMap { $0.movie?.id } + episodes.map(\.id)
        let saved: [ProgressEntry] = ids.isEmpty ? [] : try await client.from("watch_progress").select("movie_id, position_seconds, updated_at")
            .in("movie_id", values: ids).execute().value
        let progress = saved.map { EpisodeProgress(movieId: $0.movieId, position: $0.positionSeconds, updatedAt: $0.updatedAt) }
        let entries: [ListEntry] = items.map { item in
            if let movie = item.movie { return .movie(movie) }
            let show = item.series!.id
            return .series(id: show, episodes: SeriesRules.sortEpisodes(episodes.filter { $0.seriesId == show }))
        }
        return (entries, progress)
    }

    private func column(_ target: PlaylistTarget) -> (String, String) {
        switch target {
        case .movie(let id): return ("movie_id", id)
        case .series(let id): return ("series_id", id)
        }
    }

    private func guarded<T>(_ block: () async throws -> T) async throws(DataError) -> T {
        do { return try await block() } catch {
            let e = DataError.from(error)
            if e == .unauthorized { await auth.onUnauthorized() }
            throw e
        }
    }
}
