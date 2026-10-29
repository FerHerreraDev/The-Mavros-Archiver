import XCTest

extension XCTestCase {
    var env: [String: String] { ProcessInfo.processInfo.environment }

    /// La app con un llavero propio (empieza sin sesión)
    func launchApp(keychain: String = "uitest-\(UUID().uuidString)") -> XCUIApplication {
        // Una prueba anterior pudo dejar el simulador en horizontal
        XCUIDevice.shared.orientation = .portrait
        // "Save Password?" es una alerta del sistema: XCTest la cierra cuando estorba un toque
        addUIInterruptionMonitor(withDescription: "Guardar contraseña") { alert in
            for title in ["Not Now", "Ahora no"] where alert.buttons[title].exists {
                alert.buttons[title].tap()
                return true
            }
            return false
        }
        let app = XCUIApplication()
        app.launchArguments += ["-uiTestKeychainService", keychain]
        app.launch()
        return app
    }

    func signIn(_ app: XCUIApplication, password: String? = nil) {
        let field = app.textFields["email"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText(env["MAVROS_EMAIL"] ?? "")
        let secret = app.secureTextFields["password"]
        secret.tap()
        secret.typeText(password ?? env["MAVROS_PASSWORD"] ?? "")
        app.buttons["submit"].tap()
    }

    /// El catálogo es perezoso: lo que está fuera de pantalla no existe hasta que se desplaza
    @discardableResult
    func reveal(_ element: XCUIElement, in app: XCUIApplication, timeout: TimeInterval = 15) -> Bool {
        if element.waitForExistence(timeout: timeout) { return true }
        for _ in 0..<6 where !element.exists { app.swipeUp() }
        return element.exists
    }

    /// iOS ofrece guardar la contraseña unos segundos después del login, en una alerta del sistema
    /// (no de la app): se cierra antes de tocar nada más
    func dismissSavePassword(_ app: XCUIApplication) {
        // La alerta la muestra un proceso del sistema según la versión de iOS
        let hosts = ["com.apple.SharedWebCredentialViewService", "com.apple.springboard"].map { XCUIApplication(bundleIdentifier: $0) } + [app]
        let deadline = Date().addingTimeInterval(10)
        while Date() < deadline {
            for source in hosts {
                for title in ["Not Now", "Ahora no"] where source.buttons[title].exists {
                    source.buttons[title].tap()
                    return
                }
            }
            usleep(300_000)
        }
    }
}
