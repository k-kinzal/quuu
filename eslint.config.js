import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

/**
 * ESLint (flat config).
 *
 * What types can prevent is already covered by the strict `tsc --noEmit` setup.
 * What gets added here is limited to **things that pass type checking but cause
 * accidents**. Piling on rules tips people toward writing `eslint-disable` to
 * get through, which backfires.
 *
 * Type information is used (projectService), so files outside a tsconfig are
 * checked with the untyped config.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/out/**',
      '**/release/**',
      '**/dist/**',
      '**/build/**',
      '**/*.tsbuildinfo'
    ]
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      // A swallowed Promise is the most painful accident in an app that runs unattended.
      // Deliberate fire-and-forget gets a `void` prefix (the existing convention).
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // Prevent cheating past the types; that would not count as passing the gate (docs/working.md)
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',

      // Swallowing exceptions is standard practice in Quuu (never stop the app), so allow it.
      // But catching into a variable and never using it is likely an oversight.
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }
      ],

      // Full-width spaces appear deliberately in the Japanese locale resources (menu labels)
      'no-irregular-whitespace': ['error', { skipComments: true, skipTemplates: true }],

      // Every Zustand selector (`useStore((s) => s.setSettings)`) trips this.
      // Store actions are plain functions with no `this`, so the warning never holds.
      // Dozens of false positives are more harmful as noise, so turn it off.
      '@typescript-eslint/unbound-method': 'off'
    }
  },

  // main / preload / tests — Node
  {
    files: [
      'apps/mac/src/main/**/*.ts',
      'apps/mac/src/preload/**/*.ts',
      'apps/*/tests/**/*.ts',
      'packages/*/tests/**/*.ts',
      'tests/**/*.ts'
    ],
    languageOptions: {
      globals: { ...globals.node }
    }
  },

  // Screens — browser. The React hooks rules apply only here
  {
    files: ['apps/mac/src/renderer/**/*.{ts,tsx}', 'apps/mobile/src/**/*.{ts,tsx}', 'packages/design-system/src/components/**/{CompactComposer,SwipeActions,NavigationTransition,SelectionSheet}.tsx'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser }
    },
    rules: {
      ...reactHooks.configs.recommended.rules
    }
  },

  {
    files: ['apps/mac/src/preload/api{,/**}.ts', 'apps/mobile/src/sync/**/*.ts', 'apps/mac/src/renderer/src/model/**/*.ts'],
    rules: {
      // Keep import-free OS / browser dependencies out of pure contracts and decision logic too.
      'no-restricted-globals': ['error', 'process', 'Buffer', 'require', 'window', 'document', 'fetch', 'localStorage', 'sessionStorage', 'navigator']
    }
  },

  // Config files — outside any tsconfig, so no type information available
  {
    files: ['**/*.config.ts', '**/*.config.js'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      parserOptions: { projectService: false, project: false },
      globals: { ...globals.node }
    }
  },

  {
    // Untyped tooling (screenshot scripts) opts out of the type-aware rules
    files: ['**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      parserOptions: { projectService: false, project: false },
      globals: { ...globals.node, WebSocket: 'readonly', fetch: 'readonly' }
    }
  }
)
