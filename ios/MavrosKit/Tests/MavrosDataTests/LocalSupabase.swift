import Foundation
import MavrosModel
import Supabase
@testable import MavrosData

/// Supabase LOCAL para las pruebas (ios/scripts/test-kit.sh lo pasa en MAVROS_SUPABASE_STATUS).
/// Aborta si la URL no es local: estas pruebas nunca tocan producción.
enum LocalSupabase {
    static let status: [String: String]? = {
        guard let raw = ProcessInfo.processInfo.environment["MAVROS_SUPABASE_STATUS"], let start = raw.firstIndex(of: "{"),
              let json = try? JSONSerialization.jsonObject(with: Data(raw[start...].utf8)) as? [String: Any] else { return nil }
        return json.compactMapValues { $0 as? String }
    }()
    static var available: Bool { status?["API_URL"] != nil }

    static var url: URL {
        let u = URL(string: status!["API_URL"]!)!
        precondition(["127.0.0.1", "localhost"].contains(u.host ?? ""), "Las pruebas solo corren contra Supabase local: \(u)")
        return u
    }
    static var anonKey: String { status!["ANON_KEY"]! }
    private static var serviceKey: String { status!["SERVICE_ROLE_KEY"]! }
    static var config: MavrosConfig { MavrosConfig(supabaseUrl: url, anonKey: anonKey, siteUrl: URL(string: "http://localhost:3100")!) }

    /// Cliente service role, solo para preparar y limpiar datos
    static let admin = SupabaseClient(supabaseURL: url, supabaseKey: serviceKey, options: .init(auth: .init(storage: MemoryAuthStorage(), autoRefreshToken: false)))

    struct TestUser { let id: String; let email: String; let password: String }

    private static func adminRequest(_ method: String, _ path: String, _ body: [String: Any]? = nil) async throws -> [String: Any] {
        var req = URLRequest(url: url.appendingPathComponent(path))
        req.httpMethod = method
        req.setValue(serviceKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(serviceKey)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body { req.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, _) = try await URLSession.shared.data(for: req)
        return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }

    static func createUser(_ prefix: String = "ipad", role: String = "user") async throws -> TestUser {
        let email = "\(prefix)-\(Int(Date().timeIntervalSince1970 * 1000))-\(UUID().uuidString.prefix(6).lowercased())@example.com"
        let password = "pw-\(UUID().uuidString)"
        let user = try await adminRequest("POST", "auth/v1/admin/users", ["email": email, "password": password, "email_confirm": true, "user_metadata": ["password_set": true]])
        let id = user["id"] as! String
        if role == "admin" { try await admin.from("profiles").update(["role": "admin"]).eq("id", value: id).execute() }
        return TestUser(id: id, email: email, password: password)
    }

    static func ban(_ id: String) async throws { _ = try await adminRequest("PUT", "auth/v1/admin/users/\(id)", ["ban_duration": "24h"]) }
    static func deleteUser(_ id: String) async { _ = try? await adminRequest("DELETE", "auth/v1/admin/users/\(id)") }
    static func revokeSessions(_ id: String) async throws { try await admin.rpc("revoke_user_sessions", params: ["target_user_id": id]).execute() }

    struct Row: Decodable { let id: String }

    static func insertMovie(_ fields: [String: AnyJSON] = [:]) async throws -> String {
        let slug = "ipad-\(UUID().uuidString.prefix(8).lowercased())"
        var body: [String: AnyJSON] = ["slug": .string(slug), "title": .string("iPad \(slug)"), "duration_seconds": .integer(1000),
                                       "hls_path": .string("movies/\(slug)/master.m3u8"), "status": .string("published")]
        body.merge(fields) { _, new in new }
        let row: Row = try await admin.from("movies").insert(body).select("id").single().execute().value
        return row.id
    }

    static func insertSeries(_ fields: [String: AnyJSON] = [:]) async throws -> String {
        let slug = "ipad-serie-\(UUID().uuidString.prefix(8).lowercased())"
        var body: [String: AnyJSON] = ["slug": .string(slug), "title": .string("Serie \(slug)"), "status": .string("published")]
        body.merge(fields) { _, new in new }
        let row: Row = try await admin.from("series").insert(body).select("id").single().execute().value
        return row.id
    }

    static func setProgress(_ userId: String, _ movieId: String, _ seconds: Double) async throws {
        try await admin.from("watch_progress").upsert(["user_id": AnyJSON.string(userId), "movie_id": .string(movieId), "position_seconds": .double(seconds)]).execute()
    }

    static func deleteMovies(_ ids: [String]) async { _ = try? await admin.from("movies").delete().in("id", values: ids).execute() }
    static func deleteSeries(_ ids: [String]) async { _ = try? await admin.from("series").delete().in("id", values: ids).execute() }

    /// La app con su propia sesión (memoria en vez del Llavero), firmada como `user`
    static func app(_ user: TestUser?, storage: MemoryAuthStorage = MemoryAuthStorage()) async throws -> (AuthService, CatalogRepository, PlaylistRepository, ProgressRepository) {
        let client = makeSupabase(config, storage: storage)
        let auth = AuthService(client: client)
        if let user { #expect(await auth.signIn(email: user.email, password: user.password) == nil) }
        return (auth, CatalogRepository(client: client, auth: auth), PlaylistRepository(client: client, auth: auth), ProgressRepository(client: client))
    }
}

import Testing
