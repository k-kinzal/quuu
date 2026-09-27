import { tmpdir } from 'node:os'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { z } from 'zod'
import type { JsonValue } from '@bufbuild/protobuf'
import { operations } from '../src/api/catalog.js'
import type { WireShape } from '../src/api/wire.js'

const root = resolve(import.meta.dirname, '../../..')
const protoDir = join(root, 'apps/mac/proto')
const generated = join(root, 'apps/mac/src/api/generated')
const check = process.argv.includes('--check')
function write(path: string, value: string): void {
  if (check) {
    if (readFileSync(path, 'utf8') !== value) throw new Error(`Generated API is stale: ${path}. Run npm run api:generate.`)
  } else writeFileSync(path, value)
}
mkdirSync(protoDir, { recursive: true })
mkdirSync(generated, { recursive: true })
const numbersPath = join(protoDir, 'field-numbers.json')
let numbers: Record<string, Record<string, number>> = {}
try { numbers = JSON.parse(readFileSync(numbersPath, 'utf8')) as typeof numbers } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
}
interface Schema {
  type?: string
  properties?: Record<string, Schema>
  required?: string[]
  items?: Schema
  anyOf?: Schema[]
  oneOf?: Schema[]
  enum?: JsonValue[]
  const?: JsonValue
}
const messages: string[] = []
function message(name: string, fields: Array<{ key: string; type: string; repeated?: boolean }>, oneof = false): string {
  const ids = numbers[name] ??= {}
  for (const field of fields) ids[field.key] ??= Math.max(0, ...Object.values(ids)) + 1
  const removed = Object.keys(ids).filter(key => !fields.some(field => field.key === key))
  const reserved = removed.length ? `  reserved ${removed.map(key => ids[key]).join(', ')};\n  reserved ${removed.map(key => JSON.stringify(key)).join(', ')};\n` : ''
  const body = fields.map(field => `  ${oneof ? '' : field.repeated ? 'repeated ' : 'optional '}${field.type} ${field.key} = ${ids[field.key]};`).join('\n')
  messages.push(`message ${name} {\n${reserved}${oneof ? `  oneof kind {\n${body}\n  }` : body}\n}`)
  return name
}
function shape(schema: Schema, name: string): { type: string; shape: WireShape } {
  const variants = schema.anyOf ?? schema.oneOf
  if (variants) {
    const kinds = new Set(variants.map(item => item.type))
    if (kinds.size === 1 && ['string', 'number', 'integer', 'boolean'].includes(variants[0].type ?? '')) {
      return shape({ type: variants[0].type, enum: variants.flatMap(item => item.enum ?? (item.const !== undefined ? [item.const] : [])) }, name)
    }
    const children = variants.map((variant, i) => shape(variant, `${name}Variant${i + 1}`))
    return { type: message(name, children.map((child, i) => ({ key: `variant${i + 1}`, type: child.type })), true), shape: { kind: 'union', variants: children.map(child => child.shape) } }
  }
  const choices = schema.enum ?? (schema.const !== undefined ? [schema.const] : undefined)
  switch (schema.type) {
    case 'string': case 'boolean': case 'number': case 'integer': {
      const kind = schema.type === 'integer' ? 'number' : schema.type
      return { type: kind === 'number' ? 'double' : kind === 'boolean' ? 'bool' : 'string', shape: { kind, ...(choices?.length ? { choices } : {}) } }
    }
    case 'null': return { type: 'google.protobuf.NullValue', shape: { kind: 'null' } }
    case 'array': {
      const child = shape(schema.items ?? {}, `${name}Item`)
      return { type: message(name, [{ key: 'items', type: child.type, repeated: true }]), shape: { kind: 'array', items: child.shape } }
    }
    case 'object': {
      if (!schema.properties) return { type: 'google.protobuf.Value', shape: { kind: 'value' } }
      const fields = Object.entries(schema.properties).map(([key, value]) => ({ key, ...shape(value, `${name}${key[0].toUpperCase()}${key.slice(1)}`) }))
      return { type: message(name, fields), shape: { kind: 'object', fields: Object.fromEntries(fields.map(field => [field.key, field.shape])), required: schema.required ?? [] } }
    }
    default: return { type: 'google.protobuf.Value', shape: { kind: 'value' } }
  }
}
const definitions: Record<string, { method: string; input: WireShape; output: WireShape }> = {}
const methods: string[] = []
// Help must enumerate the complete API without initializing schemas or network SDKs.
write(join(generated, 'operations.ts'), `// Generated from the operation contract.\nexport const operationNames: string[] = ${JSON.stringify(operations().map(operation => operation.name), null, 2)}\n`)
for (const operation of operations()) {
  const method = operation.name.split('.').map(part => part[0].toUpperCase() + part.slice(1)).join('')
  const sides = (['input', 'output'] as const).map(side => {
    const name = `${method}${side === 'input' ? 'Request' : 'Response'}`
    if (operation[side] instanceof z.ZodVoid) { message(name, []); return { kind: 'void' } satisfies WireShape }
    const result = shape(z.toJSONSchema(operation[side], { unrepresentable: 'any', io: side === 'input' ? 'input' : 'output' }) as Schema, `${name}Value`)
    message(name, [{ key: 'value', type: result.type }])
    return result.shape
  })
  definitions[operation.name] = { method: method[0].toLowerCase() + method.slice(1), input: sides[0], output: sides[1] }
  methods.push(`  rpc ${method}(${method}Request) returns (${method}Response);`)
}
// Events and caller lifecycle are transport concerns. Every operation above comes from the app contract.
messages.push('message ConnectRequest {}', 'message ConnectResponse { string client_id = 1; }', 'message DisconnectRequest {}', 'message DisconnectResponse {}', 'message WatchRequest {}', 'message WatchResponse { string name = 1; google.protobuf.Value payload = 2; }')
methods.push('  rpc Connect(ConnectRequest) returns (ConnectResponse);', '  rpc Disconnect(DisconnectRequest) returns (DisconnectResponse);', '  rpc Watch(WatchRequest) returns (stream WatchResponse);')
write(join(protoDir, 'quuu.proto'), `// Generated from src/api/contract.ts. Run npm run api:generate.\nsyntax = "proto3";\npackage quuu.v1;\nimport "google/protobuf/struct.proto";\n\n${messages.join('\n\n')}\n\nservice Quuu {\n${methods.join('\n')}\n}\n`)
write(numbersPath, JSON.stringify(numbers, null, 2) + '\n')
write(join(generated, 'wire.ts'), `// Generated from the operation contract.\nimport type { WireShape } from '../wire.js'\nexport const wire: Record<string, { method: string; input: WireShape; output: WireShape }> = ${JSON.stringify(definitions, null, 2)}\n`)
const buf = join(root, 'node_modules/.bin/buf')
if (check) {
  const temporary = mkdtempSync(join(tmpdir(), 'quuu-generated-'))
  try {
    const template = JSON.stringify({ version: 'v2', plugins: [{ local: 'protoc-gen-es', out: temporary, opt: 'target=ts' }] })
    execFileSync(buf, ['generate', 'apps/mac/proto', '--template', template], { cwd: root, stdio: 'inherit' })
    write(join(generated, 'quuu_pb.ts'), readFileSync(join(temporary, 'quuu_pb.ts'), 'utf8'))
    execFileSync(buf, ['breaking', 'apps/mac/proto', '--against', 'tests/fixtures/api/v1.bin'], { cwd: root, stdio: 'inherit' })
  } finally { rmSync(temporary, { recursive: true, force: true }) }
} else {
  execFileSync(buf, ['generate', 'apps/mac/proto', '--template', 'apps/mac/buf.gen.yaml'], { cwd: root, stdio: 'inherit' })
}
