import AppIntents
import Foundation

/// "Hey Siri, add to Daybook": asks what to add, then opens quick add with it filled in, so it's read
/// the same way as typing ("lab report due friday 5pm", "gym tomorrow 7am") and checked before saving.
@available(iOS 18.0, *)
struct AddToDaybookIntent: AppIntent {
  static let title: LocalizedStringResource = "Add to Daybook"
  static let description = IntentDescription("Adds an event or task to Daybook from what you say.")

  @Parameter(title: "What to add", requestValueDialog: "What do you want to add?")
  var text: String

  func perform() async throws -> some IntentResult & OpensIntent {
    var components = URLComponents()
    components.scheme = "daybook"
    components.host = "new"
    components.queryItems = [URLQueryItem(name: "text", value: text)]
    return .result(opensIntent: OpenURLIntent(components.url!))
  }
}

@available(iOS 18.0, *)
struct DaybookShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: AddToDaybookIntent(),
      phrases: ["Add to \(.applicationName)", "Add something to \(.applicationName)", "New \(.applicationName) item"],
      shortTitle: "Add to Daybook",
      systemImageName: "plus.circle"
    )
  }
}
