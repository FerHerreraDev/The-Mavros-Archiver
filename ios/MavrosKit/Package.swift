// swift-tools-version: 6.0
// Lógica de la app del iPad (Fase I de tests/SPEC.md): se prueba en la Mac con `swift test`.
import PackageDescription

let package = Package(
    name: "MavrosKit",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "MavrosModel", targets: ["MavrosModel"]),
        .library(name: "MavrosData", targets: ["MavrosData"]),
    ],
    dependencies: [
        .package(url: "https://github.com/supabase/supabase-swift", exact: "2.55.5"),
    ],
    targets: [
        // Modelos y reglas puras: mismas que lib/*.ts y core:model de Android (IPAD-02)
        .target(name: "MavrosModel"),
        // Supabase + /api/playback con la sesión del usuario (RLS)
        .target(name: "MavrosData", dependencies: ["MavrosModel", .product(name: "Supabase", package: "supabase-swift")]),
        .testTarget(name: "MavrosModelTests", dependencies: ["MavrosModel"]),
        .testTarget(name: "MavrosDataTests", dependencies: ["MavrosData"]),
    ]
)
