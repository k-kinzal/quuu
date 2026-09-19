import UIKit
import UniformTypeIdentifiers

/**
 Asks the OS for permission to enter the iCloud handoff folder.

 **Not for choosing.** The destination is fixed at `iCloud Drive/Quuu`, and there
 is nothing for a person to decide. The sheet appears anyway because iOS will not
 let an app **touch a folder outside its sandbox without permission**.

 A dedicated iCloud container (`iCloud.net.kinzal.quuu`) would need no permission
 at all — both sides could resolve the same location from the identifier — but
 Apple **does not grant the iCloud capability to a Personal (free) Team**
 (`Personal development teams ... do not support the iCloud capability`).
 The moment we join the paid Developer Program, this entire file goes away.

 At the very least, **remove the act of choosing**: point `directoryURL` so the
 picker opens already inside the target folder, and the only human step is
 pressing "Open" once.
 */
final class FolderPicker: NSObject, UIDocumentPickerDelegate {
  let controller: UIDocumentPickerViewController
  private let completion: (URL?) -> Void

  init(completion: @escaping (URL?) -> Void) {
    self.completion = completion
    controller = UIDocumentPickerViewController(forOpeningContentTypes: [.folder])
    super.init()
    controller.delegate = self
    controller.allowsMultipleSelection = false
    // Open at the destination; no hunting around
    controller.directoryURL = Self.destination()
  }

  /**
   Where the picker opens.

   Points straight at `iCloud Drive/Quuu`. The app itself cannot read this path
   (hence the permission), but the sheet is drawn by another process (Files), so
   it works as a destination. If it does not resolve, the picker just lands at
   the iCloud Drive root — and either choice works, because `SyncFolder.adopt`
   finds the `Quuu` folder inside.
   */
  private static func destination() -> URL? {
    let cloud = URL(fileURLWithPath: "/private/var/mobile/Library/Mobile Documents/com~apple~CloudDocs")
    return cloud.appendingPathComponent(SyncFolder.folderName, isDirectory: true)
  }

  func documentPicker(
    _ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]
  ) {
    completion(urls.first)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    completion(nil)
  }
}
