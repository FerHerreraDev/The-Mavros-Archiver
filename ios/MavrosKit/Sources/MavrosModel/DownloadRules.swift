import Foundation

/// Reglas de las descargas para ver sin internet (IPAD-13, DL-01, DL-05). Mismas que DownloadRules.kt.
public enum DownloadRules {
    public static let maxHeight = 720

    /// Una calidad del master: alto y BANDWIDTH
    public struct Variant: Equatable, Sendable {
        public let height: Int
        public let bandwidth: Int
        public init(height: Int, bandwidth: Int) { self.height = height; self.bandwidth = bandwidth }
    }

    /// DL-01: la altura más cercana a 720p sin pasarse; si todas son más altas, la más baja
    public static func pickHeight(_ heights: [Int]) -> Int? {
        let valid = heights.filter { $0 > 0 }
        return valid.filter { $0 <= maxHeight }.max() ?? valid.min()
    }

    /// Calidades de un master.m3u8 (#EXT-X-STREAM-INF con RESOLUTION y BANDWIDTH)
    public static func variants(master: String) -> [Variant] {
        master.split(whereSeparator: \.isNewline).compactMap { line -> Variant? in
            guard line.hasPrefix("#EXT-X-STREAM-INF:") else { return nil }
            func attr(_ name: String) -> String? {
                guard let range = line.range(of: "\(name)=") else { return nil }
                let rest = line[range.upperBound...]
                return String(rest.prefix { $0 != "," })
            }
            guard let bw = attr("BANDWIDTH").flatMap({ Int($0) }),
                  let res = attr("RESOLUTION"), let h = res.split(separator: "x").last.flatMap({ Int($0) }) else { return nil }
            return Variant(height: h, bandwidth: bw)
        }
    }

    /// La calidad a descargar del master (DL-01); nil si el master no dice resoluciones
    public static func pick(master: String) -> Variant? {
        let list = variants(master: master)
        guard let height = pickHeight(list.map(\.height)) else { return nil }
        return list.filter { $0.height == height }.min { $0.bandwidth < $1.bandwidth }
    }

    /// DL-05: lo visto sin internet solo pisa un progreso más viejo del servidor
    public static func shouldUpload(localUpdatedAtMs: Int64, serverUpdatedAtMs: Int64?) -> Bool {
        guard let server = serverUpdatedAtMs else { return true }
        return localUpdatedAtMs > server
    }
}
