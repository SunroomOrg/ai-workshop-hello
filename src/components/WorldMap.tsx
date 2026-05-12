import { useCallback, useMemo, useState } from 'react'
import { LEVELS } from '../data/levels'
import { RUNS } from '../data/runs'
import type { Level } from '../data/types'
import { Avatar } from './Avatar'
import { LevelModal } from './LevelModal'
import { LevelNode } from './LevelNode'
import { MapBackground } from './MapBackground'
import { useChiptune } from '../hooks/useChiptune'

const STORAGE_KEY = 'lans-time-capsule:cleared:v1'

function loadCleared(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return new Set(parsed.filter(x => typeof x === 'string'))
  } catch {
    /* ignore */
  }
  return new Set()
}

function saveCleared(cleared: Set<string>) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...cleared]))
  } catch {
    /* ignore */
  }
}

export function WorldMap() {
  const [currentId, setCurrentId] = useState<string>(LEVELS[0].id)
  const [openId, setOpenId] = useState<string | null>(null)
  const [cleared, setCleared] = useState<Set<string>>(() => loadCleared())
  const [muted, setMuted] = useState(true)

  const { playClick, playSecret, playJingle, playJump, playFail } =
    useChiptune(muted)

  // Stable reference for BossRun so its RAF effect doesn't re-mount per render.
  const runSfx = useMemo(
    () => ({ playClick, playSecret, playJump, playFail }),
    [playClick, playSecret, playJump, playFail]
  )

  // The first un-cleared level is the next playable one. Anything beyond it
  // stays locked until earlier levels are passed.
  const unlockedIndex = useMemo(() => {
    for (let i = 0; i < LEVELS.length; i++) {
      if (!cleared.has(LEVELS[i].id)) return i
    }
    return LEVELS.length - 1
  }, [cleared])

  const isUnlocked = useCallback(
    (level: Level) => {
      const idx = LEVELS.findIndex(l => l.id === level.id)
      return idx <= unlockedIndex
    },
    [unlockedIndex]
  )

  const handleSelect = useCallback(
    (level: Level) => {
      if (!isUnlocked(level)) {
        playClick()
        return
      }
      playJingle()
      setCurrentId(level.id)
      setOpenId(level.id)
    },
    [isUnlocked, playClick, playJingle]
  )

  const markCleared = useCallback(
    (levelId: string) => {
      setCleared(prev => {
        if (prev.has(levelId)) return prev
        const next = new Set(prev)
        next.add(levelId)
        saveCleared(next)
        playSecret()
        return next
      })
    },
    [playSecret]
  )

  const resetProgress = () => {
    setCleared(new Set())
    saveCleared(new Set())
    setCurrentId(LEVELS[0].id)
    setOpenId(null)
  }

  const openIndex = LEVELS.findIndex(l => l.id === openId)
  const openLevel = openIndex >= 0 ? LEVELS[openIndex] : null

  const onPrev =
    openIndex > 0 ? () => handleSelect(LEVELS[openIndex - 1]) : undefined

  const nextLevel = openIndex >= 0 ? LEVELS[openIndex + 1] : undefined
  const onNext = nextLevel ? () => handleSelect(nextLevel) : undefined
  // The Next button is enabled if this level is cleared, OR (defensively)
  // if the level has no boss run and no quiz to gate progress.
  const canGoNext =
    !!nextLevel &&
    (cleared.has(openLevel?.id ?? '') ||
      (!RUNS[openLevel?.id ?? ''] &&
        (openLevel?.quizzes.length ?? 0) === 0))

  return (
    <div className="world">
      {/* Ambient page-chrome decoration: a handful of sakura flecks +
          sparkle pixels scattered in the corners of the viewport so the
          pastel-sky vibe extends beyond the map's bezel. Fixed-positioned,
          pointer-events: none, hidden from a11y tree. */}
      <div className="chrome-deco" aria-hidden="true">
        <span className="chrome-sakura" style={{ top: '6px', left: '6px' }} />
        <span
          className="chrome-sakura is-deeper"
          style={{ top: '6px', right: '6px' }}
        />
        <span
          className="chrome-sakura"
          style={{ top: '32%', left: '4px' }}
        />
        <span
          className="chrome-sakura"
          style={{ top: '54%', right: '4px' }}
        />
        <span
          className="chrome-sakura is-deeper"
          style={{ bottom: '6px', left: '6px' }}
        />
        <span
          className="chrome-sakura"
          style={{ bottom: '6px', right: '6px' }}
        />
        <span
          className="chrome-sparkle"
          style={{ top: '4%', left: '14%', animationDelay: '0.4s' }}
        />
        <span
          className="chrome-sparkle"
          style={{ top: '4%', right: '20%', animationDelay: '1.6s' }}
        />
        <span
          className="chrome-sparkle"
          style={{ bottom: '4%', left: '20%', animationDelay: '0.9s' }}
        />
        <span
          className="chrome-sparkle"
          style={{ bottom: '4%', right: '14%', animationDelay: '2.2s' }}
        />
      </div>

      <header className="world__header">
        <div className="world__titles">
          <h1 className="world__title">Xeo&apos;s Capsule</h1>
          <p className="world__tagline">
            Seven worlds. One save file. Press Start.
          </p>
        </div>
        <div className="world__controls">
          <button
            type="button"
            className="pixel-btn"
            onClick={() => setMuted(m => !m)}
            aria-pressed={!muted}
          >
            {muted ? '🔇 Music: off' : '🔊 Music: on'}
          </button>
          {cleared.size > 0 && (
            <button
              type="button"
              className="pixel-btn"
              onClick={resetProgress}
              title="Wipe quiz progress and start over"
            >
              ↺ Reset progress
            </button>
          )}
        </div>
      </header>

      <div className="world__map-wrap">
        <MapBackground />
        <svg
          viewBox="0 0 140 60"
          preserveAspectRatio="xMidYMid slice"
          className="map-overlay"
          shapeRendering="crispEdges"
        >
          <Avatar levels={LEVELS} currentLevelId={currentId} />
          {LEVELS.map(level => (
            <LevelNode
              key={level.id}
              level={level}
              isCurrent={level.id === currentId}
              isCleared={cleared.has(level.id)}
              isLocked={!isUnlocked(level)}
              onSelect={handleSelect}
            />
          ))}
        </svg>
      </div>

      <footer className="world__footer">
        <p>
          Click an unlocked world. Beat its boss run. Unlock the next.
          Use <kbd>←</kbd> <kbd>→</kbd> to flip between chapters,{' '}
          <kbd>Esc</kbd> to bail to the map.
        </p>
        <p className="world__progress">
          Save file: {cleared.size} / {LEVELS.length} worlds cleared
        </p>
      </footer>

      <LevelModal
        key={openId ?? 'closed'}
        level={openLevel}
        cleared={openLevel ? cleared.has(openLevel.id) : false}
        onClear={() => openLevel && markCleared(openLevel.id)}
        onClose={() => setOpenId(null)}
        onPrev={onPrev}
        onNext={onNext}
        canGoNext={canGoNext}
        onClickSfx={playClick}
        runSfx={runSfx}
      />
    </div>
  )
}
