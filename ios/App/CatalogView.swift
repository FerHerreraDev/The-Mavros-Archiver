import SwiftUI
import MavrosModel
import MavrosData

/// Estado de una pantalla que carga datos
enum Loadable<T> {
    case loading
    case failed(DataError)
    case loaded(T)
}

/// Catálogo (IPAD-04): Seguir viendo, Recién agregadas, Series y filtro por género. La cuadrícula se adapta al ancho.
struct CatalogView: View {
    @Environment(AppModel.self) private var model
    @Binding var path: NavigationPath
    @State private var state: Loadable<Catalog> = .loading
    @State private var genre: String?

    private let grid = [GridItem(.adaptive(minimum: 150, maximum: 220), spacing: 16, alignment: .top)]

    var body: some View {
        ScrollView {
            Group {
                switch state {
                case .loading: skeleton
                case .failed(let error): ErrorState(error: error) { Task { await load(showLoading: true) } }.padding(.top, 80)
                case .loaded(let catalog): content(catalog)
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
        .background(Theme.background)
        .navigationTitle("The Mavros Archiver")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load(showLoading: false) }
        .task { await load(showLoading: true) }
        // Al volver del reproductor "Seguir viendo" muestra el progreso nuevo (MOB-19)
        .onReceive(NotificationCenter.default.publisher(for: .mavrosProgressSaved)) { _ in Task { await load(showLoading: false) } }
        .accessibilityIdentifier("catalog")
    }

    private func load(showLoading: Bool) async {
        if showLoading, case .loaded = state {} else if showLoading { state = .loading }
        do {
            let catalog = try await model.catalog.catalog(genre: genre)
            state = .loaded(catalog)
        } catch {
            // Con contenido ya mostrado, un refresco fallido no lo borra
            if case .loaded = state, !showLoading { return }
            state = .failed(error)
        }
    }

    @ViewBuilder
    private func content(_ catalog: Catalog) -> some View {
        VStack(alignment: .leading, spacing: 28) {
            if !catalog.continueWatching.isEmpty {
                Section(title: "Seguir viendo") {
                    ScrollView(.horizontal, showsIndicators: false) {
                        LazyHStack(alignment: .top, spacing: 16) {
                            ForEach(catalog.continueWatching, id: \.movie.id) { item in
                                continueCard(item).frame(width: 160)
                            }
                        }
                    }
                    .accessibilityIdentifier("continue-row")
                }
            }

            if !catalog.genres.isEmpty { genreChips(catalog.genres) }

            if catalog.recent.isEmpty && catalog.series.isEmpty {
                ContentUnavailableView(genre.map { "No hay nada de \"\($0)\" todavía." } ?? "La bóveda está vacía por ahora.", systemImage: "film")
                    .accessibilityIdentifier("empty")
            }
            if !catalog.recent.isEmpty {
                Section(title: "Recién agregadas") {
                    LazyVGrid(columns: grid, spacing: 20) {
                        ForEach(catalog.recent) { movie in
                            Button { path.append(Route.movie(movie.id)) } label: {
                                Card(poster: movie.posterSrc, title: movie.title, meta: [movie.releaseYear.map(String.init), formatDuration(movie.durationSeconds)].compactMap { $0 }.joined(separator: " · "))
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("movie-\(movie.id)")
                        }
                    }
                }
            }
            if !catalog.series.isEmpty {
                Section(title: "Series") {
                    LazyVGrid(columns: grid, spacing: 20) {
                        ForEach(catalog.series, id: \.series.id) { show in
                            Button { path.append(Route.series(show.series.id)) } label: {
                                Card(poster: show.series.posterSrc, title: show.series.title, meta: [show.series.releaseYear.map(String.init), show.countLabel].compactMap { $0 }.joined(separator: " · "))
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("series-\(show.series.id)")
                        }
                    }
                }
            }
        }
        .padding(.top, 8)
    }

    /// Episodio: póster y título de su serie, "T1:E5 · título", y abre la serie (SER-11, SER-20)
    private func continueCard(_ item: ContinueItem) -> some View {
        let ratio = ProgressRules.progressRatio(item.positionSeconds, duration: item.movie.durationSeconds)
        return Button {
            if let series = item.series { path.append(Route.series(series.id)) } else { path.append(Route.movie(item.movie.id)) }
        } label: {
            if let series = item.series {
                Card(poster: series.posterSrc, title: series.title, meta: "\(item.movie.episodeTag ?? "") · \(item.movie.title)", progress: ratio)
            } else {
                Card(poster: item.movie.posterSrc, title: item.movie.title, meta: formatDuration(item.movie.durationSeconds), progress: ratio)
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("continue-\(item.series?.id ?? item.movie.id)")
    }

    private func genreChips(_ genres: [String]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip("Todas", selected: genre == nil) { genre = nil }
                ForEach(genres, id: \.self) { g in chip(g.capitalized, selected: genre == g) { genre = g } }
            }
        }
        .accessibilityIdentifier("genres")
    }

    private func chip(_ label: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button {
            action()
            Task { await load(showLoading: false) }
        } label: {
            Text(label).font(.subheadline.weight(.medium)).padding(.horizontal, 14).padding(.vertical, 8)
                .background(selected ? Theme.accent.opacity(0.18) : Theme.card, in: Capsule())
                .overlay(Capsule().stroke(selected ? Theme.accent : Theme.border))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var skeleton: some View {
        VStack(alignment: .leading, spacing: 20) {
            Skeleton().frame(width: 200, height: 26)
            LazyVGrid(columns: grid, spacing: 20) {
                ForEach(0..<10, id: \.self) { _ in Skeleton().aspectRatio(2 / 3, contentMode: .fit) }
            }
        }
        .padding(.top, 16)
        .accessibilityElement()
        .accessibilityLabel("Cargando")
        .accessibilityIdentifier("loading")
    }
}

/// Título de sección
struct Section<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title).font(.title2.bold()).accessibilityAddTraits(.isHeader)
            content
        }
    }
}

/// Tarjeta de póster con título y una línea de datos
struct Card: View {
    let poster: String?
    let title: String
    let meta: String
    var progress: Double?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            PosterImage(src: poster, title: title)
                .overlay(alignment: .bottom) { if let progress { ProgressBar(ratio: progress).clipShape(RoundedRectangle(cornerRadius: 2)) } }
            Text(title).font(.subheadline.weight(.medium)).lineLimit(2).foregroundStyle(Theme.foreground)
            Text(meta).font(.caption.monospaced()).lineLimit(1).foregroundStyle(Theme.muted)
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Ver \(title)")
    }
}
