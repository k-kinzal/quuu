import { IconMark, StatusIndicator, useTheme, type TreeNode } from '@design-system/react'
import type { FileChangeKind, PullRequestCheck } from '../../../preload/api/review.js'
import { t } from '../model/i18n/index.js'
import { Check, CircleAlert, Clock, ICON, Minus, TriangleAlert, iconProps } from './icons.js'

export const changeTone: Record<FileChangeKind, NonNullable<TreeNode['tone']>> = {
  added: 'success',
  modified: 'warning',
  deleted: 'danger',
  renamed: 'warning',
  copied: 'success',
  untracked: 'success',
  conflicted: 'danger'
}

export const changeLabel: Record<FileChangeKind, string> = {
  added: t('workbench.change.added'),
  deleted: t('workbench.change.deleted'),
  modified: t('workbench.change.modified'),
  renamed: t('workbench.change.renamed'),
  copied: t('workbench.change.copied'),
  untracked: t('workbench.change.untracked'),
  conflicted: t('workbench.change.conflicted')
}

const CHECK_LABEL: Record<PullRequestCheck, string> = {
  success: t('workbench.check.success'),
  failure: t('workbench.check.failure'),
  pending: t('workbench.check.pending'),
  neutral: t('workbench.check.neutral')
}

function checkColor(theme: ReturnType<typeof useTheme>, status: PullRequestCheck): string {
  return status === 'success'
    ? theme.palette.success.main
    : status === 'failure'
      ? theme.palette.error.main
      : status === 'pending'
        ? theme.palette.warning.main
        : theme.palette.text.tertiary
}

/** CI isn't color alone: success, failure and in-progress are distinguished by shape too. */
export function CheckMark({ status }: { status: PullRequestCheck }): JSX.Element {
  const theme = useTheme()
  const color = checkColor(theme, status)
  const icon =
    status === 'success' ? (
      <Check size={ICON.sm} {...iconProps} />
    ) : status === 'failure' ? (
      <CircleAlert size={ICON.sm} {...iconProps} />
    ) : status === 'pending' ? (
      <Clock size={ICON.sm} {...iconProps} />
    ) : (
      <Minus size={ICON.sm} {...iconProps} />
    )
  return (
    <IconMark color={color} title={CHECK_LABEL[status]} aria-label={CHECK_LABEL[status]}>
      {icon}
    </IconMark>
  )
}

/**
 * The CI of every Pull Request in one small circle, for a place too narrow for the shapes
 * above (a tab label). The word carries the meaning; the color repeats it.
 */
export function CheckDot({ status }: { status: PullRequestCheck }): JSX.Element {
  const theme = useTheme()
  return <StatusIndicator shape="dot" color={checkColor(theme, status)} label={CHECK_LABEL[status]} />
}

/** The branch no longer merges into its base. Shown beside the CI mark, since CI says nothing about it. */
export function ConflictMark(): JSX.Element {
  const theme = useTheme()
  const label = t('workbench.mergeState.conflicting')
  return (
    <IconMark color={theme.palette.error.main} title={label} aria-label={label}>
      <TriangleAlert size={ICON.sm} {...iconProps} />
    </IconMark>
  )
}
