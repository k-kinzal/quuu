import type { TerminalService } from './service.js'
import type { TerminalActionResult, TerminalSession } from './types.js'

export class TerminalOperations {
  constructor(private terminals: TerminalService, private workbenchPlace: (taskId: string) => { dir: string }) { }



  openWorkbenchTerminal(taskId: string, columns: number, rows: number): TerminalSession {
    const place = this.workbenchPlace(taskId)
    return this.terminals.openTerminal(place.dir, columns, rows)
  }



  sendWorkbenchTerminal(sessionId: string, input: string): TerminalActionResult {
    return this.terminals.terminalInput(sessionId, input)
  }



  resizeWorkbenchTerminal(
    sessionId: string,
    columns: number,
    rows: number
  ): TerminalActionResult {
    return this.terminals.resizeTerminal(sessionId, columns, rows)
  }



  runWorkbenchProjectTask(
    taskId: string,
    sessionId: string,
    projectTaskId: string
  ): TerminalActionResult {
    const place = this.workbenchPlace(taskId)
    return this.terminals.runProjectTask(sessionId, place.dir, projectTaskId)
  }



  closeWorkbenchTerminal(sessionId: string): void {
    this.terminals.closeTerminal(sessionId)
  }
}
