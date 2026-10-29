import SwiftUI
import Supabase
import MavrosModel
import MavrosData

@main
struct MavrosApp: App {
    @State private var model = AppModel()
    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .preferredColorScheme(.dark)
                .tint(Theme.accent)
        }
    }
}

/// Repositorios de la app y estado de la sesión (IPAD-03). La sesión vive en el Llavero.
@MainActor @Observable
final class AppModel {
    let config: MavrosConfig
    let auth: AuthService
    let catalog: CatalogRepository
    let playback: PlaybackRepository
    let progress: ProgressRepository
    let playlists: PlaylistRepository
    private(set) var session: SessionState = .loading

    init() {
        let info = Bundle.main.infoDictionary ?? [:]
        // Solo valores públicos (IPAD-01): URL de Supabase, clave anon y URL del sitio
        config = MavrosConfig(
            supabaseUrl: URL(string: info["MavrosSupabaseURL"] as? String ?? "")!,
            anonKey: info["MavrosAnonKey"] as? String ?? "",
            siteUrl: URL(string: info["MavrosSiteURL"] as? String ?? "")!
        )
        // Las pruebas de interfaz usan su propio llavero para empezar sin sesión y probar que la sesión sobrevive (IPAD-03)
        let service = UserDefaults.standard.string(forKey: "uiTestKeychainService") ?? "com.mavros.archiver.ipad.session"
        let storage: any AuthLocalStorage = KeychainLocalStorage(service: service)
        let client = makeSupabase(config, storage: storage)
        auth = AuthService(client: client)
        catalog = CatalogRepository(client: client, auth: auth)
        playback = PlaybackRepository(config: config, auth: auth)
        progress = ProgressRepository(client: client)
        playlists = PlaylistRepository(client: client, auth: auth)
        Task { await listen() }
    }

    private func listen() async {
        var validated = false
        for await state in auth.states {
            session = state
            // Al abrir: confirmar con el servidor que la sesión sigue valiendo (MOB-06)
            if case .signedIn = state, !validated {
                validated = true
                Task { await auth.validateSession() }
            }
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        Group {
            switch model.session {
            case .loading:
                ProgressView().controlSize(.large).frame(maxWidth: .infinity, maxHeight: .infinity).background(Theme.background)
            case .signedOut:
                LoginView()
            case .signedIn(_, let email):
                MainView(email: email)
            }
        }
        .animation(.default, value: model.session)
    }
}

/// Destinos de navegación del iPad
enum Route: Hashable {
    case movie(String)
    case series(String)
    case lists
    case list(String)
}

struct MainView: View {
    @Environment(AppModel.self) private var model
    let email: String?
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            CatalogView(path: $path)
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .movie(let id): DetailView(movieId: id, path: $path)
                    case .series(let id): SeriesView(seriesId: id)
                    case .lists: ListsView(path: $path)
                    case .list(let id): PlaylistView(playlistId: id, path: $path)
                    }
                }
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { path.append(Route.lists) } label: { Label("Mis listas", systemImage: "list.bullet.rectangle") }
                            .accessibilityIdentifier("my-lists")
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            if let email { Text(email) }
                            Button("Cerrar sesión", role: .destructive) { Task { await model.auth.signOut() } }
                        } label: { Image(systemName: "person.crop.circle").accessibilityLabel("Perfil") }
                        .accessibilityIdentifier("profile-menu")
                    }
                }
        }
    }
}
