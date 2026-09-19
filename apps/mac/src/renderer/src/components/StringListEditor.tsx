import {
  ListFrameButton, Menu, RepeatableList,
  RepeatableRow,
  TextInput, ValueColumn, useMenu
} from '@design-system/react'
import { useEffect, useRef, useState } from 'react'
import { t } from '../model/i18n/index.js'
import { Braces, ICON, Minus, Plus, iconProps } from '../ui/icons.js'

/**
 * Edits "an ordered list of strings" (argument templates, regular expressions).
 *
 * The container (`RepeatableList`) owns the border and the bar at the bottom, and
 * **add, remove and reorder** all live in that bar and in the drag handles. Never line up
 * ↑ ↓ ✕ to the right of a row (three glyphs against one value buries what you came to read).
 */

/** Track which row has focus and make it the target of the bar's "remove". */
function useCurrentRow(): {
  rootRef: React.RefObject<HTMLDivElement>
  current: number | null
  setCurrent(index: number | null): void
  focusRow(index: number, field?: number): void
} {
  const rootRef = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState<number | null>(null)
  const [pending, setPending] = useState<[number, number] | null>(null)

  // A newly added row isn't drawn yet, so move focus once it is
  useEffect(() => {
    if (!pending) return
    const [row, field] = pending
    const rows = rootRef.current?.querySelectorAll<HTMLElement>('[data-repeat-row]')
    rows?.[row]?.querySelectorAll<HTMLInputElement>('input')[field]?.focus()
    setPending(null)
  }, [pending])

  return {
    rootRef,
    current,
    setCurrent,
    focusRow: (index, field = 0) => {
      setCurrent(index)
      setPending([index, field])
    }
  }
}

interface Props {
  value: string[]
  /** The input's placeholder. Exactly one example of how to write it */
  placeholder?: string
  /** The default that applies while empty. Shown as dimmed rows, never written out as "empty means default" */
  defaults?: readonly string[]
  /** Variables that can be inserted. Picked from an OS menu behind the bar's glyph */
  variables?: readonly string[]
  /** The name of what gets added (shown in the tooltip; the button's shape can't say what it adds) */
  noun: string
  onChange(next: string[]): void
}

export function StringListEditor({
  value,
  placeholder,
  defaults,
  variables,
  noun,
  onChange
}: Props): JSX.Element {
  const { rootRef, current, setCurrent, focusRow } = useCurrentRow()
  /* The list of variables. A surface anchored to the button pressed (not the right-click container) */
  const vars = useMenu()

  const add = (text = ''): void => {
    // Keep the row remembered before the bar or variable menu took focus.
    const index = current === null ? value.length : Math.min(current + 1, value.length)
    onChange([...value.slice(0, index), text, ...value.slice(index)])
    focusRow(index)
  }

  const remove = (): void => {
    if (current === null || current >= value.length) return
    onChange(value.filter((_, i) => i !== current))
    setCurrent(value.length > 1 ? Math.max(0, current - 1) : null)
  }

  const move = (from: number, to: number): void => {
    const copy = [...value]
    const [item] = copy.splice(from, 1)
    copy.splice(to, 0, item)
    onChange(copy)
    setCurrent(to)
  }

  return (
    <div ref={rootRef}>
      <RepeatableList
        placeholder={defaults}
        onReorder={move}
        bar={
          <>
            <ListFrameButton
              title={t('listEditor.add', { noun })}
              icon={<Plus size={ICON.sm} {...iconProps} />}
              onClick={() => add()}
            />
            <ListFrameButton
              title={t('listEditor.remove', { noun })}
              icon={<Minus size={ICON.sm} {...iconProps} />}
              disabled={current === null || current >= value.length}
              onClick={remove}
            />
            {variables && (
              <ListFrameButton
                title={t('listEditor.addVariable')}
                icon={<Braces size={ICON.sm} {...iconProps} />}
                /* A surface anchored to the button pressed (not the right-click container) */
                onClick={vars.open}
              />
            )}
          </>
        }
      >
        {value.map((item, i) => (
          <RepeatableRow key={i} index={i} selected={current === i} onSelect={() => setCurrent(i)}>
            <TextInput
              mono
              value={item}
              placeholder={placeholder}
              onChange={(e) => {
                const copy = [...value]
                copy[i] = e.target.value
                onChange(copy)
              }}
            />
          </RepeatableRow>
        ))}
      </RepeatableList>

      <Menu
        open={vars.isOpen}
        anchorEl={vars.anchorEl}
        onClose={vars.close}
        items={() => (variables ?? []).map((v) => ({ label: v, onSelect: () => add(v) }))}
        label={t('listEditor.addVariable')}
      />
    </div>
  )
}

interface EnvProps {
  value: Record<string, string>
  onChange(next: Record<string, string>): void
}

/**
 * Environment variables.
 *
 * A key/value pair **can have an empty key while you are typing**, so this keeps the row
 * order itself. Holding the pairs as a Record means the row disappears the moment the key
 * is cleared, and you can't type any more (working around that is why added rows used to
 * be silently named `VAR_1`).
 */
export function EnvEditor({ value, onChange }: EnvProps): JSX.Element {
  const { rootRef, current, setCurrent, focusRow } = useCurrentRow()
  const [rows, setRows] = useState<Array<[string, string]>>(() => Object.entries(value))
  // Don't rebuild the row being typed in when the value coming back is just the one we emitted
  const emitted = useRef(value)

  useEffect(() => {
    if (value === emitted.current) return
    setRows(Object.entries(value))
    setCurrent(null)
    // Reload only when a different agent is opened (setCurrent is the same function every time)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const commit = (next: Array<[string, string]>): void => {
    setRows(next)
    const map: Record<string, string> = {}
    for (const [k, v] of next) if (k.length > 0) map[k] = v
    emitted.current = map
    onChange(map)
  }

  return (
    <div ref={rootRef}>
      <RepeatableList
        bar={
          <>
            <ListFrameButton
              title={t('envEditor.add')}
              icon={<Plus size={ICON.sm} {...iconProps} />}
              onClick={() => {
                commit([...rows, ['', '']])
                focusRow(rows.length)
              }}
            />
            <ListFrameButton
              title={t('envEditor.remove')}
              icon={<Minus size={ICON.sm} {...iconProps} />}
              disabled={current === null || current >= rows.length}
              onClick={() => {
                if (current === null) return
                commit(rows.filter((_, i) => i !== current))
                setCurrent(rows.length > 1 ? Math.max(0, current - 1) : null)
              }}
            />
          </>
        }
      >
        {rows.map(([k, v], i) => (
          <RepeatableRow key={i} index={i} selected={current === i} onSelect={() => setCurrent(i)}>
            <ValueColumn>
              <TextInput
                mono
                value={k}
                placeholder="KEY"
                onChange={(e) =>
                  commit(rows.map((row, j) => (j === i ? [e.target.value, v] : row)))
                }
              />
            </ValueColumn>
            <TextInput
              mono
              value={v}
              placeholder="value"
              onChange={(e) => commit(rows.map((row, j) => (j === i ? [k, e.target.value] : row)))}
            />
          </RepeatableRow>
        ))}
      </RepeatableList>
    </div>
  )
}
