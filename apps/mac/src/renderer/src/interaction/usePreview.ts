import { useEffect, useRef, useState } from 'react'

/** A reply to stale input never lands in the current preview. A failure is returned distinctly from an empty value. */
export function usePreview<T>(key: string, load: () => Promise<T>): { value: T | null; error: string } {
  const loadRef = useRef(load)
  loadRef.current = load
  const [result, setResult] = useState<{ key: string; value: T | null; error: string } | null>(null)
  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => loadRef.current()).then(
      value => { if (active) setResult({ key, value, error: '' }) },
      error => { if (active) setResult({ key, value: null, error: String(error) }) }
    )
    return () => { active = false }
  }, [key])
  return result?.key === key ? result : { value: null, error: '' }
}
