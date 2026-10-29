import SwiftUI
import MavrosModel
import MavrosData

/// Película o episodio para reproducir
struct PlayRequest: Identifiable, Hashable {
    let movie: Movie
    let startAt: Double
    var listId: String?
    var id: String { movie.id }
}

/// Detalle (IPAD-05, MOB-08): póster, datos, "Reproducir" / "Continuar desde", y "Ver episodios" en un episodio
struct DetailView: View {
    @Environment(AppModel.self) private var model
    let movieId: String
    @Binding var path: NavigationPath
    @State private var state: Loadable<MovieDetail?> = .loading
    @State private var playing: PlayRequest?

    var body: some View {
        Group {
            switch state {
            case .loading: ProgressView().controlSize(.large).frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed(let error): ErrorState(error: error) { Task { await load() } }
            case .loaded(nil): ContentUnavailableView("Esta película no está disponible.", systemImage: "film").accessibilityIdentifier("not-available")
            case .loaded(.some(let detail)): content(detail)
            }
        }
        .background(Theme.background)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .onReceive(NotificationCenter.default.publisher(for: .mavrosProgressSaved)) { _ in Task { await load() } }
        .fullScreenCover(item: $playing) { PlayerView(request: $0) }
    }

    private func load() async {
        do { state = .loaded(try await model.catalog.movie(id: movieId)) } catch {
            if case .loaded = state { return }
            state = .failed(error)
        }
    }

    private func content(_ detail: MovieDetail) -> some View {
        let movie = detail.movie
        let start = ProgressRules.resumePosition(detail.positionSeconds, duration: movie.durationSeconds)
        return ScrollView {
            HStack(alignment: .top, spacing: 32) {
                PosterImage(src: movie.posterSrc, title: movie.title, ratio: movie.isEpisode ? 16 / 9 : 2 / 3)
                    .frame(width: movie.isEpisode ? 360 : 260)
                VStack(alignment: .leading, spacing: 14) {
                    if let series = detail.series {
                        Text("\(series.title) · \(movie.episodeTag ?? "")").foregroundStyle(Theme.muted).accessibilityIdentifier("series-line")
                    }
                    Text(movie.title).font(.largeTitle.bold()).accessibilityIdentifier("title")
                    if let original = movie.originalTitle { Text(original).foregroundStyle(Theme.muted) }
                    Text(([movie.releaseYear.map(String.init), formatDuration(movie.durationSeconds)].compactMap { $0 } + movie.genres).joined(separator: " · ").uppercased())
                        .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                    HStack(spacing: 12) {
                        Button {
                            playing = PlayRequest(movie: movie, startAt: start)
                        } label: {
                            Label(start > 0 ? "Continuar desde \(formatTimestamp(start))" : "Reproducir", systemImage: "play.fill")
                                .font(.headline).padding(.horizontal, 20).padding(.vertical, 12)
                        }
                        .buttonStyle(.borderedProminent).tint(Color(white: 0.95)).foregroundStyle(.black)
                        .accessibilityIdentifier("play")
                        // Episodio: a su serie con todos los capítulos (SER-20)
                        if let series = detail.series {
                            Button("Ver episodios") { path.append(Route.series(series.id)) }
                                .buttonStyle(.bordered).accessibilityIdentifier("open-series")
                        }
                    }
                    if let synopsis = movie.synopsis { Text(synopsis).padding(.top, 4) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(32)
        }
    }
}
