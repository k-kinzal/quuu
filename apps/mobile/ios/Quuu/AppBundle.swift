import CryptoKit
import Foundation

/// Receives the web UI itself from iCloud. **So fixes ship without plugging in a cable.**
///
/// This app is a Swift shell plus a web UI, and almost everything worth fixing is
/// the web side. Needing a Mac connection for every one-character fix means an
/// **inconvenience noticed on the go stays broken until you get home**. The cable
/// is only for shell changes.
///
/// **No decisions are written in Swift.** Whether a delivery may go in (`checkApp`)
/// and whether to fetch it (`shouldInstall`) are rules owned by `@quuu/sync`; all
/// this does is read, verify, and install per those rules.
///
/// ```
///   receive    app/manifest.json → download the single bundle.bin → split and verify each file
///   install    copy into Application Support/web/<build>/ (never serve straight from iCloud)
///   try        used the next time the app opens; never swapped under a running page
///   confirm    once the UI comes up, it is "confirmed"; if it never does, discard it
/// ```
///
/// The last two are the point. **Installing a delivery whose UI never appears
/// leaves no way out until the cable is plugged in.** The baked-in UI is always
/// kept, so after one failed try we silently fall back to it.
final class AppBundle {
  /// The build currently installed (including one not yet tried)
  private static let installedKey = "quuu.app.installed"
  /// The build confirmed to have come up
  private static let confirmedKey = "quuu.app.confirmed"
  /// The build tried once. A second launch without confirmation means it never came up
  private static let triedKey = "quuu.app.tried"
  /// Builds that never came up. Never fetched again
  private static let failedKey = "quuu.app.failed"

  private let folder: SyncFolder
  private let store = UserDefaults.standard
  private let root: URL

  /// Streams whether a download is in progress to the UI. **Never download 2.8MB silently.**
  /// `ratio` is set only when iCloud reports it (indeterminate while unknown).
  var onProgress: ((_ active: Bool, _ ratio: Double?) -> Void)?
  private var watchdog: DispatchSourceTimer?

  init(folder: SyncFolder) {
    self.folder = folder
    let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    root = support.appendingPathComponent("web", isDirectory: true)
  }

  // MARK: - Serving

  /// The UI to use for this launch. May fall back to the baked-in one.
  ///
  /// **Decided exactly once per launch.** Swapping under an open page would mix
  /// already-loaded JS with new HTML.
  func resolveForLaunch() -> URL? {
    guard let build = store.string(forKey: Self.installedKey) else { return nil }
    let dir = root.appendingPathComponent(build, isDirectory: true)
    guard FileManager.default.fileExists(atPath: dir.appendingPathComponent("index.html").path)
    else {
      forget(build)
      return nil
    }

    if store.string(forKey: Self.confirmedKey) == build { return dir }

    // Second launch without confirmation: this UI never came up last time
    if store.string(forKey: Self.triedKey) == build {
      WebHost.log.error("Web delivery \(build, privacy: .public) never came up; falling back to baked-in UI")
      var failed = store.stringArray(forKey: Self.failedKey) ?? []
      failed.append(build)
      store.set(Array(failed.suffix(10)), forKey: Self.failedKey)
      forget(build)
      return nil
    }

    store.set(build, forKey: Self.triedKey)
    return dir
  }

  /// The UI itself reported that it came up.
  func confirm() {
    guard let build = store.string(forKey: Self.installedKey) else { return }
    guard store.string(forKey: Self.confirmedKey) != build else { return }
    store.set(build, forKey: Self.confirmedKey)
    WebHost.log.info("Web delivery \(build, privacy: .public) confirmed")
  }

  // MARK: - Receiving

  /// Picks up a new UI from iCloud if one has arrived. **Used from the next open.**
  ///
  /// Does nothing when incomplete (re-read on the next cycle).
  @discardableResult
  func syncFromCloud() -> Bool {
    guard let text = folder.read(SyncFolder.Layout.appManifest).text else { return false }
    guard let manifest = AppManifest(json: text) else { return false }

    let installed = store.string(forKey: Self.installedKey)
    let failed = store.stringArray(forKey: Self.failedKey) ?? []
    guard manifest.shouldInstall(installed: installed, failed: failed) else { return false }

    /*
     * From here on we download and unpack 2.8MB. **If we make the user wait, say so.**
     * `readData` does not return until the download finishes, so keep asking
     * iCloud for progress in the background (indeterminate when it cannot tell us)
     */
    report(true, nil)
    startWatching(bundle: SyncFolder.Layout.appBundle(manifest.build))
    defer {
      stopWatchingProgress()
      report(false, nil)
    }

    /*
     * The UI ships as a single file (measured: 375 files, 13.5MB → 2.8MB).
     * If it has not come down yet, `readData` has already requested the fetch
     */
    guard let packed = folder.readData(SyncFolder.Layout.appBundle(manifest.build)) else {
      return false
    }
    guard let blob = try? (packed as NSData).decompressed(using: .zlib) as Data else {
      WebHost.log.error("Cannot decompress web delivery")
      return false
    }

    // Split by `bytes` in manifest order and verify each file
    var bodies: [String: Data] = [:]
    var at = 0
    for file in manifest.files {
      guard at + file.bytes <= blob.count else { return false }
      let data = blob.subdata(in: at ..< (at + file.bytes))
      at += file.bytes
      guard SHA256.hash(data: data).map({ String(format: "%02x", $0) }).joined() == file.hash
      else {
        // Still in transit. Installing a partial copy would blank the next open
        WebHost.log.error("Web delivery hash mismatch: \(file.path, privacy: .public)")
        return false
      }
      bodies[file.path] = data
    }
    guard at == blob.count else { return false }

    report(true, 1)
    do {
      try install(build: manifest.build, bodies: bodies)
    } catch {
      WebHost.log.error("Cannot install web delivery: \(String(describing: error), privacy: .public)")
      return false
    }
    WebHost.log.info("Web delivery \(manifest.build, privacy: .public) received (used from next launch)")
    return true
  }

  private func install(build: String, bodies: [String: Data]) throws {
    let fm = FileManager.default
    let dir = root.appendingPathComponent(build, isDirectory: true)
    try? fm.removeItem(at: dir)
    for (path, data) in bodies {
      let file = dir.appendingPathComponent(path)
      try fm.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
      try data.write(to: file, options: .atomic)
    }
    store.set(build, forKey: Self.installedKey)
    store.removeObject(forKey: Self.triedKey)
    store.removeObject(forKey: Self.confirmedKey)

    // Never keep older builds
    for name in (try? fm.contentsOfDirectory(atPath: root.path)) ?? [] where name != build {
      try? fm.removeItem(at: root.appendingPathComponent(name))
    }
  }

  // MARK: - Progress

  private func report(_ active: Bool, _ ratio: Double?) {
    DispatchQueue.main.async { [weak self] in self?.onProgress?(active, ratio) }
  }

  /// Keeps asking iCloud for progress, but only while the download runs.
  private func startWatching(bundle: String) {
    stopWatchingProgress()
    let timer = DispatchSource.makeTimerSource(queue: .global(qos: .utility))
    timer.schedule(deadline: .now() + 0.4, repeating: 0.4)
    timer.setEventHandler { [weak self] in
      guard let self else { return }
      // Leave headroom for unpack and verify (download completion is not 1.0)
      let ratio = self.folder.downloadedRatio(bundle).map { $0 * 0.9 }
      self.report(true, ratio)
    }
    timer.resume()
    watchdog = timer
  }

  private func stopWatchingProgress() {
    watchdog?.cancel()
    watchdog = nil
  }

  private func forget(_ build: String) {
    try? FileManager.default.removeItem(at: root.appendingPathComponent(build, isDirectory: true))
    store.removeObject(forKey: Self.installedKey)
    store.removeObject(forKey: Self.triedKey)
    store.removeObject(forKey: Self.confirmedKey)
  }
}

/// The manifest. Parsed with the same rules as `parseAppManifest`.
struct AppManifest {
  struct File {
    let path: String
    let hash: String
    let bytes: Int
  }

  let build: String
  let files: [File]

  init?(json text: String) {
    guard
      let data = text.data(using: .utf8),
      let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let version = root["version"] as? Int,
      version == 1,
      let build = root["build"] as? String,
      !build.isEmpty,
      let raw = root["files"] as? [[String: Any]]
    else { return nil }

    var files: [File] = []
    for item in raw {
      guard
        let path = item["path"] as? String,
        let hash = item["hash"] as? String,
        let bytes = item["bytes"] as? Int
      else { continue }
      // Drop names pointing outside the manifest root (they become install paths as-is)
      guard !path.isEmpty, !path.hasPrefix("/"), !path.contains("..") else { continue }
      files.append(File(path: path, hash: hash, bytes: bytes))
    }
    guard files.contains(where: { $0.path == "index.html" }) else { return nil }

    self.build = build
    self.files = files
  }

  func shouldInstall(installed: String?, failed: [String]) -> Bool {
    build != installed && !failed.contains(build)
  }
}
