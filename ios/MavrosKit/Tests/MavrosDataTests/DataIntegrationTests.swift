import Foundation
import Testing
import Supabase
import MavrosModel
@testable import MavrosData

/// IPAD-03..IPAD-05, IPAD-10 contra Supabase local: mismas reglas que la web y Android
@Suite("Datos del iPad contra Supabase local", .enabled(if: LocalSupabase.available, "Supabase local apagado: corre pnpm db:start y ios/scripts/test-kit.sh"), .serialized)
struct DataIntegrationTests {

    @Test("IPAD-03 login: mismas credenciales malas → mismo error; desactivado igual; email se normaliza")
    func login() async throws {
        let user = try await LocalSupabase.createUser("ipad-login")
        let banned = try await LocalSupabase.createUser("ipad-banned")
        defer { Task { await LocalSupabase.deleteUser(user.id); await LocalSupabase.deleteUser(banned.id) } }
        try await LocalSupabase.ban(banned.id)

        let (auth, _, _, _) = try await LocalSupabase.app(nil)
        #expect(await auth.signIn(email: user.email, password: "contraseña-mala") == .invalidCredentials)
        #expect(await auth.signIn(email: "nadie-\(UUID())@example.com", password: "12345678") == .invalidCredentials)
        #expect(await auth.signIn(email: banned.email, password: banned.password) == .invalidCredentials)
        #expect(await auth.signIn(email: "  \(user.email.uppercased()) ", password: user.password) == nil)
    }

    @Test("IPAD-03 la sesión guardada sobrevive a cerrar y abrir la app; cerrar sesión la borra; revocada vuelve al login")
    func sessionPersistence() async throws {
        let user = try await LocalSupabase.createUser("ipad-session")
        defer { Task { await LocalSupabase.deleteUser(user.id) } }
        let storage = MemoryAuthStorage()
        let (first, _, _, _) = try await LocalSupabase.app(user, storage: storage)
        #expect(await first.validateSession())

        // "Abrir otra vez": un cliente nuevo con el mismo almacenamiento sigue dentro
        let (reopened, _, _, _) = try await LocalSupabase.app(nil, storage: storage)
        #expect(await reopened.validateSession())

        try await LocalSupabase.revokeSessions(user.id)
        let (afterRevoke, _, _, _) = try await LocalSupabase.app(nil, storage: storage)
        #expect(await afterRevoke.validateSession() == false)
        #expect(afterRevoke.client.auth.currentSession == nil)

        let (again, _, _, _) = try await LocalSupabase.app(user)
        await again.signOut()
        #expect(again.client.auth.currentSession == nil)
    }

    @Test("IPAD-04 catálogo: solo publicado (también para un admin), sin episodios sueltos, series y seguir viendo")
    func catalog() async throws {
        let genre = "ipad-genero-\(UUID().uuidString.prefix(6).lowercased())"
        let viewer = try await LocalSupabase.createUser("ipad-cat")
        let boss = try await LocalSupabase.createUser("ipad-boss", role: "admin")
        let show = try await LocalSupabase.insertSeries(["genres": [.string(genre)]])
        let film = try await LocalSupabase.insertMovie(["genres": [.string(genre)]])
        let draft = try await LocalSupabase.insertMovie(["status": "draft", "genres": [.string(genre)]])
        let e1 = try await LocalSupabase.insertMovie(["series_id": .string(show), "season_number": 1, "episode_number": 1])
        let e2 = try await LocalSupabase.insertMovie(["series_id": .string(show), "season_number": 1, "episode_number": 2])
        defer { Task { await LocalSupabase.deleteSeries([show]); await LocalSupabase.deleteMovies([film, draft]); await LocalSupabase.deleteUser(viewer.id); await LocalSupabase.deleteUser(boss.id) } }

        for user in [viewer, boss] {
            let (_, catalog, _, _) = try await LocalSupabase.app(user)
            let c = try await catalog.catalog()
            #expect(c.recent.contains { $0.id == film })
            #expect(!c.recent.contains { $0.id == draft || $0.id == e1 })
            let row = c.series.first { $0.series.id == show }
            #expect(row?.seasons == 1)
            #expect(row?.episodes == 2)
            #expect(c.genres.contains(genre))
        }
        let (_, catalog, _, _) = try await LocalSupabase.app(viewer)
        let filtered = try await catalog.catalog(genre: genre)
        #expect(filtered.recent.map(\.id) == [film])
        #expect(filtered.series.map(\.series.id) == [show])

        // Terminó T1:E1 → "Seguir viendo" ofrece T1:E2 con su serie (SER-11)
        try await LocalSupabase.setProgress(viewer.id, e1, 990)
        let entry = try await catalog.catalog().continueWatching.first { $0.series?.id == show }
        #expect(entry?.movie.id == e2)
        #expect(entry?.positionSeconds == 0)
    }

    @Test("IPAD-05 detalle y página de la serie; borrador → no disponible")
    func detailAndSeries() async throws {
        let viewer = try await LocalSupabase.createUser("ipad-det")
        let show = try await LocalSupabase.insertSeries(["synopsis": "Una serie."])
        let hidden = try await LocalSupabase.insertSeries(["status": "draft"])
        let e1 = try await LocalSupabase.insertMovie(["series_id": .string(show), "season_number": 1, "episode_number": 1, "synopsis": "Primero."])
        let e2 = try await LocalSupabase.insertMovie(["series_id": .string(show), "season_number": 2, "episode_number": 1])
        let draftEp = try await LocalSupabase.insertMovie(["series_id": .string(show), "season_number": 1, "episode_number": 2, "status": "draft"])
        let draft = try await LocalSupabase.insertMovie(["status": "draft"])
        defer { Task { await LocalSupabase.deleteSeries([show, hidden]); await LocalSupabase.deleteMovies([draft]); await LocalSupabase.deleteUser(viewer.id) } }

        let (_, catalog, _, _) = try await LocalSupabase.app(viewer)
        let detail = try #require(try await catalog.series(id: show))
        #expect(detail.episodes.map(\.id) == [e1, e2])
        #expect(detail.seasons == [1, 2])
        #expect(detail.episodes.first?.synopsis == "Primero.")
        #expect(detail.next?.action == .start)
        #expect(try await catalog.series(id: hidden) == nil)
        #expect(try await catalog.movie(id: draft) == nil)
        #expect(try await catalog.movie(id: draftEp) == nil)
        #expect(try await catalog.movie(id: e1)?.series?.id == show)
        #expect(try await catalog.nextEpisode(after: e1)?.id == e2)
        #expect(try await catalog.nextEpisode(after: e2) == nil)
    }

    @Test("IPAD-07 el progreso se guarda con la sesión del usuario y se ve en el detalle")
    func progress() async throws {
        let viewer = try await LocalSupabase.createUser("ipad-prog")
        let movie = try await LocalSupabase.insertMovie()
        defer { Task { await LocalSupabase.deleteMovies([movie]); await LocalSupabase.deleteUser(viewer.id) } }
        let (_, catalog, _, progress) = try await LocalSupabase.app(viewer)
        try await progress.save(movieId: movie, position: 123.4567)
        #expect(try await catalog.movie(id: movie)?.positionSeconds == 123.457)
    }

    @Test("IPAD-10 listas: crear con algo, marcar, quitar, reproducir y lo que sigue; ajenas no existen")
    func playlists() async throws {
        let ana = try await LocalSupabase.createUser("ipad-ana")
        let beto = try await LocalSupabase.createUser("ipad-beto")
        let m1 = try await LocalSupabase.insertMovie()
        let m2 = try await LocalSupabase.insertMovie()
        let show = try await LocalSupabase.insertSeries()
        let e1 = try await LocalSupabase.insertMovie(["series_id": .string(show), "season_number": 1, "episode_number": 1])
        let e2 = try await LocalSupabase.insertMovie(["series_id": .string(show), "season_number": 1, "episode_number": 2])
        defer { Task { await LocalSupabase.deleteSeries([show]); await LocalSupabase.deleteMovies([m1, m2]); await LocalSupabase.deleteUser(ana.id); await LocalSupabase.deleteUser(beto.id) } }

        let (_, _, lists, _) = try await LocalSupabase.app(ana)
        let id = try await lists.create(name: "  Maratón  ", add: .movie(m1))
        let summary = try await lists.lists().first { $0.playlist.id == id }
        #expect(summary?.playlist.name == "Maratón")
        #expect(summary?.count == 1)
        #expect(try await lists.toggle(playlistId: id, .series(show)) == true)
        #expect(try await lists.toggle(playlistId: id, .movie(m2)) == true)
        #expect(try await lists.membership(.movie(m2)).first { $0.playlist.id == id }?.contains == true)

        let detail = try #require(try await lists.playlist(id: id))
        #expect(detail.items.map { $0.movie?.id ?? $0.series?.id } == [m1, show, m2])
        #expect(detail.start?.episode.id == m1)
        #expect(try await lists.next(playlistId: id, after: m1)?.episode.id == e1)
        #expect(try await lists.next(playlistId: id, after: e1)?.episode.id == e2)
        #expect(try await lists.next(playlistId: id, after: e2)?.episode.id == m2)
        #expect(try await lists.next(playlistId: id, after: m2) == nil)

        #expect(try await lists.toggle(playlistId: id, .movie(m2)) == false)

        let (_, _, betoLists, _) = try await LocalSupabase.app(beto)
        #expect(try await betoLists.playlist(id: id) == nil)
        #expect(try await betoLists.lists().contains { $0.playlist.id == id } == false)
    }
}

/// IPAD-06: /api/playback con Bearer, sin red real (URLProtocol falso)
@Suite("Reproducción: URL firmada", .serialized)
struct PlaybackTests {
    final class FakeServer: URLProtocol, @unchecked Sendable {
        nonisolated(unsafe) static var status = 200
        nonisolated(unsafe) static var lastAuthorization: String?
        override class func canInit(with request: URLRequest) -> Bool { true }
        override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
        override func startLoading() {
            Self.lastAuthorization = request.value(forHTTPHeaderField: "Authorization")
            let body = #"{"url":"https://cdn.test/t/TOKEN/movies/x/master.m3u8","expires_at":"2030-01-01T00:00:00.000Z"}"#
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: Self.status, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data(body.utf8))
            client?.urlProtocolDidFinishLoading(self)
        }
        override func stopLoading() {}
    }

    @Test("PLY-06 / PLY-07: pide con Bearer y la sesión vigente; 404 → nil", .enabled(if: LocalSupabase.available))
    func source() async throws {
        let user = try await LocalSupabase.createUser("ipad-play")
        defer { Task { await LocalSupabase.deleteUser(user.id) } }
        let (auth, _, _, _) = try await LocalSupabase.app(user)
        let conf = URLSessionConfiguration.ephemeral
        conf.protocolClasses = [FakeServer.self]
        let repo = PlaybackRepository(config: LocalSupabase.config, auth: auth, session: URLSession(configuration: conf))

        FakeServer.status = 200
        let source = try #require(try await repo.source(movieId: "abc"))
        #expect(source.url.absoluteString == "https://cdn.test/t/TOKEN/movies/x/master.m3u8")
        #expect(FakeServer.lastAuthorization == "Bearer \(auth.client.auth.currentSession!.accessToken)")

        FakeServer.status = 404
        #expect(try await repo.source(movieId: "abc") == nil)
        FakeServer.status = 500
        await #expect(throws: DataError.server) { try await repo.source(movieId: "abc") }
    }
}
