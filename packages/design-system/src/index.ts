/**
 * The MUI-based design system.
 *
 * Only **things whose meaning does not change from app to app** go here. Bring in
 * domain words (state names, categories, priorities) and the design system starts
 * dictating the app's vocabulary, binding the app.
 *
 * - **Tokens = MUI's Theme.** The source of truth for the values is `theme/tokens.ts`.
 *   What MUI already has (palette / typography / spacing / shape) goes there, and only
 *   the missing concepts (surface levels, density) are added as extensions
 * - **Components are filed under MUI's categories.**
 *   inputs / data-display / feedback / surfaces / navigation / layout / utils
 *
 * An app **layers** `createTheme` to add its own colors and vocabulary, and builds its
 * domain components (state marks, purpose-built lists) on its own side.
 */

/* ---------------------------------------------------------------- theme */
export { createTheme } from './theme/createTheme.js'
export type { CreateThemeOptions } from './theme/createTheme.js'
export { ThemeProvider, useColorScheme, useTheme } from './theme/ThemeProvider.js'
export type { ColorSchemePreference, ThemeProviderProps } from './theme/ThemeProvider.js'
export { enStrings, jaStrings } from './theme/strings.js'
export type { DsStrings } from './theme/strings.js'
export { blockProps, fadeIn, flash, riseIn } from './theme/styled.js'
export {
  density,
  duration,
  fontFamily,
  fontSize,
  iconButton,
  iconDefaults,
  iconSize,
  lineHeight,
  markSize,
  measure,
  palettes,
  radius,
  scales,
  spacingUnit
} from './theme/tokens.js'
export type {
  AccentTokens,
  BorderTokens,
  ColorScheme,
  Density,
  Palette,
  Scale,
  SurfaceTokens,
  SyntaxTokens,
  TextTokens
} from './theme/tokens.js'

/* -------------------------------------------------------------- markdown */
export { isDiagramLanguage, resolveLanguage } from './markdown/language.js'
export { safeUrl } from './markdown/url.js'
export { shikiTheme } from './markdown/shikiTheme.js'

/* ----------------------------------------------------------- components */
export * from './components/index.js'

export * from './components/data-display/Transcript.js'

export * from './components/layout/ConversationLayout.js'
export * from './components/layout/ConversationFeed.js'

export * from './components/data-display/HistoryList.js'
export * from './components/data-display/Annotations.js'
export * from './components/layout/ContentLayout.js'
export { AmbientGradient } from './components/layout/AmbientGradient.js'

export * from './components/inputs/SurfaceInput.js'

export * from './components/inputs/CompactComposer.js'

export * from './components/inputs/ActionPill.js'

export * from './components/navigation/NavigationTransition.js'

export * from './components/inputs/SwipeActions.js'

export * from './components/surfaces/SelectionSheet.js'

export * from './components/navigation/BottomNavigation.js'

export * from './components/feedback/EdgeProgress.js'
export * from './components/layout/ScreenFrame.js'
export * from './components/layout/InsetGroup.js'
export * from './layoutSpec.js'
export * from './components/inputs/resizeInput.js'
