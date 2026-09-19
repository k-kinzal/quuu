import Foundation
import OSLog
import UIKit
import WebKit

/// The entry point for calls from the UI (WKWebView).
///
/// Accepts exactly one shape, `{id, method, params}`, and replies via
/// `window.__quuuBridge.settle(id, ok, value)`. **Keep it to one mechanism.**
/// Adding another splits behavior by which path a call came in on.
///
/// **No decisions are written here.** This only reads, writes, and presents the
/// folder prompt; what gets written is decided by the web side (`@quuu/sync`).
/// Splitting the same decision across two languages guarantees a state where only
/// one copy got fixed.
final class Bridge: NSObject, WKScriptMessageHandler {
  static let handlerName = "quuu"

  private let folder: SyncFolder
  private weak var webView: WKWebView?
  private weak var presenter: UIViewController?
  private var picker: FolderPicker?

  private let appBundle: AppBundle

  /**
   Where the Mac's files are read. **Never on the main thread.**

   A coordinated read of an iCloud file waits for its download. On the main thread that wait
   stalls the shell — the folder sheet cannot come up, change notices queue, and the OS kills
   a shell that stalls through a background transition. Outside, over a slow link, waiting is
   the normal case, not the exception.
   */
  private let readQueue = DispatchQueue(
    label: "net.kinzal.quuu.read", qos: .userInitiated, attributes: .concurrent
  )
  /**
   Reads of the same file still in flight, by path. **One coordinated read per file at a time.**

   A read that is waiting on a download would otherwise be joined by a fresh one on every
   re-read (every 10 seconds, from a screen whose earlier call has already given up), each
   holding a thread until the same download ends. Later callers take the outcome of the one
   already running. Main-thread only: the message handler and our own completion.
   */
  private var inFlight: [String: [(SyncFolder.ReadOutcome) -> Void]] = [:]

  init(folder: SyncFolder, appBundle: AppBundle) {
    self.folder = folder
    self.appBundle = appBundle
  }

  func attach(webView: WKWebView, presenter: UIViewController) {
    self.webView = webView
    self.presenter = presenter
    folder.startWatching { [weak self] in
      self?.notifyChanged()
    }
    folder.retryPendingIntentUploads()
  }

  /// Tells the UI something changed on the iCloud side.
  func notifyChanged() {
    webView?.evaluateJavaScript("window.__quuuBridge && window.__quuuBridge.changed()")
  }

  /** On return to foreground, resend intents that exist only on this device. */
  func retryPendingIntents() {
    folder.retryPendingIntentUploads()
  }

  /// Tells the UI a delivery download is running. **Never download 2.8MB silently.**
  func notifyProgress(active: Bool, ratio: Double?) {
    let value = ratio.map { String(format: "%.4f", $0) } ?? "null"
    webView?.evaluateJavaScript(
      "window.__quuuBridge && window.__quuuBridge.progress(\(active), \(value))"
    )
  }

  // MARK: - WKScriptMessageHandler

  func userContentController(
    _ userContentController: WKUserContentController, didReceive message: WKScriptMessage
  ) {
    guard
      let body = message.body as? [String: Any],
      let id = body["id"] as? Int,
      let method = body["method"] as? String
    else { return }
    let params = body["params"] as? [String: Any] ?? [:]

    switch method {
    /*
     * Exceptions from the UI. **No reply is sent** (id is 0; no call is waiting).
     * Exists solely so a black screen never goes unexplained
     */
    case "log":
      let text = params["text"] as? String ?? ""
      WebHost.log.error("web: \(text, privacy: .public)")

    /*
     * The UI came up. **The signal that confirms a delivery received from iCloud.**
     * If the next launch arrives without this, the delivery is discarded and we
     * fall back to the baked-in UI
     */
    case "app.ready":
      appBundle.confirm()
      settle(id, ok: true, value: true)

    case "device.id":
      settle(id, ok: true, value: deviceId())

    case "folder.state":
      settle(id, ok: true, value: folderState())

    case "folder.request":
      requestAccess { [weak self] in
        guard let self else { return }
        self.settle(id, ok: true, value: self.folderState())
      }

    case "mac.sync", "snapshot.sync":
      folder.downloadLatest(
        [SyncFolder.Layout.snapshot, SyncFolder.Layout.receipts],
        required: [SyncFolder.Layout.snapshot]
      ) { [weak self] result in
        guard let self else { return }
        switch result {
        case .success:
          self.settle(id, ok: true, value: true)
        case .failure(let error):
          self.settle(id, ok: false, value: error.localizedDescription)
        }
      }

    case "intents.sync":
      folder.uploadPendingIntents { [weak self] result in
        guard let self else { return }
        switch result {
        case .success:
          self.settle(id, ok: true, value: true)
        case .failure(let error):
          self.settle(id, ok: false, value: error.localizedDescription)
        }
      }

    case "snapshot.read":
      read(SyncFolder.Layout.snapshot) { [weak self] outcome in
        self?.settleRead(id, outcome)
      }

    case "receipts.read":
      // Even when a stale copy reads fine, do not call it latest; ask for a sync for the next cycle.
      // A receipt that has not come down reads as none: the intents it answers simply stay pending
      read(SyncFolder.Layout.receipts, refreshing: true) { [weak self] outcome in
        self?.settle(id, ok: true, value: outcome.text)
      }

    case "detail.read":
      guard let taskId = params["taskId"] as? String else {
        settle(id, ok: false, value: "missing taskId")
        return
      }
      read("\(SyncFolder.Layout.details)/\(taskId).json") { [weak self] outcome in
        self?.settleRead(id, outcome)
      }

    case "intents.list":
      settle(id, ok: true, value: folder.list(SyncFolder.Layout.intents))

    case "intents.read":
      guard let name = params["name"] as? String, isSafeName(name) else {
        settle(id, ok: false, value: "invalid name")
        return
      }
      // Our own file: it never lives only in iCloud, so absent and unreadable both read as none
      settle(id, ok: true, value: folder.read("\(SyncFolder.Layout.intents)/\(name)").text)

    case "intents.write":
      guard
        let name = params["name"] as? String, isSafeName(name),
        let body = params["body"] as? String
      else {
        settle(id, ok: false, value: "missing name or body")
        return
      }
      folder.write("\(SyncFolder.Layout.intents)/\(name)", body) { [weak self] result in
        guard let self else { return }
        switch result {
        case .success:
          self.settle(id, ok: true, value: nil)
        case .failure(let error):
          self.settle(id, ok: false, value: error.localizedDescription)
        }
      }

    case "intents.remove":
      guard let name = params["name"] as? String, isSafeName(name) else {
        settle(id, ok: false, value: "invalid name")
        return
      }
      folder.remove("\(SyncFolder.Layout.intents)/\(name)")
      settle(id, ok: true, value: nil)

    default:
      settle(id, ok: false, value: "unknown method: \(method)")
    }
  }

  // MARK: - Internals

  /// Reads one of the Mac's files off the main thread and hands the outcome back on it.
  private func read(
    _ relative: String,
    refreshing: Bool = false,
    _ completion: @escaping (SyncFolder.ReadOutcome) -> Void
  ) {
    if inFlight[relative] != nil {
      inFlight[relative]?.append(completion)
      return
    }
    inFlight[relative] = [completion]
    readQueue.async { [folder] in
      let outcome = folder.read(relative, refreshing: refreshing)
      DispatchQueue.main.async { [weak self] in
        guard let self else { return }
        let waiting = self.inFlight.removeValue(forKey: relative) ?? []
        for done in waiting { done(outcome) }
      }
    }
  }

  /**
   Answers a read of a file the Mac writes. **The screen must be able to tell "absent" from
   "iCloud has it, this iPhone could not read it."**

   Absent is null (the Mac has not written it). Unavailable is a refusal carrying the reason,
   so a screen never says "waiting for the Mac" while the file is sitting in iCloud
   (that actually happened). A screen older than this refusal shows it as a failed load with
   the same reason, which is still the truth.
   */
  private func settleRead(_ id: Int, _ outcome: SyncFolder.ReadOutcome) {
    switch outcome {
    case .content(let text):
      settle(id, ok: true, value: text)
    case .absent:
      settle(id, ok: true, value: nil)
    case .unavailable(let reason):
      settle(id, ok: false, value: reason)
    }
  }

  /// Device identity. Needed to keep intent ordering per device.
  ///
  /// `identifierForVendor` changes when the app is deleted, but the only harm in
  /// a change is **one device's intents splitting into two streams** — and after
  /// a delete, splitting is correct.
  private func deviceId() -> String {
    let key = "quuu.deviceId"
    if let saved = UserDefaults.standard.string(forKey: key) { return saved }
    let id = UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
    UserDefaults.standard.set(id, forKey: key)
    return id
  }

  private func folderState() -> [String: Any] {
    [
      "configured": folder.isConfigured,
      "name": folder.displayName,
      "readable": folder.isReadable
    ]
  }

  /** Presents the permission sheet. **Not a choice** — the destination is fixed. */
  private func requestAccess(completion: @escaping () -> Void) {
    guard let presenter else {
      completion()
      return
    }
    let picker = FolderPicker { [weak self] url in
      if let url { self?.folder.adopt(url) }
      self?.picker = nil
      completion()
    }
    // Keep it alive until picking ends (the delegate is held weakly)
    self.picker = picker
    presenter.present(picker.controller, animated: true)
  }

  /// **Reject `/` and `..`.** If a name from the UI could escape the folder,
  /// anything outside the handoff folder becomes readable and writable.
  private func isSafeName(_ name: String) -> Bool {
    !name.isEmpty && !name.contains("/") && !name.contains("..") && !name.hasPrefix(".")
  }

  private func settle(_ id: Int, ok: Bool, value: Any?) {
    let payload: String
    if let value {
      let wrapped = ["v": value]
      guard
        let data = try? JSONSerialization.data(withJSONObject: wrapped),
        let json = String(data: data, encoding: .utf8)
      else {
        payload = "null"
        webView?.evaluateJavaScript("window.__quuuBridge.settle(\(id), false, 'could not encode reply')")
        return
      }
      payload = "(\(json)).v"
    } else {
      payload = "null"
    }
    webView?.evaluateJavaScript("window.__quuuBridge.settle(\(id), \(ok), \(payload))")
  }
}
