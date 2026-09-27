import { useId, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { TranscriptCode } from './Annotations.js'
import { Markdown } from './Markdown.js'
import { Reveal } from '../surfaces/Reveal.js'
import { ThemeProvider } from '../../theme/ThemeProvider.js'
import { useTheme } from '@mui/material/styles'
import { Text } from './Text.js'
import { StatusIndicator } from './StatusIndicator.js'
import { Button } from '../inputs/Button.js'
import {
  TranscriptDetailSection, TranscriptInterlude, TranscriptTurnHead, TranscriptTurnRole,
  TranscriptToolCluster, TranscriptToolDetail, TranscriptToolEntry, TranscriptToolError, TranscriptToolLine, TranscriptToolVerb,
  TranscriptTurn, TranscriptTurnBody, TranscriptTurnText, type TranscriptToolTone
} from './Transcript.js'

export default { title: 'Data Display/Transcript' } satisfies Meta

function Action({ verb, target, tone, outcome = 'ok', defaultOpen = false, input = '{ "path": "src/example.ts" }', language = 'json', result = 'Operation completed.', resultLanguage }: {
  verb: string
  target: string
  tone: TranscriptToolTone
  outcome?: 'ok' | 'error' | 'pending'
  defaultOpen?: boolean
  input?: string
  language?: string
  result?: string
  resultLanguage?: string
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  const failed = outcome === 'error'
  return (
    <TranscriptToolCluster tone={tone}>
      <TranscriptToolEntry open={open}>
        <TranscriptToolLine outcome={outcome} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
          <TranscriptToolVerb data-verb>{verb}</TranscriptToolVerb>
          <span data-target>{target}</span>
          {failed && <span data-flag>Failed</span>}
          {outcome === 'pending' && <span data-flag>Running</span>}
        </TranscriptToolLine>
        {failed && !open && <TranscriptToolError>Error: the requested file could not be found.</TranscriptToolError>}
        <Reveal open={open}>
          {() => <TranscriptToolDetail id={id}>
            <TranscriptCode label="Input" code={input} language={language} />
            {outcome !== 'pending' && <TranscriptCode label="Result" code={failed ? 'Error: the requested file could not be found.\nCheck the path and try again.' : result} language={resultLanguage} tone={failed ? 'danger' : 'default'} />}
          </TranscriptToolDetail>}
        </Reveal>
      </TranscriptToolEntry>
    </TranscriptToolCluster>
  )
}

function ExpandedExamples(): JSX.Element {
  return (
    <TranscriptTurnBody>
      <TranscriptTurnText><Markdown>The expanded details share the same surface and remain secondary to the explanation.</Markdown></TranscriptTurnText>
      <Action verb="Edit" target="src/dashboard/query.ts" tone="accent" defaultOpen language="diff" input={'*** Begin Patch\n*** Update File: src/dashboard/query.ts\n@@\n-export const order = "created_at ASC"\n+export const order = "updated_at DESC, created_at DESC"\n*** End Patch'} result="Updated src/dashboard/query.ts" />
      <Action verb="Run" target="npm run build" tone="success" defaultOpen language="js" input={'const result = await tools.exec_command({cmd: "npm run build"});\ntext(result.output);'} result={'{"exit_code":0,"output":"Build finished.\\nApplication ready.","path":"/workspace/project/release/application/build/output/with/a/long/path"}'} />
      <Action verb="Read" target="src/example.ts" tone="neutral" defaultOpen resultLanguage="ts" result={'export function example() {\n  return "ready"\n}'} />
      <Action verb="Run" target="cat docs/missing.md" tone="success" outcome="error" defaultOpen />
      <Action verb="Run" target="npm run preview" tone="success" outcome="pending" />
    </TranscriptTurnBody>
  )
}

export const ExpandedDetails: StoryObj = { render: () => <ExpandedExamples /> }

export const LongOutput: StoryObj = {
  render: () => <Action verb="Run" target="npm test" tone="success" defaultOpen input="npm test" language="sh" result={Array.from({ length: 80 }, (_, i) => `PASS test ${i + 1}: output stays within the expanded detail`).join('\n')} />
}

function ComfortableExamples(): JSX.Element {
  const theme = useTheme()
  return <ThemeProvider colorScheme={theme.palette.mode} density="comfortable"><ExpandedExamples /></ThemeProvider>
}

export const Comfortable: StoryObj = { render: () => <ComfortableExamples /> }

function BackgroundAction({ name, status = 'Completed' }: { name: string; status?: 'Completed' | 'Running' | 'Failed' }): JSX.Element {
  const [open, setOpen] = useState(false)
  const id = useId()
  return <TranscriptToolEntry open={open}>
    <TranscriptToolLine targetKind="text" outcome={status === 'Failed' ? 'error' : 'ok'} aria-expanded={open} aria-controls={id} title={name} onClick={() => setOpen(!open)}>
      <TranscriptToolVerb>Shell</TranscriptToolVerb><span data-target>{name}</span>
      <span aria-hidden="true"><StatusIndicator shape={status === 'Running' ? 'spinner' : status === 'Failed' ? 'cross' : 'check'} tone={status === 'Failed' ? 'danger' : status === 'Running' ? 'accent' : 'neutral'} label={status} /></span>
      <Text size="xs" fixed tone={status === 'Failed' ? 'danger' : status === 'Running' ? 'accent' : 'tertiary'}>{status}</Text>
    </TranscriptToolLine>
    <Reveal open={open}>{() => <TranscriptToolDetail id={id}>
      <TranscriptDetailSection><Text size="xs" tone="secondary">After processing · 21:30 · 12s</Text></TranscriptDetailSection>
      <TranscriptCode label="Command" code="npm run check" language="sh" />
      <TranscriptCode label="Output" code={status === 'Failed' ? 'Validation failed. Check the output and retry.' : 'Validation complete. All checks passed.'} tone={status === 'Failed' ? 'danger' : 'default'} />
      <TranscriptDetailSection><Button size="xs" variant="ghost">Open full log</Button></TranscriptDetailSection>
    </TranscriptToolDetail>}</Reveal>
  </TranscriptToolEntry>
}

function InterludeExample(): JSX.Element {
  return <>
    <TranscriptTurn><TranscriptTurnText><Markdown>The update is ready. Background actions follow the response in the same reading flow.</Markdown></TranscriptTurnText></TranscriptTurn>
    <TranscriptInterlude aria-label="Background actions">
      <TranscriptTurnHead><TranscriptTurnRole>Background actions</TranscriptTurnRole></TranscriptTurnHead>
      <BackgroundAction name="Validate the changes" />
      <BackgroundAction name="Prepare the summary" status="Running" />
      <BackgroundAction name="Publish the generated documentation with a deliberately long descriptive name" status="Failed" />
    </TranscriptInterlude>
    <TranscriptTurn><TranscriptTurnText role="user"><Markdown>Please continue with the next change.</Markdown></TranscriptTurnText></TranscriptTurn>
  </>
}

export const AuxiliaryPhase: StoryObj = { render: () => <InterludeExample /> }
export const NarrowAuxiliaryPhase: StoryObj = { render: () => <div style={{ maxWidth: 340 }}><InterludeExample /></div> }
export const ComfortableAuxiliaryPhase: StoryObj = {
  render: () => <ThemeProvider density="comfortable"><InterludeExample /></ThemeProvider>
}

export const SupportingColors: StoryObj = {
  render: () => (
    <TranscriptTurn>
      <TranscriptTurnBody>
        <TranscriptTurnText role="assistant"><Markdown>The message is the main thing to read. Action details keep their meaning while sitting quietly alongside the explanation.</Markdown></TranscriptTurnText>
        <Action verb="Read" target="docs/guide.md" tone="neutral" />
        <Action verb="Edit" target="src/example.ts" tone="accent" />
        <Action verb="Run" target="npm run build" tone="success" />
        <Action verb="Run" target="npm run preview" tone="success" outcome="pending" />
        <Action verb="Run" target="cat docs/missing.md" tone="success" outcome="error" />
        <TranscriptTurnText role="assistant"><Markdown>The build finished. I will correct the missing path and check the result again.</Markdown></TranscriptTurnText>
      </TranscriptTurnBody>
    </TranscriptTurn>
  )
}
