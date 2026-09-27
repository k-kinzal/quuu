# Quuu AI

![Platform: macOS | Windows](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-000000)
[![Download: Releases](https://img.shields.io/badge/download-Releases-181717?logo=github)](https://github.com/k-kinzal/quuu/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

> [!WARNING]
> Quuu is an application built by **kinzal, for kinzal**. External changes and pull
> requests are not accepted. Issues may describe bugs or feature requests, but they
> will not be addressed unless kinzal is personally affected by the problem or needs
> the feature.

Quuu brings AI coding agents into one desktop workspace on macOS and Windows. Queue work across projects,
let agents run unattended, then review the results and send follow-ups without
juggling terminals or losing track of sessions.

![Quuu in dark mode, with projects, queued tasks, an agent conversation, and run details side by side](docs/images/quuu-overview.png)

- **Run multiple agents:** Claude Code, Codex, Cursor, Grok, GitHub Copilot, Antigravity, and opencode.
- **Control the queue:** priorities, dependencies, concurrency limits, and automatic scheduling.
- **Keep work moving:** automatic fallback on rate limits; agent runs survive app restarts.
- **Review in context:** conversations, code changes, reports, and follow-ups. You decide when work is done.
- **Pick up anywhere:** import terminal sessions, resume them interactively, or review and queue work from iPhone via iCloud.

## Requirement

- macOS on Apple Silicon or Intel, or Windows 10 (1809) / 11 on x64.
- At least one supported agent CLI installed and authenticated.

The optional iPhone companion requires iOS 18+, iCloud Drive, and a local Xcode build.

## Install

### macOS

1. Download `Quuu-<version>-arm64.dmg` (Apple Silicon) or
   `Quuu-<version>-x64.dmg` (Intel) from [Releases](https://github.com/k-kinzal/quuu/releases).
2. Open the DMG and drag `Quuu.app` into **Applications**.
3. Open Quuu. If macOS blocks the first launch, go to
   **System Settings → Privacy & Security → Open Anyway**, then confirm **Open**
   ([Apple's instructions](https://support.apple.com/en-us/102445)).

### Windows

1. Download `Quuu-<version>-win-x64-setup.exe` from [Releases](https://github.com/k-kinzal/quuu/releases)
   and run it (or unzip `Quuu-<version>-win-x64.zip` and run `Quuu.exe`).
2. The build is unsigned: if SmartScreen stops it, choose **More info → Run anyway**.

Windows updates by installing a newer Release. Automatic updates and the GitHub App commit
identity are macOS-only; syncing with the iPhone needs iCloud for Windows.

Enable an agent in **Settings → Agents** and select it for your project to start
queueing work.

Certificate-signed Releases check for updates automatically. Downloaded updates apply
on the next launch, or through **Quuu → Restart to Update**. Local builds are excluded.
Ad-hoc builds require a manual download; see [automatic updates](docs/guide.md#automatic-mac-updates).

See the [guide](docs/guide.md) for configuration, development, and iPhone installation.

## License

[MIT](LICENSE)
