import {
  IconButton,
  SafeFooter,
  SafeHeader,
  ScreenContent,
  ScreenFrame,
  Text,
  TitleAction,
  TitleBand
} from '@design-system/react'
import type { ReactNode } from 'react'
import { Glyph } from '../lib/icons.js'
import { t } from '../model/i18n/index.js'

/**
 * The container for one screen. **Follows the iOS conventions for screens.**
 *
 * There are two ways to build the bar. Settle for one and both surfaces end up
 * "slightly wrong".
 *
 * | | Large title (`large`) | Pushed screen (default) |
 * |---|---|---|
 * | Where | directly under a tab (top level) | opened by pressing |
 * | Title | left-aligned, large, bold | **centered**, same size as body text |
 * | Back | none (move by tab) | `‹` at the leading edge |
 *
 * **Never put the app's name in the title.** Which app is open was settled the moment
 * it was picked on the home screen. Announcing it again inside throws that line away.
 *
 * Clearances (notch, home bar) come from `env(safe-area-inset-*)`.
 * The bar's ground paints past the clearance (without that, a band of another color
 * is left at the top edge).
 */

export interface ScreenProps {
  title: string
  /** Use the large-title form. Screens directly under a tab take this */
  large?: boolean
  /** Where back goes. Passing it puts a `‹` at the leading edge */
  onBack?: () => void
  /** The action placed at the top trailing corner */
  actions?: ReactNode
  /** What is pinned to the bottom edge (input, the primary action, tabs) */
  footer?: ReactNode
  /** What sticks under the bar (filters and such; does not scroll with the body) */
  toolbar?: ReactNode
  children: ReactNode
}

export function Screen({
  title,
  large,
  onBack,
  actions,
  footer,
  toolbar,
  children
}: ScreenProps): JSX.Element {
  return (
    <ScreenFrame>
      <SafeHeader>
        {large ? (
          <TitleBand large>
            <Text size="xl" weight="bold" truncate grow>
              {title}
            </Text>
            {actions}
          </TitleBand>
        ) : (
          <TitleBand>
            <TitleAction>
              {onBack && (
                <IconButton
                  title={t('screen.back')}
                  plainTitle
                  size="md"
                  icon={<Glyph name="back" step="lg" />}
                  onClick={onBack}
                />
              )}
            </TitleAction>
            <Text weight="bold" truncate grow align="center">
              {title}
            </Text>
            <TitleAction end>{actions}</TitleAction>
          </TitleBand>
        )}
        {toolbar}
      </SafeHeader>
      <ScreenContent>{children}</ScreenContent>
      {footer && <SafeFooter>{footer}</SafeFooter>}
    </ScreenFrame>
  )
}
