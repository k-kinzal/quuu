import { useEffect, useRef, useState } from 'react'
import type { SessionImage } from '../../../preload/api/session.js'
import { t } from '../model/i18n/index.js'
import { ImageFrame, ImageMissing, ImageStrip } from '../ui/session.js'

/**
 * Images that appeared in the conversation.
 *
 * The bytes are not carried on the message (tens of MB per session).
 * Fetch from the main process **only once on screen**. Hauling everything
 * the moment the conversation opens stalls the UI for images never seen.
 */
function Image({ image }: { image: SessionImage }): JSX.Element {
  const frameRef = useRef<HTMLButtonElement>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    let alive = true

    const fetchImage = (): void => {
      void window.quuu.session.image(image.id).then((data) => {
        if (!alive) return
        if (data) setSrc(data)
        else setMissing(true)
      })
    }

    // Start fetching as it approaches. Don't show a blank after the scroll arrives
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        observer.disconnect()
        fetchImage()
      },
      { rootMargin: '600px' }
    )
    observer.observe(el)

    return () => {
      alive = false
      observer.disconnect()
    }
  }, [image.id])

  /*
   * The space held before loading. When dimensions can't be read, assume landscape.
   * Sized by aspect ratio rather than height, so anything wider than the pane shrinks to fit.
   */
  const ratio = image.width && image.height ? image.width / image.height : 3 / 2

  return (
    <ImageFrame
      ref={frameRef}
      type="button"
      expanded={expanded}
      onClick={() => setExpanded(!expanded)}
      /*
       * Right-clicking an image is left to the OS menu (Copy Image).
       * Only stop propagation. Calling preventDefault here brings up the
       * enclosing turn's menu and "Copy Image" disappears
       */
      onContextMenu={(e) => e.stopPropagation()}
      title={dimensions(image)}
      ratio={ratio}
    >
      {src ? (
        <img src={src} alt={dimensions(image)} />
      ) : missing ? (
        <ImageMissing>{t('sessionImages.missing')}</ImageMissing>
      ) : null}
    </ImageFrame>
  )
}

function dimensions(image: SessionImage): string {
  if (!image.width || !image.height) return t('sessionImages.image')
  return `${image.width}×${image.height}`
}

export function SessionImages({ images }: { images: SessionImage[] }): JSX.Element {
  return (
    <ImageStrip>
      {images.map((image) => (
        <Image key={image.id} image={image} />
      ))}
    </ImageStrip>
  )
}
