export function githubAppJwt(appId: string, pem: string, nowMs?: number): string
export function writeGitHubHosts(configDir: string, user: string, token: string): void
export function refreshDelay(expiresAt: number, nowMs?: number): number
export function run(): Promise<void>
