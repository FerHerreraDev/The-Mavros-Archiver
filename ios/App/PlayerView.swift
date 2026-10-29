import SwiftUI
import AVKit
import MediaPlayer
import MavrosModel
import MavrosData

/// Lo que se ofrece al terminar: el siguiente episodio (SER-16) o lo siguiente de la lista (PL-07)
struct UpNext: Equatable {
    let movie: Movie
    let startAt: Double
    let inList: Bool
    var heading: String { inList ? "Siguiente en la lista" : "Siguiente episodio" }
}

/// Reproductor (IPAD-06..IPAD-09): token al día, progreso, PiP/AirPlay y siguiente episodio sin salir
@MainActor @Observable
final class PlayerModel {
    enum Phase: Equatable { case loading, playing, unavailable, failed(String) }

    let player = AVPlayer()
    private(set) var phase: Phase = .loading
    private(set) var current: PlayRequest
    private(set) var upNext: UpNext?
    private(set) var ended = false
    var nextCancelled = false

    private let model: AppModel
    private var tracker: ProgressTracker
    private var expiresAt = Date.distantFuture
    private var timeObserver: Any?
    private var refreshTask: Task<Void, Never>?
    private var observers: [NSObjectProtocol] = []
    private var statusObservation: NSKeyValueObservation?
    private var rateObservation: NSKeyValueObservation?

    init(model: AppModel, request: PlayRequest) {
        self.model = model
        current = request
        tracker = ProgressTracker(durationSeconds: request.movie.durationSeconds)
        // Audio de película: suena con el iPad en silencio, sigue en PiP y en AirPlay (IPAD-08)
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        player.allowsExternalPlayback = true
        rateObservation = player.observe(\.timeControlStatus, options: [.new]) { [weak self] p, _ in
            let playing = p.timeControlStatus == .playing
            Task { @MainActor in self?.onPlayingChanged(playing) }
        }
        timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 1, preferredTimescale: 600), queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
    }

    var position: Double {
        let t = player.currentTime().seconds
        return t.isFinite ? t : 0
    }

    private var now: Int64 { Int64(Date().timeIntervalSince1970 * 1000) }

    // MARK: - Arrancar una película/episodio

    func start() async {
        phase = .loading
        ended = false
        nextCancelled = false
        upNext = nil
        do {
            guard let source = try await model.playback.source(movieId: current.movie.id) else { phase = .unavailable; return }
            load(source, at: current.startAt)
            phase = .playing
            player.play()
            Task { await findNext() }
        } catch {
            phase = .failed(error == .network ? "Sin conexión. Revisa tu internet." : "No se pudo reproducir el video.")
        }
    }

    private func load(_ source: PlaybackSource, at seconds: Double) {
        let item = AVPlayerItem(url: source.url)
        item.externalMetadata = metadata()
        expiresAt = source.expiresAt
        observe(item)
        player.replaceCurrentItem(with: item)
        if seconds > 0 { player.seek(to: CMTime(seconds: seconds, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) }
        scheduleRefresh()
    }

    /// Título en la pantalla de bloqueo, el Centro de control y AirPlay (IPAD-08)
    private func metadata() -> [AVMetadataItem] {
        func item(_ id: AVMetadataIdentifier, _ value: String) -> AVMetadataItem {
            let m = AVMutableMetadataItem()
            m.identifier = id
            m.value = value as NSString
            m.extendedLanguageTag = "und"
            return m
        }
        let title = current.movie.episodeTag.map { "\($0) · \(current.movie.title)" } ?? current.movie.title
        return [item(.commonIdentifierTitle, title), item(.iTunesMetadataTrackSubTitle, "The Mavros Archiver")]
    }

    private func observe(_ item: AVPlayerItem) {
        observers.forEach(NotificationCenter.default.removeObserver)
        observers = [
            NotificationCenter.default.addObserver(forName: AVPlayerItem.didPlayToEndTimeNotification, object: item, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.didEnd() }
            },
        ]
        // Un 403 del Worker (token caducado) hace fallar el item: URL nueva y seguir en el mismo punto (IPAD-07)
        statusObservation = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            guard item.status == .failed else { return }
            Task { @MainActor in await self?.recover() }
        }
    }

    // MARK: - Token (IPAD-07, MOB-16)

    private func scheduleRefresh() {
        refreshTask?.cancel()
        let delay = PlaybackRules.refreshDelayMs(expiresAtMs: Int64(expiresAt.timeIntervalSince1970 * 1000), nowMs: now)
        refreshTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(delay))
            guard !Task.isCancelled else { return }
            await self?.recover()
        }
    }

    /// URL nueva con token vigente; el video sigue desde donde iba
    private var recovering = false
    func recover() async {
        guard !recovering else { return }
        recovering = true
        defer { recovering = false }
        let at = position
        let wasPlaying = player.timeControlStatus != .paused
        guard let source = try? await model.playback.source(movieId: current.movie.id) else { return }
        load(source, at: at)
        if wasPlaying { player.play() }
    }

    // MARK: - Progreso (IPAD-07, MOB-15)

    private func onPlayingChanged(_ playing: Bool) {
        if playing { tracker.onPlaying(nowMs: now) } else { save(tracker.onPause(position: position, nowMs: now)) }
    }

    private func tick() {
        save(tracker.onTick(position: position, isPlaying: player.timeControlStatus == .playing, nowMs: now))
    }

    /// Salir (cerrar, siguiente episodio): guarda la posición si ya había arrancado
    func saveExit() { save(tracker.onExit(position: position, nowMs: now)) }

    private func save(_ position: Double?) {
        guard let position else { return }
        let id = current.movie.id
        let repo = model.progress
        // Termina aunque se cierre la pantalla
        Task.detached { try? await repo.save(movieId: id, position: position) }
    }

    // MARK: - Siguiente (IPAD-09)

    private func findNext() async {
        let id = current.movie.id
        if let listId = current.listId {
            if let pick = try? await model.playlists.next(playlistId: listId, after: id) { upNext = UpNext(movie: pick.episode, startAt: pick.startAt, inList: true) }
        } else if let movie = try? await model.catalog.nextEpisode(after: id) {
            upNext = UpNext(movie: movie, startAt: 0, inList: false)
        }
    }

    private func didEnd() {
        save(tracker.onExit(position: Double(current.movie.durationSeconds), nowMs: now))
        ended = true
    }

    /// Siguiente sin salir del reproductor: su propia URL, token y progreso (SER-16)
    func playNext() async {
        guard let next = upNext else { return }
        saveExit()
        current = PlayRequest(movie: next.movie, startAt: next.startAt, listId: current.listId)
        tracker = ProgressTracker(durationSeconds: next.movie.durationSeconds)
        await start()
    }

    func close() {
        saveExit()
        player.pause()
        refreshTask?.cancel()
        observers.forEach(NotificationCenter.default.removeObserver)
        if let timeObserver { player.removeTimeObserver(timeObserver) }
        timeObserver = nil
    }
}

struct PlayerView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let request: PlayRequest
    @State private var model: PlayerModel?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let model {
                switch model.phase {
                case .loading:
                    ProgressView().controlSize(.large).tint(.white).accessibilityIdentifier("player-loading")
                case .unavailable:
                    message("Esta película no está disponible.")
                case .failed(let text):
                    message(text, retry: { Task { await model.start() } })
                case .playing:
                    NativePlayer(player: model.player).ignoresSafeArea().accessibilityIdentifier("player")
                    if model.ended, !model.nextCancelled, let next = model.upNext {
                        NextCard(next: next, play: { Task { await model.playNext() } }, cancel: { model.nextCancelled = true })
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                            .padding(32)
                    }
                }
            }
        }
        .overlay(alignment: .topLeading) {
            Button { close() } label: { Image(systemName: "xmark").font(.title2.bold()).padding(14).background(.ultraThinMaterial, in: Circle()) }
                .padding(.leading, 24).padding(.top, 12)
                .accessibilityLabel("Cerrar").accessibilityIdentifier("close-player")
        }
        .task {
            let m = PlayerModel(model: app, request: request)
            model = m
            await m.start()
        }
        .statusBarHidden()
    }

    private func close() {
        model?.close()
        dismiss()
    }

    private func message(_ text: String, retry: (() -> Void)? = nil) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "video.slash").font(.largeTitle).foregroundStyle(Theme.muted)
            Text(text).foregroundStyle(Theme.foreground).accessibilityIdentifier("player-message")
            HStack {
                Button("Volver") { close() }.buttonStyle(.bordered)
                if let retry { Button("Reintentar", action: retry).buttonStyle(.borderedProminent) }
            }
        }
    }
}

/// "Siguiente episodio en 10 s" (o "Siguiente en la lista") con Ver ahora / Cancelar (IPAD-09)
struct NextCard: View {
    let next: UpNext
    let play: () -> Void
    let cancel: () -> Void
    @State private var left = 10

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("\(next.heading) en \(left) s").font(.caption.monospaced()).foregroundStyle(Theme.muted).accessibilityIdentifier("next-countdown")
            Text(next.movie.episodeTag.map { "\($0) · \(next.movie.title)" } ?? next.movie.title).font(.headline).lineLimit(2)
            HStack {
                Button("Ver ahora", action: play).buttonStyle(.borderedProminent).tint(Color(white: 0.95)).foregroundStyle(.black)
                    .accessibilityIdentifier("next-now")
                Button("Cancelar", action: cancel).buttonStyle(.bordered).accessibilityIdentifier("next-cancel")
            }
        }
        .padding(20)
        .frame(width: 340, alignment: .leading)
        .background(.black.opacity(0.85), in: RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("next-episode")
        .task(id: next.movie.id) {
            left = 10
            while left > 0 {
                try? await Task.sleep(for: .seconds(1))
                if Task.isCancelled { return }
                left -= 1
            }
            play()
        }
    }
}

/// Reproductor nativo del iPad: controles, calidad automática, PiP y AirPlay (IPAD-06, IPAD-08)
struct NativePlayer: UIViewControllerRepresentable {
    let player: AVPlayer
    func makeUIViewController(context: Context) -> AVPlayerViewController {
        let vc = AVPlayerViewController()
        vc.player = player
        vc.allowsPictureInPicturePlayback = true
        vc.canStartPictureInPictureAutomaticallyFromInline = true
        vc.updatesNowPlayingInfoCenter = true
        return vc
    }
    func updateUIViewController(_ vc: AVPlayerViewController, context: Context) {
        if vc.player !== player { vc.player = player }
    }
}
