import SwiftUI
import AVKit
import MavrosModel
import MavrosData

/// Reproductor (IPAD-06). Fase I2 completa token, progreso, PiP y siguiente episodio.
struct PlayerView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let request: PlayRequest
    @State private var player: AVPlayer?
    @State private var message: String?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let player {
                VideoPlayer(player: player).ignoresSafeArea().accessibilityIdentifier("player")
            } else if let message {
                VStack(spacing: 16) {
                    Text(message)
                    Button("Volver") { dismiss() }
                }
            } else {
                ProgressView().controlSize(.large)
            }
        }
        .overlay(alignment: .topLeading) {
            Button { dismiss() } label: { Image(systemName: "xmark").font(.title2).padding(12).background(.ultraThinMaterial, in: Circle()) }
                .padding(20).accessibilityLabel("Cerrar").accessibilityIdentifier("close-player")
        }
        .task {
            do {
                guard let source = try await model.playback.source(movieId: request.movie.id) else { message = "Esta película no está disponible."; return }
                let p = AVPlayer(url: source.url)
                await p.seek(to: CMTime(seconds: request.startAt, preferredTimescale: 600))
                player = p
                p.play()
            } catch {
                message = (error as? DataError) == .network ? "Sin conexión. Revisa tu internet." : "No se pudo reproducir el video."
            }
        }
        .onDisappear { player?.pause() }
    }
}
