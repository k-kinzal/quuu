import { CompactComposer, type CompactComposerProps } from '@design-system/react'
import { Glyph } from '../lib/icons.js'
import { t } from '../model/i18n/index.js'
export type ComposerProps = Omit<CompactComposerProps, 'sendIcon' | 'sendLabel'>
export function Composer(props: ComposerProps): JSX.Element {
  return (
    <CompactComposer
      {...props}
      sendIcon={<Glyph name="up" step="md" />}
      sendLabel={t('composer.send')}
    />
  )
}
