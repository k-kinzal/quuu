/** Native CLI syntax. No Quuu state, persistence, scheduling or conversation types. */
export type PromptStyle =
  | { kind: 'positional' }
  | { kind: 'attached'; flags: string[]; as: string }
  | { kind: 'value' }
  | { kind: 'bare' }
export interface CliDriver {
  command: string
  name: string
  resume(sessionId: string): string[]
  prompt: PromptStyle
  argsTemplate: string[]
  resumeArgsTemplate: string[]
}
