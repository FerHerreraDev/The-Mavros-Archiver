import Foundation

/// Lo único que lleva la app (IPAD-01): URL de Supabase, clave pública y URL del sitio
public struct MavrosConfig: Sendable {
    public let supabaseUrl: URL
    public let anonKey: String
    public let siteUrl: URL
    public init(supabaseUrl: URL, anonKey: String, siteUrl: URL) { self.supabaseUrl = supabaseUrl; self.anonKey = anonKey; self.siteUrl = siteUrl }
}
