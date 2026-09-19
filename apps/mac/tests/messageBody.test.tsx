// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ThemeProvider } from '@design-system/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MessageBody } from '../src/renderer/src/components/MessageBody.js'
import { buildTheme } from '../src/renderer/src/ui/theme.js'

// Parsing is the cost being guarded, so count the parser's calls rather than the drawn output.
const { parsed } = vi.hoisted(() => ({ parsed: vi.fn<(text: string) => void>() }))
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => {
    parsed(children)
    return <p>{children}</p>
  }
}))

beforeEach(() => {
  window.matchMedia = query => ({ matches: false, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false })
})

afterEach(() => {
  cleanup()
  parsed.mockClear()
})

/** A conversation that re-renders for reasons other than its text: a clock, then a new reply. */
function Conversation(): JSX.Element {
  const [clock, setClock] = useState(0)
  const [reply, setReply] = useState('First reply')
  return (
    <div>
      <button onClick={() => setClock(clock + 1)}>tick</button>
      <button onClick={() => setReply('Second reply')}>append</button>
      <span>{clock}</span>
      <MessageBody text="Opening question" />
      <MessageBody text={reply} />
    </div>
  )
}

it('does not parse an unchanged message again when the conversation re-renders', () => {
  render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><Conversation /></ThemeProvider>)
  expect(parsed.mock.calls.map(([text]) => text)).toEqual(['Opening question', 'First reply'])

  fireEvent.click(screen.getByRole('button', { name: 'tick' }))
  fireEvent.click(screen.getByRole('button', { name: 'tick' }))
  expect(screen.getByText('2')).toBeTruthy()
  expect(parsed).toHaveBeenCalledTimes(2)

  fireEvent.click(screen.getByRole('button', { name: 'append' }))
  expect(parsed.mock.calls.map(([text]) => text)).toEqual(['Opening question', 'First reply', 'Second reply'])
  expect(screen.getByText('Second reply')).toBeTruthy()
})
