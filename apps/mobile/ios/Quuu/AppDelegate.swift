import UIKit

/// Quuu (iPhone).
///
/// No SwiftUI: there is only **one WKWebView** to place.
/// The UI is assembled on the web side (`apps/mobile/src`); this shell only
/// holds folder permission, coordinated reads/writes, and change notifications.
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    true
  }

  func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
  }
}
