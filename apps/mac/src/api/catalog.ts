import { isContractProcedure } from '@orpc/contract'
import { z } from 'zod'
import { contract } from './contract.js'

export interface OperationDefinition {
  name: string
  input: z.ZodType
  output: z.ZodType
}

/** Enumerate the actual contract; transports cannot maintain partial operation lists. */
export function operations(): OperationDefinition[] {
  const result: OperationDefinition[] = []
  function visit(value: unknown, path: string[]): void {
    if (isContractProcedure(value)) {
      const { inputSchema, outputSchema } = value['~orpc'] as { inputSchema?: unknown; outputSchema?: unknown }
      if (inputSchema !== undefined && !(inputSchema instanceof z.ZodType)) throw new Error('Expected a Zod input')
      if (!(outputSchema instanceof z.ZodType)) throw new Error('Expected a Zod output')
      result.push({ name: path.join('.'), input: inputSchema ?? z.void(), output: outputSchema })
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) visit(child, [...path, key])
    }
  }
  visit(contract, [])
  return result
}
