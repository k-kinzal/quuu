import { usePromptFiles } from '../interaction/promptFiles.js'
import { Alert, AutoTextArea, resizeInput, type EditorTone } from '@design-system/react'
import { useMutation } from '@tanstack/react-query'
import {
  useCallback,
  useId,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject
} from 'react'
import { isImeComposing, isSubmitKey } from '../model/composer.js'
import { t } from '../model/i18n/index.js'
import { failureReason } from '../model/operationFailure.js'
import { queryClient } from '../state/queryClient.js'

/** Commit / discard the text being written, from buttons the caller places. */
export interface EditableBodyActions {
  commit(): void
  cancel(): void
}

/**
 * Input for fixing existing text in place (the inline rank of rule D).
 *
 * Instructions and follow-ups not yet sent get typos and second thoughts as a matter
 * of course. To avoid a "queued means unfixable" state, the displayed text itself
 * becomes the input.
 *
 * The looks belong to the design system's `AutoTextArea`. All this owns is
 * "when to commit, when to discard".
 * Key meanings match the composer (rule D-②): `↵` is a newline, `⌘↵` commits, `Esc` discards the edit.
 *
 * No clear-all operation here. Wiping everything happens by accident, so an empty
 * commit reverts; if a delete entry point is needed, the caller places it as an
 * explicit button (rule J-2).
 *
 * **Don't rely on background change alone to signal editability.** Text laid out like a
 * quote is indistinguishable from a read-only pane until touched. So the caller can
 * offer explicit entry points ("Edit", "Commit", "Revert"), we hand out a way to focus
 * from outside (`inputRef`), whether editing is active (`onEditingChange`), and commit
 * and discard handles (`actionsRef`).
 *
 * It's also the outlet that keeps key hints ("⌘↵ to commit") off the screen (rule Q).
 * The same thing can be said with a pressable button, so keys get a pressable form.
 */
export function EditableBody({
  value,
  onCommit,
  label,
  placeholder,
  tone,
  disabled = false,
  disabledReason,
  inputRef,
  onEditingChange,
  actionsRef
}: {
  value: string
  /** The committed text. Rejects when saving fails; the input is kept and the reason shown. */
  onCommit: (next: string) => Promise<void>
  /** What is being edited. Used for screen readers and the tooltip. */
  label: string
  placeholder?: string
  /** Character of the surface it sits on. Specified in the same vocabulary as the read-only `Quote`. */
  tone?: EditorTone
  disabled?: boolean
  disabledReason?: string
  /** Outlet for the caller's "Edit" button to place focus. */
  inputRef?: RefObject<HTMLTextAreaElement>
  /** Whether editing is active. Passed so commit/discard buttons can be toggled. */
  onEditingChange?: (editing: boolean) => void
  /** Outlet for the caller's buttons to trigger commit/discard. */
  actionsRef?: MutableRefObject<EditableBodyActions | null>
}): JSX.Element {
  const [text, setText] = useState(value)
  const saving = useMutation({
    mutationKey: ['tasks', 'update'],
    meta: { feedback: 'inline' },
    mutationFn: onCommit,
    onSuccess: () => onEditingChange?.(false),
    onError: () => onEditingChange?.(true)
  }, queryClient)
  const own = useRef<HTMLTextAreaElement>(null)
  const ref = inputRef ?? own
  const scope = useId()
  const files = usePromptFiles({ value: text, onChange: setText, inputRef: ref, scope, disabled: disabled || saving.isPending })
  // Discard via Esc comes with a blur. setText doesn't land until the next render,
  // so a flag tells the blur-side commit not to pick up the stale text.
  const discarding = useRef(false)

  // After a commit, main's value is authoritative. Our own commit and outside changes come back through the same path
  useEffect(() => setText(value), [value])

  // A writing surface: no scrollbar, follow the height of the content
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    resizeInput(el, 'document')
  }, [text, ref])

  const commit = useCallback((): void => {
    if (files.isBusy()) return
    if (discarding.current) {
      discarding.current = false
      setText(value)
      saving.reset()
      onEditingChange?.(false)
      return
    }
    const next = text.trim()
    if (next === value.trim() || next.length === 0) {
      setText(value)
      saving.reset()
      onEditingChange?.(false)
      return
    }
    if (!saving.isPending) saving.mutate(next)
  }, [text, value, saving, onEditingChange, files])

  useEffect(() => {
    if (!actionsRef) return
    const finish = (): void => {
      // After a failed save the field may already be blurred. Let the commit button retry too.
      if (ref.current === document.activeElement) ref.current?.blur()
      else commit()
    }
    actionsRef.current = {
      commit: finish,
      cancel: () => { discarding.current = true; finish() }
    }
    return () => { actionsRef.current = null }
  }, [actionsRef, ref, commit])

  return (
    <>
      <AutoTextArea
        {...files.inputProps}
        ref={ref}
        tone={tone}
        value={text}
        rows={1}
        spellCheck={false}
        disabled={disabled || saving.isPending}
        placeholder={placeholder}
        aria-label={label}
        title={disabled ? disabledReason : undefined}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => onEditingChange?.(true)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !isImeComposing(e)) {
            discarding.current = true
            e.currentTarget.blur()
            return
          }
          if (!isSubmitKey(e)) return
          e.preventDefault()
          // Commit goes through the single blur path. Don't run it twice
          e.currentTarget.blur()
        }}
      />
      {files.error && <Alert title={t('promptFiles.failed')}>{failureReason(files.error)}</Alert>}
      {saving.error && <Alert title={t('editableBody.saveFailed')}>{failureReason(saving.error)}</Alert>}
    </>
  )
}
