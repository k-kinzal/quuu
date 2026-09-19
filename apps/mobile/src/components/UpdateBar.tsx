import { EdgeProgress as Bar } from '@design-system/react'
export function UpdateBar({ ratio }: { ratio: number | null }): JSX.Element {
  return ratio === null ? (
    <Bar variant="indeterminate" />
  ) : (
    <Bar variant="determinate" value={Math.round(ratio * 100)} />
  )
}
