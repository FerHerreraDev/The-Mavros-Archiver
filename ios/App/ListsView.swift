import SwiftUI
import MavrosModel
import MavrosData

/// Mis listas (IPAD-10, PL-07): cada lista con cuántos elementos tiene; crear una nueva
struct ListsView: View {
    @Environment(AppModel.self) private var model
    @Binding var path: NavigationPath
    @State private var state: Loadable<[PlaylistSummary]> = .loading
    @State private var creating = false
    @State private var name = ""

    var body: some View {
        Group {
            switch state {
            case .loading: ProgressView().controlSize(.large).frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed(let error): ErrorState(error: error) { Task { await load() } }
            case .loaded(let lists) where lists.isEmpty:
                ContentUnavailableView("Todavía no tienes listas", systemImage: "list.bullet.rectangle",
                                       description: Text("Crea una aquí o toca \"Agregar a lista\" en una película o serie."))
                    .accessibilityIdentifier("lists-empty")
            case .loaded(let lists):
                List(lists, id: \.playlist.id) { summary in
                    Button { path.append(Route.list(summary.playlist.id)) } label: {
                        HStack {
                            Text(summary.playlist.name).font(.headline).foregroundStyle(Theme.foreground)
                            Spacer()
                            Text(itemCount(summary.count)).font(.caption.monospaced()).foregroundStyle(Theme.muted)
                        }
                        .padding(.vertical, 8)
                    }
                    .listRowBackground(Theme.card)
                    .accessibilityIdentifier("list-\(summary.playlist.id)")
                }
                .scrollContentBackground(.hidden)
            }
        }
        .background(Theme.background)
        .navigationTitle("Mis listas")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { name = ""; creating = true } label: { Label("Nueva lista", systemImage: "plus") }
                    .accessibilityIdentifier("new-list")
            }
        }
        .alert("Nueva lista", isPresented: $creating) {
            TextField("Nombre", text: $name).accessibilityIdentifier("new-list-name")
            Button("Cancelar", role: .cancel) {}
            Button("Crear") { Task { await create() } }.disabled(!PlaylistName.isValid(name))
        }
        .task { await load() }
    }

    private func load() async {
        do { state = .loaded(try await model.playlists.lists()) } catch {
            if case .loaded = state { return }
            state = .failed(error)
        }
    }

    private func create() async {
        guard PlaylistName.isValid(name) else { return }
        _ = try? await model.playlists.create(name: name)
        await load()
    }
}

func itemCount(_ n: Int) -> String { n == 1 ? "1 elemento" : "\(n) elementos" }

/// Nombre de 1 a 100 caracteres sin espacios sobrantes (PL-01)
enum PlaylistName {
    static func isValid(_ name: String) -> Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty && trimmed.count <= 100
    }
}

/// Una lista (PL-05, PL-07): "Reproducir lista" y sus elementos en orden; tocar uno abre su detalle o su serie
struct PlaylistView: View {
    @Environment(AppModel.self) private var model
    let playlistId: String
    @Binding var path: NavigationPath
    @State private var state: Loadable<PlaylistDetail?> = .loading
    @State private var playing: PlayRequest?

    var body: some View {
        Group {
            switch state {
            case .loading: ProgressView().controlSize(.large).frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed(let error): ErrorState(error: error) { Task { await load() } }
            case .loaded(nil): ContentUnavailableView("Esta lista no está disponible.", systemImage: "list.bullet.rectangle").accessibilityIdentifier("not-available")
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
        do { state = .loaded(try await model.playlists.playlist(id: playlistId)) } catch {
            if case .loaded = state { return }
            state = .failed(error)
        }
    }

    private func content(_ detail: PlaylistDetail) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text(detail.playlist.name).font(.largeTitle.bold()).accessibilityIdentifier("list-title")
                Text(itemCount(detail.items.count)).font(.caption.monospaced()).foregroundStyle(Theme.muted)
                if let start = detail.start {
                    Button {
                        playing = PlayRequest(movie: start.episode, startAt: start.startAt, listId: detail.playlist.id)
                    } label: {
                        Label("Reproducir lista", systemImage: "play.fill").font(.headline).padding(.horizontal, 20).padding(.vertical, 12)
                    }
                    .buttonStyle(.borderedProminent).tint(Color(white: 0.95)).foregroundStyle(.black)
                    .accessibilityIdentifier("play-list")
                }
                if detail.items.isEmpty {
                    Text("Esta lista está vacía. Toca \"Agregar a lista\" en una película o serie.").foregroundStyle(Theme.muted)
                }
                ForEach(Array(detail.items.enumerated()), id: \.element.id) { index, item in
                    Button { open(item) } label: { row(index + 1, item) }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("item-\(item.id)")
                }
            }
            .padding(32)
            .frame(maxWidth: 900, alignment: .leading)
        }
    }

    private func row(_ number: Int, _ item: PlaylistItem) -> some View {
        HStack(spacing: 16) {
            Text("\(number)").font(.title3.monospaced()).foregroundStyle(Theme.muted).frame(width: 32)
            PosterImage(src: item.movie?.posterSrc ?? item.series?.posterSrc, title: item.title).frame(width: 72)
            VStack(alignment: .leading, spacing: 4) {
                Text(item.title).font(.headline).foregroundStyle(Theme.foreground)
                if item.series != nil {
                    Text("Serie").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                } else if let movie = item.movie {
                    Text([movie.episodeTag, formatDuration(movie.durationSeconds)].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                }
            }
            Spacer()
        }
        .padding(12)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 14))
        .contentShape(Rectangle())
    }

    private func open(_ item: PlaylistItem) {
        if let series = item.series { path.append(Route.series(series.id)) } else if let movie = item.movie { path.append(Route.movie(movie.id)) }
    }
}

/// "Agregar a lista" (PL-04): mis listas marcadas; tocar una agrega o quita; crear una nueva ahí mismo y queda agregado
struct AddToListButton: View {
    @Environment(AppModel.self) private var model
    let target: PlaylistTarget
    @State private var open = false
    @State private var lists: [PlaylistMembership]?
    @State private var name = ""
    @State private var failed = false

    var body: some View {
        Button { open = true } label: { Label("Agregar a lista", systemImage: "plus") .padding(.horizontal, 8).padding(.vertical, 6) }
            .buttonStyle(.bordered)
            .accessibilityIdentifier("add-to-list")
            .popover(isPresented: $open) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Agregar a lista").font(.headline)
                    if let lists {
                        if lists.isEmpty { Text("Todavía no tienes listas.").foregroundStyle(Theme.muted) }
                        ForEach(lists, id: \.playlist.id) { entry in
                            Button { Task { await toggle(entry.playlist.id) } } label: {
                                HStack {
                                    Image(systemName: entry.contains ? "checkmark.circle.fill" : "circle")
                                    Text(entry.playlist.name)
                                    Spacer()
                                }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("toggle-\(entry.playlist.name)")
                            .accessibilityAddTraits(entry.contains ? .isSelected : [])
                        }
                    } else {
                        ProgressView()
                    }
                    Divider()
                    HStack {
                        TextField("Nueva lista", text: $name).textFieldStyle(.roundedBorder).accessibilityIdentifier("new-list-name")
                        Button("Crear") { Task { await create() } }.disabled(!PlaylistName.isValid(name)).accessibilityIdentifier("create-list")
                    }
                    if failed { Text("No se pudo guardar. Revisa tu conexión.").font(.caption).foregroundStyle(Theme.accent) }
                }
                .padding(20)
                .frame(width: 340)
                .task { await load() }
            }
    }

    private func load() async {
        do { lists = try await model.playlists.membership(target); failed = false } catch { failed = true }
    }

    private func toggle(_ id: String) async {
        do { try await model.playlists.toggle(playlistId: id, target); await load() } catch { failed = true }
    }

    private func create() async {
        guard PlaylistName.isValid(name) else { return }
        do { _ = try await model.playlists.create(name: name, add: target); name = ""; await load() } catch { failed = true }
    }
}
