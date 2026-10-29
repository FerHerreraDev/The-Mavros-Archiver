import SwiftUI
import MavrosModel
import MavrosData

/// Página de la serie (IPAD-05, SER-17, SER-18): imagen horizontal, botón de qué sigue, temporadas y episodios
struct SeriesView: View {
    @Environment(AppModel.self) private var model
    let seriesId: String
    @State private var state: Loadable<SeriesDetail?> = .loading
    @State private var season: Int?
    @State private var playing: PlayRequest?

    var body: some View {
        Group {
            switch state {
            case .loading: ProgressView().controlSize(.large).frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed(let error): ErrorState(error: error) { Task { await load() } }
            case .loaded(nil): ContentUnavailableView("Esta serie no está disponible.", systemImage: "tv.slash").accessibilityIdentifier("not-available")
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
        do {
            let detail = try await model.catalog.series(id: seriesId)
            // Al abrir, la temporada del episodio que sigue; al refrescar, la que estaba viendo
            if let detail, season.map({ !detail.seasons.contains($0) }) ?? true {
                season = detail.next?.episode.seasonNumber ?? detail.seasons.first
            }
            state = .loaded(detail)
        } catch {
            if case .loaded = state { return }
            state = .failed(error)
        }
    }

    private func content(_ detail: SeriesDetail) -> some View {
        let series = detail.series
        let shown = detail.episodes.filter { $0.seasonNumber == season }
        return ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                hero(detail)
                VStack(alignment: .leading, spacing: 16) {
                    HStack {
                        Text("Episodios").font(.title2.bold()).accessibilityAddTraits(.isHeader)
                        Spacer()
                        if detail.seasons.count > 1, let current = season {
                            Picker("Temporada", selection: Binding(get: { current }, set: { season = $0 })) {
                                ForEach(detail.seasons, id: \.self) { Text(seasonName($0)).tag($0) }
                            }
                            .pickerStyle(.menu)
                            .accessibilityIdentifier("season-picker")
                        } else if let current = season {
                            Text(seasonName(current)).foregroundStyle(Theme.muted)
                        }
                    }
                    if shown.isEmpty { Text("Esta serie todavía no tiene episodios.").foregroundStyle(Theme.muted) }
                    ForEach(shown) { episode in
                        EpisodeRow(episode: episode, position: detail.progress[episode.id], isNext: detail.next?.episode.id == episode.id) {
                            playing = PlayRequest(movie: episode, startAt: ProgressRules.resumePosition(detail.progress[episode.id], duration: episode.durationSeconds))
                        }
                    }
                }
                .padding(.horizontal, 24)
                if series.tmdbId != nil { Text("Datos e imágenes: TMDB.").font(.caption2).foregroundStyle(Theme.muted).padding(.horizontal, 24) }
            }
            .padding(.bottom, 32)
        }
        .ignoresSafeArea(edges: .top)
    }

    private func hero(_ detail: SeriesDetail) -> some View {
        let series = detail.series
        let background = series.background
        return ZStack(alignment: .bottomLeading) {
            Color.clear.frame(height: 460)
                .overlay {
                    if let src = background.src, let url = URL(string: src) {
                        AsyncImage(url: url) { image in image.resizable().scaledToFill() } placeholder: { Theme.card }
                            .blur(radius: background.isWide ? 0 : 30)
                    } else { Theme.card }
                }
                .clipped()
                .accessibilityHidden(true)
            LinearGradient(colors: [Theme.background, Theme.background.opacity(0.75), .clear], startPoint: .bottom, endPoint: .top)
            LinearGradient(colors: [Theme.background.opacity(0.85), .clear], startPoint: .leading, endPoint: .trailing)
            VStack(alignment: .leading, spacing: 12) {
                Text(series.title).font(.system(size: 44, weight: .bold)).accessibilityIdentifier("series-title")
                Text(([series.releaseYear.map(String.init), CatalogSeries(series: series, seasons: detail.seasons.count, episodes: detail.episodes.count).countLabel].compactMap { $0 } + series.genres)
                    .joined(separator: " · ").uppercased())
                    .font(.caption.monospaced()).foregroundStyle(Theme.foreground.opacity(0.85))
                if let synopsis = series.synopsis { Text(synopsis).lineLimit(4).frame(maxWidth: 640, alignment: .leading) }
                if let next = detail.next {
                    Button {
                        playing = PlayRequest(movie: next.episode, startAt: next.startAt)
                    } label: {
                        Label(next.label, systemImage: "play.fill").font(.headline).padding(.horizontal, 20).padding(.vertical, 12)
                    }
                    .buttonStyle(.borderedProminent).tint(Color(white: 0.95)).foregroundStyle(.black)
                    .accessibilityIdentifier("play")
                }
            }
            .padding(24)
        }
    }
}

/// Episodio con imagen 16:9, progreso, título, duración y sinopsis; el que sigue, resaltado (SER-18)
struct EpisodeRow: View {
    let episode: Movie
    let position: Double?
    let isNext: Bool
    let play: () -> Void

    var body: some View {
        let ratio = position.flatMap { ProgressRules.isInProgress($0, duration: episode.durationSeconds) ? ProgressRules.progressRatio($0, duration: episode.durationSeconds) : nil }
        return Button(action: play) {
            HStack(alignment: .top, spacing: 16) {
                PosterImage(src: episode.posterSrc, title: episode.title, ratio: 16 / 9)
                    .frame(width: 220)
                    .overlay(alignment: .bottom) { if let ratio { ProgressBar(ratio: ratio) } }
                    .overlay { Image(systemName: "play.circle.fill").font(.largeTitle).foregroundStyle(.white.opacity(0.85)) }
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("\(episode.episodeNumber ?? 0). \(episode.title)").font(.headline).lineLimit(2)
                        Spacer()
                        Text(formatDuration(episode.durationSeconds)).font(.caption.monospaced()).foregroundStyle(Theme.muted)
                    }
                    if let synopsis = episode.synopsis { Text(synopsis).font(.subheadline).foregroundStyle(Theme.muted).lineLimit(3) }
                }
            }
            .padding(12)
            .background(isNext ? Theme.accent.opacity(0.08) : Theme.card.opacity(0.5), in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(isNext ? Theme.accent.opacity(0.6) : Theme.border))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Ver \(episode.episodeTag ?? "") \(episode.title)")
        .accessibilityIdentifier("episode-\(episode.id)")
    }
}
