import type { JsonValue } from '@bufbuild/protobuf'

/** Shapes are generated with the .proto. They preserve missing, null, false and empty collections. */
export interface WireShape {
  kind: 'void' | 'value' | 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array' | 'union'
  fields?: Record<string, WireShape>
  required?: string[]
  items?: WireShape
  variants?: WireShape[]
  choices?: JsonValue[]
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object')
  return value as Record<string, unknown>
}

function matches(shape: WireShape, value: unknown): boolean {
  if (shape.choices && !shape.choices.includes(value as JsonValue)) return false
  switch (shape.kind) {
    case 'void': return value === undefined
    case 'value': return true
    case 'null': return value === null
    case 'string': case 'number': case 'boolean': return typeof value === shape.kind
    case 'array': return Array.isArray(value) && value.every(item => matches(shape.items!, item))
    case 'union': return shape.variants!.some(variant => matches(variant, value))
    case 'object': return value !== null && typeof value === 'object' && !Array.isArray(value) &&
      (shape.required ?? []).every(key => key in value) && Object.entries(shape.fields!).every(([key, child]) => !(key in value) || matches(child, object(value)[key]))
  }
}

export function encodeWire(shape: WireShape, value: unknown): JsonValue {
  switch (shape.kind) {
    case 'void': return {}
    case 'null': return 'NULL_VALUE'
    case 'object': return Object.fromEntries(Object.entries(object(value)).filter(([, val]) => val !== undefined).map(([key, val]) => {
      const field = shape.fields![key]
      if (!field) throw new Error(`Unknown field: ${key}`)
      return [key, encodeWire(field, val)]
    }))
    case 'array': {
      if (!Array.isArray(value)) throw new Error('Expected an array')
      return { items: value.map(item => encodeWire(shape.items!, item)) }
    }
    case 'union': {
      const index = shape.variants!.findIndex(variant => matches(variant, value))
      if (index < 0) throw new Error('Value does not match any contract variant')
      return { [`variant${index + 1}`]: encodeWire(shape.variants![index], value) }
    }
    default: return value as JsonValue
  }
}

export function decodeWire(shape: WireShape, value: JsonValue): unknown {
  switch (shape.kind) {
    case 'void': return undefined
    case 'null': return null
    case 'object': return Object.fromEntries(Object.entries(object(value)).map(([key, val]) => [key, decodeWire(shape.fields![key], val as JsonValue)]))
    case 'array': return ((object(value).items ?? []) as JsonValue[]).map(item => decodeWire(shape.items!, item))
    case 'union': {
      const record = object(value)
      const index = shape.variants!.findIndex((_, i) => `variant${i + 1}` in record)
      if (index < 0) throw new Error('Missing union variant')
      return decodeWire(shape.variants![index], record[`variant${index + 1}`] as JsonValue)
    }
    default: return value
  }
}
