import Foundation
import Supabase

/// URL firmada del master.m3u8 en el Worker y cuándo caduca su token (PLY-08)
public struct PlaybackSource: Equatable, Sendable {
    public let url: URL
    public let expiresAt: Date
}

/// Pide la URL a `/api/playback/<id>` con el token de Supabase (IPAD-06, PLY-06). El secreto del video nunca llega al iPad.
public final class PlaybackRepository: Sendable {
    let config: MavrosConfig
    let auth: AuthService
    let session: URLSession
    public init(config: MavrosConfig, auth: AuthService, session: URLSession = .shared) { self.config = config; self.auth = auth; self.session = session }

    struct Response: Decodable { let url: URL; let expires_at: String }

    /// nil = no existe o este usuario no la puede ver (PLY-07)
    public func source(movieId: String) async throws(DataError) -> PlaybackSource? {
        do {
            var (status, data) = try await request(movieId)
            // 401 con una sesión que sigue valiendo (token recién renovado): un reintento
            if status == 401, await auth.validateSession() { (status, data) = try await request(movieId) }
            switch status {
            case 200:
                let body = try JSONDecoder().decode(Response.self, from: data)
                return PlaybackSource(url: body.url, expiresAt: SeriesDate.parse(body.expires_at))
            case 404: return nil
            case 401:
                await auth.onUnauthorized()
                throw DataError.unauthorized
            default: throw DataError.server
            }
        } catch {
            throw DataError.from(error)
        }
    }

    private func request(_ movieId: String) async throws -> (Int, Data) {
        guard let token = await auth.accessToken() else { return (401, Data()) }
        var req = URLRequest(url: config.siteUrl.appendingPathComponent("api/playback/\(movieId)"))
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.cachePolicy = .reloadIgnoringLocalCacheData
        let (data, response) = try await session.data(for: req)
        return ((response as? HTTPURLResponse)?.statusCode ?? 0, data)
    }
}

enum SeriesDate {
    static func parse(_ s: String) -> Date {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: s) ?? ISO8601DateFormatter().date(from: s) ?? Date()
    }
}

/// Progreso escrito por el propio cliente bajo RLS (PRG-01, PRG-03); user_id lo pone la base
public final class ProgressRepository: Sendable {
    let client: SupabaseClient
    public init(client: SupabaseClient) { self.client = client }

    struct Row: Encodable { let movie_id: String; let position_seconds: Double }

    public func save(movieId: String, position: Double) async throws(DataError) {
        do {
            // numeric(10,3): milisegundos, como la web
            let rounded = (max(position, 0) * 1000).rounded() / 1000
            try await client.from("watch_progress").upsert(Row(movie_id: movieId, position_seconds: rounded), onConflict: "user_id,movie_id", returning: .minimal).execute()
            NotificationCenter.default.post(name: .mavrosProgressSaved, object: movieId)
        } catch {
            throw DataError.from(error)
        }
    }
}

public extension Notification.Name {
    /// Se guardó progreso: quien lo muestre (detalle, "Seguir viendo") se recarga (MOB-19)
    static let mavrosProgressSaved = Notification.Name("mavrosProgressSaved")
}
