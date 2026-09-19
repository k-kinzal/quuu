import Foundation
import UniformTypeIdentifiers
import WebKit

/// Serves the baked-in UI **over a custom scheme** (`quuu://app/...`).
///
/// Loading it from `file://` via `loadFileURL` does not work.
///
/// | What | Why |
/// |------|-----|
/// | ES modules do not load | `file://` has a null origin, so `import` is rejected by CORS |
/// | CSP `'self'` has no effect | there is no origin to match against |
/// | `localStorage` is unusable | storage is per-origin; with no origin there is nowhere to put it |
///
/// With a custom scheme, `quuu://app` becomes a real origin and all three just work.
/// Nothing goes out (CSP is `default-src 'self'`), so no traffic leaves this origin.
final class WebAssets: NSObject, WKURLSchemeHandler {
  static let scheme = "quuu"
  static let indexURL = URL(string: "quuu://app/index.html")!

  private let root: URL

  init(root: URL) {
    self.root = root.standardizedFileURL
  }

  /// The baked-in location. nil when absent (the shell says "not installed").
  static func bundled() -> WebAssets? {
    guard let web = Bundle.main.url(forResource: "web", withExtension: nil) else { return nil }
    return at(web)
  }

  /// Makes a server for that location if a UI is there.
  static func at(_ root: URL) -> WebAssets? {
    guard FileManager.default.fileExists(atPath: root.appendingPathComponent("index.html").path)
    else { return nil }
    return WebAssets(root: root)
  }

  /// What this launch serves. **A delivery received from iCloud wins if present.**
  ///
  /// If the received one fails to come up, fall back to the baked-in UI
  /// (the decision lives in `AppBundle`). That is why the baked-in copy is never deleted.
  static func current(_ bundle: AppBundle) -> WebAssets? {
    if let dir = bundle.resolveForLaunch(), let assets = at(dir) { return assets }
    return bundled()
  }

  func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
    guard let url = urlSchemeTask.request.url else {
      urlSchemeTask.didFailWithError(URLError(.badURL))
      return
    }

    var path = url.path
    if path.isEmpty || path == "/" { path = "/index.html" }

    let file = root.appendingPathComponent(path).standardizedFileURL
    // **Never step outside the baked-in root.** A request containing `..` must not read device files
    guard file.path.hasPrefix(root.path), let data = try? Data(contentsOf: file) else {
      urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist))
      return
    }

    let response = HTTPURLResponse(
      url: url,
      statusCode: 200,
      httpVersion: "HTTP/1.1",
      headerFields: [
        "Content-Type": Self.mime(for: file),
        "Content-Length": String(data.count),
        // Baked-in assets change per build; never let a stale version be held
        "Cache-Control": "no-store"
      ]
    )!
    urlSchemeTask.didReceive(response)
    urlSchemeTask.didReceive(data)
    urlSchemeTask.didFinish()
  }

  func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
    // Responses are synchronous, so there is no in-flight state to stop
  }

  private static func mime(for url: URL) -> String {
    switch url.pathExtension.lowercased() {
    case "html": return "text/html; charset=utf-8"
    case "js", "mjs": return "text/javascript; charset=utf-8"
    case "css": return "text/css; charset=utf-8"
    case "json": return "application/json; charset=utf-8"
    case "svg": return "image/svg+xml"
    case "woff2": return "font/woff2"
    default:
      return UTType(filenameExtension: url.pathExtension)?.preferredMIMEType
        ?? "application/octet-stream"
    }
  }
}
