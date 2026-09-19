import Foundation
import OSLog

/// The layer that reads and writes the iCloud Drive folder. **No decisions live here.**
///
/// The destination is hardcoded to `iCloud Drive/Quuu`. **Never a user choice.**
/// But iOS will not let us outside the sandbox without permission, so the OS asks
/// once on first run (`FolderPicker` — permission, not selection).
/// The grant is carried over as a bookmark, so from then on launching is enough.
///
/// Removing the permission entirely would need a dedicated iCloud container,
/// but Apple does not grant the iCloud capability to a Personal (free) Team.
///
/// The etiquette for carrying the grant over:
///
/// | What | Why |
/// |------|-----|
/// | security-scoped bookmark | the picked grant dies when the app exits; a bookmark carries it over |
/// | `startAccessingSecurityScopedResource` | enter the grant **once, for the folder, and hold it**. Pairs around each operation raced once reads left the main thread: one side's `stop` revoked the access another side was reading under, and the file looked absent (that actually happened) |
/// | `NSFileCoordinator` | never read while the other side (file provider) is mid-write |
/// | `NSMetadataQuery` | learn about changes; files whose content has not come down show up here too |
/// | `startDownloadingUbiquitousItem` | fetch files whose content was evicted |
final class SyncFolder {
  /// Handoff layout. Same shape as `LAYOUT` in `@quuu/sync`.
  enum Layout {
    static let snapshot = "mac/snapshot.json"
    static let receipts = "mac/receipts.json"
    static let details = "mac/tasks"
    static let intents = "phone/intents"
    /// The web UI itself (written by the Mac). Kept in step with `LAYOUT` in `@quuu/sync`
    static let app = "app"
    static let appManifest = "app/manifest.json"
    /// The whole UI as one file (concatenated in manifest order, raw deflate)
    static func appBundle(_ build: String) -> String { "app/\(build)/bundle.bin" }
  }

  private static let bookmarkKey = "quuu.syncFolder.bookmark"

  private var root: URL?
  /// Whether we are inside the folder's grant (left only when the folder changes or we go away)
  private var accessOpen = false
  private var query: NSMetadataQuery?
  private var onChange: (() -> Void)?
  /** Serializes sync requests so operations never overlap on the same item. */
  private let syncQueue = DispatchQueue(label: "net.kinzal.quuu.sync", qos: .userInitiated)
  /// What each file last read as, so the log shows changes and not every 10-second re-read
  private var lastOutcomes: [String: String] = [:]
  private let outcomeLock = NSLock()

  init() {
    root = restoreBookmark()
    enterGrant()
  }

  deinit {
    leaveGrant()
  }

  // MARK: - Folder selection

  var isConfigured: Bool { root != nil }

  var displayName: String { root?.lastPathComponent ?? "" }

  /// Whether the folder reads right now. False when the bookmark went stale (folder deleted or moved).
  var isReadable: Bool {
    guard let root else { return false }
    return FileManager.default.isReadableFile(atPath: root.path)
  }

  /// Name of the handoff folder. The Mac creates it at the iCloud Drive root.
  static let folderName = "Quuu"

  /**
   Remembers the picked folder. **Carried over as a bookmark** (the grant dies on exit).

   If what was picked is iCloud Drive itself (or another parent), take the `Quuu`
   folder inside it. Without a dedicated iCloud container, pointing at the location
   rests on one human tap — so **make either choice work**, and never let a mispick
   silently stop syncing.
   */
  func adopt(_ picked: URL) {
    leaveGrant()
    let opened = picked.startAccessingSecurityScopedResource()

    var url = picked
    if picked.lastPathComponent != Self.folderName {
      let inside = picked.appendingPathComponent(Self.folderName, isDirectory: true)
      // Create if missing (iPhone launched first; the Mac writes to the same spot later)
      if !FileManager.default.fileExists(atPath: inside.path) {
        try? FileManager.default.createDirectory(at: inside, withIntermediateDirectories: true)
      }
      if FileManager.default.fileExists(atPath: inside.path) { url = inside }
    }

    let data = try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
    // Leave the picked grant before entering ours: on the same URL, a later `stop` would revoke it
    if opened { picked.stopAccessingSecurityScopedResource() }
    if let data {
      UserDefaults.standard.set(data, forKey: Self.bookmarkKey)
    }
    /*
     * Enter through the bookmark, not the picked URL. When `Quuu` sits inside what was
     * picked, the child URL carries no grant of its own; only a URL resolved from its
     * bookmark can be entered. Until now that case read nothing until the next launch
     */
    var stale = false
    root = data.flatMap {
      try? URL(resolvingBookmarkData: $0, options: [], relativeTo: nil, bookmarkDataIsStale: &stale)
    } ?? url
    enterGrant()
    ensureSkeleton()
    startWatching()
  }

  private func restoreBookmark() -> URL? {
    guard let data = UserDefaults.standard.data(forKey: Self.bookmarkKey) else {
      WebHost.log.info("iCloud: no bookmark (first run)")
      return nil
    }
    var stale = false
    guard
      let url = try? URL(
        resolvingBookmarkData: data,
        options: [],
        relativeTo: nil,
        bookmarkDataIsStale: &stale
      )
    else {
      // Drop a bookmark that will not resolve. Keeping it strands us in "configured but unreadable"
      WebHost.log.error("iCloud: cannot resolve bookmark; asking again")
      UserDefaults.standard.removeObject(forKey: Self.bookmarkKey)
      return nil
    }
    /*
     * Refresh a stale bookmark. It can only be made **from inside the grant**
     * (calling `bookmarkData()` outside yields a bookmark that resolves but opens nothing).
     */
    if stale {
      let opened = url.startAccessingSecurityScopedResource()
      defer { if opened { url.stopAccessingSecurityScopedResource() } }
      if let fresh = try? url.bookmarkData() {
        UserDefaults.standard.set(fresh, forKey: Self.bookmarkKey)
      }
    }
    WebHost.log.info("iCloud: restored from bookmark \(url.lastPathComponent, privacy: .public)")
    return url
  }

  // MARK: - Entering and leaving the grant

  /**
   Enters the folder's grant and stays. **One grant, held for as long as we have the folder.**

   The grant is process-wide and not counted: a `stop` by whoever finishes first revokes
   it for everyone. Entering and leaving around each operation was safe only while every
   operation ran on the main thread, one after another. With reads on their own queue, the
   main thread's quick `intents.list` stopped the grant under a read in progress, the read
   failed with permission denied, and `mac/snapshot.json` looked absent on a phone whose
   iCloud was fully synced (that actually happened). Holding it is one kernel resource,
   not a leak; what exhausts the quota is entering again and again without leaving.
   */
  private func enterGrant() {
    guard let root, !accessOpen else { return }
    accessOpen = root.startAccessingSecurityScopedResource()
    if !accessOpen {
      WebHost.log.error("iCloud: could not enter the folder's grant")
    }
  }

  private func leaveGrant() {
    if accessOpen, let root { root.stopAccessingSecurityScopedResource() }
    accessOpen = false
  }

  // MARK: - Reading and writing

  /// What one read found. **"Absent" and "not here yet" are different states.**
  ///
  /// One `nil` for both sent the screen looking at the wrong machine: with the Mac long done
  /// and iCloud synced, a phone that had not brought the content down kept saying it was
  /// waiting for the Mac (that actually happened, outside). The screen words each case;
  /// this only tells them apart.
  enum ReadOutcome {
    /// Read in full
    case content(String)
    /// Nothing under that name, not even iCloud's stand-in. The writer has not placed it
    case absent
    /// iCloud knows the file but its content could not be read here — still coming down,
    /// or the fetch failed. Carries the reason
    case unavailable(String)

    /// For callers that only need text (absent and unavailable both read as nil)
    var text: String? {
      if case .content(let text) = self { return text }
      return nil
    }
  }

  /// Reads. If the content has not come down yet, requests the fetch and reports it as
  /// `unavailable` (read on the next cycle). `refreshing` also starts a sync with the
  /// cloud copy even when a stale local copy was readable.
  /// **Distinguish "absent" from "not here yet."**
  func read(_ relative: String, refreshing: Bool = false) -> ReadOutcome {
    guard let root else { return .absent }
    let outcome = readOutcome(root.appendingPathComponent(relative), refreshing: refreshing)
    note(relative, outcome)
    return outcome
  }

  private func readOutcome(_ url: URL, refreshing: Bool) -> ReadOutcome {
    var content: String?
    var readError: Error?
    var coordError: NSError?
    NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordError) { target in
      do {
        content = try String(contentsOf: target, encoding: .utf8)
      } catch {
        readError = error
      }
    }
    if let content {
      if refreshing { requestDownload(url) }
      return .content(content)
    }
    requestDownload(url)
    /*
     * The coordinator itself refusing is the download failing (offline, a paused File
     * Provider). Keep its words: they are the only clue a person gets outside
     */
    if let coordError {
      return .unavailable("Could not read from iCloud: \(coordError.localizedDescription)")
    }
    if hasPlaceholder(url) {
      return .unavailable("Not downloaded from iCloud to this iPhone yet")
    }
    if let readError, FileManager.default.fileExists(atPath: url.path) {
      return .unavailable("Could not read the file: \(readError.localizedDescription)")
    }
    return .absent
  }

  /// Logs a file's outcome when it changes. **Never a black screen with no reason recorded** —
  /// a phone that reads nothing must leave a line saying what it saw.
  private func note(_ relative: String, _ outcome: ReadOutcome) {
    let kind: String
    switch outcome {
    case .content(let text): kind = "content (\(text.utf8.count) bytes)"
    case .absent: kind = "absent"
    case .unavailable(let reason): kind = "unavailable: \(reason)"
    }
    outcomeLock.lock()
    let changed = lastOutcomes[relative] != kind
    if changed { lastOutcomes[relative] = kind }
    outcomeLock.unlock()
    if changed {
      WebHost.log.notice("iCloud: \(relative, privacy: .public) → \(kind, privacy: .public)")
    }
  }

  /// Whether iCloud left its stand-in (`.<name>.icloud`) for content that is not on this device.
  private func hasPlaceholder(_ url: URL) -> Bool {
    let placeholder = url.deletingLastPathComponent()
      .appendingPathComponent(".\(url.lastPathComponent).icloud")
    return FileManager.default.fileExists(atPath: placeholder.path)
  }

  /// Writes. **Writes to a temp file, then swaps it in.**
  /// A direct write can hand the other side half a file.
  func write(
    _ relative: String,
    _ body: String,
    completion: @escaping (Result<Void, Error>) -> Void
  ) {
    guard let root else {
      finishWrite(.failure(SyncFolderError("Cannot open the iCloud folder")), completion)
      return
    }

    syncQueue.async {
      let url = root.appendingPathComponent(relative)

      do {
        try self.writeLocal(url, body)
      } catch {
        self.finishWrite(
          .failure(SyncFolderError("Could not write to iCloud: \(error.localizedDescription)")),
          completion
        )
        return
      }

      /*
       * Landing locally does not count as "sent."
       * iOS 26 can explicitly ask the File Provider to upload the local version,
       * so wait for completion before replying to the UI. On failure keep the file,
       * so the same intent can be resent at the next launch or resync.
       */
      self.requestUpload(url) { error in
        if let error {
          self.finishWrite(
            .failure(SyncFolderError("Could not send to iCloud: \(error.localizedDescription)")),
            completion
          )
        } else {
          self.finishWrite(.success(()), completion)
        }
      }
    }
  }

  /** Inside the coordination, only write. Waiting on the upload happens after leaving it. */
  private func writeLocal(_ url: URL, _ body: String) throws {
    try FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )

    var operationError: Error?
    var coordinationError: NSError?
    NSFileCoordinator().coordinate(writingItemAt: url, options: .forReplacing, error: &coordinationError) {
      target in
      let tmp = target.appendingPathExtension("tmp")
      do {
        try body.write(to: tmp, atomically: false, encoding: .utf8)
        if FileManager.default.fileExists(atPath: target.path) {
          _ = try FileManager.default.replaceItemAt(target, withItemAt: tmp)
        } else {
          try FileManager.default.moveItem(at: tmp, to: target)
        }
      } catch {
        try? FileManager.default.removeItem(at: tmp)
        operationError = error
      }
    }
    if let operationError { throw operationError }
    if let coordinationError { throw coordinationError }
  }

  private func finishWrite(
    _ result: Result<Void, Error>,
    _ completion: @escaping (Result<Void, Error>) -> Void
  ) {
    DispatchQueue.main.async { completion(result) }
  }

  @discardableResult
  /// Reads raw bytes (web deliveries mix in images and fonts, so no string decode).
  func readData(_ relative: String) -> Data? {
    guard let root else { return nil }
    let url = root.appendingPathComponent(relative)
    var result: Data?
    var coordError: NSError?
    NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordError) { target in
      result = try? Data(contentsOf: target)
    }
    if result == nil { requestDownload(url) }
    return result
  }

  func remove(_ relative: String) -> Bool {
    guard let root else { return false }
    let url = root.appendingPathComponent(relative)
    var ok = false
    var coordError: NSError?
    NSFileCoordinator().coordinate(writingItemAt: url, options: .forDeleting, error: &coordError) {
      target in
      ok = (try? FileManager.default.removeItem(at: target)) != nil
    }
    return ok
  }

  /// Lists entries. Files not yet downloaded appear as `.name.icloud`, so map them back to real names.
  func list(_ relativeDir: String) -> [String] {
    guard let root else { return [] }
    let dir = root.appendingPathComponent(relativeDir)
    let entries =
      (try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []
    var names = Set<String>()
    for entry in entries {
      if entry.hasSuffix(".tmp") { continue }
      if entry.hasPrefix("."), entry.hasSuffix(".icloud") {
        let real = String(entry.dropFirst().dropLast(".icloud".count))
        requestDownload(dir.appendingPathComponent(real))
        names.insert(real)
        continue
      }
      if entry.hasPrefix(".") { continue }
      names.insert(entry)
    }
    return names.sorted()
  }

  /// Creates only the skeleton this side writes. `mac/` is created by the Mac.
  private func ensureSkeleton() {
    guard let root else { return }
    try? FileManager.default.createDirectory(
      at: root.appendingPathComponent(Layout.intents),
      withIntermediateDirectories: true
    )
  }

  /// Requests the content. **Does not wait for a reply** (readable by the next cycle is enough).
  private func requestDownload(_ url: URL) {
    try? FileManager.default.startDownloadingUbiquitousItem(at: url)
  }

  /**
   * Actively asks iCloud to sync and waits until the local copy is the latest.
   *
   * On iOS 26 the server version is fetched explicitly. Before that, call
   * `startDownloadingUbiquitousItem` and confirm `.current` before replying to the
   * UI. The automatic 10-second re-read never waits on this; only a human-pressed
   * resync uses it.
   */
  func downloadLatest(
    _ relatives: [String],
    required: Set<String> = [],
    timeout: TimeInterval = 60,
    completion: @escaping (Result<Void, Error>) -> Void
  ) {
    guard let root else {
      completion(.failure(SyncFolderError("Cannot open the iCloud folder")))
      return
    }

    syncQueue.async {
      var pending: [URL] = []
      for relative in relatives {
        let url = root.appendingPathComponent(relative)
        // Receipts do not exist yet in an environment never operated from the iPhone.
        // A missing non-required file must not fail the whole sync.
        if !required.contains(relative), !FileManager.default.fileExists(atPath: url.path) {
          continue
        }
        pending.append(url)
      }

      let finish: (Result<Void, Error>) -> Void = { result in
        self.finishDownload(result, completion)
      }
      if pending.isEmpty {
        finish(.success(()))
        return
      }
      let deadline = Date().addingTimeInterval(timeout)

      /*
       * On iOS 26, `startDownloadingUbiquitousItem` can keep reporting a stale copy
       * as `.current` without ever checking the server. The newer API asks the
       * server for its version explicitly and, unless syncing is paused, replaces
       * the local copy. Whether it also brings down the content of a file this device
       * never had is not something to rely on, so the download-and-wait still runs
       * after it: on a copy that is already current it returns at once. Without it, a
       * re-sync could end in success while the file stayed a stand-in, and the next read
       * found nothing again.
       */
      if #available(iOS 26.0, *) {
        self.fetchLatestRemote(pending[...]) { error in
          if let error {
            finish(
              .failure(
                SyncFolderError(
                  "Could not fetch the latest version from iCloud: \(error.localizedDescription)"
                )
              )
            )
            return
          }
          self.syncQueue.async { finish(self.waitUntilDownloaded(pending, deadline: deadline)) }
        }
        return
      }

      finish(self.waitUntilDownloaded(pending, deadline: deadline))
    }
  }

  /// Asks iCloud for the content of each item and waits until every local copy is current.
  /// Blocks the calling queue until then, or until the deadline.
  private func waitUntilDownloaded(_ urls: [URL], deadline: Date) -> Result<Void, Error> {
    for url in urls {
      do {
        try FileManager.default.startDownloadingUbiquitousItem(at: url)
      } catch {
        return .failure(
          SyncFolderError("Could not request a download from iCloud: \(error.localizedDescription)")
        )
      }
    }

    let keys: Set<URLResourceKey> = [
      .ubiquitousItemDownloadingStatusKey,
      .ubiquitousItemDownloadingErrorKey
    ]
    var pending = urls
    var lastStatusError: Error?

    while Date() < deadline {
      lastStatusError = nil
      var waiting: [URL] = []
      for var url in pending {
        do {
          // `URL` caches resource values. Waiting on the same run loop here,
          // an uncleared cache would show the first `downloaded` status for the full 60 seconds.
          for key in keys { url.removeCachedResourceValue(forKey: key) }
          let values = try url.resourceValues(forKeys: keys)
          if let error = values.ubiquitousItemDownloadingError {
            return .failure(
              SyncFolderError("Could not download from iCloud: \(error.localizedDescription)")
            )
          }
          if values.ubiquitousItemDownloadingStatus != .current {
            waiting.append(url)
          }
        } catch {
          // The URL is briefly unreadable while a placeholder becomes the real file.
          // Do not fail on the spot; keep re-reading status until the deadline.
          lastStatusError = error
          waiting.append(url)
        }
      }
      if waiting.isEmpty { return .success(()) }
      pending = waiting
      Thread.sleep(forTimeInterval: 0.25)
    }

    let suffix = lastStatusError.map { ": \($0.localizedDescription)" } ?? ""
    return .failure(
      SyncFolderError("Timed out fetching the latest version from iCloud\(suffix)")
    )
  }

  /// Asks the server for the current version of each item in turn. Reports the first failure.
  @available(iOS 26.0, *)
  private func fetchLatestRemote(
    _ pending: ArraySlice<URL>,
    completion: @escaping (Error?) -> Void
  ) {
    guard let url = pending.first else {
      completion(nil)
      return
    }

    FileManager.default.fetchLatestRemoteVersionOfItem(at: url) { [weak self] _, error in
      guard let self else {
        completion(SyncFolderError("The sync folder went away"))
        return
      }
      if let error {
        completion(error)
        return
      }
      self.fetchLatestRemote(pending.dropFirst(), completion: completion)
    }
  }

  private func finishDownload(
    _ result: Result<Void, Error>,
    _ completion: @escaping (Result<Void, Error>) -> Void
  ) {
    DispatchQueue.main.async { completion(result) }
  }

  /**
   * Sends every intent still on the device to iCloud.
   *
   * A failed send at creation time never deletes the intent file itself. Running
   * this at launch and on manual resync recovers them after radio loss or a
   * File Provider pause.
   */
  func uploadPendingIntents(completion: @escaping (Result<Void, Error>) -> Void) {
    let names = list(Layout.intents).filter { $0.hasSuffix(".json") }
    if names.isEmpty {
      DispatchQueue.main.async { completion(.success(())) }
      return
    }

    let group = DispatchGroup()
    let lock = NSLock()
    var firstError: Error?

    for name in names {
      group.enter()
      uploadStored("\(Layout.intents)/\(name)") { error in
        if let error {
          lock.lock()
          if firstError == nil { firstError = error }
          lock.unlock()
        }
        group.leave()
      }
    }

    group.notify(queue: .main) {
      if let firstError {
        completion(.failure(SyncFolderError("Could not send to iCloud: \(firstError.localizedDescription)")))
      } else {
        completion(.success(()))
      }
    }
  }

  /** Recovery at launch. Failures go to the log; neither the UI nor the launch is blocked. */
  func retryPendingIntentUploads() {
    uploadPendingIntents { result in
      if case .failure(let error) = result {
        WebHost.log.error("iCloud: cannot resend pending intents: \(error.localizedDescription, privacy: .public)")
      }
    }
  }

  private func uploadStored(_ relative: String, completion: @escaping (Error?) -> Void) {
    guard let root else {
      completion(SyncFolderError("Cannot open the iCloud folder"))
      return
    }
    requestUpload(root.appendingPathComponent(relative), completion: completion)
  }

  /**
   * iOS 26 can explicitly ask the File Provider to upload. Before that, fall back
   * to `startDownloadingUbiquitousItem`, whose etiquette syncs an existing local
   * version with the cloud (intents are new files unique per device, so no conflicts).
   */
  private func requestUpload(_ url: URL, completion: @escaping (Error?) -> Void) {
    if #available(iOS 26.0, *) {
      FileManager.default.uploadLocalVersionOfUbiquitousItem(
        at: url,
        withConflictResolutionPolicy: .conflictPolicyDefault
      ) { _, error in
        completion(error)
      }
      return
    }
    do {
      try FileManager.default.startDownloadingUbiquitousItem(at: url)
      completion(nil)
    } catch {
      completion(error)
    }
  }

  // MARK: - Change notifications

  /// Reports when anything changes on the iCloud side.
  ///
  /// `NSMetadataQuery` is used because it **also sees files whose content has not
  /// come down**. Watching the directory with `DispatchSource` stays blind until
  /// the content arrives.
  func startWatching(onChange: (() -> Void)? = nil) {
    if let onChange { self.onChange = onChange }
    guard let root else { return }
    stopWatching()

    let query = NSMetadataQuery()
    query.searchScopes = [NSMetadataQueryUbiquitousDocumentsScope, root]
    query.predicate = NSPredicate(format: "%K LIKE '*'", NSMetadataItemFSNameKey)
    // A burst of downloads fires notification after notification, so space them out
    query.notificationBatchingInterval = 1.0

    for name in [
      NSNotification.Name.NSMetadataQueryDidFinishGathering,
      NSNotification.Name.NSMetadataQueryDidUpdate
    ] {
      NotificationCenter.default.addObserver(
        forName: name, object: query, queue: .main
      ) { [weak self] _ in
        self?.onChange?()
      }
    }

    self.query = query
    query.start()
  }

  /// How far iCloud has downloaded that one file (0–1). nil when unknown.
  ///
  /// Only `NSMetadataQuery` can tell. Reading through `NSFileCoordinator` does not
  /// return until the download finishes, so **this is peeked at behind it**.
  /// `results` must be touched on the main thread, so hop there.
  func downloadedRatio(_ relative: String) -> Double? {
    guard let root else { return nil }
    let target = root.appendingPathComponent(relative).standardizedFileURL.path
    let read: () -> Double? = { [weak self] in
      guard let query = self?.query else { return nil }
      for case let item as NSMetadataItem in query.results {
        guard
          let url = item.value(forAttribute: NSMetadataItemURLKey) as? URL,
          url.standardizedFileURL.path == target
        else { continue }
        let status = item.value(forAttribute: NSMetadataUbiquitousItemDownloadingStatusKey) as? String
        if status == NSMetadataUbiquitousItemDownloadingStatusCurrent { return 1 }
        if let percent = item.value(forAttribute: NSMetadataUbiquitousItemPercentDownloadedKey)
          as? NSNumber {
          return percent.doubleValue / 100
        }
        return nil
      }
      return nil
    }
    if Thread.isMainThread { return read() }
    return DispatchQueue.main.sync(execute: read)
  }

  func stopWatching() {
    if let query {
      query.stop()
      NotificationCenter.default.removeObserver(self, name: nil, object: query)
    }
    query = nil
  }
}

private struct SyncFolderError: LocalizedError {
  let errorDescription: String?

  init(_ message: String) {
    errorDescription = message
  }
}
