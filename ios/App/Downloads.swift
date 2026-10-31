import SwiftUI
import AVFoundation
import MavrosModel
import MavrosData

/// Lo que se guarda de cada descarga para mostrarla sin internet (IPAD-13, DL-03)
struct OfflineMovie: Codable, Hashable, Identifiable {
    let id: String
    let title: String
    let durationSeconds: Int
    var posterSrc: String?
    /// Para un episodio: "Arcane · T1:E2"
    var subtitle: String?

    init(movie: Movie, series: Series? = nil) {
        id = movie.id
        title = movie.title
        durationSeconds = movie.durationSeconds
        posterSrc = movie.posterSrc ?? series?.posterSrc
        subtitle = movie.episodeTag.map { tag in [series?.title, tag].compactMap { $0 }.joined(separator: " · ") }
    }
}

struct OfflineEntry: Codable, Hashable, Identifiable {
    enum State: String, Codable { case preparing, downloading, completed, failed }
    var movie: OfflineMovie
    var state: State
    var progress: Double = 0
    /// Ruta del .movpkg relativa a la carpeta de la app (la absoluta cambia entre instalaciones)
    var relativePath: String?
    var id: String { movie.id }
}

/// Último progreso visto en el iPad y si falta mandarlo al servidor (DL-04, DL-05)
@MainActor
final class LocalProgress {
    private struct Entry: Codable { var position: Double; var at: Int64; var pending: Bool }
    private let key = "mavros.offlineProgress"
    private var entries: [String: Entry]

    init() {
        entries = (UserDefaults.standard.data(forKey: key)).flatMap { try? JSONDecoder().decode([String: Entry].self, from: $0) } ?? [:]
    }

    private func persist() { UserDefaults.standard.set(try? JSONEncoder().encode(entries), forKey: key) }

    func position(_ id: String) -> Double? { entries[id]?.position }

    func put(_ id: String, position: Double, at: Int64) {
        entries[id] = Entry(position: position, at: at, pending: true)
        persist()
    }

    func markSent(_ id: String, at: Int64) {
        guard var e = entries[id], e.at <= at else { return }
        e.pending = false
        entries[id] = e
        persist()
    }

    var pending: [String: (position: Double, at: Int64)] {
        entries.filter(\.value.pending).mapValues { ($0.position, $0.at) }
    }

    func clear() {
        entries = [:]
        persist()
    }
}

/// Descargas para ver sin internet (IPAD-13): una calidad (≤ 720p, DL-01), todos los audios y subtítulos.
/// Usa una sesión de fondo: siguen aunque se cierre la app.
@MainActor @Observable
final class DownloadsModel: NSObject {
    private(set) var entries: [String: OfflineEntry] = [:]
    private(set) var lastError: String?
    let progress = LocalProgress()

    @ObservationIgnored private let storeKey = "mavros.downloads"
    @ObservationIgnored private var session: AVAssetDownloadURLSession!
    @ObservationIgnored private var tasks: [String: AVAssetDownloadTask] = [:]
    @ObservationIgnored private var observations: [String: NSKeyValueObservation] = [:]
    @ObservationIgnored private weak var app: AppModel?

    override init() {
        super.init()
        entries = (UserDefaults.standard.data(forKey: storeKey)).flatMap { try? JSONDecoder().decode([String: OfflineEntry].self, from: $0) } ?? [:]
        let config = URLSessionConfiguration.background(withIdentifier: "com.mavros.archiver.ipad.downloads")
        config.sessionSendsLaunchEvents = true
        session = AVAssetDownloadURLSession(configuration: config, assetDownloadDelegate: self, delegateQueue: .main)
        // Las que seguían bajando cuando se cerró la app
        session.getAllTasks { [weak self] tasks in
            Task { @MainActor in
                for case let task as AVAssetDownloadTask in tasks {
                    guard let id = task.taskDescription else { continue }
                    self?.track(task, id: id)
                }
                self?.markInterrupted()
            }
        }
    }

    func attach(_ app: AppModel) { self.app = app }

    private func save() { UserDefaults.standard.set(try? JSONEncoder().encode(entries), forKey: storeKey) }

    /// Lo que estaba "bajando" sin tarea viva no va a terminar: queda para reintentar
    private func markInterrupted() {
        for (id, e) in entries where (e.state == .downloading || e.state == .preparing) && tasks[id] == nil {
            entries[id]?.state = .failed
        }
        save()
    }

    var list: [OfflineEntry] { entries.values.sorted { $0.movie.title.localizedCaseInsensitiveCompare($1.movie.title) == .orderedAscending } }

    func localURL(_ id: String) -> URL? {
        guard let e = entries[id], e.state == .completed, let path = e.relativePath else { return nil }
        let url = URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(path)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    // MARK: - Descargar

    func start(_ movie: OfflineMovie) async {
        guard let app else { return }
        if let e = entries[movie.id], e.state != .failed { return }
        lastError = nil
        entries[movie.id] = OfflineEntry(movie: movie, state: .preparing)
        save()
        do {
            guard let source = try await app.playback.source(movieId: movie.id) else {
                fail(movie.id, "Esta película ya no se puede descargar.")
                return
            }
            let asset = AVURLAsset(url: source.url)
            let config = AVAssetDownloadConfiguration(asset: asset, title: movie.title)
            // DL-01: la calidad más cercana a 720p sin pasarse (la misma regla que Android)
            if let master = try? await URLSession.shared.data(from: source.url).0, let text = String(data: master, encoding: .utf8),
               let variant = DownloadRules.pick(master: text) {
                config.primaryContentConfiguration.variantQualifiers = [
                    AVAssetVariantQualifier(predicate: NSPredicate(format: "peakBitRate <= %d", variant.bandwidth)),
                ]
            }
            config.primaryContentConfiguration.mediaSelections = try await allSelections(asset)
            let task = session.makeAssetDownloadTask(downloadConfiguration: config)
            task.taskDescription = movie.id
            track(task, id: movie.id)
            entries[movie.id]?.state = .downloading
            save()
            task.resume()
        } catch {
            fail(movie.id, DataError.from(error) == .network ? "Sin conexión: no se pudo empezar la descarga." : "No se pudo empezar la descarga.")
        }
    }

    /// Una selección por cada idioma de audio y cada subtítulo: así se bajan todos
    private func allSelections(_ asset: AVURLAsset) async throws -> [AVMediaSelection] {
        let preferred = try await asset.load(.preferredMediaSelection)
        var out: [AVMediaSelection] = [preferred]
        for characteristic in [AVMediaCharacteristic.audible, .legible] {
            guard let group = try await asset.loadMediaSelectionGroup(for: characteristic) else { continue }
            for option in group.options {
                guard let copy = preferred.mutableCopy() as? AVMutableMediaSelection else { continue }
                copy.select(option, in: group)
                out.append(copy)
            }
        }
        return out
    }

    private func track(_ task: AVAssetDownloadTask, id: String) {
        tasks[id] = task
        observations[id] = task.progress.observe(\.fractionCompleted, options: [.new]) { [weak self] p, _ in
            let fraction = p.fractionCompleted
            Task { @MainActor in self?.entries[id]?.progress = fraction }
        }
    }

    private func fail(_ id: String, _ message: String) {
        entries[id]?.state = .failed
        lastError = message
        save()
    }

    func remove(_ id: String) {
        tasks[id]?.cancel()
        tasks[id] = nil
        observations[id] = nil
        if let path = entries[id]?.relativePath {
            try? FileManager.default.removeItem(at: URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(path))
        }
        entries[id] = nil
        save()
    }

    /// DL-06: al cerrar sesión no queda nada
    func removeAll() {
        for id in Array(entries.keys) { remove(id) }
        progress.clear()
    }

    /// DL-06: lo despublicado se borra; sin red no se toca nada
    func prune() async {
        guard let app else { return }
        for id in Array(entries.keys) {
            // nil = ya no existe para este usuario; un error (sin red) no borra nada
            do { if try await app.catalog.movie(id: id) == nil { remove(id) } } catch {}
        }
    }

    // MARK: - Progreso sin internet (DL-05)

    func save(progress position: Double, movieId: String) async {
        guard let app else { return }
        let at = Int64(Date().timeIntervalSince1970 * 1000)
        progress.put(movieId, position: position, at: at)
        do {
            try await app.progress.save(movieId: movieId, position: position)
            progress.markSent(movieId, at: at)
        } catch {
            if error != .network { progress.markSent(movieId, at: at) }
        }
    }

    /// Con conexión: manda lo visto sin internet que sea más nuevo que lo del servidor
    func flush() async {
        guard let app else { return }
        let pending = progress.pending
        guard !pending.isEmpty, let server = await app.progress.updatedAt(movieIds: Array(pending.keys)) else { return }
        for (id, entry) in pending {
            if DownloadRules.shouldUpload(localUpdatedAtMs: entry.at, serverUpdatedAtMs: server[id]) {
                if (try? await app.progress.save(movieId: id, position: entry.position)) != nil { progress.markSent(id, at: entry.at) }
            } else {
                progress.markSent(id, at: entry.at)
            }
        }
    }
}

extension DownloadsModel: AVAssetDownloadDelegate {
    nonisolated func urlSession(_ session: URLSession, assetDownloadTask: AVAssetDownloadTask, willDownloadTo location: URL) {
        let id = assetDownloadTask.taskDescription
        let path = location.relativePath
        Task { @MainActor in
            guard let id else { return }
            self.entries[id]?.relativePath = path
            self.save()
        }
    }

    nonisolated func urlSession(_ session: URLSession, assetDownloadTask: AVAssetDownloadTask, didFinishDownloadingTo location: URL) {
        let id = assetDownloadTask.taskDescription
        let path = location.relativePath
        Task { @MainActor in
            guard let id else { return }
            self.entries[id]?.relativePath = path
            self.save()
        }
    }

    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        let id = task.taskDescription
        let cancelled = (error as? URLError)?.code == .cancelled
        Task { @MainActor in
            guard let id, self.entries[id] != nil else { return }
            self.tasks[id] = nil
            self.observations[id] = nil
            if error == nil {
                self.entries[id]?.state = .completed
                self.entries[id]?.progress = 1
            } else if !cancelled {
                self.entries[id]?.state = .failed
            }
            self.save()
        }
    }
}

// MARK: - Pantallas

/// "Descargar" en el detalle y en cada episodio (IPAD-13, DL-01)
struct DownloadButton: View {
    @Environment(AppModel.self) private var model
    let movie: OfflineMovie
    var compact = false

    var body: some View {
        let entry = model.downloads.entries[movie.id]
        Group {
            switch entry?.state {
            case nil, .failed:
                Button {
                    Task { await model.downloads.start(movie) }
                } label: {
                    if compact { Image(systemName: entry == nil ? "arrow.down.circle" : "exclamationmark.arrow.circlepath") }
                    else { Label(entry == nil ? "Descargar" : "Reintentar descarga", systemImage: entry == nil ? "arrow.down.circle" : "exclamationmark.arrow.circlepath") }
                }
                .accessibilityLabel(entry == nil ? "Descargar \(movie.title)" : "Reintentar descarga de \(movie.title)")
                .accessibilityIdentifier("download")
            case .preparing, .downloading:
                Button(role: .destructive) { model.downloads.remove(movie.id) } label: {
                    HStack(spacing: 8) {
                        ProgressView(value: entry?.progress ?? 0).progressViewStyle(.circular).controlSize(.small)
                        if !compact { Text(entry?.state == .preparing ? "Preparando…" : "Descargando… \(Int((entry?.progress ?? 0) * 100)) %") }
                    }
                }
                .accessibilityLabel("Cancelar descarga de \(movie.title)")
                .accessibilityIdentifier("download-progress")
            case .completed:
                Button { model.downloads.remove(movie.id) } label: {
                    if compact { Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.accent) }
                    else { Label("Descargada · Borrar", systemImage: "checkmark.circle.fill") }
                }
                .accessibilityLabel("Borrar descarga de \(movie.title)")
                .accessibilityIdentifier("download-done")
            }
        }
        .buttonStyle(.bordered)
    }
}

/// DL-03: lo descargado, para ver sin internet
struct DownloadsView: View {
    @Environment(AppModel.self) private var model
    @State private var playing: PlayRequest?

    var body: some View {
        let list = model.downloads.list
        Group {
            if list.isEmpty {
                ContentUnavailableView("No tienes descargas", systemImage: "arrow.down.circle", description: Text("Usa Descargar en una película o episodio para verla sin internet."))
                    .accessibilityIdentifier("downloads-empty")
            } else {
                List(list) { entry in
                    HStack(spacing: 14) {
                        PosterImage(src: entry.movie.posterSrc, title: entry.movie.title).frame(width: 56)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(entry.movie.title).font(.headline)
                            if let subtitle = entry.movie.subtitle { Text(subtitle).font(.subheadline).foregroundStyle(Theme.muted) }
                            Text(status(entry)).font(.caption.monospaced()).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        Button(role: .destructive) { model.downloads.remove(entry.id) } label: { Image(systemName: "trash") }
                            .accessibilityLabel("Borrar \(entry.movie.title)")
                    }
                    .contentShape(Rectangle())
                    .onTapGesture {
                        guard entry.state == .completed else { return }
                        let m = entry.movie
                        let start = ProgressRules.resumePosition(model.downloads.progress.position(m.id), duration: m.durationSeconds)
                        playing = PlayRequest(movie: Movie(id: m.id, title: m.title, durationSeconds: m.durationSeconds), startAt: start)
                    }
                    .accessibilityIdentifier("download-\(entry.id)")
                }
                .scrollContentBackground(.hidden)
            }
        }
        .background(Theme.background)
        .navigationTitle("Descargas")
        .fullScreenCover(item: $playing) { PlayerView(request: $0) }
    }

    private func status(_ entry: OfflineEntry) -> String {
        switch entry.state {
        case .completed: return formatDuration(entry.movie.durationSeconds)
        case .failed: return "No se pudo descargar"
        case .preparing: return "Preparando…"
        case .downloading: return "Descargando… \(Int(entry.progress * 100)) %"
        }
    }
}
