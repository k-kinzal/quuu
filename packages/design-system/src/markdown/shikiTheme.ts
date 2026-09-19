import type { ThemeRegistrationRaw } from 'shiki'
import { palettes, syntaxTokens, type ColorScheme } from '../theme/tokens.js'

/**
 * The highlighting rules.
 *
 * Interpreting the grammar is left to shiki (the same TextMate grammars as VS Code) and
 * **only the colors come from our own tokens**. Use an off-the-shelf theme as-is and
 * the code surface alone ends up in another app's palette.
 *
 * Match scopes at the largest unit you can. The finer the match, the more the languages
 * diverge, which shows up as "TypeScript gets a color but Go does not".
 */
export function shikiTheme(scheme: ColorScheme): ThemeRegistrationRaw {
  const palette = palettes[scheme]
  const syntax = syntaxTokens(palette)

  return {
    name: `ds-${scheme}`,
    type: scheme,
    colors: {
      'editor.background': palette.surface.subtle,
      'editor.foreground': syntax.plain
    },
    settings: [
      { settings: { background: palette.surface.subtle, foreground: syntax.plain } },

      // Things you can skip over. Demoted in rank rather than colored
      {
        scope: ['comment', 'punctuation.definition.comment', 'string.comment'],
        settings: { foreground: syntax.comment, fontStyle: 'italic' }
      },

      // Values
      {
        scope: ['string', 'string.quoted', 'string.template', 'constant.other.symbol'],
        settings: { foreground: syntax.string }
      },
      {
        scope: [
          'constant.numeric',
          'constant.language',
          'constant.character',
          'constant.other',
          'keyword.other.unit'
        ],
        settings: { foreground: syntax.number }
      },

      // The words that build the structure
      {
        scope: ['keyword', 'storage', 'storage.type', 'storage.modifier', 'keyword.operator.new'],
        settings: { foreground: syntax.keyword }
      },
      {
        scope: ['keyword.operator', 'punctuation.separator', 'punctuation.terminator'],
        settings: { foreground: syntax.operator }
      },
      { scope: ['punctuation'], settings: { foreground: syntax.punctuation } },

      // Names
      {
        scope: [
          'entity.name.function',
          'support.function',
          'meta.function-call.generic',
          'variable.function'
        ],
        settings: { foreground: syntax.function }
      },
      {
        scope: [
          'entity.name.type',
          'entity.name.class',
          'entity.name.namespace',
          'entity.other.inherited-class',
          'support.type',
          'support.class'
        ],
        settings: { foreground: syntax.type }
      },
      {
        scope: [
          'variable',
          'variable.other',
          'variable.parameter',
          'support.variable',
          'meta.definition.variable'
        ],
        settings: { foreground: syntax.plain }
      },

      // A key in a config file is "the thing you are looking for". Rendered in the strongest text
      {
        scope: [
          'support.type.property-name',
          'meta.object-literal.key',
          'entity.name.tag.yaml',
          'variable.other.key'
        ],
        settings: { foreground: syntax.property }
      },

      // Markup (HTML / Markdown)
      { scope: ['entity.name.tag'], settings: { foreground: syntax.tag } },
      { scope: ['entity.other.attribute-name'], settings: { foreground: syntax.attribute } },
      {
        scope: ['variable.other.environment', 'variable.language', 'punctuation.definition.variable'],
        settings: { foreground: syntax.variable }
      },
      {
        scope: ['meta.preprocessor', 'meta.annotation', 'entity.name.function.preprocessor'],
        settings: { foreground: syntax.meta }
      },

      // Diffs
      { scope: ['markup.inserted', 'meta.diff.header.to-file'], settings: { foreground: syntax.added } },
      { scope: ['markup.deleted', 'meta.diff.header.from-file'], settings: { foreground: syntax.removed } },
      { scope: ['meta.diff.range', 'meta.diff.header'], settings: { foreground: syntax.meta } },

      { scope: ['invalid', 'invalid.illegal'], settings: { foreground: palette.accents.red } }
    ]
  }
}
