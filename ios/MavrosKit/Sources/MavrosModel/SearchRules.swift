import Foundation

/// Un resultado de búsqueda: película o serie (SRCH-01)
public enum SearchHit: Hashable, Sendable, Identifiable {
    case movie(Movie)
    case series(CatalogSeries)
    public var id: String {
        switch self {
        case .movie(let m): return m.id
        case .series(let s): return s.series.id
        }
    }
}

/// Misma regla que lib/search.ts de la web y SearchRules.kt de Android (casos en tests/fixtures/search-cases.json)
public enum SearchRules {
    /// minúsculas, sin acentos y con signos como espacios: "Spider-Man: Él" → "spider man el"
    public static func normalize(_ text: String) -> String {
        var out = ""
        var space = false
        for scalar in text.decomposedStringWithCanonicalMapping.unicodeScalars {
            switch scalar.properties.generalCategory {
            case .nonspacingMark, .spacingMark, .enclosingMark: continue
            default: break
            }
            if scalar.properties.isAlphabetic || scalar.properties.numericType != nil {
                if space && !out.isEmpty { out.append(" ") }
                space = false
                out.append(String(scalar).lowercased())
            } else {
                space = true
            }
        }
        return out
    }

    /// Lo que coincide con `query`, mejor primero; empates en el orden recibido
    public static func search<T>(_ items: [T], query: String, names: (T) -> [String?]) -> [T] {
        let q = normalize(query)
        guard !q.isEmpty else { return [] }
        let words = q.split(separator: " ").map(String.init)
        var ranked: [(item: T, rank: Int, index: Int)] = []
        for (index, item) in items.enumerated() {
            let normalized = names(item).compactMap { $0.map(normalize) }.filter { !$0.isEmpty }
            let all = normalized.joined(separator: " ")
            guard words.allSatisfy({ all.contains($0) }) else { continue }
            let rank: Int
            if normalized.contains(where: { $0.hasPrefix(q) }) { rank = 0 }
            else if normalized.contains(where: { $0.split(separator: " ").contains { $0.hasPrefix(words[0]) } }) { rank = 1 }
            else { rank = 2 }
            ranked.append((item, rank, index))
        }
        return ranked.sorted { ($0.rank, $0.index) < ($1.rank, $1.index) }.map(\.item)
    }

    /// Películas (sin episodios sueltos) y series publicadas del catálogo (SRCH-01)
    public static func searchCatalog(_ catalog: Catalog, query: String) -> [SearchHit] {
        let hits = catalog.recent.filter { !$0.isEpisode }.map(SearchHit.movie) + catalog.series.map(SearchHit.series)
        return search(hits, query: query) { hit in
            switch hit {
            case .movie(let m): return [m.title, m.originalTitle]
            case .series(let s): return [s.series.title, s.series.originalTitle]
            }
        }
    }
}
