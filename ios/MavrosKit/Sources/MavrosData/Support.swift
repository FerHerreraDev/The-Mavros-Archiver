import Foundation
import Supabase

/// Error de datos que la UI sabe mostrar (MOB-09)
public enum DataError: Error, Equatable, Sendable {
    case network, unauthorized, server

    /// Clasifica cualquier error de red, de Supabase o del servidor
    public static func from(_ error: Error) -> DataError {
        if let e = error as? DataError { return e }
        if error is URLError { return .network }
        if let e = error as? HTTPError { return [401, 403].contains(e.response.statusCode) ? .unauthorized : .server }
        if let e = error as? AuthError, case .sessionMissing = e { return .unauthorized }
        if let e = error as? PostgrestError, ["PGRST301", "PGRST303"].contains(e.code ?? "") { return .unauthorized }
        let ns = error as NSError
        if ns.domain == NSURLErrorDomain { return .network }
        return .server
    }
}

/// Sesión guardada en memoria (pruebas en la Mac, sin Llavero)
public final class MemoryAuthStorage: AuthLocalStorage, @unchecked Sendable {
    private var values: [String: Data] = [:]
    private let lock = NSLock()
    public init() {}
    public func store(key: String, value: Data) throws { lock.withLock { values[key] = value } }
    public func retrieve(key: String) throws -> Data? { lock.withLock { values[key] }
    }
    public func remove(key: String) throws { lock.withLock { _ = values.removeValue(forKey: key) } }
}

/// Cliente de Supabase con la clave pública: todo pasa por RLS como el usuario (IPAD-01).
/// En el iPad la sesión se guarda en el Llavero (IPAD-03).
public func makeSupabase(_ config: MavrosConfig, storage: any AuthLocalStorage) -> SupabaseClient {
    SupabaseClient(
        supabaseURL: config.supabaseUrl,
        supabaseKey: config.anonKey,
        options: SupabaseClientOptions(
            auth: .init(storage: storage, autoRefreshToken: true, emitLocalSessionAsInitialSession: true)
        )
    )
}
