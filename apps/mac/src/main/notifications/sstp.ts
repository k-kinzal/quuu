import { createConnection } from 'node:net'
import type { ToastPayload } from '../snapshot.js'
import type { SstpScripts } from './types.js'

/** Values are speech, not Sakura Script: a task title must never become a command. */
function speech(value: string): string {
  return value.replace(/[\\%]/g, character => `\\_u[0x${character.charCodeAt(0).toString(16)}]`)
    .replace(/\r\n|\r|\n/g, '\\n').replace(/\0/g, '')
}

export function renderSstpScript(template: string, event: ToastPayload, title: string): string {
  const variables: Record<string, string> = {
    type: event.notificationKind ?? '', title, message: event.message, detail: event.detail ?? '',
    taskId: event.taskId ?? '', taskTitle: event.taskTitle ?? '',
    projectId: event.projectId ?? '', projectName: event.projectName ?? ''
  }
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (original: string, name: string) =>
    Object.hasOwn(variables, name) ? speech(variables[name]) : original
  ).replace(/\r\n|\r|\n/g, '\\n').replace(/\0/g, '')
}

export function selectSstpScript(scripts: SstpScripts, event: ToastPayload, title: string, random = Math.random): string | null {
  if (!event.notificationKind) return null
  const candidates = scripts[event.notificationKind].filter(script => script.trim())
  if (!candidates.length) return null
  return renderSstpScript(candidates[Math.floor(random() * candidates.length)], event, title)
}

/** One request per TCP connection, with a deadline even if the peer keeps trickling bytes. */
export function sendSstp(host: string, port: number, script: string, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port })
    let response = ''
    let settled = false
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      if (error) reject(error)
      else resolve()
    }
    const timer = setTimeout(() => finish(new Error('SSTP response timed out')), timeoutMs)
    socket.on('connect', () => socket.write([
      'SEND SSTP/1.4', 'Charset: UTF-8', 'Sender: Quuu',
      `Script: ${script.replace(/\r\n|\r|\n/g, '\\n').replace(/\0/g, '')}`,
      'Option: notranslate', '', ''
    ].join('\r\n'), 'utf8'))
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      response += chunk
      if (response.length > 16384) return finish(new Error('SSTP response is too large'))
      if (!response.includes('\r\n\r\n')) return
      const status = /^SSTP\/1\.\d+ (\d{3})(?: [^\r\n]*)?\r\n/.exec(response)
      if (!status) return finish(new Error('Invalid SSTP response'))
      if (Number(status[1]) < 200 || Number(status[1]) >= 300) return finish(new Error(`SSTP rejected the notification (${status[1]})`))
      finish()
    })
    socket.on('error', finish)
    socket.on('end', () => finish(new Error('SSTP connection ended before a complete response')))
    socket.on('close', () => finish(new Error('SSTP connection closed before a complete response')))
  })
}
