export function githubAppJwt(appId: string, pem: string, nowMs?: number): string
export function writeGitHubHosts(configDir: string, user: string, token: string): void
export function refreshDelay(expiresAt: number, nowMs?: number): number
export function run(): Promise<void>

/** Where the private key is kept: the macOS Keychain service, or a DPAPI-protected file on Windows. */
export type GitHubAppKeyStore = { keychainService: string; keyFile?: undefined } | { keyFile: string; keychainService?: undefined }
export function issueToken(config: { appId: string; repository: string; apiVersion: string } & GitHubAppKeyStore, signal: AbortSignal): Promise<{ token: string; expiresAt: number }>
export const DPAPI_UNPROTECT: string
export const DPAPI_PROTECT: string
export function powershellPath(): string
