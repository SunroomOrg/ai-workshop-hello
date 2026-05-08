import { useEffect, useRef, useState } from 'react'
import type { Level } from '../data/types'

interface AvatarProps {
  levels: Level[]
  currentLevelId: string
}

/**
 * Cute chibi-style sprite that walks along the dotted path between levels.
 * Renders inside the SVG world map's coordinate space (viewBox 140 × 60).
 */
export function Avatar({ levels, currentLevelId }: AvatarProps) {
  const target = levels.find(l => l.id === currentLevelId) ?? levels[0]
  const [{ x, y, facing }, setPos] = useState({
    x: target.x,
    y: target.y - 4.2,
    facing: 1 as 1 | -1,
  })
  const [bobFrame, setBobFrame] = useState(0)
  const isMovingRef = useRef(false)

  // Subtle 2-frame bobbing animation for "alive" feel.
  useEffect(() => {
    const id = window.setInterval(() => setBobFrame(f => (f + 1) % 2), 240)
    return () => window.clearInterval(id)
  }, [])

  // Animate from current x/y through every intermediate level to the target.
  useEffect(() => {
    if (isMovingRef.current) return
    const targetIndex = levels.findIndex(l => l.id === currentLevelId)
    const startIndex = nearestLevelIndex(levels, x, y + 4.2)
    if (startIndex === targetIndex) return

    const step = targetIndex > startIndex ? 1 : -1
    const path: Level[] = []
    for (let i = startIndex; i !== targetIndex + step; i += step) {
      if (levels[i]) path.push(levels[i])
    }

    let raf = 0
    let cancelled = false
    isMovingRef.current = true

    ;(async () => {
      let curX = x
      let curY = y
      for (const wp of path.slice(1)) {
        const dir: 1 | -1 = wp.x >= curX ? 1 : -1
        await new Promise<void>(resolve => {
          const fromX = curX
          const fromY = curY
          const startT = performance.now()
          const dur = 700
          const tick = (now: number) => {
            if (cancelled) return resolve()
            const t = Math.min(1, (now - startT) / dur)
            setPos({
              x: fromX + (wp.x - fromX) * t,
              y: fromY + (wp.y - 4.2 - fromY) * t,
              facing: dir,
            })
            if (t < 1) raf = requestAnimationFrame(tick)
            else resolve()
          }
          raf = requestAnimationFrame(tick)
        })
        curX = wp.x
        curY = wp.y - 4.2
      }
      isMovingRef.current = false
    })()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      isMovingRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLevelId])

  return (
    <g transform={`translate(${x}, ${y})`} className="avatar">
      <ellipse cx={0} cy={3.4} rx={1.6} ry={0.4} fill="#000" opacity="0.25" />
      <g
        transform={`scale(${facing}, 1) translate(0, ${bobFrame === 0 ? 0 : -0.2})`}
      >
        <Chibi />
      </g>
    </g>
  )
}

/** Index of the level whose centre is closest to (px, py). */
function nearestLevelIndex(levels: Level[], px: number, py: number): number {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < levels.length; i++) {
    const dx = levels[i].x - px
    const dy = levels[i].y - py
    const d = dx * dx + dy * dy
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/**
 * Pixel-art chibi sprite — black bowl-cut hair, big eyes, red shirt,
 * blue shorts, brown shoes. Read top-down, left-to-right. Centred on (0,0)
 * with feet around y = +3.0.
 *
 * Grid is 12 cols × 18 rows. Legend:
 *   h = black hair        s = skin           e = eye
 *   w = eye sparkle       p = pink cheek     m = mouth (smile)
 *   r = red shirt         a = shirt accent   b = blue shorts
 *   k = brown shoe        . = transparent
 */
function Chibi() {
  const px = 0.36
  const grid = [
    '...hhhhhh...', // hair top
    '..hhhhhhhh..', // hair widening
    '.hhhhhhhhhh.', // full bangs row
    '.hhsssssshh.', // forehead under bangs
    '.hssssssssh.', // face widens
    '.hsswesswesh', // eye row 1 (white sparkle + black pupil)
    '.hsseesseesh', // eye row 2 (full black)
    '.hssssssssh.', // cheeks pad
    '.hsspsmsspsh', // pink cheeks + smile
    '.hhsssssshh.', // chin
    '..hhssssshh.', // jawline narrowing
    '...ssssss...', // neck
    '..ddaadddd..', // dress neckline w/ ribbon
    '.dddddddddd.', // dress shoulders
    '.daddddddad.', // dress with side accents
    '.dddddddddd.', // dress waist
    'dddddddddddd', // skirt flares full width
    '....kkkk....', // little shoes peeking from skirt
  ]
  const colors: Record<string, string> = {
    h: '#1d1d1d',          // hair (black bob)
    s: '#f4c89a',          // skin
    e: '#1d1d1d',          // eye
    w: '#ffffff',          // eye sparkle
    p: '#f29ac0',          // cheek pink
    m: '#d63b2c',          // mouth (smile)
    d: '#fdf6dd',          // cream/white dress (matches the toddler photos)
    a: '#f29ac0',          // pink ribbon / dress accent
    k: '#3a2410',          // shoes
    '.': 'transparent',
  }
  const cols = 12
  const rows = grid.length
  const rects: { x: number; y: number; fill: string }[] = []
  for (let j = 0; j < rows; j++) {
    const row = grid[j].padEnd(cols, '.').slice(0, cols)
    for (let i = 0; i < cols; i++) {
      const ch = row[i]
      if (ch === '.' || !colors[ch]) continue
      rects.push({
        x: i * px - (cols * px) / 2,
        y: j * px - (rows * px) / 2,
        fill: colors[ch],
      })
    }
  }
  return (
    <g>
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={px} height={px} fill={r.fill} />
      ))}
    </g>
  )
}
