import type { ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ArrowLeft } from 'lucide-react'
import { iconDefaults, iconSize } from '../../theme/tokens.js'
import { Button, IconButton } from '../inputs/Button.js'
import { Checkbox } from '../inputs/Toggle.js'
import { Field, FieldHint } from '../inputs/Field.js'
import { TextInput } from '../inputs/TextInput.js'
import { GroupTitle, OrderedNotes, Page, Section } from './Page.js'
import { MenuNav, MenuNavTitle } from '../navigation/NavList.js'
import { Panel, PanelHeader, PanelHeading } from './Panel.js'

const meta: Meta = { title: 'Layout/Page', parameters: { layout: 'fullscreen' } }
export default meta

/** Titles and controls share one window band, including the category column. */
export const HeaderAlignment: StoryObj = {
  render: () => (
    <div style={{ display: 'flex', height: 300 }}>
      <MenuNav>
        <MenuNavTitle>Categories</MenuNavTitle>
      </MenuNav>
      <Panel surface="canvas" grow bordered="right">
        <Page title="General" description="Supporting text belongs below the shared header band.">
          <Section title="Behavior"><Checkbox label="Enabled" checked onChange={() => undefined} /></Section>
        </Page>
      </Panel>
      <Panel surface="canvas" grow bordered="right">
        <Page
          title="Detail"
          lead={<IconButton title="Back" icon={<ArrowLeft size={iconSize.md} {...iconDefaults} />} />}
          actions={<Button>Save</Button>}
        >
          <Section title="Basics"><TextInput aria-label="Name" defaultValue="Alpha" /></Section>
        </Page>
      </Panel>
      <Panel grow>
        <PanelHeader><PanelHeading>Collection</PanelHeading></PanelHeader>
      </Panel>
    </div>
  )
}

/**
 * Stands in for a window with no title bar: the OS controls at the top-left, and a
 * collapsed navigation column too narrow to hold them, so they overhang the surface
 * beside it. `RAIL` / `OVERHANG` are that window's measurements, not design values.
 */
const RAIL = 42
const OVERHANG = 42

function WindowFrame({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div style={{ position: 'relative', display: 'flex', height: '100vh' }}>
      <div style={{ width: RAIL, flex: `0 0 ${RAIL}px`, background: '#2b2f36' }} />
      {children}
      <div style={{ position: 'absolute', left: 14, top: 14, display: 'flex', gap: 9, zIndex: 2 }}>
        {['#ff5f57', '#febc2e', '#28c840'].map((fill) => (
          <span key={fill} style={{ width: 14, height: 14, borderRadius: '50%', background: fill }} />
        ))}
      </div>
    </div>
  )
}

export const Default: StoryObj = {
  render: () => (
    <Panel surface="canvas" grow sx={{ height: '100vh', overflowY: 'auto' }}>
      <Page
        title="General"
        description="Decides how the whole thing behaves. Only things that apply app-wide go here."
        actions={<Button color="primary">Save</Button>}
      >
        <Section title="Behavior">
          <Checkbox label="Start automatically at launch" checked onChange={() => undefined} />
          <Checkbox
            label="Keep running after closing"
            hint="Turn this off and it stops the moment you close it."
            checked={false}
            onChange={() => undefined}
          />
        </Section>

        <Section title="Interval">
          <Field label="Polling interval (ms)" hint="The default is 3000." width="sm">
            <TextInput type="number" defaultValue={3000} />
          </Field>
        </Section>

        <Section title="Rules">
          <FieldHint>When a slot frees up, the first item meeting all of the following is taken.</FieldHint>
          <OrderedNotes>
            <li>It is waiting</li>
            <li>Its scheduled time has passed</li>
            <li>Whatever precedes it has finished</li>
            <li>The cap has not been reached</li>
          </OrderedNotes>
        </Section>
      </Page>
    </Panel>
  )
}

/** One item picked out of a list and opened. The way back sits to the left of the title. */
export const Detail: StoryObj = {
  render: () => (
    <Panel surface="canvas" grow sx={{ height: '100vh', overflowY: 'auto' }}>
      <Page
        title="Alpha"
        lead={
          <IconButton
            title="Back to the list (Esc)"
            icon={<ArrowLeft size={iconSize.md} {...iconDefaults} />}
          />
        }
        actions={
          <>
            <Button color="primary">Save</Button>
            <Button variant="ghost" color="error">
              Delete
            </Button>
          </>
        }
      >
        <Section title="Basics">
          <Field label="Name">
            <TextInput defaultValue="Alpha" />
          </Field>
        </Section>
        <GroupTitle>A section that is only a heading</GroupTitle>
        <FieldHint>Used when you want the row heights aligned without drawing a rule.</FieldHint>
      </Page>
    </Panel>
  )
}

/**
 * On a window with no title bar the surface reaches the top-left corner, where the OS
 * window controls sit. `startInset` is the width the head leaves clear for them, and the
 * head stays put while the body scrolls, so nothing ever passes underneath them.
 */
export const WindowControlsInset: StoryObj = {
  render: () => (
    <WindowFrame>
      <Panel surface="canvas" grow sx={{ overflowY: 'auto' }}>
        <Page
          title="Alpha"
          startInset={OVERHANG}
          lead={
            <IconButton
              title="Back to the list (Esc)"
              icon={<ArrowLeft size={iconSize.md} {...iconDefaults} />}
            />
          }
          actions={<Button color="primary">Save</Button>}
        >
          {Array.from({ length: 8 }, (_, index) => (
            <Section key={index} title={`Group ${index + 1}`}>
              <Field label="Name">
                <TextInput defaultValue="Alpha" />
              </Field>
              <Checkbox label="Enabled" checked onChange={() => undefined} />
            </Section>
          ))}
        </Page>
      </Panel>
    </WindowFrame>
  )
}
