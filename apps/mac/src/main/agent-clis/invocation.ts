import { expandArgs, type TemplateVars } from './templating.js'
import type { CliDriver } from './types.js'

export interface InvocationRequest {
  command: string
  template: string[]
  vars: TemplateVars
}
export interface Invocation { command: string; args: string[] }

/** Preserve configured wrappers and argument templates; the driver supplies native defaults only. */
export function invocationFor(driver: CliDriver | null): (request: InvocationRequest) => Invocation {
  return ({ command, template, vars }) => ({ command: command || driver?.command || '', args: expandArgs(template, vars) })
}
