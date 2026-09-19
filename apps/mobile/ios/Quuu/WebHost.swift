import OSLog
import UIKit
import WebKit

/// The shell that hosts the UI. **Reads the baked-in build over a custom scheme** (`WebAssets`).
///
/// Nothing goes out (`connect-src 'self'`). Conversation bodies are treated as
/// strings written by someone else, so images are never fetched either. Same
/// stance as the Mac renderer.
final class WebHost: UIViewController, WKNavigationDelegate {
  /// Where the reason lands when the UI does not appear. Never a silent black screen.
  static let log = Logger(subsystem: "net.kinzal.quuu.mobile", category: "web")

  private let folder = SyncFolder()
  private lazy var appBundle = AppBundle(folder: folder)
  private lazy var bridge = Bridge(folder: folder, appBundle: appBundle)
  private var webView: WKWebView!

  override func viewDidLoad() {
    super.viewDidLoad()

    /*
     * Decide the UI to serve for this launch **exactly once**. Swapping under an
     * open page mixes already-loaded JS with new HTML
     */
    let assets = WebAssets.current(appBundle)
    let config = WKWebViewConfiguration()
    config.userContentController.add(bridge, name: Bridge.handlerName)
    // Align media and scrolling behavior with iOS defaults
    config.allowsInlineMediaPlayback = true
    if let assets { config.setURLSchemeHandler(assets, forURLScheme: WebAssets.scheme) }
    /*
     * Route UI-side exceptions into the shell log. An unreadable black screen
     * leaves nothing to go on when no dev machine is at hand
     */
    config.userContentController.addUserScript(
      WKUserScript(source: Self.errorHook, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    )

    webView = WKWebView(frame: .zero, configuration: config)
    webView.navigationDelegate = self
    webView.translatesAutoresizingMaskIntoConstraints = false
    webView.scrollView.bounces = false
    // The web side paints the background; keep this transparent so transitions never flash white
    webView.isOpaque = false
    webView.backgroundColor = .systemBackground
    webView.scrollView.backgroundColor = .systemBackground
    #if DEBUG
      // Expose to Safari's Web Inspector (for fixing the UI on a real device)
      if #available(iOS 16.4, *) { webView.isInspectable = true }
    #endif

    view.backgroundColor = .systemBackground
    view.addSubview(webView)
    NSLayoutConstraint.activate([
      webView.topAnchor.constraint(equalTo: view.topAnchor),
      webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
    ])

    // While a delivery downloads, a thin bar shows at the bottom (the web side decides)
    appBundle.onProgress = { [weak self] active, ratio in
      self?.bridge.notifyProgress(active: active, ratio: ratio)
    }

    bridge.attach(webView: webView, presenter: self)
    if assets != nil {
      webView.load(URLRequest(url: WebAssets.indexURL))
    } else {
      showMissingBundle()
    }

    // Check for a new UI delivery. Used from the next open
    DispatchQueue.global(qos: .utility).async { [weak self] in self?.appBundle.syncFromCloud() }

    // Re-read on return to foreground; the Mac keeps working while we are backgrounded
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(didBecomeActive),
      name: UIApplication.didBecomeActiveNotification,
      object: nil
    )
  }

  /// A build that forgot to bake in the UI must **not turn into a silent white screen**.
  private func showMissingBundle() {
    let label = UILabel()
    label.text = "Web assets missing\nnpm run build -w @quuu/mobile"
    label.numberOfLines = 0
    label.textAlignment = .center
    label.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(label)
    NSLayoutConstraint.activate([
      label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      label.centerYAnchor.constraint(equalTo: view.centerYAnchor)
    ])
  }

  @objc private func didBecomeActive() {
    bridge.notifyChanged()
    bridge.retryPendingIntents()
    // A new UI may have arrived while backgrounded. Used from the next open
    DispatchQueue.global(qos: .utility).async { [weak self] in self?.appBundle.syncFromCloud() }
  }

  // MARK: - WKNavigationDelegate

  func webView(_ webView: WKWebView, didFailProvisionalNavigation: WKNavigation!, withError error: Error) {
    Self.log.error("Cannot load the UI: \(error.localizedDescription, privacy: .public)")
  }

  func webView(_ webView: WKWebView, didFail: WKNavigation!, withError error: Error) {
    Self.log.error("The UI failed: \(error.localizedDescription, privacy: .public)")
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    Self.log.error("The web content process died; reloading")
    webView.load(URLRequest(url: WebAssets.indexURL))
  }

  /// The hook that hands UI-side exceptions to the shell.
  ///
  /// Three kinds are caught. **Missing any one of them leaves a black screen with no reason.**
  ///
  ///   · `error` (capture phase) … a script that failed to load only shows up here (it does not bubble)
  ///   · `unhandledrejection` … dynamic import failures
  ///   · `securitypolicyviolation` … things blocked by CSP
  private static let errorHook = """
    (function () {
      var send = function (kind, text) {
        try {
          window.webkit.messageHandlers.quuu.postMessage({
            id: 0, method: 'log', params: { kind: kind, text: String(text) }
          })
        } catch (e) {}
      }
      window.addEventListener('error', function (e) {
        if (e.target && e.target !== window && e.target.src) {
          send('error', 'cannot load: ' + e.target.src)
          return
        }
        send('error', (e.message || '') + ' @ ' + (e.filename || '') + ':' + (e.lineno || 0))
      }, true)
      window.addEventListener('unhandledrejection', function (e) {
        send('error', 'unhandled: ' + (e.reason && e.reason.message ? e.reason.message : e.reason))
      })
      document.addEventListener('securitypolicyviolation', function (e) {
        send('csp', e.violatedDirective + ' blocked ' + e.blockedURI)
      })
      /*
       * Also record when the UI never assembled. There is a failure mode that
       * throws nothing and shows nothing (the load went through but nothing
       * rendered), and it is the hardest one to reach
       */
      window.addEventListener('load', function () {
        setTimeout(function () {
          var root = document.getElementById('root')
          if (!root || root.childElementCount === 0) send('error', 'UI never assembled')
        }, 3000)
      })
    })()
    """
}
