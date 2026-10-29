import XCTest

/// Fase I1 en el simulador de iPad contra Supabase local (ios/scripts/ui-test.sh siembra los datos)
final class CatalogUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
        XCTAssertFalse((env["MAVROS_EMAIL"] ?? "").isEmpty, "Corre las pruebas con ios/scripts/ui-test.sh (siembra un usuario en el Supabase local)")
    }

    private let keychain = "uitest-\(UUID().uuidString)"
    private func launch() -> XCUIApplication { launchApp(keychain: keychain) }

    func testIPAD03_LoginWrongPasswordShowsGenericErrorThenSignsInAndKeepsSession() {
        var app = launch()
        XCTAssertFalse(app.buttons["submit"].isEnabled, "sin datos el botón está bloqueado")
        signIn(app, password: "contraseña-incorrecta")
        let error = app.staticTexts["login-error"]
        XCTAssertTrue(error.waitForExistence(timeout: 10))
        XCTAssertEqual(error.label, "Email o contraseña incorrectos.")

        let secret = app.secureTextFields["password"]
        secret.tap()
        secret.press(forDuration: 1.2)
        if app.menuItems["Select All"].waitForExistence(timeout: 2) { app.menuItems["Select All"].tap() }
        secret.typeText(XCUIKeyboardKey.delete.rawValue)
        secret.typeText(env["MAVROS_PASSWORD"] ?? "")
        app.buttons["submit"].tap()
        XCTAssertTrue(app.staticTexts["Recién agregadas"].waitForExistence(timeout: 15))
        dismissSavePassword(app)

        // Cerrar y abrir: sigue dentro (sesión en el Llavero)
        app.terminate()
        app = launch()
        XCTAssertTrue(app.staticTexts["Recién agregadas"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.textFields["email"].exists)

        // Cerrar sesión vuelve al login
        app.buttons["profile-menu"].tap()
        app.buttons["Cerrar sesión"].tap()
        XCTAssertTrue(app.textFields["email"].waitForExistence(timeout: 10))
    }

    func testIPAD04_CatalogSectionsAndContinueWatchingOpensSeries() {
        let app = launch()
        signIn(app)
        XCTAssertTrue(app.staticTexts["Seguir viendo"].waitForExistence(timeout: 15))
        dismissSavePassword(app)
        XCTAssertTrue(app.staticTexts["Recién agregadas"].exists)
        XCTAssertTrue(app.staticTexts["Series"].exists)
        XCTAssertTrue(app.buttons["Ver Película iPad"].exists)

        // La tarjeta de la serie en "Seguir viendo" dice qué episodio sigue y abre la serie (SER-11, SER-20)
        let continueCard = app.buttons["continue-\(env["MAVROS_SERIES_ID"] ?? "")"]
        XCTAssertTrue(continueCard.exists)
        XCTAssertTrue(continueCard.label.contains("Serie iPad"))
        continueCard.tap()
        let play = app.buttons["play"]
        XCTAssertTrue(play.waitForExistence(timeout: 15))
        XCTAssertTrue(play.label.contains("Reproducir T1:E2"), play.label)
    }

    func testIPAD05_SeriesPageSeasonsAndEpisodesAndMovieDetail() {
        let app = launch()
        signIn(app)
        dismissSavePassword(app)
        let seriesCard = app.buttons["series-\(env["MAVROS_SERIES_ID"] ?? "")"]
        XCTAssertTrue(reveal(seriesCard, in: app))
        seriesCard.tap()

        XCTAssertTrue(app.staticTexts["series-title"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Una serie de prueba con dos temporadas."].exists)
        XCTAssertTrue(app.buttons["Ver T1:E1 Piloto"].exists)
        XCTAssertTrue(app.buttons["Ver T1:E2 El segundo"].exists)
        XCTAssertFalse(app.buttons["Ver T2:E1 Nueva temporada"].exists)
        XCTAssertTrue(app.staticTexts["Sinopsis de Piloto."].exists)

        app.buttons["season-picker"].tap()
        app.buttons["Temporada 2"].tap()
        XCTAssertTrue(app.buttons["Ver T2:E1 Nueva temporada"].waitForExistence(timeout: 5))

        app.navigationBars.buttons.element(boundBy: 0).tap()
        let movie = app.buttons["Ver Película iPad"]
        XCTAssertTrue(reveal(movie, in: app))
        movie.tap()
        XCTAssertTrue(app.staticTexts["title"].waitForExistence(timeout: 15))
        XCTAssertEqual(app.staticTexts["title"].label, "Película iPad")
        XCTAssertTrue(app.buttons["play"].label.contains("Reproducir"))
        XCTAssertFalse(app.buttons["open-series"].exists, "una película no tiene Ver episodios")
    }
}
