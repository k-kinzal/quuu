import { useIsMutating, useMutation } from '@tanstack/react-query'
import { useLayoutEffect, useRef, type ClipboardEvent, type DragEvent, type RefObject } from 'react'
import { t } from '../model/i18n/index.js'
import { queryClient } from '../state/queryClient.js'

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',', 2)[1])
    reader.onerror = () => reject(new Error(reader.error?.message ?? t('promptFiles.failed')))
    reader.readAsDataURL(file)
  })
}

/** Preserve the selection and keep paths with spaces recognizable as a single reference. */
export function insertFilePaths(value: string, start: number, end: number, paths: string[]): { value: string; caret: number } {
  const before = value.slice(0, start)
  const after = value.slice(end)
  const references = paths.map(path => /[\s"'`\\]/.test(path) ? JSON.stringify(path) : path).join(' ')
  const inserted = `${before && !/\s$/.test(before) ? ' ' : ''}${references}${/^\s/.test(after) ? '' : ' '}`
  return { value: before + inserted + after, caret: before.length + inserted.length }
}

interface Transfer {
  files: File[]
  copy: boolean
  apply(paths: string[]): void
}

/** The browser owns input/selection; main owns writing files and choosing their destinations. */
export function usePromptFiles({ value, onChange, inputRef, scope, disabled = false }: {
  value: string
  onChange(value: string, caret: number): void
  inputRef: RefObject<HTMLTextAreaElement>
  scope: string
  disabled?: boolean
}) {
  const mutationKey = ['system', 'savePromptFiles', scope]
  const busy = useIsMutating({ mutationKey }, queryClient) > 0
  const caret = useRef<{ scope: string; value: string; at: number } | null>(null)
  const mutation = useMutation({
    mutationKey,
    meta: { feedback: 'inline' },
    mutationFn: async ({ files, copy }: Transfer) => {
      const paths = files.map(file => copy ? '' : window.quuuFiles.getPathForFile(file))
      const staged = await Promise.all(files.filter((_, index) => !paths[index]).map(async file => ({ name: file.name, data: await readFile(file) })))
      const saved = staged.length > 0
        ? await window.quuu.system.savePromptFiles(staged, { context: { feedback: 'inline' } })
        : []
      let index = 0
      return paths.map(path => path || saved[index++])
    },
    // Keep the original draft's callback even if the user navigated to another task during the write.
    onSuccess: (paths, transfer) => transfer.apply(paths)
  }, queryClient)

  useLayoutEffect(() => {
    const selection = caret.current
    if (!selection || selection.scope !== scope || inputRef.current?.value !== selection.value) return
    inputRef.current.setSelectionRange(selection.at, selection.at)
    caret.current = null
  }, [value, scope, inputRef, busy])

  const attach = (files: File[], copy: boolean): void => {
    if (disabled || queryClient.isMutating({ mutationKey })) return
    const input = inputRef.current
    if (!input) return
    const start = input.selectionStart
    const end = input.selectionEnd
    input.focus()
    mutation.mutate({ files, copy, apply: paths => {
      const next = insertFilePaths(value, start, end, paths)
      caret.current = { scope, value: next.value, at: next.caret }
      onChange(next.value, next.caret)
    } })
  }

  return {
    busy,
    error: mutation.error,
    isBusy: () => queryClient.isMutating({ mutationKey }) > 0,
    inputProps: {
      readOnly: busy,
      onPaste: (event: ClipboardEvent<HTMLTextAreaElement>): void => {
        const files = Array.from(event.clipboardData.files)
        if (files.length === 0) return
        event.preventDefault()
        attach(files, true)
      },
      onDragOver: (event: DragEvent<HTMLTextAreaElement>): void => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        event.dataTransfer.dropEffect = disabled || busy ? 'none' : 'copy'
      },
      onDrop: (event: DragEvent<HTMLTextAreaElement>): void => {
        const files = Array.from(event.dataTransfer.files)
        if (files.length === 0) return
        event.preventDefault()
        attach(files, false)
      }
    }
  }
}
