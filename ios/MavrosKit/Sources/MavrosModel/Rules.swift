import Foundation

/// Validación previa del login (MOB-03), con las mismas reglas que loginSchema de la web
public enum LoginValidation {
    public static let minPassword = 8
    public struct Errors: Equatable, Sendable {
        public var email: String?
        public var password: String?
        public var isValid: Bool { email == nil && password == nil }
    }
    /// Sin espacios alrededor y en minúsculas, como la web
    public static func normalizeEmail(_ email: String) -> String { email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }

    public static func validate(email: String, password: String) -> Errors {
        let e = normalizeEmail(email)
        let emailError: String? =
            e.isEmpty ? "El email es requerido" : (e.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) == nil ? "Email inválido" : nil)
        let passwordError: String? =
            password.isEmpty ? "La contraseña es requerida" : (password.count < minPassword ? "La contraseña debe tener al menos \(minPassword) caracteres" : nil)
        return Errors(email: emailError, password: passwordError)
    }
}

/// Reglas de progreso (PRG-02, CAT-06). Mismas que lib/progress.ts y ProgressRules.kt.
public enum ProgressRules {
    public static let resumeMinSeconds = 10.0
    public static let finishedRatio = 0.95
    public static let continueMinRatio = 0.05

    /// Desde dónde arrancar al abrir la película
    public static func resumePosition(_ position: Double?, duration: Int) -> Double {
        guard let position, position != 0, duration > 0 else { return 0 }
        if position < resumeMinSeconds { return 0 }
        if position / Double(duration) >= finishedRatio { return 0 }
        return min(position, Double(duration))
    }

    /// ¿Va en "Seguir viendo"? Entre 5 % y 95 %
    public static func isInProgress(_ position: Double, duration: Int) -> Bool {
        guard duration > 0 else { return false }
        let ratio = position / Double(duration)
        return ratio >= continueMinRatio && ratio < finishedRatio
    }

    public static func progressRatio(_ position: Double, duration: Int) -> Double {
        guard duration > 0 else { return 0 }
        return min(1, max(0, position / Double(duration)))
    }
}

/// Reglas del reproductor (MOB-15, MOB-16, IPAD-07)
public enum PlaybackRules {
    /// Se pide URL nueva 5 min antes de que caduque el token
    public static let refreshBeforeMs: Int64 = 5 * 60 * 1000

    public static func refreshDelayMs(expiresAtMs: Int64, nowMs: Int64) -> Int64 { max(0, expiresAtMs - nowMs - refreshBeforeMs) }

    /// Cambia el token de una URL del Worker por el de la URL firmada más reciente (lib/video/swap-token.ts)
    public static func swapToken(_ requestUrl: String, latest latestSignedUrl: String) -> String {
        guard let request = URLComponents(string: requestUrl), let latest = URLComponents(string: latestSignedUrl),
              request.scheme != nil, request.host != nil, latest.scheme != nil, latest.host != nil,
              origin(request) == origin(latest) else { return requestUrl }
        let tokenPath = #"^/t/[^/]+/"#
        let latestPath = latest.percentEncodedPath
        guard let latestRange = latestPath.range(of: tokenPath, options: .regularExpression) else { return requestUrl }
        let path = request.percentEncodedPath
        guard let range = path.range(of: tokenPath, options: .regularExpression) else { return requestUrl }
        var swapped = request
        swapped.percentEncodedPath = path.replacingCharacters(in: range, with: latestPath[latestRange])
        return swapped.string ?? requestUrl
    }

    private static func origin(_ c: URLComponents) -> String {
        let scheme = (c.scheme ?? "").lowercased()
        let port = c.port ?? (scheme == "https" ? 443 : 80)
        return "\(scheme)://\((c.host ?? "").lowercased()):\(port)"
    }
}

/// Cuándo guardar el progreso (MOB-15, PRG-01, PRG-06). Igual que ProgressTracker.kt.
public final class ProgressTracker {
    private let duration: Int
    private let saveEveryMs: Int64
    private var started = false
    private var lastSaved: Double?
    private var lastSaveAtMs: Int64?

    public init(durationSeconds: Int, saveEveryMs: Int64 = 10_000) { duration = durationSeconds; self.saveEveryMs = saveEveryMs }

    /// El reproductor empezó a reproducir de verdad
    public func onPlaying(nowMs: Int64) {
        started = true
        if lastSaveAtMs == nil { lastSaveAtMs = nowMs }
    }

    public func onTick(position: Double, isPlaying: Bool, nowMs: Int64) -> Double? {
        guard started, isPlaying else { return nil }
        let since = nowMs - (lastSaveAtMs ?? nowMs)
        return since >= saveEveryMs ? commit(position, nowMs) : nil
    }

    public func onPause(position: Double, nowMs: Int64) -> Double? { started ? commit(position, nowMs) : nil }
    public func onExit(position: Double, nowMs: Int64) -> Double? { onPause(position: position, nowMs: nowMs) }

    private func commit(_ position: Double, _ nowMs: Int64) -> Double? {
        guard !position.isNaN else { return nil }
        let p = min(max(position, 0), Double(max(duration, 0)))
        if p <= 0 || p == lastSaved { return nil }
        lastSaved = p
        lastSaveAtMs = nowMs
        return p
    }
}
