export const OUTPUT_HEAD_BYTES: number
export const OUTPUT_TAIL_BYTES: number
export const OUTPUT_MAX_BYTES: number
export const OUTPUT_PREFIX: string
export const OUTPUT_GAP: string
export class BoundedOutput {
  bytes: number
  append(chunk: Buffer | string): void
  snapshot(): Buffer
}
export function outputSnapshot(path: string): Buffer
export function writeOutputSnapshot(path: string, data: Buffer): void
