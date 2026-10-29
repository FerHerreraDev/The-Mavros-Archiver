import SwiftUI
import MavrosModel
import MavrosData

/// Colores de la marca (los mismos que la web y Android)
enum Theme {
    static let background = Color(red: 0.02, green: 0.02, blue: 0.02)
    static let card = Color(white: 0.1)
    static let border = Color(white: 0.2)
    /// Contorno de los campos: ≥ 3:1 contra el fondo (UI-03)
    static let field = Color(white: 0.52)
    static let foreground = Color(white: 0.9)
    static let muted = Color(white: 0.62)
    static let accent = Color(red: 0.91, green: 0.09, blue: 0.04)
}

/// Póster o imagen 16:9 con el color de tarjeta mientras carga y el título si falla
struct PosterImage: View {
    let src: String?
    let title: String
    var ratio: CGFloat = 2 / 3

    var body: some View {
        Theme.card
            .aspectRatio(ratio, contentMode: .fit)
            .overlay {
                if let src, let url = URL(string: src) {
                    AsyncImage(url: url, transaction: Transaction(animation: .easeOut(duration: 0.3))) { phase in
                        switch phase {
                        case .success(let image): image.resizable().scaledToFill()
                        case .failure: fallback
                        default: Color.clear
                        }
                    }
                } else { fallback }
            }
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.border, lineWidth: 1))
    }

    private var fallback: some View {
        VStack(spacing: 8) {
            Image(systemName: "film").foregroundStyle(Theme.muted)
            Text(title).font(.footnote).multilineTextAlignment(.center).lineLimit(3).foregroundStyle(Theme.foreground)
        }
        .padding(8)
    }
}

/// Barra de progreso roja sobre la imagen
struct ProgressBar: View {
    let ratio: Double
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Rectangle().fill(.black.opacity(0.6))
                Rectangle().fill(Theme.accent).frame(width: geo.size.width * ratio)
            }
        }
        .frame(height: 4)
        .accessibilityElement()
        .accessibilityLabel("Progreso")
        .accessibilityValue("\(Int((ratio * 100).rounded())) %")
    }
}

/// Error con "Reintentar" (MOB-09)
struct ErrorState: View {
    let error: DataError
    let retry: () -> Void
    var body: some View {
        ContentUnavailableView {
            Label(error == .network ? "Sin conexión" : "Algo salió mal", systemImage: error == .network ? "wifi.slash" : "exclamationmark.triangle")
        } description: {
            Text(error == .network ? "Revisa tu internet." : "Intenta de nuevo en un momento.")
        } actions: {
            Button("Reintentar", action: retry).buttonStyle(.borderedProminent).accessibilityIdentifier("retry")
        }
    }
}

/// Bloques grises con brillo mientras carga el catálogo (LOAD-01)
struct Skeleton: View {
    @State private var shine = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        RoundedRectangle(cornerRadius: 12).fill(Theme.card)
            .overlay {
                if !reduceMotion {
                    LinearGradient(colors: [.clear, .white.opacity(0.07), .clear], startPoint: .leading, endPoint: .trailing)
                        .offset(x: shine ? 400 : -400)
                        .animation(.easeInOut(duration: 1.6).repeatForever(autoreverses: false), value: shine)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .onAppear { shine = true }
    }
}

/// Campo de texto con contorno visible y anillo rojo al enfocarse (UI-03)
struct FieldStyle: ViewModifier {
    var focused: Bool
    func body(content: Content) -> some View {
        content
            .padding(.horizontal, 12).frame(height: 44)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(focused ? Theme.accent : Theme.field, lineWidth: focused ? 2 : 1))
    }
}
