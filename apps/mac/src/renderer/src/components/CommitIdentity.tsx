import { Button, Code, Column, DescriptionList, FieldHint, Row } from '@design-system/react'
import { useEffect, useState } from 'react'
import type { CommitIdentity } from '../../../preload/api/settings.js'
import { usePreview } from '../interaction/usePreview.js'
import { t } from '../model/i18n/index.js'

/**
 * The GitHub identity (a GitHub App's bot).
 *
 * **There is exactly one thing to press: "create".** Both the slug and the bot user ID are
 * values decided as a result of creating it, not by a person. Making someone type them
 * requires knowing "what the identity will be" before typing it, and one wrong character
 * leaves commits in the history that belong to nobody.
 *
 * Appears in both the app settings and a project's settings.
 */
export function CommitIdentityPanel({
  value,
  onChange
}: {
  value: CommitIdentity
  onChange(next: CommitIdentity): void
}): JSX.Element {
  /*
   * There are two kinds of waiting.
   *   creating … waiting for a human to approve in the browser (can be stopped)
   *   loading  … just asking GitHub (returns right away)
   * Collapsed into one state, when to offer "cancel" becomes unreadable.
   */
  const [busy, setBusy] = useState<'' | 'creating' | 'loading'>('')
  const [message, setMessage] = useState('')
  const preview = usePreview(JSON.stringify(value), () => window.quuu.settings.previewIdentity({ identity: value })).value

  // Opening a different project must not carry over the previous surface's message
  useEffect(() => {
    setBusy('')
    setMessage('')
  }, [value.appSlug])

  const create = async (): Promise<void> => {
    setBusy('creating')
    setMessage('')
    const result = await window.quuu.settings.createGitHubApp()
    setBusy('')
    // Never restate in red something the user stopped themselves
    if (!result.ok) {
      if (!result.canceled) setMessage(result.reason)
      return
    }
    // If the ID didn't come back, the list below and "reload" say so
    onChange(result.identity)
  }

  /** Stands in for retyping when the bot wasn't visible in the API right after creation. */
  const reload = async (): Promise<void> => {
    setBusy('loading')
    setMessage('')
    const result = await window.quuu.settings.lookupBotUser(value.appSlug)
    setBusy('')
    if (result.ok) onChange({ ...value, botUserId: result.botUserId })
    else setMessage(result.reason)
  }

  const cancel = (
    <>
      <Button onClick={() => void window.quuu.settings.cancelGitHubApp()}>{t('commitIdentity.cancel')}</Button>
      <FieldHint>{t('commitIdentity.waitingApproval')}</FieldHint>
    </>
  )
  const error = message ? <FieldHint tone="danger">{message}</FieldHint> : null
  const slug = preview?.slug ?? value.appSlug

  // No App yet. Offer exactly one thing to press
  if (!slug) {
    return (
      <Row>
        {busy === 'creating' ? (
          cancel
        ) : (
          <Button color="primary" onClick={() => void create()}>
            {t('commitIdentity.setUp')}
          </Button>
        )}
        {error}
      </Row>
    )
  }

  const complete = preview?.complete ?? false
  const current = preview?.current ?? false

  return (
    <Column gap="lg" align="start">
      <DescriptionList labels="short">
        <dt>{t('commitIdentity.identity')}</dt>
        <dd>
          <Code>{preview?.login ?? ''}</Code>
        </dd>

        <dt>{t('commitIdentity.email')}</dt>
        <dd>
          {/* This is what GitHub links on. Show the value that actually lands, as-is */}
          {complete ? (
            <Code>{preview?.email ?? ''}</Code>
          ) : (
            <FieldHint tone="danger">{t('commitIdentity.missingBotUser')}</FieldHint>
          )}
        </dd>

        <dt>{t('commitIdentity.operations')}</dt>
        <dd>
          {current ? <Code>{t('commitIdentity.appIdentity')}</Code> : <FieldHint tone="danger">{t('commitIdentity.needsUpdate')}</FieldHint>}
        </dd>
      </DescriptionList>

      <Row>
        <Button onClick={() => void window.quuu.system.openExternal(preview?.url ?? 'https://github.com/apps')}>
          {t('commitIdentity.openOnGitHub')}
        </Button>
        {!complete && (
          <Button color="primary" disabled={busy !== ''} onClick={() => void reload()}>
            {t('commitIdentity.reload')}
          </Button>
        )}
        {busy === 'creating' ? (
          cancel
        ) : !current ? (
          <Button
            color="primary"
            disabled={busy !== ''}
            onClick={() => void create()}
            title={t('commitIdentity.updateTitle')}
          >
            {t('commitIdentity.update')}
          </Button>
        ) : (
          <Button
            variant="ghost"
            disabled={busy !== ''}
            onClick={() => void create()}
            title={t('commitIdentity.recreateTitle')}
          >
            {t('commitIdentity.recreate')}
          </Button>
        )}
        {error}
      </Row>
    </Column>
  )
}

/** A row that only shows the resolved identity. Used while a project inherits it. */
export function CommitIdentityReadout({
  identity
}: {
  identity: CommitIdentity | null
}): JSX.Element {
  const preview = usePreview(JSON.stringify(identity), () => window.quuu.settings.previewIdentity({ identity: identity ?? { appSlug: '', botUserId: '' } })).value
  return (
    <DescriptionList labels="short">
      <dt>{t('commitIdentity.identity')}</dt>
      <dd>{identity ? <Code>{preview?.login ?? ''}</Code> : <FieldHint>—</FieldHint>}</dd>
    </DescriptionList>
  )
}
