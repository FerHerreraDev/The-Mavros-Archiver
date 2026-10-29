import SwiftUI
import MavrosModel
import MavrosData

/// Login con email y contraseña (IPAD-03, MOB-03). El mismo mensaje para todo lo que no sea red.
struct LoginView: View {
    @Environment(AppModel.self) private var model
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focus: Field?
    enum Field { case email, password }

    private var validation: LoginValidation.Errors { LoginValidation.validate(email: email, password: password) }

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            VStack(spacing: 20) {
                (Text("THE MAVROS ") + Text("ARCHIVER").foregroundColor(Theme.accent)).font(.largeTitle.bold())
                VStack(spacing: 12) {
                    TextField("Email", text: $email)
                        .textContentType(.username).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .focused($focus, equals: .email)
                        .modifier(FieldStyle(focused: focus == .email))
                        .accessibilityIdentifier("email")
                    SecureField("Contraseña", text: $password)
                        .textContentType(.password)
                        .focused($focus, equals: .password)
                        .modifier(FieldStyle(focused: focus == .password))
                        .accessibilityIdentifier("password")
                        .onSubmit(submit)
                }
                .disabled(busy)

                if let error {
                    Text(error).foregroundStyle(Theme.accent).font(.callout).accessibilityIdentifier("login-error")
                }
                Button(action: submit) {
                    HStack {
                        if busy { ProgressView().tint(.black) }
                        Text("Entrar").bold()
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color(white: 0.95))
                .foregroundStyle(.black)
                // Bloqueado mientras envía: un segundo toque no repite (UX-01)
                .disabled(!validation.isValid || busy)
                .accessibilityIdentifier("submit")
            }
            .frame(maxWidth: 420)
            .padding(32)
        }
    }

    private func submit() {
        guard validation.isValid, !busy else { return }
        busy = true
        error = nil
        Task {
            switch await model.auth.signIn(email: email, password: password) {
            case .network: error = "Sin conexión. Revisa tu internet."
            case .invalidCredentials: error = "Email o contraseña incorrectos."
            case nil: break
            }
            busy = false
        }
    }
}
