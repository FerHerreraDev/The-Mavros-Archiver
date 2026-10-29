import XCTest

/// Fase I3: Mis listas, una lista, "Agregar a lista" y "Siguiente en la lista" (IPAD-10, PL-04..PL-07)
final class ListsUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
        XCTAssertFalse((env["MAVROS_EMAIL"] ?? "").isEmpty, "Corre con ios/scripts/ui-test.sh")
    }

    private let listName = "Mi lista iPad"

    private func closePopover(_ app: XCUIApplication) {
        let dismiss = app.otherElements["PopoverDismissRegion"]
        if dismiss.exists { dismiss.tap() } else { app.coordinate(withNormalizedOffset: CGVector(dx: 0.05, dy: 0.95)).tap() }
    }

    private func back(_ app: XCUIApplication) { app.navigationBars.buttons.element(boundBy: 0).tap() }

    func testIPAD10_CreateListAddMovieAndSeriesThenPlayListOffersNextInList() {
        let app = launchApp()
        signIn(app)
        dismissSavePassword(app)

        // Película: crear una lista ahí mismo y queda agregada
        let movie = app.buttons["movie-\(env["MAVROS_MOVIE_ID"] ?? "")"]
        XCTAssertTrue(reveal(movie, in: app))
        movie.tap()
        app.buttons["add-to-list"].tap()
        let field = app.textFields["new-list-name"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText(listName)
        app.buttons["create-list"].tap()
        let toggle = app.buttons["toggle-\(listName)"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 10))
        XCTAssertTrue(toggle.isSelected, "la película quedó en la lista nueva")
        closePopover(app)
        back(app)

        // Serie: la lista aparece sin marcar; tocarla la agrega (al final)
        let series = app.buttons["series-\(env["MAVROS_SERIES_ID"] ?? "")"]
        XCTAssertTrue(reveal(series, in: app))
        series.tap()
        XCTAssertTrue(app.buttons["add-to-list"].waitForExistence(timeout: 15))
        app.buttons["add-to-list"].tap()
        XCTAssertTrue(toggle.waitForExistence(timeout: 10))
        XCTAssertFalse(toggle.isSelected)
        toggle.tap()
        expectSelected(toggle)
        closePopover(app)
        back(app)

        // Mis listas: la lista con sus 2 elementos
        app.buttons["my-lists"].tap()
        let row = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", listName)).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 15))
        XCTAssertTrue(row.label.contains("2 elementos"), row.label)
        row.tap()

        // La lista: en orden, la serie dice "Serie"; "Reproducir lista" empieza por la película
        XCTAssertTrue(app.staticTexts["list-title"].waitForExistence(timeout: 15))
        XCTAssertEqual(app.staticTexts["list-title"].label, listName)
        XCTAssertTrue(app.staticTexts["Película iPad"].exists)
        XCTAssertTrue(app.staticTexts["Serie iPad"].exists)
        XCTAssertTrue(app.staticTexts["Serie"].exists)
        XCTAssertLessThan(app.staticTexts["Película iPad"].frame.minY, app.staticTexts["Serie iPad"].frame.minY, "lo nuevo va al final")
        app.buttons["play-list"].tap()

        // La película de prueba dura 12 s: al terminar sigue la serie por su episodio que sigue (T1:E1 ya está visto)
        let next = app.descendants(matching: .any)["next-episode"]
        XCTAssertTrue(next.waitForExistence(timeout: 40), "no apareció Siguiente en la lista")
        XCTAssertTrue(app.staticTexts["next-countdown"].label.contains("Siguiente en la lista"), app.staticTexts["next-countdown"].label)
        XCTAssertTrue(app.staticTexts["T1:E2 · El segundo"].exists)
        app.buttons["next-cancel"].tap()
        XCTAssertTrue(next.waitForNonExistence(timeout: 5))
        app.buttons["close-player"].tap()
        XCTAssertTrue(app.buttons["play-list"].waitForExistence(timeout: 10))
    }

    private func expectSelected(_ element: XCUIElement) {
        let selected = XCTNSPredicateExpectation(predicate: NSPredicate(format: "isSelected == true"), object: element)
        XCTAssertEqual(XCTWaiter().wait(for: [selected], timeout: 10), .completed, "quedó marcada")
    }
}
