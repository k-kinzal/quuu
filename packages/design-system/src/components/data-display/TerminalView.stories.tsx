import { useEffect, useRef } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { TerminalView, type TerminalViewHandle } from './TerminalView.js'

const meta: Meta<typeof TerminalView> = {
  title: 'Data display/TerminalView',
  component: TerminalView,
  parameters: { layout: 'fullscreen' }
}

export default meta

export const Interactive: StoryObj<typeof TerminalView> = {
  render: function Render() {
    const terminal = useRef<TerminalViewHandle>(null)
    useEffect(() => {
      terminal.current?.write(
        [
          '\u001b[34m~/project\u001b[0m  \u001b[32mmain\u001b[0m',
          '\u001b[30mblack\u001b[0m  \u001b[31mred\u001b[0m  \u001b[33myellow\u001b[0m  \u001b[35mmagenta\u001b[0m',
          '$ '
        ].join('\r\n')
      )
      terminal.current?.focus()
    }, [])
    return (
      <div style={{ display: 'flex', height: '100vh' }}>
        <TerminalView
          ref={terminal}
          onData={(data) => terminal.current?.write(data === '\r' ? '\r\n$ ' : data)}
        />
      </div>
    )
  }
}
