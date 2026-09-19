import { BrowserWindow } from 'electron'
import { eventSchemas, type EventPayloads } from '../../preload/events.js'

export function sendEvent<K extends keyof EventPayloads>(owner: BrowserWindow, channel: K, payload: EventPayloads[K]): void {
  if (!owner.isDestroyed()) owner.webContents.send(channel, eventSchemas[channel].parse(payload))
}

/** One notification is checked against the contract once, and that value goes to each window. */
export function broadcast<K extends keyof EventPayloads>(channel: K, payload: EventPayloads[K]): void {
  const value = eventSchemas[channel].parse(payload)
  for (const owner of BrowserWindow.getAllWindows()) {
    if (!owner.isDestroyed()) owner.webContents.send(channel, value)
  }
}
