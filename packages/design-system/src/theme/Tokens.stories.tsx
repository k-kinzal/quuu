import type { Meta, StoryObj } from '@storybook/react-vite'
import { Column, Row } from '../components/layout/Stack.js'
import { Text } from '../components/data-display/Text.js'
import { useTheme } from './ThemeProvider.js'
import { density, fontSize, lineHeight, radius } from './tokens.js'

/**
 * The token catalog.
 * Flip the color scheme and check that meaning holds in both light and dark.
 */
const meta: Meta = { title: 'Theme/Tokens' }
export default meta

/** `Object.entries` types values as any, so pull out just the color rows with a type. */
function entries<T extends object>(record: T): Array<[string, string]> {
  return Object.entries(record) as Array<[string, string]>
}

function Swatch({ name, value }: { name: string; value: string }): JSX.Element {
  return (
    <Row gap={2} sx={{ minWidth: 220 }}>
      <span
        style={{ width: 28, height: 28, borderRadius: 6, background: value, flex: '0 0 28px' }}
      />
      <Column gap={0}>
        <Text size="sm">{name}</Text>
        <Text size="xs" tone="tertiary" mono>
          {value}
        </Text>
      </Column>
    </Row>
  )
}

export const Colors: StoryObj = {
  render: () => {
    const t = useTheme()
    return (
      <Column gap={5}>
        <Column gap={2}>
          <Text weight="bold">surface — the surface hierarchy (back to front)</Text>
          <Row wrap gap={3}>
            {entries(t.palette.surface).map(([k, v]) => (
              <Swatch key={k} name={`surface.${k}`} value={v} />
            ))}
          </Row>
        </Column>
        <Column gap={2}>
          <Text weight="bold">border / text</Text>
          <Row wrap gap={3}>
            {entries(t.palette.border).map(([k, v]) => (
              <Swatch key={k} name={`border.${k}`} value={v} />
            ))}
            <Swatch name="text.primary" value={t.palette.text.primary} />
            <Swatch name="text.secondary" value={t.palette.text.secondary} />
            <Swatch name="text.tertiary" value={t.palette.text.tertiary} />
          </Row>
        </Column>
        <Column gap={2}>
          <Text weight="bold">accents — named colors. Raw material apps assign to their domain</Text>
          <Row wrap gap={3}>
            {entries(t.palette.accents).map(([k, v]) => (
              <Swatch key={k} name={`accents.${k}`} value={v} />
            ))}
          </Row>
        </Column>
        <Column gap={2}>
          <Text weight="bold">Semantic colors (MUI palette)</Text>
          <Row wrap gap={3}>
            <Swatch name="primary" value={t.palette.primary.main} />
            <Swatch name="info" value={t.palette.info.main} />
            <Swatch name="success" value={t.palette.success.main} />
            <Swatch name="warning" value={t.palette.warning.main} />
            <Swatch name="error" value={t.palette.error.main} />
            <Swatch name="secondary" value={t.palette.secondary.main} />
          </Row>
        </Column>
      </Column>
    )
  }
}

export const Typography: StoryObj = {
  render: () => (
    <Column gap={3}>
      {(Object.keys(fontSize) as Array<keyof typeof fontSize>).map((size) => (
        <Row key={size} gap={3} align="baseline">
          <Text size="xs" tone="tertiary" mono sx={{ width: 64 }}>
            {size} / {fontSize[size]}px
          </Text>
          <Text size={size}>密度は読み取れる価値 ÷ 占有する空間 — The quick brown fox</Text>
        </Row>
      ))}
      <Row gap={3} align="baseline">
        <Text size="xs" tone="tertiary" mono sx={{ width: 64 }}>
          mono
        </Text>
        <Text mono>/Users/me/Projects/design-system --permission-mode</Text>
      </Row>
      {(Object.keys(lineHeight) as Array<keyof typeof lineHeight>).map((key) => (
        <Row key={key} gap={3} align="start">
          <Text size="xs" tone="tertiary" mono sx={{ width: 64 }}>
            {key} / {lineHeight[key]}
          </Text>
          <Text leading={key} sx={{ maxWidth: 420, display: 'block' }}>
            Leading is density itself, so it differs between surfaces you read and surfaces you scan. A reading surface keeps at least 1.75.
          </Text>
        </Row>
      ))}
    </Column>
  )
}

export const Metrics: StoryObj = {
  render: () => (
    <Column gap={4}>
      <Column gap={2}>
        <Text weight="bold">density.row — row heights</Text>
        {(Object.keys(density.row) as Array<keyof typeof density.row>).map((key) => (
          <Row key={key} gap={2}>
            <Text size="xs" tone="tertiary" mono sx={{ width: 90 }}>
              row.{key} / {density.row[key]}
            </Text>
            <span
              style={{
                height: density.row[key],
                width: 220,
                background: 'currentColor',
                opacity: 0.12,
                borderRadius: 3
              }}
            />
          </Row>
        ))}
      </Column>
      <Column gap={2}>
        <Text weight="bold">density.control — control heights</Text>
        {(Object.keys(density.control) as Array<keyof typeof density.control>).map((key) => (
          <Row key={key} gap={2}>
            <Text size="xs" tone="tertiary" mono sx={{ width: 90 }}>
              control.{key} / {density.control[key]}
            </Text>
            <span
              style={{
                height: density.control[key],
                width: 220,
                background: 'currentColor',
                opacity: 0.12,
                borderRadius: 3
              }}
            />
          </Row>
        ))}
      </Column>
      <Column gap={2}>
        <Text weight="bold">radius</Text>
        <Row gap={3}>
          {(Object.keys(radius) as Array<keyof typeof radius>).map((key) => (
            <Column key={key} gap={1} align="center">
              <span
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: radius[key],
                  background: 'currentColor',
                  opacity: 0.14
                }}
              />
              <Text size="xs" tone="tertiary" mono>
                {key}
              </Text>
            </Column>
          ))}
        </Row>
      </Column>
    </Column>
  )
}
