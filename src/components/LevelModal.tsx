import { useEffect, useRef, useState } from 'react'
import { RUNS } from '../data/runs'
import type { Level, Media, MediaPhoto } from '../data/types'
import { BossRun } from './BossRun'

interface LevelModalProps {
  level: Level | null
  cleared: boolean
  onClear: () => void
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  /** Whether the next chapter is reachable (cleared this level OR no quiz). */
  canGoNext: boolean
  /** Click feedback hook. */
  onClickSfx?: () => void
  /** Boss-run SFX bundle. */
  runSfx?: {
    playClick: () => void
    playSecret: () => void
    playJump: () => void
    playFail: () => void
  }
}

export function LevelModal({
  level,
  cleared,
  onClear,
  onClose,
  onPrev,
  onNext,
  canGoNext,
  runSfx,
}: LevelModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const [lightbox, setLightbox] = useState<MediaPhoto | null>(null)

  useEffect(() => {
    if (!level) return
    // While the lightbox is open it owns Escape / arrow keys. We pull the
    // modal's listener off the window entirely so the first Escape just
    // closes the photo viewer, not the surrounding modal.
    if (lightbox) return
    closeBtnRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && onPrev) onPrev()
      if (e.key === 'ArrowRight' && onNext && canGoNext) onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [level, onClose, onPrev, onNext, canGoNext, lightbox])

  if (!level) return null

  const hasRun = !!RUNS[level.id]
  const nextDisabled = !onNext || !canGoNext
  const gateLabel = hasRun ? 'boss' : 'quiz'

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="level-title"
      onClick={onClose}
    >
      <div className="modal" onClick={e => e.stopPropagation()}>
        <header className="modal__header" style={{ background: level.accent }}>
          <div className="modal__header-text">
            <span className="modal__era">
              {level.era} · {level.ageRange} · {level.location}
            </span>
            <h2 id="level-title" className="modal__title">
              World {level.number}: {level.title}
              {cleared && <span className="modal__cleared-badge">★ Cleared</span>}
            </h2>
            <p className="modal__subtitle">{level.subtitle}</p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="Close level"
          >
            ✕
          </button>
        </header>

        <div className="modal__body">
          {level.chapters.length === 0 ? (
            <p className="modal__empty">
              This world is awaiting playtest content. Add chapters in{' '}
              <code>src/data/levels.ts</code>.
            </p>
          ) : (
            level.chapters.map((c, i) => (
              <section key={i} className="chapter">
                <h3 className="chapter__heading">
                  {c.year !== undefined && (
                    <span className="chapter__year">{c.year}</span>
                  )}
                  {c.heading}
                </h3>
                {c.body.split(/\n+/).map((p, j) => (
                  <p key={j} className="chapter__body">
                    {p}
                  </p>
                ))}
              </section>
            ))
          )}

          {level.media.length > 0 && (
            <section className="media">
              <h3 className="chapter__heading">Memories</h3>
              <div className="media__grid">
                {level.media.map((m, i) => (
                  <MediaItem
                    key={i}
                    media={m}
                    onOpenPhoto={photo => setLightbox(photo)}
                  />
                ))}
              </div>
            </section>
          )}

          {RUNS[level.id] && runSfx && (
            <BossRun
              key={level.id}
              config={RUNS[level.id]}
              cleared={cleared}
              levelNumber={level.number}
              onWin={onClear}
              onExit={onClose}
              sfx={runSfx}
            />
          )}
        </div>

        <footer className="modal__footer">
          <button
            type="button"
            className="pixel-btn"
            onClick={onPrev}
            disabled={!onPrev}
          >
            ◀ Prev world
          </button>
          <button type="button" className="pixel-btn" onClick={onClose}>
            Back to map
          </button>
          <button
            type="button"
            className="pixel-btn"
            onClick={onNext}
            disabled={nextDisabled}
            title={
              nextDisabled && onNext
                ? `Beat this world’s ${gateLabel} to unlock the next one`
                : undefined
            }
          >
            {cleared || level.quizzes.length === 0
              ? 'Next world ▶'
              : `🔒 Beat ${gateLabel} to continue`}
          </button>
        </footer>
      </div>

      {lightbox && (
        <Lightbox photo={lightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  )
}

function MediaItem({
  media,
  onOpenPhoto,
}: {
  media: Media
  onOpenPhoto: (photo: MediaPhoto) => void
}) {
  if (media.kind === 'photo') {
    const label = media.caption
      ? `Open full-size: ${media.caption}`
      : `Open full-size: ${media.alt}`
    return (
      <figure className="media__item">
        <button
          type="button"
          className="media__photo-btn"
          onClick={() => onOpenPhoto(media)}
          aria-label={label}
        >
          <img src={media.src} alt={media.alt} loading="lazy" />
        </button>
        {media.caption && <figcaption>{media.caption}</figcaption>}
      </figure>
    )
  }
  if (media.kind === 'video') {
    return (
      <figure className="media__item">
        {media.embed ? (
          <iframe
            src={media.src}
            title={media.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <video src={media.src} controls preload="metadata" />
        )}
        <figcaption>{media.title}</figcaption>
      </figure>
    )
  }
  return (
    <figure className="media__item">
      <audio src={media.src} controls />
      <figcaption>{media.title}</figcaption>
    </figure>
  )
}

function Lightbox({
  photo,
  onClose,
}: {
  photo: MediaPhoto
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    // Use capture so we run before the parent modal's keydown listener.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div
      className="lightbox-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onClick={e => {
        // The lightbox is rendered inside the level-modal backdrop, so a
        // click on its own backdrop would otherwise bubble up and also
        // close the modal. Eat the click here.
        e.stopPropagation()
        onClose()
      }}
    >
      <button
        ref={closeRef}
        type="button"
        className="lightbox-close"
        onClick={e => {
          e.stopPropagation()
          onClose()
        }}
        aria-label="Close photo"
      >
        ✕
      </button>
      <figure
        className="lightbox-figure"
        onClick={e => e.stopPropagation()}
      >
        <img className="lightbox-img" src={photo.src} alt={photo.alt} />
        {photo.caption && (
          <figcaption className="lightbox-caption">{photo.caption}</figcaption>
        )}
      </figure>
    </div>
  )
}
