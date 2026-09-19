import { styled } from '@mui/material/styles'

/**
 * Not shown to the eye, but kept for screen readers.
 *
 * Even where a glyph alone gets the meaning across, a screen reader needs a word.
 * This is the escape hatch that keeps "remove it from the visuals" from becoming
 * "remove the information".
 */
export const VisuallyHidden = styled('span')({
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0
})

/**
 * A box that fits to one line and elides.
 * Always give an elided element a `title` (eliding hides information, so leave a way to
 * get it back).
 */
export const Truncate = styled('span')({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
})
