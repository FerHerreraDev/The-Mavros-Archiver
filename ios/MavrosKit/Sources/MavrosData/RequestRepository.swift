import Foundation
import Supabase

/// Qué pasó con un pedido (REQ-02, REQ-03)
public enum RequestResult: Sendable, Equatable {
    case sent, duplicate, tooMany

    /// Mismos textos que la web y Android
    public var message: String {
        switch self {
        case .sent: return "Listo, se lo pedimos al admin."
        case .duplicate: return "Ya lo pediste y sigue pendiente."
        case .tooMany: return "Tienes 20 pedidos pendientes: espera a que se resuelvan."
        }
    }
}

/// "Pedir «…»" con la sesión del usuario: RLS pone user_id y solo deja crear pendientes (REQ-01, REQ-03)
public final class RequestRepository: Sendable {
    let client: SupabaseClient
    let auth: AuthService
    public init(client: SupabaseClient, auth: AuthService) { self.client = client; self.auth = auth }

    private struct NewRequest: Encodable { let title: String }

    public func request(title: String) async throws(DataError) -> RequestResult {
        let clean = String(title.split(whereSeparator: \.isWhitespace).joined(separator: " ").prefix(200))
        guard !clean.isEmpty else { throw .server }
        do {
            try await client.from("movie_requests").insert(NewRequest(title: clean), returning: .minimal).execute()
            return .sent
        } catch let error as PostgrestError {
            if error.code == "23505" { return .duplicate }
            if error.message.contains("too_many_requests") { return .tooMany }
            let e = DataError.from(error)
            if e == .unauthorized { await auth.onUnauthorized() }
            throw e
        } catch {
            throw DataError.from(error)
        }
    }
}
