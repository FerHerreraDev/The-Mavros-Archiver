import Foundation
import Testing
@testable import MavrosModel

/// tests/fixtures del repo: los mismos casos que corren la web y Android (IPAD-02)
func fixture(_ name: String) throws -> Data {
    let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../../tests/fixtures").standardized
    return try Data(contentsOf: root.appendingPathComponent(name))
}

struct Ref: Decodable { let id: String; let season: Int; let episode: Int; let duration: Int }
struct Prog: Decodable { let movieId: String; let position: Double; let updatedAt: String }
func episodes(_ refs: [Ref], series: String? = "s") -> [Movie] {
    refs.map { Movie(id: $0.id, title: $0.id, durationSeconds: $0.duration, seriesId: series, seasonNumber: series == nil ? nil : $0.season, episodeNumber: series == nil ? nil : $0.episode) }
}
func progress(_ list: [Prog]) -> [EpisodeProgress] { list.map { EpisodeProgress(movieId: $0.movieId, position: $0.position, updatedAt: $0.updatedAt) } }

@Suite("Reglas de progreso: mismos casos que la web (MOB-10, IPAD-02)")
struct ProgressCases {
    struct Case: Decodable { let position: Double?; let duration: Int; let expected: Double }
    struct BoolCase: Decodable { let position: Double?; let duration: Int; let expected: Bool }
    struct Cases: Decodable { let resumePosition: [Case]; let isInProgress: [BoolCase] }

    @Test func resumePosition() throws {
        let cases = try JSONDecoder().decode(Cases.self, from: fixture("progress-cases.json"))
        #expect(!cases.resumePosition.isEmpty)
        for c in cases.resumePosition { #expect(ProgressRules.resumePosition(c.position, duration: c.duration) == c.expected, "resumePosition(\(String(describing: c.position)), \(c.duration))") }
    }

    @Test func isInProgress() throws {
        let cases = try JSONDecoder().decode(Cases.self, from: fixture("progress-cases.json"))
        #expect(!cases.isInProgress.isEmpty)
        for c in cases.isInProgress { #expect(ProgressRules.isInProgress(c.position ?? 0, duration: c.duration) == c.expected, "isInProgress(\(String(describing: c.position)), \(c.duration))") }
    }
}

@Suite("Cambio de token: mismos casos que la web (MOB-16, IPAD-07)")
struct SwapTokenCases {
    struct Case: Decodable { let name: String; let url: String; let expected: String }
    struct Single: Decodable { let latest: String; let url: String; let expected: String }
    struct Cases: Decodable { let latest: String; let cases: [Case]; let latestWithoutToken: Single }

    @Test func swapToken() throws {
        let shared = try JSONDecoder().decode(Cases.self, from: fixture("swap-token-cases.json"))
        #expect(!shared.cases.isEmpty)
        for c in shared.cases { #expect(PlaybackRules.swapToken(c.url, latest: shared.latest) == c.expected, "\(c.name)") }
        let w = shared.latestWithoutToken
        #expect(PlaybackRules.swapToken(w.url, latest: w.latest) == w.expected)
    }

    @Test func refreshFiveMinutesBefore() {
        #expect(PlaybackRules.refreshDelayMs(expiresAtMs: 1_000_000, nowMs: 0) == 1_000_000 - 300_000)
        #expect(PlaybackRules.refreshDelayMs(expiresAtMs: 100_000, nowMs: 0) == 0)
    }
}

@Suite("Series: mismos casos que la web (SER-10, SER-11, SER-13)")
struct SeriesCases {
    struct NextCase: Decodable { let current: String; let expected: String? }
    struct UpExpected: Decodable, Equatable { let id: String; let action: String; let startAt: Double }
    struct UpCase: Decodable { let name: String; let episodes: [Ref]?; let progress: [Prog]; let expected: UpExpected? }
    struct ContExpected: Decodable, Equatable { let id: String; let positionSeconds: Double; let updatedAt: String }
    struct ContCase: Decodable { let name: String; let progress: [Prog]; let expected: ContExpected? }
    struct Cases: Decodable { let episodes: [Ref]; let sorted: [String]; let nextEpisode: [NextCase]; let nextUp: [UpCase]; let seriesContinue: [ContCase] }

    let cases: Cases
    init() throws { cases = try JSONDecoder().decode(Cases.self, from: fixture("series-cases.json")) }

    @Test func order() { #expect(SeriesRules.sortEpisodes(episodes(cases.episodes)).map(\.id) == cases.sorted) }

    @Test func next() {
        for c in cases.nextEpisode { #expect(SeriesRules.nextEpisode(episodes(cases.episodes), after: c.current)?.id == c.expected, "siguiente de \(c.current)") }
    }

    @Test func nextUp() {
        for c in cases.nextUp {
            let r = SeriesRules.nextUp(episodes(c.episodes ?? cases.episodes), progress: progress(c.progress))
            #expect(r.map { UpExpected(id: $0.episode.id, action: $0.action.rawValue, startAt: $0.startAt) } == c.expected, "\(c.name)")
        }
    }

    @Test func continueWatching() {
        for c in cases.seriesContinue {
            let r = SeriesRules.seriesContinue(episodes(cases.episodes), progress: progress(c.progress))
            #expect(r.map { ContExpected(id: $0.episode.id, positionSeconds: $0.positionSeconds, updatedAt: $0.updatedAt) } == c.expected, "\(c.name)")
        }
    }

    @Test func labels() {
        let ep = episodes(cases.episodes).first { $0.id == "s1e2" }!
        #expect(episodeLabel(season: 1, episode: 2) == "T1:E2")
        #expect(seasonName(0) == "Especiales")
        #expect(NextUp(episode: ep, action: .continue, startAt: 400).label == "Continuar T1:E2 desde 6:40")
        #expect(NextUp(episode: ep, action: .rewatch, startAt: 0).label == "Volver a ver T1:E2")
        #expect(CatalogSeries(series: Series(id: "x", title: "x"), seasons: 2, episodes: 5).countLabel == "2 temporadas")
        #expect(CatalogSeries(series: Series(id: "x", title: "x"), seasons: 1, episodes: 1).countLabel == "1 episodio")
    }

    @Test func supabaseTimestamps() {
        // Postgres manda 6 decimales y "+00:00"; los casos traen "Z"
        #expect(SeriesRules.instant("2026-10-27T05:05:33.123456+00:00") > SeriesRules.instant("2026-10-27T05:05:33Z"))
        #expect(SeriesRules.instant("2026-01-02T00:00:00+00:00") > SeriesRules.instant("2026-01-01T00:00:00Z"))
    }
}

@Suite("Listas: mismos casos que la web (PL-05, PL-06)")
struct PlaylistCases {
    struct Expected: Decodable, Equatable { let id: String; let startAt: Double }
    struct StartCase: Decodable { let name: String; let entries: [String]?; let progress: [Prog]; let expected: Expected? }
    struct NextCase: Decodable { let name: String; let current: String; let progress: [Prog]; let expected: Expected? }
    struct Cases: Decodable { let movies: [Ref]; let series: [String: [Ref]]; let entries: [String]; let start: [StartCase]; let next: [NextCase] }

    let cases: Cases
    init() throws { cases = try JSONDecoder().decode(Cases.self, from: fixture("playlist-cases.json")) }

    private func entries(_ keys: [String]) -> [ListEntry] {
        keys.map { key in
            if let eps = cases.series[key] { return .series(id: key, episodes: episodes(eps, series: key)) }
            return .movie(episodes(cases.movies.filter { $0.id == key }, series: nil)[0])
        }
    }
    private func simple(_ p: ListPick?) -> Expected? { p.map { Expected(id: $0.episode.id, startAt: $0.startAt) } }

    @Test func playList() {
        for c in cases.start { #expect(simple(PlaylistRules.start(entries(c.entries ?? cases.entries), progress: progress(c.progress))) == c.expected, "\(c.name)") }
    }

    @Test func nextInList() {
        for c in cases.next { #expect(simple(PlaylistRules.next(entries(cases.entries), after: c.current, progress: progress(c.progress))) == c.expected, "\(c.name)") }
    }
}

@Suite("Login y avance (MOB-03, MOB-15)")
struct LoginAndTracker {
    @Test func loginValidation() {
        #expect(LoginValidation.validate(email: "", password: "").email == "El email es requerido")
        #expect(LoginValidation.validate(email: "no-es-email", password: "12345678").email == "Email inválido")
        #expect(LoginValidation.validate(email: "a@b.co", password: "1234567").password == "La contraseña debe tener al menos 8 caracteres")
        #expect(LoginValidation.validate(email: "  A@B.CO ", password: "12345678").isValid)
        #expect(LoginValidation.normalizeEmail("  A@B.CO ") == "a@b.co")
    }

    @Test func trackerNeverSavesBeforeStartingNorZero() {
        let t = ProgressTracker(durationSeconds: 100)
        #expect(t.onExit(position: 0, nowMs: 0) == nil, "antes de arrancar no guarda (PRG-06)")
        t.onPlaying(nowMs: 0)
        #expect(t.onTick(position: 5, isPlaying: true, nowMs: 9_000) == nil)
        #expect(t.onTick(position: 10, isPlaying: true, nowMs: 10_000) == 10)
        #expect(t.onPause(position: 10, nowMs: 11_000) == nil, "misma posición dos veces no")
        #expect(t.onExit(position: 500, nowMs: 12_000) == 100, "dentro de 0…duración")
    }
}
