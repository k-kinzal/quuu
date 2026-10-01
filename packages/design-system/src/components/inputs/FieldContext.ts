import { createContext, useContext } from 'react'

/** A composed field names its actual input, including controls nested in action rows. */
export const FieldContext = createContext<{ label: string; labelId: string; hintId?: string; invalid?: boolean } | null>(null)
export const useFieldContext = () => useContext(FieldContext)
