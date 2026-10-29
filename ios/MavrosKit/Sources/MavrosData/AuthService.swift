import Foundation
import MavrosModel
import Supabase

public enum LoginError: Error, Equatable, Sendable { case invalidCredentials, network }

public enum SessionState: Equatable, Sendable {
    case loading
    case signedOut
    case signedIn(userId: String, email: String?)
}

/// Sesión del usuario (IPAD-03). Mismas reglas que SupabaseAuthRepository de Android.
public final class AuthService: Sendable {
    let client: SupabaseClient
    public init(client: SupabaseClient) { self.client = client }

    /// Estados de sesión en el orden en que ocurren (el primero es la sesión guardada)
    public var states: AsyncStream<SessionState> {
        AsyncStream { continuation in
            let task = Task {
                for await (event, session) in client.auth.authStateChanges {
                    switch event {
                    case .signedOut: continuation.yield(.signedOut)
                    default:
                        // Sesión guardada aunque el token de acceso haya caducado: se renueva sola (MOB-04)
                        if let user = session?.user { continuation.yield(.signedIn(userId: user.id.uuidString.lowercased(), email: user.email)) }
                        else if event == .initialSession { continuation.yield(.signedOut) }
                    }
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    /// MOB-03: credenciales malas, desactivado o invitado sin contraseña dan el MISMO error; solo la red se distingue
    public func signIn(email: String, password: String) async -> LoginError? {
        do {
            _ = try await client.auth.signIn(email: LoginValidation.normalizeEmail(email), password: password)
            return nil
        } catch {
            return DataError.from(error) == .network ? .network : .invalidCredentials
        }
    }

    /// Aunque el servidor no responda, la sesión local se borra (MOB-05)
    public func signOut() async {
        try? await client.auth.signOut(scope: .local)
    }

    /// ¿La sesión sigue valiendo en el servidor? Si no, la borra (MOB-06). Sin red se conserva.
    @discardableResult
    public func validateSession() async -> Bool {
        guard client.auth.currentSession != nil else { return false }
        do {
            _ = try await client.auth.user()
            return true
        } catch {
            if DataError.from(error) == .network { return true }
            // El token de acceso dura 1 h: rechazado no es sesión inválida. Se renueva y solo si ESO falla se cierra (MOB-04)
            do {
                _ = try await client.auth.refreshSession()
                _ = try await client.auth.user()
                return true
            } catch {
                if DataError.from(error) == .network { return true }
                try? await client.auth.signOut(scope: .local)
                return false
            }
        }
    }

    /// Un endpoint respondió 401/403 con esta sesión: se valida y, si no sirve, se cierra (MOB-06)
    public func onUnauthorized() async { _ = await validateSession() }

    /// Token de acceso vigente (lo renueva si está por caducar)
    func accessToken() async -> String? {
        if let s = client.auth.currentSession, s.expiresAt - Date().timeIntervalSince1970 < 30 {
            _ = try? await client.auth.refreshSession()
        }
        return client.auth.currentSession?.accessToken
    }
}
