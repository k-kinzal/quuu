/**
 * Git by a fixed path on macOS, so a PATH a GUI launch happened to get cannot swap it for another.
 * Windows has no such fixed place (Git for Windows installs wherever it was told), so it is looked
 * up on PATH there.
 */
export const GIT = process.platform === 'win32' ? 'git' : '/usr/bin/git'
