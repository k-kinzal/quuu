export function githubAppJwt(appId: string, pem: string, nowMs?: number): string
export function writeGitHubHosts(configDir: string, user: string, token: string): void
export function refreshDelay(expiresAt: number, nowMs?: number): number
export function run(): Promise<void>

export function issueToken(config: { appId: string; repository: string; keychainService: string; apiVersion: string }, signal: AbortSignal): Promise<{ token: string; expiresAt: number }>
