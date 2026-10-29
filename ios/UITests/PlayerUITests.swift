import XCTest

/// Fase I2: reproductor contra la web local (/api/playback) y el HLS de prueba de 12 s
final class PlayerUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
        XCTAssertFalse((env["MAVROS_EMAIL"] ?? "").isEmpty, "Corre con ios/scripts/ui-test.sh")
    }

    func testIPAD06_MovieOpensNativePlayerAndPlays() {
        let app = launchApp()
        signIn(app)
        dismissSavePassword(app)
        let movie = app.buttons["movie-\(env["MAVROS_MOVIE_ID"] ?? "")"]
        XCTAssertTrue(reveal(movie, in: app))
        movie.tap()
        app.buttons["play"].tap()
        XCTAssertTrue(app.otherElements["player"].waitForExistence(timeout: 20) || app.descendants(matching: .any)["player"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["player-message"].exists, "sin error de reproducción")
        app.buttons["close-player"].tap()
        XCTAssertTrue(app.buttons["play"].waitForExistence(timeout: 10))
    }

    func testIPAD07_IPAD09_EpisodeEndsOffersNextPlaysItAndSavesProgress() {
        let app = launchApp()
        signIn(app)
        dismissSavePassword(app)
        let series = app.buttons["series-\(env["MAVROS_SERIES_ID"] ?? "")"]
        XCTAssertTrue(reveal(series, in: app))
        series.tap()
        let play = app.buttons["play"]
        XCTAssertTrue(play.waitForExistence(timeout: 15))
        XCTAssertTrue(play.label.contains("Reproducir T1:E2"), play.label)
        play.tap()

        // El episodio de prueba dura 12 s: al terminar se ofrece el siguiente, que cruza a la temporada 2
        let next = app.descendants(matching: .any)["next-episode"]
        XCTAssertTrue(next.waitForExistence(timeout: 40), "no apareció Siguiente episodio")
        XCTAssertTrue(app.staticTexts["T2:E1 · Nueva temporada"].exists, "la tarjeta nombra el siguiente")
        XCTAssertTrue(app.staticTexts["next-countdown"].label.contains("Siguiente episodio en"))
        app.buttons["next-now"].tap()

        // Sigue en el reproductor con el siguiente (la tarjeta desaparece)
        XCTAssertTrue(next.waitForNonExistence(timeout: 10))
        XCTAssertTrue(app.buttons["close-player"].exists)
        sleep(4)
        app.buttons["close-player"].tap()

        // T1:E2 quedó terminado y T2:E1 empezado: la serie ya no ofrece T1:E2 (el progreso se guardó)
        XCTAssertTrue(play.waitForExistence(timeout: 10))
        let moved = NSPredicate(format: "NOT (label CONTAINS 'T1:E2')")
        XCTAssertEqual(XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: moved, object: play)], timeout: 15), .completed, play.label)
        XCTAssertTrue(play.label.contains("T2:E1"), play.label)
    }
}
