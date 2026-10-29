import XCTest

/// Capturas de las pantallas principales para revisarlas (solo si se pide con MAVROS_SNAPSHOT_DIR)
final class ScreenshotsUITests: XCTestCase {
    func testScreenshots() throws {
        guard let dir = env["MAVROS_SNAPSHOT_DIR"], let email = env["MAVROS_EMAIL"], let password = env["MAVROS_PASSWORD"] else { throw XCTSkip("Sin MAVROS_SNAPSHOT_DIR") }
        let app = launchApp(keychain: "shots-\(UUID().uuidString)")
        func shot(_ name: String) throws { try XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: "\(dir)/\(name).png")) }
        XCTAssertTrue(app.textFields["email"].waitForExistence(timeout: 10))
        try shot("1-login")
        app.textFields["email"].tap(); app.textFields["email"].typeText(email)
        app.secureTextFields["password"].tap(); app.secureTextFields["password"].typeText(password)
        app.buttons["submit"].tap()
        XCTAssertTrue(app.staticTexts["Seguir viendo"].waitForExistence(timeout: 15))
        dismissSavePassword(app)
        sleep(2)
        try shot("2-catalogo")
        let series = app.buttons["series-\(env["MAVROS_SERIES_ID"] ?? "")"]
        XCTAssertTrue(reveal(series, in: app))
        series.tap()
        XCTAssertTrue(app.staticTexts["series-title"].waitForExistence(timeout: 15))
        sleep(2)
        try shot("4-serie")
        XCUIDevice.shared.orientation = .landscapeLeft
        sleep(2)
        try shot("5-serie-horizontal")
        XCUIDevice.shared.orientation = .portrait
    }
}
