import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Minus, Plus } from 'lucide-react'
import { iconDefaults, iconSize } from '../../theme/tokens.js'
import { ListFrameButton } from '../layout/ListFrame.js'
import { TextInput } from './TextInput.js'
import { RepeatableList, RepeatableRow, SwatchGroup } from './RepeatableList.js'

const meta: Meta = { title: 'Inputs/RepeatableList' }
export default meta

const COLORS = ['#4ea8de', '#4caf7d', '#e2a03f', '#e05c5c', '#8f86b8', '#8b95a5']

function Editor({ initial, defaults }: { initial: string[]; defaults?: string[] }): JSX.Element {
  const [items, setItems] = useState(initial)
  const [current, setCurrent] = useState<number | null>(null)
  return (
    <div style={{ maxWidth: 520 }}>
      <RepeatableList
        placeholder={defaults}
        onReorder={(from, to) => {
          const next = [...items]
          const [x] = next.splice(from, 1)
          next.splice(to, 0, x)
          setItems(next)
          setCurrent(to)
        }}
        bar={
          <>
            <ListFrameButton
              title="Add"
              icon={<Plus size={iconSize.sm} {...iconDefaults} />}
              onClick={() => setItems([...items, ''])}
            />
            <ListFrameButton
              title="Remove the selected row"
              icon={<Minus size={iconSize.sm} {...iconDefaults} />}
              disabled={current === null}
              onClick={() => {
                if (current === null) return
                setItems(items.filter((_, j) => j !== current))
                setCurrent(null)
              }}
            />
          </>
        }
      >
        {items.map((item, i) => (
          <RepeatableRow key={i} index={i} selected={current === i} onSelect={() => setCurrent(i)}>
            <TextInput
              mono
              value={item}
              onChange={(e) => setItems(items.map((v, j) => (j === i ? e.target.value : v)))}
            />
          </RepeatableRow>
        ))}
      </RepeatableList>
    </div>
  )
}

/**
 * A run of inputs whose order carries meaning.
 * Reordering means grabbing the handle (reachable with `⇥`, and it also moves with `↑ ↓`).
 * Add and remove are gathered on the bottom band; no glyphs are lined up on the rows.
 */
export const Ordered: StoryObj = {
  render: () => <Editor initial={['-p', '{{prompt}}', '--permission-mode']} />
}

/** An empty container says "there is nothing yet" by its shape. No prose is placed there. */
export const Empty: StoryObj = { render: () => <Editor initial={[]} /> }

/** The defaults in effect while empty are shown by the faint rows themselves (never written out as "empty means default"). */
export const DefaultsShown: StoryObj = {
  render: () => <Editor initial={[]} defaults={['usage limit', 'rate.?limit', '\\b429\\b']} />
}

/** Selection is shown by an outline. The fill is spoken for by the color itself and cannot be taken. */
export const Colors: StoryObj = {
  render: function Render() {
    const [color, setColor] = useState(COLORS[0])
    return <SwatchGroup label="Color" colors={COLORS} value={color} onChange={setColor} />
  }
}
