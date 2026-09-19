import type { Decorator, Preview } from '@storybook/react-vite'
import { ThemeProvider } from '../src/theme/ThemeProvider.js'
import type { ColorScheme } from '../src/theme/tokens.js'

/**
 * Wraps every story in the Theme.
 *
 * The color scheme is switched from the toolbar. Tokens that hold different values in
 * light and dark easily end up "checked on one side and left at that", so the switch
 * stays within reach at all times.
 */
const withTheme: Decorator = (Story, context) => {
  const scheme = (context.globals.colorScheme as ColorScheme) ?? 'dark'
  const surface = (context.parameters.surface as string) ?? 'canvas'

  return (
    <ThemeProvider colorScheme={scheme}>
      <div
        data-surface={surface}
        style={{
          padding: context.parameters.layout === 'fullscreen' ? 0 : 24,
          minHeight: context.parameters.layout === 'fullscreen' ? '100vh' : undefined
        }}
      >
        <Story />
      </div>
    </ThemeProvider>
  )
}

const preview: Preview = {
  decorators: [withTheme],
  parameters: {
    // We draw the surface levels ourselves, so Storybook's own background is turned off
    backgrounds: { disable: true },
    controls: { expanded: true, matchers: { color: /(background|color)$/i } }
  },
  globalTypes: {
    colorScheme: {
      description: 'Color scheme',
      toolbar: {
        title: 'Color scheme',
        icon: 'circlehollow',
        items: ['dark', 'light'],
        dynamicTitle: true
      }
    }
  },
  initialGlobals: { colorScheme: 'dark' }
}

export default preview
