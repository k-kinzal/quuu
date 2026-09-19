import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { StorybookConfig } from '@storybook/react-vite'

const here = dirname(fileURLToPath(import.meta.url))

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx'],
  framework: { name: '@storybook/react-vite', options: {} },
  // The point is checking how things look, so only auto-generated docs are emitted
  typescript: { reactDocgen: 'react-docgen-typescript' },
  viteFinal: (config) => ({
    ...config,
    resolve: {
      ...config.resolve,
      alias: {
        ...config.resolve?.alias,
        '@design-system/react': resolve(here, '../src/index.ts')
      }
    }
  })
}

export default config
