import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  Biome,
  Decoration,
  Obstacle,
  Platform,
  RunConfig,
} from '../data/types'

/* ──────────────────────────── Engine constants ─────────────────────────── */

const W = 640 // logical canvas width (px)
const H = 240 // logical canvas height (px)
const GROUND_Y = 200 // ground line (autoRunner)
const AVATAR_W = 12
const AVATAR_H = 18
const GRAVITY = 1800 // px / s²
const JUMP_VEL = 700 // px / s
/** When the player releases jump mid-rise, cap upward velocity to this fraction
 *  of full so a "tap" yields a smaller hop and a "hold" gives the full arc. */
const JUMP_CUT_FACTOR = 0.45
const COYOTE_TIME_MS = 80
const FAIL_PAUSE_MS = 600
const RUN_SPEED_DEFAULT = 140
/** How fast the avatar slides on a controllable platformer. */
const PLATFORMER_RUN_SPEED = 130

/**
 * True if the visitor has the OS-level "reduce motion" preference set.
 * Used by the LA boss run to dim the paparazzi screen-flash overlay to a
 * soft pulse instead of a full-canvas whiteout — flashbulbs are the most
 * likely accessibility offender in this scene.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/* ────────────────────────────── Pixel art ─────────────────────────────── */

/**
 * Chibi avatar pixel grid — ported verbatim from `Avatar.tsx` so the run
 * sprite matches the overworld marker. 12 cols × 18 rows, drawn at 1:1
 * logical pixels.
 */
const CHIBI_GRID = [
  '...hhhhhh...',
  '..hhhhhhhh..',
  '.hhhhhhhhhh.',
  '.hhsssssshh.',
  '.hssssssssh.',
  '.hsswesswesh',
  '.hsseesseesh',
  '.hssssssssh.',
  '.hsspsmsspsh',
  '.hhsssssshh.',
  '..hhssssshh.',
  '...ssssss...',
  '..ddaadddd..',
  '.dddddddddd.',
  '.daddddddad.',
  '.dddddddddd.',
  'dddddddddddd',
  '....kkkk....',
]
const CHIBI_COLORS: Record<string, string> = {
  h: '#1d1d1d',
  s: '#f4c89a',
  e: '#1d1d1d',
  w: '#ffffff',
  p: '#f29ac0',
  m: '#d63b2c',
  d: '#fdf6dd',
  a: '#f29ac0',
  k: '#3a2410',
}

function drawChibi(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  facing: 1 | -1,
  inAir: boolean
) {
  // cx, cy = top-left corner of avatar bounding box (12×18).
  ctx.save()
  if (facing === -1) {
    ctx.translate(cx + AVATAR_W, cy)
    ctx.scale(-1, 1)
  } else {
    ctx.translate(cx, cy)
  }
  for (let j = 0; j < CHIBI_GRID.length; j++) {
    const row = CHIBI_GRID[j]
    for (let i = 0; i < AVATAR_W; i++) {
      const ch = row[i]
      if (!ch || ch === '.') continue
      const color = CHIBI_COLORS[ch]
      if (!color) continue
      let yy = j
      // Mid-jump pose: tuck the legs (last row) up by 1 px.
      if (inAir && j === CHIBI_GRID.length - 1) yy -= 1
      ctx.fillStyle = color
      ctx.fillRect(i, yy, 1, 1)
    }
  }
  ctx.restore()
}

/* ───────────────────────── Obstacle / scenery art ─────────────────────── */

type DrawCtx = CanvasRenderingContext2D
type DrawArgs = {
  ctx: DrawCtx
  x: number
  y: number
  w: number
  h: number
  time: number
  /** For projectile art only — telegraph (`windup`) vs. live (`fire`). */
  phase?: 'off' | 'windup' | 'fire'
  /** ms elapsed within the current phase (used for windup pulse anim). */
  phaseElapsedMs?: number
  /** total ms of the current phase (for normalising progress 0..1). */
  phaseTotalMs?: number
}

/** Generic colored rect with 1-px shadow on the right + bottom. */
function pixelBox(ctx: DrawCtx, x: number, y: number, w: number, h: number, fill: string, shadow = '#0006') {
  ctx.fillStyle = fill
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = shadow
  ctx.fillRect(x + w - 1, y, 1, h)
  ctx.fillRect(x, y + h - 1, w, 1)
}

function drawText(
  ctx: DrawCtx,
  text: string,
  x: number,
  y: number,
  size = 8,
  fill = '#1d1d1d'
) {
  ctx.save()
  ctx.font = `${size}px "Press Start 2P", monospace`
  ctx.fillStyle = fill
  ctx.textBaseline = 'top'
  ctx.fillText(text, x, y)
  ctx.restore()
}

/** Apply an alpha to a `#rrggbb` colour and return an `rgba()` string.
 *  Used by the Seoul neon-sign halo so the same hex palette doubles
 *  as both the bright fill and a faded outer-glow ring. */
function applyAlpha(hex: string, alpha: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i)
  if (!m) return hex
  const r = parseInt(m[1].slice(0, 2), 16)
  const g = parseInt(m[1].slice(2, 4), 16)
  const b = parseInt(m[1].slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/* ── World 5 (Seoul) — hangul-impression glyphs. ──
 * Stylised 6×8 pixel "impressions" of hangul characters used in W5
 * signage and storefronts. These are intentionally NOT real Unicode
 * renders — `fillText` with hangul depends on system fonts and the
 * result clashes with the 16-bit aesthetic. Each char is a small grid
 * of `#` (filled) / `.` (empty) cells, tracing the rough jamo shapes
 * so they READ as Korean storefront signage without trying to be
 * orthographically accurate. */
const HANGUL_GLYPH_W = 6
const HANGUL_GLYPH_H = 8
const HANGUL_GLYPHS: Record<string, string[]> = {
  // 노 — noraebang
  no: [
    '######',
    '#.....',
    '#.....',
    '#.....',
    '######',
    '..#...',
    '..#...',
    '######',
  ],
  // 래
  rae: [
    '###.#.',
    '#.#.#.',
    '###.#.',
    '#.###.',
    '###.#.',
    '#...#.',
    '###.#.',
    '....#.',
  ],
  // 방
  bang: [
    '##..##',
    '#...#.',
    '##..##',
    '#...#.',
    '##.###',
    '....#.',
    '...##.',
    '..####',
  ],
  // 치 — chimaek
  chi: [
    '..#...',
    '######',
    '......',
    '###.#.',
    '#.#.#.',
    '###.#.',
    '..#.#.',
    '..#.#.',
  ],
  // 킨
  kin: [
    '###...',
    '#.#...',
    '###.##',
    '#.#.#.',
    '###.##',
    '....#.',
    '....#.',
    '....##',
  ],
  // 편 — pyeon (편의점)
  pyeon: [
    '#.....',
    '######',
    '#.#.#.',
    '###.#.',
    '#.#.#.',
    '###.##',
    '....#.',
    '....##',
  ],
  // 의
  ui: [
    '###...',
    '#.#...',
    '###.##',
    '....#.',
    '######',
    '....#.',
    '....#.',
    '....##',
  ],
  // 점
  jeom: [
    '###...',
    '..#...',
    '######',
    '#....#',
    '######',
    '......',
    '#....#',
    '######',
  ],
  // 술 — sool / soju
  sul: [
    '..##..',
    '.#..#.',
    '#####.',
    '......',
    '######',
    '...#..',
    '###...',
    '######',
  ],
  // 분 — bunsik
  bun: [
    '#.#...',
    '#.#...',
    '#####.',
    '......',
    '######',
    '...#..',
    '..#...',
    '######',
  ],
  // 식
  sik: [
    '..#.#.',
    '#####.',
    '..#.#.',
    '#####.',
    '..#.#.',
    '..###.',
    '.#.#..',
    '#...#.',
  ],
}

/** Render one hangul-impression glyph as `fillRect` blocks. `key` is
 *  the ASCII transliteration so we don't need non-ASCII chars in keys.
 *  Caller is responsible for any halo / glow pass. */
function drawHangulGlyph(
  ctx: DrawCtx,
  key: string,
  x: number,
  y: number,
  color: string
) {
  const grid = HANGUL_GLYPHS[key]
  if (!grid) return
  ctx.fillStyle = color
  for (let j = 0; j < grid.length; j++) {
    const row = grid[j]
    for (let i = 0; i < row.length; i++) {
      if (row[i] === '#') ctx.fillRect(x + i, y + j, 1, 1)
    }
  }
}

/** Render a row of glyph keys as a sign. Returns the rendered text
 *  width in px (excl. trailing gap) so the caller can fit halos. */
function drawHangulText(
  ctx: DrawCtx,
  keys: string[],
  x: number,
  y: number,
  color: string,
  gap = 1
): number {
  let cx = x
  for (const k of keys) {
    drawHangulGlyph(ctx, k, cx, y, color)
    cx += HANGUL_GLYPH_W + gap
  }
  return cx - x - gap
}

/** Pixel-art five-pointed star with a center body and four short rays.
 *  `r` controls the visual radius in logical pixels. */
function drawBigStar(ctx: DrawCtx, cx: number, cy: number, r: number) {
  ctx.fillRect(cx - 1, cy - r, 2, r * 2)
  ctx.fillRect(cx - r, cy - 1, r * 2, 2)
  ctx.fillRect(cx - Math.floor(r * 0.7), cy - Math.floor(r * 0.7), 2, 2)
  ctx.fillRect(cx + Math.floor(r * 0.7) - 2, cy - Math.floor(r * 0.7), 2, 2)
  ctx.fillRect(cx - Math.floor(r * 0.7), cy + Math.floor(r * 0.7) - 2, 2, 2)
  ctx.fillRect(cx + Math.floor(r * 0.7) - 2, cy + Math.floor(r * 0.7) - 2, 2, 2)
}

/** Smaller star variant for sidewalk inlay decorations. */
function drawTinyStar(ctx: DrawCtx, cx: number, cy: number, r: number) {
  ctx.fillRect(cx, cy - r, 1, r * 2 + 1)
  ctx.fillRect(cx - r, cy, r * 2 + 1, 1)
  ctx.fillRect(cx - 1, cy - 1, 3, 3)
}

/** Renders a single obstacle / boss / decoration art tag. Coordinates are
 *  the bounding box; art is drawn fitted inside (often spilling slightly
 *  upward for crowns, antennae, etc.). */
function drawArt(art: string, args: DrawArgs) {
  const { ctx, x, y, w, h, time } = args
  switch (art) {
    /* ─── World 1 (Vietnam) ─── */
    case 'palmTrunk': {
      pixelBox(ctx, x, y, w, h, '#7b4a1d', '#3a2410')
      // Brown bark notches
      ctx.fillStyle = '#3a2410'
      for (let i = 0; i < h; i += 6) ctx.fillRect(x + 1, y + i, w - 2, 1)
      // Crown of fronds spilling upward
      ctx.fillStyle = '#3aa84a'
      ctx.fillRect(x - 8, y - 4, w + 16, 4)
      ctx.fillRect(x - 4, y - 8, w + 8, 4)
      ctx.fillStyle = '#2c7d34'
      ctx.fillRect(x - 6, y - 2, w + 12, 1)
      break
    }
    case 'palmFrond': {
      ctx.fillStyle = '#7b4a1d'
      ctx.fillRect(x + w / 2 - 1, y, 2, 16)
      ctx.fillStyle = '#3aa84a'
      ctx.fillRect(x - 6, y - 2, 18, 4)
      ctx.fillRect(x - 2, y - 6, 14, 4)
      break
    }
    case 'frosting': {
      ctx.fillStyle = '#ffe1ec'
      ctx.fillRect(x, y, w, h)
      ctx.fillStyle = '#f29ac0'
      ctx.fillRect(x, y + h - 2, w, 2)
      ctx.fillStyle = '#fff'
      ctx.fillRect(x + 2, y + 1, 4, 1)
      break
    }
    case 'cakeSlice': {
      // Triangular cake silhouette w/ candle
      ctx.fillStyle = '#fdf6dd'
      ctx.fillRect(x, y + 6, w, h - 6)
      ctx.fillStyle = '#f29ac0'
      ctx.fillRect(x, y + h - 4, w, 4)
      ctx.fillRect(x, y + 6, w, 2)
      ctx.fillStyle = '#7b4a1d'
      ctx.fillRect(x + w / 2 - 1, y, 2, 6)
      ctx.fillStyle = '#ffd24a'
      ctx.fillRect(x + w / 2 - 1, y - 2, 2, 2)
      break
    }
    case 'tearDrop': {
      ctx.fillStyle = '#7ed4ff'
      ctx.fillRect(x + 2, y, w - 4, 2)
      ctx.fillRect(x + 1, y + 2, w - 2, 4)
      ctx.fillRect(x, y + 6, w, h - 6)
      ctx.fillStyle = '#bdf'
      ctx.fillRect(x + 2, y + 4, 2, 2)
      break
    }
    case 'tearBoss': {
      // Giant teardrop boss
      ctx.fillStyle = '#5fc6e6'
      ctx.fillRect(x + w / 2 - 4, y, 8, 4)
      ctx.fillRect(x + w / 2 - 8, y + 4, 16, 4)
      ctx.fillRect(x + w / 2 - 12, y + 8, 24, 8)
      ctx.fillRect(x + 4, y + 16, w - 8, h - 16)
      ctx.fillStyle = '#bdf'
      ctx.fillRect(x + 10, y + 14, 6, 6)
      ctx.fillStyle = '#1d3a4a'
      ctx.fillRect(x + 20, y + 24, 4, 4) // sad eye
      ctx.fillRect(x + 32, y + 24, 4, 4)
      // Frown
      ctx.fillRect(x + 20, y + 36, 16, 2)
      drawText(ctx, '12-HR', x + 4, y + h + 4, 7, '#fff')
      drawText(ctx, 'CRY', x + 12, y + h + 14, 7, '#fff')
      break
    }
    case 'cyclo': {
      // Bicycle rickshaw (xích lô). Two cyclos in the run alternate red /
      // blue based on x position so they don't look identical.
      const bodyColor = (Math.floor(x / 100) % 2 === 0) ? '#a02038' : '#3a5a8c'
      // Front passenger basket-seat (frame) + cream cushion
      pixelBox(ctx, x, y + h - 22, 14, 18, bodyColor, '#1a1410')
      ctx.fillStyle = '#f0e0c0'
      ctx.fillRect(x + 2, y + h - 20, 10, 4)
      // Tiny áo dài-yellow figure in the seat
      ctx.fillStyle = '#1a0e08'
      ctx.fillRect(x + 5, y + h - 28, 4, 4)
      ctx.fillStyle = '#f4c89a'
      ctx.fillRect(x + 6, y + h - 25, 2, 1)
      ctx.fillStyle = '#f0c050'
      ctx.fillRect(x + 4, y + h - 24, 6, 8)
      // Bicycle frame + driver behind
      ctx.fillStyle = '#1a1410'
      ctx.fillRect(x + 14, y + h - 12, 12, 2)
      ctx.fillRect(x + 22, y + h - 22, 2, 12)
      ctx.fillStyle = '#f0e0c0'
      ctx.fillRect(x + 19, y + h - 24, 6, 8)
      ctx.fillStyle = '#1a0e08'
      ctx.fillRect(x + 20, y + h - 28, 4, 4)
      // Front wheels (two side-by-side)
      ctx.fillStyle = '#1a1a1a'
      ctx.fillRect(x + 1, y + h - 7, 6, 6)
      ctx.fillRect(x + 7, y + h - 5, 1, 4)
      ctx.fillRect(x + 9, y + h - 7, 6, 6)
      ctx.fillStyle = '#9a9a9a'
      ctx.fillRect(x + 3, y + h - 5, 2, 2)
      ctx.fillRect(x + 11, y + h - 5, 2, 2)
      // Rear wheel
      ctx.fillStyle = '#1a1a1a'
      ctx.fillRect(x + 20, y + h - 7, 7, 6)
      ctx.fillStyle = '#9a9a9a'
      ctx.fillRect(x + 22, y + h - 5, 3, 2)
      break
    }
    case 'hondaCub': {
      // Vintage Honda Cub — low step-through frame + chrome accents.
      ctx.fillStyle = '#f0e0c0'
      ctx.fillRect(x + 4, y + h - 12, 16, 6)
      ctx.fillStyle = '#3a3a36'
      ctx.fillRect(x + 8, y + h - 10, 6, 4)
      ctx.fillStyle = '#1a1410'
      ctx.fillRect(x + 12, y + h - 14, 8, 3)
      ctx.fillStyle = '#c8c8d0'
      ctx.fillRect(x + 1, y + h - 14, 3, 4)
      ctx.fillStyle = '#1a1410'
      ctx.fillRect(x + 2, y + h - 17, 1, 4)
      ctx.fillStyle = '#c8c8d0'
      ctx.fillRect(x + 1, y + h - 18, 3, 2)
      ctx.fillStyle = '#1a1a1a'
      ctx.fillRect(x + 2, y + h - 6, 6, 6)
      ctx.fillRect(x + 16, y + h - 6, 6, 6)
      ctx.fillStyle = '#9a9a9a'
      ctx.fillRect(x + 4, y + h - 4, 2, 2)
      ctx.fillRect(x + 18, y + h - 4, 2, 2)
      break
    }
    case 'bicycleWheel': {
      // Wheel lying on the ground — rough pixel circle.
      ctx.fillStyle = '#1a1a1a'
      ctx.fillRect(x + 2, y, w - 4, 2)
      ctx.fillRect(x, y + 2, w, h - 4)
      ctx.fillRect(x + 2, y + h - 2, w - 4, 2)
      ctx.fillStyle = '#9a9a9a'
      ctx.fillRect(x + w / 2 - 1, y + h / 2 - 1, 2, 2)
      ctx.fillRect(x + w / 2, y + 2, 1, h - 4)
      ctx.fillRect(x + 2, y + h / 2, w - 4, 1)
      ctx.fillStyle = '#a04032'
      ctx.fillRect(x + w - 4, y + 2, 1, 6)
      break
    }
    case 'nonLaStack': {
      // Stack of nón lá conical hats — broad triangle silhouettes, straw.
      ctx.fillStyle = '#e8c882'
      ctx.fillRect(x, y + h - 4, w, 4)
      ctx.fillRect(x + 2, y + h - 7, w - 4, 3)
      ctx.fillRect(x + 5, y + h - 10, w - 10, 3)
      ctx.fillRect(x + 3, y + h - 13, w - 6, 3)
      ctx.fillRect(x + 6, y + h - 16, w - 12, 3)
      ctx.fillStyle = '#a8884a'
      ctx.fillRect(x, y + h - 1, w, 1)
      ctx.fillRect(x + 5, y + h - 10, w - 10, 1)
      ctx.fillStyle = '#7a5a14'
      ctx.fillRect(x + w / 2 - 1, y + h - 18, 2, 2)
      break
    }
    case 'vendorStool': {
      // Iconic plastic street stool — small, colorful.
      ctx.fillStyle = '#3a78c4'
      ctx.fillRect(x, y, w, h - 4)
      ctx.fillStyle = '#1a3a6a'
      ctx.fillRect(x, y + h - 5, w, 1)
      ctx.fillStyle = '#1a1410'
      ctx.fillRect(x + 1, y + h - 4, 2, 4)
      ctx.fillRect(x + w - 3, y + h - 4, 2, 4)
      ctx.fillStyle = '#5fa0e0'
      ctx.fillRect(x + 1, y + 1, w - 2, 1)
      break
    }
    case 'fruitCart': {
      // Two-wheel cart heaped with tropical fruit — dragonfruit pink with
      // green tips, a few mangosteens (deep purple), one rambutan (red).
      pixelBox(ctx, x + 2, y + h - 12, w - 4, 8, '#7b4a1d', '#3a2410')
      ctx.fillStyle = '#1a1a1a'
      ctx.fillRect(x + 4, y + h - 4, 5, 4)
      ctx.fillRect(x + w - 9, y + h - 4, 5, 4)
      // Dragonfruit
      ctx.fillStyle = '#e84a72'
      ctx.fillRect(x + 4, y + h - 18, 6, 6)
      ctx.fillRect(x + 10, y + h - 16, 6, 4)
      ctx.fillRect(x + 16, y + h - 19, 6, 7)
      ctx.fillStyle = '#3aa84a'
      ctx.fillRect(x + 6, y + h - 19, 2, 2)
      ctx.fillRect(x + 12, y + h - 17, 2, 2)
      ctx.fillRect(x + 18, y + h - 21, 2, 3)
      // Mangosteen
      ctx.fillStyle = '#5c2e6a'
      ctx.fillRect(x + 8, y + h - 22, 4, 4)
      // Rambutan
      ctx.fillStyle = '#c0282a'
      ctx.fillRect(x + 20, y + h - 23, 3, 3)
      ctx.fillStyle = '#fff'
      ctx.fillRect(x + 5, y + h - 17, 1, 1)
      ctx.fillRect(x + 17, y + h - 18, 1, 1)
      break
    }
    case 'phoBowl': {
      // Ceramic phở bowl — broth with steam curls.
      pixelBox(ctx, x, y + h - 8, w, 8, '#f5e8c8', '#a8884a')
      ctx.fillStyle = '#a06030'
      ctx.fillRect(x + 2, y + h - 7, w - 4, 3)
      ctx.fillStyle = '#f0d4a0'
      ctx.fillRect(x + 4, y + h - 6, 4, 1)
      ctx.fillRect(x + w - 8, y + h - 6, 4, 1)
      ctx.fillStyle = '#3aa84a'
      ctx.fillRect(x + w / 2 - 1, y + h - 6, 2, 1)
      // Static steam puffs (no animation — keeps motion budget for tears)
      ctx.fillStyle = '#fff'
      ctx.fillRect(x + 4, y + 2, 3, 2)
      ctx.fillRect(x + w - 7, y, 3, 2)
      ctx.fillStyle = '#dde9d9'
      ctx.fillRect(x + w / 2 - 2, y - 1, 4, 2)
      break
    }
    case 'clockTowerBoss': {
      // Bến Thành Market clock tower. Drawn upward from the bossZone box,
      // extending well above it for skyline drama. Avatar still wins on
      // contacting the (smaller) collision box.
      const towerW = 36
      const tx = x + (w - towerW) / 2
      const baseY = y + h
      // Tall body
      ctx.fillStyle = '#e8b653'
      ctx.fillRect(tx, baseY - 110, towerW, 110)
      ctx.fillStyle = '#a8782e'
      ctx.fillRect(tx + towerW - 2, baseY - 110, 2, 110)
      // Body horizontal cornices
      ctx.fillStyle = '#7a5a14'
      ctx.fillRect(tx, baseY - 110, towerW, 2)
      ctx.fillRect(tx, baseY - 70, towerW, 2)
      // Big clock face
      ctx.fillStyle = '#3a2516'
      ctx.fillRect(tx + 8, baseY - 60, 20, 20)
      ctx.fillStyle = '#fdf6dd'
      ctx.fillRect(tx + 10, baseY - 58, 16, 16)
      ctx.fillStyle = '#3a2516'
      ctx.fillRect(tx + 17, baseY - 50, 2, 8)
      ctx.fillRect(tx + 17, baseY - 50, 6, 2)
      // "BẾN THÀNH" pixel banner (no real Unicode — yellow dabs on dark)
      ctx.fillStyle = '#3a2516'
      ctx.fillRect(tx, baseY - 30, towerW, 8)
      ctx.fillStyle = '#f5d04a'
      for (let k = 0; k < 8; k++) {
        ctx.fillRect(tx + 2 + k * 4, baseY - 28, 2, 4)
      }
      // Stepped domed terracotta roof
      ctx.fillStyle = '#a04032'
      ctx.fillRect(tx - 2, baseY - 116, towerW + 4, 6)
      ctx.fillRect(tx + 2, baseY - 122, towerW - 4, 6)
      ctx.fillRect(tx + 6, baseY - 128, towerW - 12, 6)
      ctx.fillRect(tx + 12, baseY - 134, towerW - 24, 6)
      ctx.fillStyle = '#7a2e26'
      ctx.fillRect(tx + towerW / 2 - 1, baseY - 144, 2, 10)
      // Tiny red flag
      ctx.fillStyle = '#b8242a'
      ctx.fillRect(tx + towerW / 2 + 1, baseY - 144, 6, 4)
      ctx.fillStyle = '#f5d04a'
      ctx.fillRect(tx + towerW / 2 + 3, baseY - 143, 2, 2)
      // Doorway at base
      ctx.fillStyle = '#3a2516'
      ctx.fillRect(tx + towerW / 2 - 4, baseY - 18, 8, 18)
      ctx.fillStyle = '#7a5a14'
      ctx.fillRect(tx + towerW / 2 - 4, baseY - 18, 8, 1)
      drawText(ctx, 'BENTHANH', x - 4, y + h + 4, 7, '#fff')
      break
    }
    case 'aoDaiMom': {
      // Mom waiting at the base of the clock tower in a yellow áo dài,
      // facing left toward the chibi. Decoration only — no collision.
      ctx.fillStyle = '#1a0e08'
      ctx.fillRect(x + 3, y, 8, 4)
      ctx.fillRect(x + 2, y + 3, 10, 6)
      ctx.fillStyle = '#f4c89a'
      ctx.fillRect(x + 4, y + 4, 6, 4)
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + 5, y + 6, 1, 1)
      ctx.fillRect(x + 8, y + 6, 1, 1)
      ctx.fillStyle = '#f0c050'
      ctx.fillRect(x + 2, y + 9, 10, 10)
      ctx.fillStyle = '#c89530'
      ctx.fillRect(x + 6, y + 10, 1, 9)
      ctx.fillStyle = '#f4c89a'
      ctx.fillRect(x, y + 11, 2, 5)
      ctx.fillRect(x + 12, y + 11, 2, 5)
      ctx.fillStyle = '#f0e8d8'
      ctx.fillRect(x + 3, y + 19, 8, 5)
      ctx.fillStyle = '#a8a094'
      ctx.fillRect(x + 3, y + 23, 8, 1)
      break
    }

    /* ─── World 2 (Texas, 1992–2005) ───
     *
     * Dallas-suburb auto-runner: yellow school buses, textbook stacks,
     * a Texas Lone Star flagpole, a strip-mall sign, a garage trash can
     * with raccoon eyes, a periodic lawn sprinkler that telegraphs then
     * sprays, a tipped kids' bike, a knee-high mailbox, walk-through
     * metal detector arches (era of daily checkpoint at Warren Travis
     * White HS), and a passing pickup truck. The boss zone is the
     * WTW HS metal detector — chibi walks through cleanly, no beep. */
    case 'schoolBus': {
      // Long flat-front yellow body, hood, side windows, "SCHOOL BUS" stripe.
      // School buses are ~64 px wide in our world units; we draw the right
      // half (back of bus) so the player sees it "passing" from left to right.
      ctx.fillStyle = '#f5c63a'
      ctx.fillRect(x, y, w, h - 4)
      ctx.fillStyle = '#cca12a'
      ctx.fillRect(x, y + h - 6, w, 2)
      // Black "SCHOOL BUS" stripe
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + 2, y + h - 14, w - 4, 2)
      ctx.fillStyle = '#f5c63a'
      drawText(ctx, 'BUS', x + 4, y + h - 13, 6, '#1d1d1d')
      // Windows — three across, blue tinted
      ctx.fillStyle = '#3a4a5e'
      for (let wx = x + 4; wx < x + w - 6; wx += 12) {
        ctx.fillRect(wx, y + 4, 8, 8)
      }
      ctx.fillStyle = '#5fc6e6'
      for (let wx = x + 5; wx < x + w - 6; wx += 12) {
        ctx.fillRect(wx, y + 5, 6, 4)
      }
      // Roof "STOP" arm flag
      ctx.fillStyle = '#d63b2c'
      ctx.fillRect(x + w - 14, y - 4, 10, 6)
      ctx.fillStyle = '#fff'
      ctx.fillRect(x + w - 12, y - 3, 6, 4)
      ctx.fillStyle = '#d63b2c'
      drawText(ctx, 'S', x + w - 11, y - 4, 4, '#d63b2c')
      // Wheels
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + 4, y + h - 6, 8, 6)
      ctx.fillRect(x + w - 14, y + h - 6, 8, 6)
      ctx.fillStyle = '#5a6068'
      ctx.fillRect(x + 6, y + h - 4, 4, 3)
      ctx.fillRect(x + w - 12, y + h - 4, 4, 3)
      break
    }
    case 'texasTextbookStack': {
      // 3 stacked textbooks — varied warm spines: Texas history red,
      // pre-AP English green, math blue. Brass-tape spine ribs.
      const colors = ['#a02038', '#3a6a4a', '#2a4a78']
      const accents = ['#7a1a20', '#1a4a2a', '#1a2a58']
      const tierH = Math.floor(h / 3)
      for (let i = 0; i < 3; i++) {
        const ty = y + i * tierH + (i === 2 ? h - 3 * tierH : 0)
        pixelBox(ctx, x + (i === 1 ? 1 : 0), ty, w - (i === 1 ? 2 : 0), tierH, colors[i], accents[i])
        ctx.fillStyle = '#f0e6c0'
        ctx.fillRect(x + 2, ty + 2, 6, 1)
        ctx.fillRect(x + 2, ty + tierH - 3, 6, 1)
        // Brass spine tape
        ctx.fillStyle = '#cfa44a'
        ctx.fillRect(x, ty + tierH - 2, w, 1)
      }
      // Pencil tip sticking out
      ctx.fillStyle = '#ffd24a'
      ctx.fillRect(x + w - 2, y + 2, 4, 1)
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + w + 2, y + 2, 2, 1)
      break
    }
    case 'texasFlagPole': {
      // Tall pole + a pixel-impression Texas Lone Star flag at the top.
      // Bbox: w ≈ 18, h ≈ 56. Pole runs full height; flag occupies the
      // top ~22 px and over-spills to the right.
      const poleX = x + Math.floor(w / 2) - 1
      // Pole (silver)
      ctx.fillStyle = '#9aa3ad'
      ctx.fillRect(poleX, y, 2, h)
      ctx.fillStyle = '#5a6068'
      ctx.fillRect(poleX + 1, y, 1, h)
      // Pole cap
      ctx.fillStyle = '#cfa44a'
      ctx.fillRect(poleX - 1, y - 2, 4, 2)
      // Lone Star flag — 24 × 14 to the right of the pole.
      const fx = poleX + 2
      const fy = y + 2
      const fw = 24
      const fh = 14
      // Hoist field: deep navy blue, top half left third
      ctx.fillStyle = '#1a3a78'
      ctx.fillRect(fx, fy, 8, fh)
      // Top white stripe (right two-thirds)
      ctx.fillStyle = '#fdfdfd'
      ctx.fillRect(fx + 8, fy, fw - 8, Math.floor(fh / 2))
      // Bottom red stripe
      ctx.fillStyle = '#bf2a2a'
      ctx.fillRect(fx + 8, fy + Math.floor(fh / 2), fw - 8, fh - Math.floor(fh / 2))
      // White Lone Star at center of the blue field
      ctx.fillStyle = '#fdfdfd'
      drawTinyStar(ctx, fx + 4, fy + Math.floor(fh / 2), 2)
      // Flag ripple
      const ripple = prefersReducedMotion() ? 0 : Math.floor(time / 200) % 2
      if (ripple) {
        ctx.fillStyle = '#1a3a78'
        ctx.fillRect(fx + fw - 1, fy, 1, 2)
      }
      break
    }
    case 'stripMallSign': {
      // 90s-strip-mall stylized sign — square cabinet with bold pixel
      // letters. We avoid trademark names; the cabinet says "MART" so it
      // reads as era-authentic strip mall without naming Blockbuster /
      // Taco Bell specifically.
      ctx.fillStyle = '#5a6068'
      ctx.fillRect(x + Math.floor(w / 2) - 1, y + h - 8, 2, 8)
      pixelBox(ctx, x, y, w, h - 8, '#7028a0', '#3a1450')
      ctx.fillStyle = '#ffd24a'
      ctx.fillRect(x + 2, y + 3, w - 4, h - 16)
      drawText(ctx, 'MART', x + 3, y + 6, 7, '#1d1d1d')
      // Era-specific corner dabs (purple/yellow neon)
      ctx.fillStyle = '#ff66cc'
      ctx.fillRect(x, y, 2, 2)
      ctx.fillRect(x + w - 2, y, 2, 2)
      break
    }
    case 'garageTrashCan': {
      // Aluminum trash can w/ a lid askew. Two raccoon eyes peek out from
      // a dark gap below the lid.
      pixelBox(ctx, x + 1, y + 4, w - 2, h - 4, '#7a8088', '#4a505a')
      // Vertical ridge highlights
      ctx.fillStyle = '#9aa3ad'
      for (let rx = x + 3; rx < x + w - 3; rx += 4) {
        ctx.fillRect(rx, y + 5, 1, h - 6)
      }
      // Tilted lid
      ctx.fillStyle = '#5a6068'
      ctx.fillRect(x, y + 2, w - 2, 3)
      ctx.fillStyle = '#3a3a40'
      ctx.fillRect(x, y + 4, w - 2, 1)
      // Lid handle
      ctx.fillStyle = '#cfa44a'
      ctx.fillRect(x + Math.floor(w / 2) - 1, y, 2, 2)
      // Dark gap under the lid where the raccoon peers
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + 4, y + 5, w - 10, 3)
      // Raccoon eyes — two yellow dots in the dark gap
      ctx.fillStyle = '#ffd24a'
      ctx.fillRect(x + 5, y + 6, 1, 1)
      ctx.fillRect(x + 8, y + 6, 1, 1)
      // Black eye pupils
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + 5, y + 6, 1, 1)
      ctx.fillRect(x + 8, y + 6, 1, 1)
      // Mask hint — small grey snout below eyes
      ctx.fillStyle = '#9aa3ad'
      ctx.fillRect(x + 6, y + 7, 2, 1)
      break
    }
    case 'lawnSprinkler': {
      // Three-state projectile. Off (caller skips). Windup: low hump shows
      // a stem rising. Fire: a fan-shaped water arc sweeps across the
      // lane — collidable only during fire.
      const phase: ProjectilePhase = (args.phase as ProjectilePhase) ?? 'fire'
      const elapsed = args.phaseElapsedMs ?? 0
      const total = Math.max(40, args.phaseTotalMs ?? 600)
      // Base stem
      ctx.fillStyle = '#3aa84a'
      ctx.fillRect(x + 2, y + h - 6, w - 4, 6)
      ctx.fillStyle = '#2c7d34'
      ctx.fillRect(x + 2, y + h - 6, w - 4, 1)
      // Brass head
      ctx.fillStyle = '#cfa44a'
      ctx.fillRect(x + Math.floor(w / 2) - 2, y + h - 10, 4, 4)
      if (phase === 'windup') {
        // Tick of pressure rising
        const t = Math.min(1, elapsed / total)
        const dropY = y + h - 12 - Math.floor(t * 4)
        ctx.fillStyle = '#7adcd0'
        ctx.fillRect(x + Math.floor(w / 2) - 1, dropY, 2, 2)
      } else {
        // Fan-shaped arc of water — a few diagonal drops + a near horizontal
        // sweep that crosses the lane at chibi-jump height.
        const flicker = Math.floor(time / 60) % 2
        ctx.fillStyle = '#7adcd0'
        // Vertical jet
        ctx.fillRect(x + Math.floor(w / 2) - 1, y + 4, 2, h - 14)
        // Right diagonal spray
        for (let i = 0; i < 8; i++) {
          const dx = x + Math.floor(w / 2) + 2 + i * 2
          const dy = y + 6 + Math.floor(i * 1.6) + flicker
          ctx.fillRect(dx, dy, 2, 2)
        }
        // Left diagonal spray
        for (let i = 0; i < 8; i++) {
          const dx = x + Math.floor(w / 2) - 4 - i * 2
          const dy = y + 6 + Math.floor(i * 1.6) + flicker
          ctx.fillRect(dx, dy, 2, 2)
        }
        // Bright water highlight near the head
        ctx.fillStyle = '#bdf'
        ctx.fillRect(x + Math.floor(w / 2) - 1, y + 4, 2, 4)
      }
      break
    }
    case 'kidsBike': {
      // Tipped-over kids' bike on its side. Two wheels, frame, handlebar.
      // Bright cyan/purple kids' bike colors.
      // Wheels
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + 1, y + h - 8, 8, 8)
      ctx.fillRect(x + w - 9, y + h - 8, 8, 8)
      ctx.fillStyle = '#9aa3ad'
      ctx.fillRect(x + 3, y + h - 6, 4, 4)
      ctx.fillRect(x + w - 7, y + h - 6, 4, 4)
      // Frame
      ctx.fillStyle = '#3ad4d4'
      ctx.fillRect(x + 6, y + h - 12, w - 12, 4)
      // Seat post + seat
      ctx.fillStyle = '#5a3614'
      ctx.fillRect(x + Math.floor(w * 0.65), y + h - 14, 2, 4)
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + Math.floor(w * 0.6), y + h - 16, 6, 2)
      // Handlebar
      ctx.fillStyle = '#9aa3ad'
      ctx.fillRect(x + 6, y + h - 18, 2, 6)
      ctx.fillStyle = '#7028a0'
      ctx.fillRect(x + 3, y + h - 19, 8, 2)
      break
    }
    case 'mailbox': {
      // Knee-high curbside mailbox on a post, red flag UP.
      const postX = x + Math.floor(w / 2) - 1
      ctx.fillStyle = '#5a3614'
      ctx.fillRect(postX, y + h - 12, 2, 12)
      // Box (silver, arched top)
      ctx.fillStyle = '#7a8088'
      ctx.fillRect(x, y, w, h - 12)
      ctx.fillStyle = '#9aa3ad'
      ctx.fillRect(x + 1, y + 1, w - 2, 1)
      // Door + handle
      ctx.fillStyle = '#5a6068'
      ctx.fillRect(x + 1, y + 4, w - 2, h - 18)
      ctx.fillStyle = '#cfa44a'
      ctx.fillRect(x + w - 4, y + Math.floor((h - 14) / 2), 2, 2)
      // Red flag UP
      ctx.fillStyle = '#d63b2c'
      ctx.fillRect(x + w - 1, y - 2, 6, 4)
      ctx.fillStyle = '#7a1a14'
      ctx.fillRect(x + w - 1, y + 2, 1, 4)
      break
    }
    case 'wtwArch': {
      // Walk-through metal-detector arch — yellow-and-grey, mid-height,
      // little square beep light up top. Two columns + a top bar; the
      // top bar is the collidable top of the bbox.
      // Top crossbar (the actual hazard)
      ctx.fillStyle = '#ffd24a'
      ctx.fillRect(x, y, w, 6)
      ctx.fillStyle = '#cfa44a'
      ctx.fillRect(x, y, w, 1)
      ctx.fillRect(x, y + 5, w, 1)
      // Beep light
      ctx.fillStyle = '#3aa84a'
      ctx.fillRect(x + Math.floor(w / 2) - 1, y + 1, 2, 3)
      // Side columns down to the ground line
      ctx.fillStyle = '#9aa3ad'
      ctx.fillRect(x + 1, y + 6, 4, GROUND_Y - (y + 6))
      ctx.fillRect(x + w - 5, y + 6, 4, GROUND_Y - (y + 6))
      ctx.fillStyle = '#5a6068'
      ctx.fillRect(x + 1, y + 6, 1, GROUND_Y - (y + 6))
      ctx.fillRect(x + w - 5, y + 6, 1, GROUND_Y - (y + 6))
      // Mini label band
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x - 2, y - 6, w + 4, 4)
      drawText(ctx, 'WTW', x + 4, y - 6, 4, '#ffd24a')
      break
    }
    case 'pickupTruck': {
      // Pixel Ford-F150-shape pickup truck — boxy cab + bed, chrome
      // grille, dusty trail behind. Used as a low decoration / hazard.
      // Cab + bed bodywork
      ctx.fillStyle = '#a02038'
      ctx.fillRect(x + 2, y + h - 18, w - 4, 12)
      // Cab top (slightly taller right portion is the cab)
      ctx.fillRect(x + Math.floor(w / 2) - 4, y + h - 24, Math.floor(w / 2) + 2, 6)
      // Cab window
      ctx.fillStyle = '#5fc6e6'
      ctx.fillRect(x + Math.floor(w / 2) - 2, y + h - 22, Math.floor(w / 2) - 2, 4)
      ctx.fillStyle = '#3a4a5e'
      ctx.fillRect(x + Math.floor(w / 2) - 2, y + h - 22, 1, 4)
      // Grille
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x, y + h - 14, 4, 4)
      ctx.fillStyle = '#9aa3ad'
      ctx.fillRect(x, y + h - 14, 4, 1)
      ctx.fillRect(x, y + h - 11, 4, 1)
      // Headlight
      ctx.fillStyle = '#fff7c2'
      ctx.fillRect(x, y + h - 17, 2, 2)
      // Wheel wells + wheels
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + 4, y + h - 6, 8, 6)
      ctx.fillRect(x + w - 12, y + h - 6, 8, 6)
      ctx.fillStyle = '#5a6068'
      ctx.fillRect(x + 6, y + h - 4, 4, 3)
      ctx.fillRect(x + w - 10, y + h - 4, 4, 3)
      // Dust trail behind (only if not reduced motion)
      if (!prefersReducedMotion()) {
        const drift = Math.floor(time / 80) % 3
        ctx.fillStyle = 'rgba(168, 120, 74, 0.55)'
        ctx.fillRect(x + w, y + h - 8 + drift, 4, 2)
        ctx.fillRect(x + w + 4, y + h - 5 + drift, 6, 2)
      }
      break
    }
    case 'wtwBoss': {
      // Boss zone: full Warren Travis White HS metal detector arch with
      // a stylized "WTW HS" sign and arrows pointing through. Drawn
      // upward from the bossZone box.
      const archW = Math.min(48, w)
      const ax = x + Math.floor((w - archW) / 2)
      // Top crossbar
      ctx.fillStyle = '#ffd24a'
      ctx.fillRect(ax, y, archW, 8)
      ctx.fillStyle = '#cfa44a'
      ctx.fillRect(ax, y, archW, 1)
      ctx.fillRect(ax, y + 7, archW, 1)
      // Vertical columns
      ctx.fillStyle = '#9aa3ad'
      ctx.fillRect(ax + 2, y + 8, 5, h - 10)
      ctx.fillRect(ax + archW - 7, y + 8, 5, h - 10)
      ctx.fillStyle = '#5a6068'
      ctx.fillRect(ax + 2, y + 8, 1, h - 10)
      ctx.fillRect(ax + archW - 7, y + 8, 1, h - 10)
      // Beep light — calm green (no beep)
      ctx.fillStyle = '#3aa84a'
      ctx.fillRect(ax + Math.floor(archW / 2) - 2, y + 2, 4, 4)
      // School name sign above the arch
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(ax - 4, y - 18, archW + 8, 12)
      ctx.fillStyle = '#3a2410'
      ctx.fillRect(ax - 4, y - 18, archW + 8, 2)
      ctx.fillRect(ax - 4, y - 8, archW + 8, 2)
      drawText(ctx, 'WTW HS', ax, y - 16, 8, '#ffd24a')
      // Pixel-arrow "→" stencil between the columns to telegraph "walk through"
      ctx.fillStyle = '#fdfdfd'
      const arrowY = y + Math.floor((h - 10) / 2) + 4
      ctx.fillRect(ax + 10, arrowY, archW - 20, 2)
      ctx.fillRect(ax + archW - 14, arrowY - 2, 2, 6)
      ctx.fillRect(ax + archW - 16, arrowY - 1, 2, 4)
      // Pixel chibi placeholder shadow walking through (silent payoff)
      ctx.fillStyle = '#2a2a26'
      ctx.fillRect(ax + Math.floor(archW / 2) - 6, y + h - 2, 12, 2)
      // Pre-text label below the bbox
      drawText(ctx, 'WTW HS', x, y + h + 4, 7, '#fff')
      break
    }

    /* ─── World 3 (UT Austin, 2005–2008) ───
     *
     * Evening campus auto-runner: textbook stacks, takeout coffee cups,
     * a student bicycle, a library push-cart, a Cap-Metro bus-stop pole,
     * an alarm-clock projectile (kept from the original W3 mix), a
     * pizza-box stack, a banh-mi cart, a co-op composting bin, a film
     * slate, scattered ginkgo leaves on the sidewalk. Boss zone is the
     * UT Tower with a glowing graduation-cap clock face. */
    case 'alarmClock': {
      // Burnt-orange clock body (UT colors) with white face, ringer bells.
      pixelBox(ctx, x, y, w, h, '#bf5700', '#5a2200')
      ctx.fillStyle = '#fdf6dd'
      ctx.fillRect(x + 3, y + 3, w - 6, h - 6)
      // Clock hands
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + w / 2, y + h / 2, 1, 4)
      ctx.fillRect(x + w / 2, y + h / 2, 4, 1)
      // Ringer bells
      ctx.fillStyle = '#bf5700'
      ctx.fillRect(x + 1, y - 2, 4, 3)
      ctx.fillRect(x + w - 5, y - 2, 4, 3)
      break
    }
    case 'utTextbook': {
      // Three-volume textbook stack — Film/Anthro/Lit. Each spine has a
      // pixel-letter label so they read as different books even at small
      // sizes. Burnt-orange / cream stack with brown spine tape.
      const tiers: Array<[string, string, string]> = [
        ['#bf5700', '#5a2200', 'FILM'],
        ['#3a3a4a', '#1d1d1d', 'ANTH'],
        ['#7a5a14', '#3a2410', 'LIT'],
      ]
      const tierH = Math.floor(h / 3)
      for (let i = 0; i < 3; i++) {
        const ty = y + i * tierH + (i === 2 ? h - 3 * tierH : 0)
        pixelBox(
          ctx,
          x + (i === 1 ? 1 : 0),
          ty,
          w - (i === 1 ? 2 : 0),
          tierH,
          tiers[i][0],
          tiers[i][1]
        )
        ctx.fillStyle = '#cfa44a'
        ctx.fillRect(x, ty + tierH - 1, w, 1)
        drawText(ctx, tiers[i][2], x + 2, ty + 1, 5, '#fdf6dd')
      }
      break
    }
    case 'studentBike': {
      // Upright single-speed bike chained to a low pole. Two wheels +
      // diamond frame + handlebars. Pastel mint frame (era-appropriate).
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + 1, y + h - 8, 8, 8)
      ctx.fillRect(x + w - 9, y + h - 8, 8, 8)
      ctx.fillStyle = '#5a6068'
      ctx.fillRect(x + 3, y + h - 6, 4, 4)
      ctx.fillRect(x + w - 7, y + h - 6, 4, 4)
      // Mint diamond frame
      ctx.fillStyle = '#9adcb4'
      ctx.fillRect(x + 4, y + h - 14, 2, 6)
      ctx.fillRect(x + w - 6, y + h - 14, 2, 6)
      ctx.fillRect(x + 4, y + h - 14, w - 8, 2)
      ctx.fillRect(x + 5, y + h - 12, w - 10, 1)
      // Handlebar
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + 3, y + h - 18, 6, 2)
      // U-lock to mini pole (chained-up vibe)
      ctx.fillStyle = '#cfa44a'
      ctx.fillRect(x + Math.floor(w / 2), y + h - 6, 2, 4)
      break
    }
    case 'coffeeCup': {
      // White takeout coffee cup with brown lid, paper sleeve. ~14×18.
      ctx.fillStyle = '#fdf6dd'
      ctx.fillRect(x + 1, y + 4, w - 2, h - 4)
      ctx.fillStyle = '#e0d0a0'
      ctx.fillRect(x + 1, y + h - 2, w - 2, 1)
      // Brown sleeve in the middle
      ctx.fillStyle = '#7a5a14'
      ctx.fillRect(x + 1, y + 9, w - 2, 5)
      // Lid
      ctx.fillStyle = '#3a2410'
      ctx.fillRect(x, y, w, 5)
      ctx.fillStyle = '#7a5a14'
      ctx.fillRect(x + 1, y + 1, w - 2, 1)
      // Sip lid hole
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + Math.floor(w / 2) - 1, y + 1, 2, 2)
      // Light steam wisp
      if (!prefersReducedMotion()) {
        const wisp = Math.floor(time / 200) % 3
        ctx.fillStyle = '#fff'
        ctx.fillRect(x + Math.floor(w / 2) - 1, y - 2 - wisp, 2, 1)
      }
      break
    }
    case 'bookTrolley': {
      // Library push-cart with two shelves of books + four casters.
      // Bbox approx 28×26.
      pixelBox(ctx, x, y + 2, w, h - 6, '#9aa3ad', '#5a6068')
      // Top shelf books (varied spines)
      const spines = ['#bf5700', '#3a6a4a', '#2a4a78', '#a02038']
      for (let i = 0; i < 4; i++) {
        const sx = x + 2 + i * Math.floor((w - 4) / 4)
        const sw = Math.floor((w - 4) / 4) - 1
        ctx.fillStyle = spines[i % spines.length]
        ctx.fillRect(sx, y + 3, sw, 6)
      }
      // Middle shelf books
      for (let i = 0; i < 4; i++) {
        const sx = x + 2 + i * Math.floor((w - 4) / 4)
        const sw = Math.floor((w - 4) / 4) - 1
        ctx.fillStyle = spines[(i + 2) % spines.length]
        ctx.fillRect(sx, y + 12, sw, 6)
      }
      // Push handle
      ctx.fillStyle = '#5a6068'
      ctx.fillRect(x + w - 3, y, 3, 4)
      ctx.fillRect(x + w - 8, y, 5, 2)
      // Wheels
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + 2, y + h - 3, 3, 3)
      ctx.fillRect(x + w - 5, y + h - 3, 3, 3)
      break
    }
    case 'capMetroPole': {
      // Tall bus-stop pole — Capital Metro yellow + black. A small flag
      // sign sticks out the top with the iconic CM yellow swoosh.
      const poleX = x + Math.floor(w / 2) - 1
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(poleX, y + 8, 2, h - 8)
      // Top sign (yellow rectangle with black border)
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x - 4, y, w + 8, 12)
      ctx.fillStyle = '#f5c63a'
      ctx.fillRect(x - 2, y + 2, w + 4, 8)
      // Tiny BUS letterform
      drawText(ctx, 'BUS', x - 2, y + 3, 6, '#1d1d1d')
      // Yellow swoosh on the post
      ctx.fillStyle = '#f5c63a'
      ctx.fillRect(poleX - 2, y + 16, 6, 2)
      break
    }
    case 'pizzaBox': {
      // Two-tier pizza box stack, cardboard brown with red logo block.
      const tierH = Math.floor(h / 2)
      for (let i = 0; i < 2; i++) {
        const ty = y + i * tierH
        pixelBox(ctx, x, ty, w, tierH, '#d8a868', '#7a5a14')
        // Logo block on top tier
        ctx.fillStyle = '#a02038'
        ctx.fillRect(x + 2, ty + 2, 8, 4)
        ctx.fillStyle = '#fdf6dd'
        ctx.fillRect(x + 12, ty + 2, w - 14, 2)
      }
      break
    }
    case 'banhMiCart': {
      // Vendor cart with a green canopy + baguettes. A few baguette
      // silhouettes stick up out of the cart.
      // Body
      pixelBox(ctx, x + 2, y + h - 14, w - 4, 10, '#cfa44a', '#7a5a14')
      // Glass case
      ctx.fillStyle = '#5fc6e6'
      ctx.fillRect(x + 4, y + h - 12, w - 8, 6)
      // Baguettes
      ctx.fillStyle = '#e8c882'
      ctx.fillRect(x + 4, y + h - 18, 4, 6)
      ctx.fillRect(x + 10, y + h - 20, 4, 8)
      ctx.fillRect(x + 16, y + h - 17, 4, 5)
      ctx.fillStyle = '#a8884a'
      ctx.fillRect(x + 4, y + h - 18, 4, 1)
      ctx.fillRect(x + 10, y + h - 20, 4, 1)
      ctx.fillRect(x + 16, y + h - 17, 4, 1)
      // Green canopy
      ctx.fillStyle = '#3aa84a'
      ctx.fillRect(x, y, w, 3)
      ctx.fillStyle = '#2c7d34'
      ctx.fillRect(x, y + 3, w, 1)
      // Canopy stripes
      ctx.fillStyle = '#fdf6dd'
      for (let i = 0; i < w; i += 4) {
        ctx.fillRect(x + i, y, 2, 3)
      }
      // Support post on each side
      ctx.fillStyle = '#3a2410'
      ctx.fillRect(x + 1, y + 4, 1, h - 18)
      ctx.fillRect(x + w - 2, y + 4, 1, h - 18)
      // Wheels
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + 4, y + h - 4, 4, 4)
      ctx.fillRect(x + w - 8, y + h - 4, 4, 4)
      break
    }
    case 'compostBin': {
      // Green co-op composting bin with a curved lid and "C" sticker.
      pixelBox(ctx, x, y + 2, w, h - 2, '#3aa84a', '#1a4a2a')
      ctx.fillStyle = '#5fc66a'
      ctx.fillRect(x + 1, y + 3, w - 2, 1)
      // Lid (slightly darker)
      ctx.fillStyle = '#2c7d34'
      ctx.fillRect(x, y, w, 3)
      ctx.fillStyle = '#1a4a2a'
      ctx.fillRect(x, y + 2, w, 1)
      // Compost label "C"
      ctx.fillStyle = '#fdf6dd'
      drawText(ctx, 'C', x + Math.floor(w / 2) - 2, y + 6, 8, '#fdf6dd')
      // Foot
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x, y + h - 1, w, 1)
      break
    }
    case 'filmSlate': {
      // Pocket-size W3 film slate — like W4's clapboard but oriented as a
      // jump-low obstacle on the sidewalk. White/black striped clap arm
      // up top, dark body, "SCENE" label.
      const bodyTop = y + 3
      const bodyH = h - 3
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x, bodyTop, w, bodyH)
      // Clap arm (striped)
      for (let sx = 0; sx < w; sx += 3) {
        ctx.fillStyle = sx % 6 === 0 ? '#1d1d1d' : '#fdf6dd'
        ctx.fillRect(x + sx, y, 3, 3)
      }
      ctx.fillStyle = '#fdf6dd'
      drawText(ctx, 'SCN', x + 2, bodyTop + 2, 6, '#fdf6dd')
      break
    }
    case 'ginkgoLeaf': {
      // Decorative ground ginkgo leaf — fan-shaped yellow patch.
      ctx.fillStyle = '#f0c060'
      ctx.fillRect(x + 1, y - 1, 4, 1)
      ctx.fillRect(x, y, 6, 2)
      ctx.fillStyle = '#cfa44a'
      ctx.fillRect(x + 2, y + 1, 2, 1)
      ctx.fillStyle = '#7a5a14'
      ctx.fillRect(x + 2, y + 2, 1, 1)
      break
    }
    case 'utTowerGradBoss': {
      // UT Tower with a clock face that briefly reads with a graduation
      // cap pixel — paying off the "Stat: degree obtained" post-win line.
      const towerW = 28
      const tx = x + Math.floor((w - towerW) / 2)
      const baseY = y + h
      // Limestone shaft
      ctx.fillStyle = '#fdf6dd'
      ctx.fillRect(tx, baseY - 120, towerW, 120)
      ctx.fillStyle = '#d8c8a0'
      ctx.fillRect(tx + towerW - 2, baseY - 120, 2, 120)
      // Horizontal cornices
      ctx.fillStyle = '#7a6a3a'
      ctx.fillRect(tx, baseY - 120, towerW, 2)
      ctx.fillRect(tx, baseY - 80, towerW, 1)
      ctx.fillRect(tx, baseY - 40, towerW, 1)
      // Burnt-orange band at top
      ctx.fillStyle = '#bf5700'
      ctx.fillRect(tx, baseY - 142, towerW, 6)
      // Belfry block
      ctx.fillStyle = '#fdf6dd'
      ctx.fillRect(tx - 2, baseY - 136, towerW + 4, 12)
      ctx.fillStyle = '#bf5700'
      ctx.fillRect(tx - 2, baseY - 136, towerW + 4, 2)
      // Clock face (with grad-cap glyph)
      ctx.fillStyle = '#3a2410'
      ctx.fillRect(tx + Math.floor(towerW / 2) - 6, baseY - 110, 12, 12)
      ctx.fillStyle = '#fdf6dd'
      ctx.fillRect(tx + Math.floor(towerW / 2) - 4, baseY - 108, 8, 8)
      // Graduation cap glyph (mortarboard + tassel)
      const capY = baseY - 105
      const capX = tx + Math.floor(towerW / 2) - 3
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(capX, capY, 6, 1)
      ctx.fillRect(capX + 1, capY + 1, 4, 2)
      // Tassel
      ctx.fillStyle = '#bf5700'
      ctx.fillRect(capX + 4, capY + 1, 1, 3)
      // Stepped roof
      ctx.fillStyle = '#7a3814'
      ctx.fillRect(tx + 4, baseY - 148, towerW - 8, 6)
      ctx.fillRect(tx + 8, baseY - 154, towerW - 16, 6)
      // Tip + tiny flag
      ctx.fillStyle = '#3a2410'
      ctx.fillRect(tx + Math.floor(towerW / 2) - 1, baseY - 162, 2, 8)
      ctx.fillStyle = '#bf5700'
      ctx.fillRect(tx + Math.floor(towerW / 2) + 1, baseY - 162, 6, 4)
      // Doorway at base
      ctx.fillStyle = '#3a2410'
      ctx.fillRect(tx + Math.floor(towerW / 2) - 4, baseY - 14, 8, 14)
      drawText(ctx, 'UT', x - 4, y + h + 4, 8, '#fff')
      break
    }

    /* ─── World 4 (LA / Hollywood, 2008–2009) ───
     *
     * Glamour zone. Static-jump props (red carpet, director chair, klieg
     * tripod, clapboard, audition headshots, stiletto), tall-jump props
     * (star-on-pedestal, parking meter), and timing hazards (paparazzi
     * flashbulb, klieg sweep) — all drawn in stepped 16-bit colors.
     * Boss zone is a → KOREA jetway paying off the post-win flavor. */
    case 'velvetRope': {
      // Two gold stanchion posts with a sagging maroon-velvet rope.
      const baseY = y + h
      ctx.fillStyle = '#cfa44a'
      ctx.fillRect(x + 1, y + 6, 3, h - 6)
      ctx.fillRect(x + w - 4, y + 6, 3, h - 6)
      ctx.fillStyle = '#d4a93a'
      ctx.fillRect(x + 1, baseY - 2, 3, 1)
      ctx.fillRect(x + w - 4, baseY - 2, 3, 1)
      ctx.fillStyle = '#f0e6d0'
      ctx.fillRect(x, y + 4, 5, 4)
      ctx.fillRect(x + w - 5, y + 4, 5, 4)
      ctx.fillStyle = '#a02038'
      const ropeYMid = y + 11
      for (let rx = x + 4; rx < x + w - 3; rx++) {
        const dip = Math.round(Math.sin(((rx - x) / (w - 6)) * Math.PI) * 3)
        ctx.fillRect(rx, ropeYMid + dip, 1, 2)
      }
      ctx.fillStyle = '#5a1020'
      ctx.fillRect(x + 4, ropeYMid + 3, w - 8, 1)
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x, baseY - 1, w, 1)
      break
    }

    case 'directorChair': {
      const seatTop = y + 2
      const seatH = Math.max(8, Math.floor(h / 2.2))
      ctx.fillStyle = '#7a1a14'
      ctx.fillRect(x + 1, seatTop, w - 2, seatH)
      ctx.fillStyle = '#a02038'
      ctx.fillRect(x + 1, seatTop, w - 2, 2)
      ctx.fillStyle = '#fdf6dd'
      drawText(ctx, 'DIR', x + 2, seatTop + 2, 6, '#fdf6dd')
      ctx.fillStyle = '#5a3614'
      const legTop = seatTop + seatH
      const legBot = y + h
      ctx.fillRect(x, legTop, 2, legBot - legTop)
      ctx.fillRect(x + w - 2, legTop, 2, legBot - legTop)
      ctx.fillRect(x + Math.floor(w / 2) - 1, legTop + 2, 2, legBot - legTop - 2)
      ctx.fillStyle = '#3a2410'
      ctx.fillRect(x, legBot - 1, w, 1)
      break
    }

    case 'kliegTripod': {
      // Conical klieg light on a tripod — cream housing, gold trim, dim bulb.
      const lampW = w
      const lampH = Math.floor(h * 0.55)
      ctx.fillStyle = '#f0e6d0'
      ctx.fillRect(x + 2, y, lampW - 4, lampH - 2)
      ctx.fillStyle = '#cfa44a'
      ctx.fillRect(x + 2, y, lampW - 4, 2)
      ctx.fillRect(x + 2, y + lampH - 3, lampW - 4, 1)
      ctx.fillStyle = '#fff7c2'
      ctx.fillRect(x + lampW - 5, y + 3, 3, lampH - 8)
      ctx.fillStyle = '#3a2410'
      ctx.fillRect(x + lampW / 2 - 1, y + lampH - 2, 2, 2)
      ctx.fillStyle = '#5a6068'
      const baseY = y + lampH
      ctx.fillRect(x + lampW / 2 - 1, baseY, 2, 4)
      ctx.fillStyle = '#3c364a'
      ctx.fillRect(x, y + h - 2, 4, 2)
      ctx.fillRect(x + lampW / 2 - 1, y + h - 2, 2, 2)
      ctx.fillRect(x + lampW - 4, y + h - 2, 4, 2)
      ctx.fillStyle = '#5a6068'
      ctx.fillRect(x + 1, baseY + 4, 2, h - lampH - 6)
      ctx.fillRect(x + lampW - 3, baseY + 4, 2, h - lampH - 6)
      break
    }

    case 'clapboard': {
      const bodyTop = y + 4
      const bodyH = h - 4
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x, bodyTop, w, bodyH)
      ctx.fillStyle = '#fdf6dd'
      const stripeY = y + 1
      for (let sx = 0; sx < w; sx += 4) {
        ctx.fillStyle = sx % 8 === 0 ? '#1d1d1d' : '#fdf6dd'
        ctx.fillRect(x + sx, stripeY, 4, 3)
      }
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x, stripeY + 3, w, 1)
      ctx.fillStyle = '#fdf6dd'
      drawText(ctx, 'TAKE', x + 2, bodyTop + 2, 6, '#fdf6dd')
      ctx.fillStyle = '#cfa44a'
      ctx.fillRect(x + w - 4, bodyTop + 2, 2, 2)
      break
    }

    case 'headshotStack': {
      // A leaning stack of glossy 8x10 portraits.
      ctx.fillStyle = '#3a2410'
      ctx.fillRect(x, y + h - 2, w, 2)
      const sheets = [
        { dx: 1, dy: 4, tilt: 0 },
        { dx: 2, dy: 2, tilt: 1 },
        { dx: 0, dy: 0, tilt: -1 },
      ]
      for (const s of sheets) {
        const sx = x + s.dx
        const sy = y + s.dy
        ctx.fillStyle = '#fdf6dd'
        ctx.fillRect(sx, sy, w - 2, h - 4)
        ctx.fillStyle = '#cfa44a'
        ctx.fillRect(sx, sy, w - 2, 1)
        ctx.fillStyle = '#a02038'
        ctx.fillRect(sx + 2, sy + h - 6, w - 6, 1)
        ctx.fillStyle = '#3a2410'
        ctx.fillRect(sx + Math.floor((w - 2) / 2) - 1, sy + 2, 2, 2)
        ctx.fillStyle = '#7a5a3a'
        ctx.fillRect(sx + Math.floor((w - 2) / 2) - 2, sy + 4, 4, 3)
        if (s.tilt !== 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.18)'
          ctx.fillRect(sx, sy + h - 4, w - 2, 1)
        }
      }
      break
    }

    case 'stilettoHeel': {
      // Petty industry vibe — a single dropped red stiletto on its side.
      ctx.fillStyle = '#d6324c'
      ctx.fillRect(x + 1, y + h - 6, w - 4, 4)
      ctx.fillRect(x + 1, y + h - 4, w - 8, 2)
      ctx.fillStyle = '#a02038'
      ctx.fillRect(x + 1, y + h - 6, 2, 4)
      ctx.fillRect(x + w - 4, y + h - 4, 1, 1)
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + w - 6, y + h - 1, 4, 1)
      ctx.fillStyle = '#5a1020'
      ctx.fillRect(x + w - 6, y + h - 2, 1, 2)
      ctx.fillStyle = '#ffd9c2'
      ctx.fillRect(x + 2, y + h - 5, w - 8, 1)
      break
    }

    case 'parkingMeter': {
      // Squat post + boxy meter head + red EXPIRED flag.
      const headY = y
      const headH = Math.floor(h * 0.55)
      ctx.fillStyle = '#5a6068'
      ctx.fillRect(x + Math.floor(w / 2) - 2, headY + headH, 4, h - headH)
      ctx.fillStyle = '#3c364a'
      ctx.fillRect(x + Math.floor(w / 2) - 2, y + h - 1, 4, 1)
      ctx.fillStyle = '#9aa3ad'
      ctx.fillRect(x, headY, w, headH)
      ctx.fillStyle = '#5a6068'
      ctx.fillRect(x, headY, w, 1)
      ctx.fillRect(x, headY + headH - 1, w, 1)
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + 2, headY + 3, w - 4, headH - 6)
      ctx.fillStyle = '#d6324c'
      const flagX = x + w - 1
      ctx.fillRect(flagX, headY + 4, 4, 4)
      ctx.fillStyle = '#fdf6dd'
      drawText(ctx, 'EX', flagX, headY + 4, 4, '#fdf6dd')
      break
    }

    case 'starPedestal': {
      // Marble pedestal with a gold star on top.
      const pedY = y + Math.floor(h * 0.4)
      ctx.fillStyle = '#e8c5cf'
      ctx.fillRect(x + 1, pedY, w - 2, h - (pedY - y))
      ctx.fillStyle = '#d8a3b0'
      ctx.fillRect(x + 1, pedY, w - 2, 1)
      ctx.fillRect(x + 1, pedY + 4, w - 2, 1)
      ctx.fillStyle = '#8b5a6b'
      ctx.fillRect(x, y + h - 1, w, 1)
      ctx.fillStyle = '#cfa44a'
      drawBigStar(ctx, x + Math.floor(w / 2), y + Math.floor(h * 0.25), 6)
      ctx.fillStyle = '#fff7c2'
      ctx.fillRect(x + Math.floor(w / 2) - 1, y + Math.floor(h * 0.2), 1, 1)
      break
    }

    case 'flashbulb': {
      // 3-state: off (caller skips), windup (250ms charge), fire (160ms).
      // Windup = camera silhouette + glowing ring forming. Fire = full white
      // flash + lens-glare cross. (Screen overlay tint is added later.)
      const phase: ProjectilePhase = (args.phase as ProjectilePhase) ?? 'fire'
      const elapsed = args.phaseElapsedMs ?? 0
      const total = Math.max(40, args.phaseTotalMs ?? 160)
      const cx = x + w / 2
      const cy = y + h / 2
      // Camera body silhouette (always drawn while visible).
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x, y + 4, w, h - 6)
      ctx.fillStyle = '#3a2410'
      ctx.fillRect(x + 2, y + 6, w - 4, h - 10)
      // Lens glass.
      ctx.fillStyle = '#5a6068'
      ctx.fillRect(cx - 2, cy - 1, 4, 4)
      // Flash unit perched on top.
      ctx.fillStyle = '#fdf6dd'
      ctx.fillRect(x + 2, y, w - 4, 4)
      ctx.fillStyle = '#cfa44a'
      ctx.fillRect(x + 2, y, w - 4, 1)
      if (phase === 'windup') {
        const t = Math.min(1, elapsed / total)
        const ringR = 1 + Math.floor(t * 4)
        ctx.fillStyle = `rgba(255, 247, 194, ${(0.35 + 0.5 * t).toFixed(2)})`
        ctx.fillRect(x + 2, y - 1, w - 4, 2)
        // Charging halo around the bulb.
        ctx.fillRect(x + 2 - ringR, y - 1, 2, 2)
        ctx.fillRect(x + w - 4 + ringR, y - 1, 2, 2)
        // Tiny "click" tick on the housing.
        if (Math.floor(time / 80) % 2 === 0) {
          ctx.fillStyle = '#cfa44a'
          ctx.fillRect(x + 1, y + h - 4, 1, 1)
        }
      } else {
        // Fire — bright bulb + four-arm lens glare cross.
        ctx.fillStyle = '#fff'
        ctx.fillRect(x + 2, y - 2, w - 4, 5)
        ctx.fillStyle = '#fff7c2'
        const beam = 18
        ctx.fillRect(cx - 1, y - beam, 2, beam + 4)
        ctx.fillRect(x - beam, cy - 1, beam + 4, 2)
        ctx.fillStyle = '#fff'
        ctx.fillRect(x + w / 2 - beam, cy - 1, beam * 2 + 2, 2)
        ctx.fillRect(cx - 1, y - beam, 2, beam * 2 + 2)
      }
      break
    }

    case 'kliegSweep': {
      // Vertical hazard cone sweeping down. Windup outlines the cone for
      // ~1s; fire fills it bright white for ~360ms (collidable). Drawn
      // floor-to-ceiling (caller passes y=0, h=GROUND_Y).
      const phase: ProjectilePhase = (args.phase as ProjectilePhase) ?? 'fire'
      const elapsed = args.phaseElapsedMs ?? 0
      const total = Math.max(40, args.phaseTotalMs ?? 360)
      const topY = y + 2
      const apexX = x + Math.floor(w / 2)
      const baseHalf = Math.floor(w / 2) + 6
      // Tripod-mounted source stub at the top.
      ctx.fillStyle = '#f0e6d0'
      ctx.fillRect(apexX - 4, topY - 4, 8, 4)
      ctx.fillStyle = '#cfa44a'
      ctx.fillRect(apexX - 4, topY - 4, 8, 1)
      if (phase === 'windup') {
        const t = Math.min(1, elapsed / total)
        const fillAlpha = (0.08 + 0.18 * t).toFixed(2)
        ctx.fillStyle = `rgba(255, 247, 194, ${fillAlpha})`
        for (let py = topY; py < y + h; py += 2) {
          const k = (py - topY) / Math.max(1, y + h - topY)
          const half = Math.max(2, Math.floor(2 + (baseHalf - 2) * k))
          ctx.fillRect(apexX - half, py, half * 2, 1)
        }
        // Crisp outline so the cone reads at distance.
        const outline = `rgba(255, 247, 194, ${(0.55 + 0.4 * t).toFixed(2)})`
        ctx.fillStyle = outline
        for (let py = topY; py < y + h; py += 1) {
          const k = (py - topY) / Math.max(1, y + h - topY)
          const half = Math.max(2, Math.floor(2 + (baseHalf - 2) * k))
          ctx.fillRect(apexX - half, py, 1, 1)
          ctx.fillRect(apexX + half - 1, py, 1, 1)
        }
        ctx.fillStyle = '#fff7c2'
        ctx.fillRect(apexX - baseHalf, y + h - 2, baseHalf * 2, 1)
      } else {
        // Fire — solid bright cone.
        for (let py = topY; py < y + h; py += 1) {
          const k = (py - topY) / Math.max(1, y + h - topY)
          const half = Math.max(2, Math.floor(2 + (baseHalf - 2) * k))
          ctx.fillStyle = '#fff7c2'
          ctx.fillRect(apexX - half, py, half * 2, 1)
        }
        ctx.fillStyle = '#fff'
        ctx.fillRect(apexX - 2, topY, 4, y + h - topY)
        // Hot pool at the base.
        ctx.fillStyle = '#fff'
        ctx.fillRect(apexX - baseHalf, y + h - 3, baseHalf * 2, 3)
      }
      break
    }

    case 'koreaJetway': {
      // The post-LA payoff: pixel jetway + departure sign reading "→ KOREA".
      // Designed so the chibi visibly steps INTO the corridor on win.
      const corridorY = y + 28
      const corridorH = h - 32
      // Suspended jetway corridor.
      ctx.fillStyle = '#e8c5cf'
      ctx.fillRect(x, corridorY, w, corridorH)
      ctx.fillStyle = '#d8a3b0'
      ctx.fillRect(x, corridorY, w, 2)
      ctx.fillRect(x, corridorY + corridorH - 2, w, 2)
      // Window strip.
      ctx.fillStyle = '#3c364a'
      ctx.fillRect(x + 2, corridorY + 6, w - 4, 8)
      ctx.fillStyle = '#5fc6e6'
      for (let wx = x + 4; wx < x + w - 6; wx += 8) {
        ctx.fillRect(wx, corridorY + 8, 4, 4)
      }
      // Door at the right end (chibi "boards" from the left).
      ctx.fillStyle = '#3a4a5e'
      ctx.fillRect(x + w - 8, corridorY + 4, 6, corridorH - 8)
      ctx.fillStyle = '#cfa44a'
      ctx.fillRect(x + w - 6, corridorY + corridorH / 2 - 1, 2, 2)
      // Suspension cables to the ceiling.
      ctx.fillStyle = '#5a6068'
      ctx.fillRect(x + 6, y + 16, 1, corridorY - y - 16)
      ctx.fillRect(x + Math.floor(w / 2), y + 16, 1, corridorY - y - 16)
      ctx.fillRect(x + w - 8, y + 16, 1, corridorY - y - 16)
      // Departure sign mounted above the corridor.
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x, y, w, 18)
      ctx.fillStyle = '#3a2410'
      ctx.fillRect(x, y, w, 2)
      ctx.fillRect(x, y + 16, w, 2)
      // Glowing amber-yellow split-flap text "→ KOREA".
      drawText(ctx, '→ KOREA', x + 4, y + 5, 8, '#ffd24a')
      // Tiny ICN code below.
      drawText(ctx, 'ICN', x + 4, y + h + 2, 6, '#fff')
      // Mat / boarding step.
      ctx.fillStyle = '#a02038'
      ctx.fillRect(x - 4, y + h - 2, w + 8, 2)
      break
    }

    case 'sidewalkStar': {
      // Decorative Walk-of-Fame star inlay at ground level.
      ctx.fillStyle = '#cfa44a'
      drawTinyStar(ctx, x + Math.floor(w / 2), y + Math.floor(h / 2), 4)
      ctx.fillStyle = '#8b5a6b'
      ctx.fillRect(x, y + h - 1, w, 1)
      break
    }

    case 'limoWhoosh': {
      // Pure foreground decoration — a long black limo silhouette zipping
      // through. NOT a hazard. Wheels + a cabin window strip read it as a
      // limo even at speed. (Decoration draw passes w=16/h=22 by default;
      // we intentionally over-spill here for the "long limo" silhouette.)
      const limoW = 88
      const limoH = 14
      const lx = x - limoW / 2
      const ly = y - 4
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(lx, ly, limoW, limoH)
      ctx.fillStyle = '#3a3a4a'
      ctx.fillRect(lx, ly, limoW, 2)
      ctx.fillStyle = '#5fc6e6'
      ctx.fillRect(lx + 14, ly + 3, limoW - 28, 4)
      ctx.fillStyle = '#3a4a5e'
      ctx.fillRect(lx + 14, ly + 5, limoW - 28, 2)
      ctx.fillStyle = '#fff7c2'
      ctx.fillRect(lx + limoW - 3, ly + 6, 3, 3)
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(lx + 8, ly + limoH, 8, 4)
      ctx.fillRect(lx + limoW - 18, ly + limoH, 8, 4)
      ctx.fillStyle = '#5a6068'
      ctx.fillRect(lx + 10, ly + limoH + 1, 4, 2)
      ctx.fillRect(lx + limoW - 16, ly + limoH + 1, 4, 2)
      break
    }

    /* Legacy LA art — retained as fallback for any external references. */
    case 'trafficCone': {
      ctx.fillStyle = '#ff7a2a'
      ctx.fillRect(x + w / 2 - 1, y, 2, 4)
      ctx.fillRect(x + w / 2 - 3, y + 4, 6, 4)
      ctx.fillRect(x + w / 2 - 5, y + 8, 10, 4)
      ctx.fillRect(x + 1, y + 12, w - 2, 6)
      ctx.fillStyle = '#fff'
      ctx.fillRect(x + w / 2 - 4, y + 8, 8, 1)
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x, y + h - 2, w, 2)
      break
    }
    case 'hollywoodO': {
      pixelBox(ctx, x, y, w, h, '#fdf6dd', '#7a6a3a')
      drawText(ctx, 'O', x + 6, y + 4, 14, '#bf5700')
      break
    }
    case 'walkOfFameStar': {
      pixelBox(ctx, x, y, w, h, '#3a2410', '#1d1d1d')
      ctx.fillStyle = '#ffd24a'
      ctx.fillRect(x + w / 2 - 2, y + 4, 4, 4)
      ctx.fillRect(x + 6, y + 10, w - 12, 6)
      ctx.fillRect(x + w / 2 - 6, y + 14, 12, 4)
      ctx.fillRect(x + w / 2 - 2, y + 18, 4, 6)
      ctx.fillRect(x + 8, y + 22, 4, 4)
      ctx.fillRect(x + w - 12, y + 22, 4, 4)
      drawText(ctx, 'STAR', x + 12, y + h + 4, 7, '#fff')
      break
    }

    /* ─── World 5 (Seoul) ─── */
    case 'soupBowl': {
      pixelBox(ctx, x, y + 6, w, h - 6, '#d63b2c', '#7a1a14')
      ctx.fillStyle = '#ffd24a'
      ctx.fillRect(x + 2, y + 8, w - 4, 3)
      // Steam puffs
      ctx.fillStyle = '#fff'
      const off = Math.floor(time / 80) % 3
      ctx.fillRect(x + 4, y - off, 3, 3)
      ctx.fillRect(x + 11, y - 1 - off, 3, 3)
      break
    }
    case 'stairStep': {
      pixelBox(ctx, x, y, w, h, '#9aa3ad', '#5a6068')
      ctx.fillStyle = '#cdd2d7'
      ctx.fillRect(x, y, w, 2)
      break
    }
    case 'steamPuff': {
      // Plume rising from a hidden soup bowl below.
      const phase = Math.floor(time / 80) % 4
      ctx.fillStyle = '#fff'
      ctx.fillRect(x + 2, y + 16 - phase, w - 4, 6)
      ctx.fillStyle = '#dde'
      ctx.fillRect(x + 4, y + 10 - phase, w - 8, 6)
      ctx.fillStyle = '#fff'
      ctx.fillRect(x + 6, y + 4 - phase, w - 12, 4)
      // Bowl beneath
      ctx.fillStyle = '#d63b2c'
      ctx.fillRect(x, GROUND_Y - 8, w, 8)
      ctx.fillStyle = '#7a1a14'
      ctx.fillRect(x, GROUND_Y - 8, w, 1)
      break
    }
    case 'kimchiJar': {
      pixelBox(ctx, x + 2, y, w - 4, 4, '#a87f1e', '#5a3614')
      pixelBox(ctx, x, y + 4, w, h - 4, '#d63b2c', '#7a1a14')
      ctx.fillStyle = '#fdf6dd'
      drawText(ctx, '辛', x + 4, y + 8, 8, '#fdf6dd')
      break
    }
    case 'nSeoulTower': {
      // Tower base
      pixelBox(ctx, x + w / 2 - 4, y + 30, 8, h - 30, '#9aa3ad', '#5a6068')
      // Observatory deck
      pixelBox(ctx, x + w / 2 - 12, y + 20, 24, 12, '#3a2410', '#1d1d1d')
      drawText(ctx, 'N', x + w / 2 - 4, y + 22, 10, '#fff')
      // Antenna
      ctx.fillStyle = '#9aa3ad'
      ctx.fillRect(x + w / 2 - 1, y, 2, 20)
      ctx.fillStyle = '#d63b2c'
      ctx.fillRect(x + w / 2 - 1, y, 2, 4)
      break
    }
    case 'lantern': {
      ctx.fillStyle = '#d63b2c'
      ctx.fillRect(x, y + 4, 12, 12)
      ctx.fillStyle = '#a87f1e'
      ctx.fillRect(x, y, 12, 4)
      ctx.fillRect(x, y + 16, 12, 4)
      ctx.fillStyle = '#ffd24a'
      ctx.fillRect(x + 4, y + 8, 4, 4)
      break
    }

    /* ─── World 6 (Houston, 2011–2014) ───
     *
     * NASA + Vietnamese-TV-station Houston: humidity vapor, a NASA crawler
     * slab, a portable TV monitor on a stand, a VHS-tape stack, two boom
     * microphone stands, a director's clapboard, a falling exhaust trail
     * projectile (vertical streak), a yellow cab, a briefcase / file box,
     * Awty textbooks. Boss zone: small Mission-Control building doorway
     * with Fred + Henderson silhouettes inside (silent emotional payoff). */
    case 'humidity': {
      // Soft rectangular vapor patch, gentle drift.
      const off = Math.floor(time / 80) % 3
      ctx.fillStyle = '#bdf'
      ctx.fillRect(x, y + 6, w, h - 6)
      ctx.fillStyle = '#fff'
      ctx.fillRect(x + 2, y + 4 - off, 6, 4)
      ctx.fillRect(x + w - 8, y + 2 - off, 6, 4)
      break
    }
    case 'humidityCloud': {
      // Three-state vapor projectile — rises from the ground, then disperses.
      // Windup: a low patch of moisture. Fire: a wider rising cloud at
      // chibi-jump height that's collidable.
      const phase: ProjectilePhase = (args.phase as ProjectilePhase) ?? 'fire'
      const elapsed = args.phaseElapsedMs ?? 0
      const total = Math.max(40, args.phaseTotalMs ?? 600)
      if (phase === 'windup') {
        const t = Math.min(1, elapsed / total)
        // Low moisture patch
        ctx.fillStyle = `rgba(190, 220, 240, ${(0.4 + 0.3 * t).toFixed(2)})`
        ctx.fillRect(x + 2, y + h - 4, w - 4, 4)
        // Tiny rising drops
        ctx.fillStyle = '#bdf'
        ctx.fillRect(x + Math.floor(w / 2) - 1, y + h - 6 - Math.floor(t * 4), 2, 2)
      } else {
        const drift = Math.floor(time / 80) % 3
        // Wide cloud body
        ctx.fillStyle = '#7adcd0'
        ctx.fillRect(x, y + 4, w, h - 6)
        ctx.fillStyle = '#bdf'
        ctx.fillRect(x + 2, y + 2 - drift, w - 4, 4)
        ctx.fillStyle = '#fdfdfd'
        ctx.fillRect(x + 4, y - 2 - drift, 6, 4)
        ctx.fillRect(x + w - 10, y - drift, 6, 4)
      }
      break
    }
    case 'nasaSlab': {
      // Low, wide crawler-transporter slab w/ tank treads and "NASA" decal.
      // Bbox approx 40 × 16.
      pixelBox(ctx, x, y + 4, w, h - 6, '#7a8088', '#3a3a40')
      ctx.fillStyle = '#9aa3ad'
      ctx.fillRect(x + 1, y + 5, w - 2, 1)
      // Tank treads
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x, y + h - 4, w, 4)
      const tread = Math.floor(time / 100) % 2
      ctx.fillStyle = '#3a3a40'
      for (let tx = x + tread; tx < x + w; tx += 4) {
        ctx.fillRect(tx, y + h - 3, 2, 2)
      }
      // NASA red-stripe decal
      ctx.fillStyle = '#d63b2c'
      ctx.fillRect(x + 4, y + 6, w - 8, 2)
      drawText(ctx, 'NASA', x + Math.floor(w / 2) - 8, y + 9, 6, '#1d1d1d')
      break
    }
    case 'tvMonitor': {
      // Portable studio TV monitor on a stand — black housing, scanning
      // green CRT image, tripod legs. Replaces the older `monitor` art
      // but keeps the same shape so existing references still read.
      const screenH = h - 8
      pixelBox(ctx, x, y, w, screenH, '#1d1d1d', '#000')
      ctx.fillStyle = '#3aa84a'
      ctx.fillRect(x + 2, y + 2, w - 4, screenH - 4)
      // CRT scanlines (deterministic flicker)
      const off = Math.floor(time / 120) % 3
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + 4, y + 4 + off, 8, 1)
      ctx.fillRect(x + 4, y + 9 + off, 14, 1)
      ctx.fillRect(x + 4, y + 14 + off, 10, 1)
      // Red REC light
      ctx.fillStyle = '#d63b2c'
      ctx.fillRect(x + w - 4, y + 2, 2, 2)
      // Stand
      ctx.fillStyle = '#5a6068'
      ctx.fillRect(x + Math.floor(w / 2) - 1, y + screenH, 2, 8)
      ctx.fillRect(x + 2, y + h - 2, w - 4, 2)
      break
    }
    case 'monitor': {
      // Legacy alias for tvMonitor — same shape, kept so any leftover
      // references don't fall through to the fallback magenta box.
      pixelBox(ctx, x, y, 28, 24, '#1d1d1d', '#000')
      ctx.fillStyle = '#3aa84a'
      ctx.fillRect(x + 2, y + 2, 24, 20)
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + 4, y + 6, 8, 2)
      ctx.fillRect(x + 4, y + 10, 14, 2)
      ctx.fillRect(x + 4, y + 14, 10, 2)
      break
    }
    case 'vhsStack': {
      // Three stacked VHS tapes — black plastic, white labels, brown reel
      // window in the center of each.
      const tierH = Math.floor(h / 3)
      for (let i = 0; i < 3; i++) {
        const ty = y + i * tierH + (i === 2 ? h - 3 * tierH : 0)
        pixelBox(ctx, x, ty, w, tierH, '#1d1d1d', '#000')
        // Label
        ctx.fillStyle = '#fdf6dd'
        ctx.fillRect(x + 1, ty + 1, w - 2, Math.max(2, tierH - 4))
        ctx.fillStyle = '#5a3614'
        ctx.fillRect(x + 2, ty + 2, w - 4, 1)
        // Reel window
        ctx.fillStyle = '#5a3614'
        ctx.fillRect(
          x + Math.floor(w / 2) - 2,
          ty + tierH - 3,
          4,
          2
        )
      }
      break
    }
    case 'boomMic': {
      // Boom mic on a stand — long horizontal arm, fluffy windshield at
      // the tip, vertical stand to the ground. Knee-to-head height.
      const standX = x + 2
      const armY = y + 4
      // Vertical stand
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(standX, y + 4, 2, h - 4)
      // Stand base
      ctx.fillRect(standX - 3, y + h - 2, 8, 2)
      // Horizontal boom arm
      ctx.fillStyle = '#5a6068'
      ctx.fillRect(standX + 2, armY, w - 6, 2)
      // Windshield (grey furry blob)
      ctx.fillStyle = '#9aa3ad'
      ctx.fillRect(x + w - 6, armY - 2, 6, 6)
      ctx.fillStyle = '#7a8088'
      ctx.fillRect(x + w - 5, armY - 1, 4, 1)
      ctx.fillRect(x + w - 5, armY + 3, 4, 1)
      break
    }
    case 'dirClapboard': {
      // TV-production clapboard. Like W4's clapboard but with a TV-station
      // red "REC" tag instead of "TAKE".
      const bodyTop = y + 4
      const bodyH = h - 4
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x, bodyTop, w, bodyH)
      const stripeY = y + 1
      for (let sx = 0; sx < w; sx += 4) {
        ctx.fillStyle = sx % 8 === 0 ? '#1d1d1d' : '#fdf6dd'
        ctx.fillRect(x + sx, stripeY, 4, 3)
      }
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x, stripeY + 3, w, 1)
      ctx.fillStyle = '#fdf6dd'
      drawText(ctx, 'REC', x + 2, bodyTop + 2, 6, '#fdf6dd')
      ctx.fillStyle = '#d63b2c'
      ctx.fillRect(x + w - 4, bodyTop + 2, 2, 2)
      break
    }
    case 'fallingExhaust': {
      // Vertical streak hazard — telegraphs as a faint plume above the
      // path, then sweeps downward through the lane during fire. Tall +
      // narrow bbox. Less punishing than W4 klieg sweep — short fire window.
      const phase: ProjectilePhase = (args.phase as ProjectilePhase) ?? 'fire'
      const elapsed = args.phaseElapsedMs ?? 0
      const total = Math.max(40, args.phaseTotalMs ?? 360)
      if (phase === 'windup') {
        const t = Math.min(1, elapsed / total)
        // Faint downward streak — outline only during windup
        ctx.fillStyle = `rgba(255, 200, 100, ${(0.25 + 0.4 * t).toFixed(2)})`
        ctx.fillRect(x + Math.floor(w / 2) - 1, y, 2, Math.floor(h * t))
        // Tiny puff at the top
        ctx.fillStyle = '#ddd'
        ctx.fillRect(x, y - 2, w, 2)
      } else {
        // Hot streak descending
        const flicker = Math.floor(time / 60) % 2
        ctx.fillStyle = '#ffd24a'
        ctx.fillRect(x + Math.floor(w / 2) - 2, y, 4, h)
        ctx.fillStyle = '#ff7a2a'
        ctx.fillRect(x + Math.floor(w / 2) - 1, y, 2, h)
        ctx.fillStyle = flicker ? '#fff7c2' : '#fff'
        ctx.fillRect(x + Math.floor(w / 2) - 1, y, 2, Math.floor(h / 2))
        // Smoke puffs at top
        ctx.fillStyle = '#ddd'
        ctx.fillRect(x, y - 4, w, 4)
        ctx.fillRect(x + 2, y - 8, w - 4, 4)
      }
      break
    }
    case 'yellowCab': {
      // Houston yellow cab — sedan silhouette with TAXI light on top.
      // Body
      ctx.fillStyle = '#f5c63a'
      ctx.fillRect(x + 2, y + h - 14, w - 4, 8)
      // Cab top
      ctx.fillRect(x + 6, y + h - 20, w - 12, 6)
      // Window
      ctx.fillStyle = '#3a4a5e'
      ctx.fillRect(x + 8, y + h - 18, w - 16, 4)
      // TAXI sign
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + Math.floor(w / 2) - 6, y + h - 24, 12, 4)
      ctx.fillStyle = '#fff'
      drawText(ctx, 'TAXI', x + Math.floor(w / 2) - 5, y + h - 23, 4, '#fff')
      // Wheels
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + 4, y + h - 6, 6, 6)
      ctx.fillRect(x + w - 10, y + h - 6, 6, 6)
      ctx.fillStyle = '#5a6068'
      ctx.fillRect(x + 5, y + h - 4, 4, 3)
      ctx.fillRect(x + w - 9, y + h - 4, 4, 3)
      // Door handle
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + Math.floor(w / 2), y + h - 11, 2, 1)
      break
    }
    case 'briefcase': {
      // Leather briefcase / file-box on the ground. Brown body w/ brass
      // clasps and a handle.
      pixelBox(ctx, x, y + 2, w, h - 2, '#7a5a14', '#3a2410')
      ctx.fillStyle = '#a87f1e'
      ctx.fillRect(x + 1, y + 3, w - 2, 1)
      // Handle
      ctx.fillStyle = '#3a2410'
      ctx.fillRect(x + Math.floor(w / 4), y, Math.floor(w / 2), 2)
      ctx.fillRect(x + Math.floor(w / 4), y + 1, 1, 1)
      ctx.fillRect(x + Math.floor(w / 4) + Math.floor(w / 2) - 1, y + 1, 1, 1)
      // Brass clasps
      ctx.fillStyle = '#cfa44a'
      ctx.fillRect(x + 3, y + Math.floor(h / 2), 3, 2)
      ctx.fillRect(x + w - 6, y + Math.floor(h / 2), 3, 2)
      break
    }
    case 'awtyTextbook': {
      // Awty International School textbook — single thick volume with a
      // small globe sticker (Awty is an Intl school).
      pixelBox(ctx, x, y, w, h, '#1a3a78', '#0a1d3a')
      ctx.fillStyle = '#5fc6e6'
      ctx.fillRect(x + 1, y + 2, w - 2, 1)
      ctx.fillRect(x + 1, y + h - 3, w - 2, 1)
      // Globe sticker (cyan with green continent dabs)
      ctx.fillStyle = '#5fc6e6'
      ctx.fillRect(x + Math.floor(w / 2) - 3, y + 6, 6, 6)
      ctx.fillStyle = '#3aa84a'
      ctx.fillRect(x + Math.floor(w / 2) - 2, y + 7, 2, 2)
      ctx.fillRect(x + Math.floor(w / 2), y + 9, 2, 2)
      ctx.fillStyle = '#fdf6dd'
      drawText(ctx, 'AWTY', x + 1, y + h - 8, 5, '#fdf6dd')
      break
    }
    case 'missionControlBoss': {
      // Small Mission-Control-style building with a doorway. Two
      // silhouettes (Fred + Henderson) visible inside — silent payoff to
      // the W6 chapter. No "FRED & HENDERSON" label — just the figures.
      const bldgW = Math.min(56, w)
      const bx = x + Math.floor((w - bldgW) / 2)
      const baseY = y + h
      // Curved-facade body
      ctx.fillStyle = '#cfa44a'
      ctx.fillRect(bx + 2, baseY - 56, bldgW - 4, 56)
      ctx.fillStyle = '#a87f1e'
      ctx.fillRect(bx + 2, baseY - 56, bldgW - 4, 2)
      ctx.fillRect(bx + bldgW - 4, baseY - 56, 2, 56)
      // Stepped curved roof (impression of mission control)
      ctx.fillStyle = '#7a5a14'
      ctx.fillRect(bx, baseY - 62, bldgW, 6)
      ctx.fillRect(bx + 4, baseY - 68, bldgW - 8, 6)
      // Dish antenna on roof
      ctx.fillStyle = '#9aa3ad'
      ctx.fillRect(bx + bldgW - 14, baseY - 76, 10, 4)
      ctx.fillRect(bx + bldgW - 10, baseY - 80, 2, 4)
      ctx.fillStyle = '#5a6068'
      ctx.fillRect(bx + bldgW - 14, baseY - 76, 10, 1)
      // AWTY sign over the door
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(bx + 8, baseY - 48, bldgW - 16, 8)
      drawText(ctx, 'AWTY', bx + 11, baseY - 47, 7, '#ffd24a')
      // Warm-lit doorway
      ctx.fillStyle = '#ffd24a'
      const doorW = 18
      const doorX = bx + Math.floor((bldgW - doorW) / 2)
      const doorH = 30
      ctx.fillRect(doorX, baseY - doorH, doorW, doorH)
      // Door frame
      ctx.fillStyle = '#3a2410'
      ctx.fillRect(doorX - 2, baseY - doorH - 2, doorW + 4, 2)
      ctx.fillRect(doorX - 2, baseY - doorH, 2, doorH)
      ctx.fillRect(doorX + doorW, baseY - doorH, 2, doorH)
      // Silhouette of Fred (tall) inside the doorway
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(doorX + 3, baseY - 24, 6, 4)
      ctx.fillRect(doorX + 2, baseY - 20, 8, 16)
      // Silhouette of Henderson (short, next to Fred)
      ctx.fillRect(doorX + 12, baseY - 18, 4, 3)
      ctx.fillRect(doorX + 11, baseY - 15, 6, 11)
      // Side windows on the building (with mission-control screens)
      ctx.fillStyle = '#3aa84a'
      ctx.fillRect(bx + 6, baseY - 36, 6, 6)
      ctx.fillRect(bx + bldgW - 12, baseY - 36, 6, 6)
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(bx + 7, baseY - 35, 4, 1)
      ctx.fillRect(bx + bldgW - 11, baseY - 35, 4, 1)
      drawText(ctx, 'MISSION', x - 6, y + h + 4, 7, '#fff')
      break
    }
    case 'launchButton': {
      // Legacy W6 boss-art fallback (still referenced if anything points
      // at the old bossArt key during partial-cache scenarios).
      pixelBox(ctx, x, y, w, h, '#1d1d1d', '#000')
      pixelBox(ctx, x + 4, y + 4, w - 8, h - 8, '#d63b2c', '#7a1a14')
      drawText(ctx, 'LAUNCH', x + 4, y + h / 2 - 4, 8, '#fff')
      break
    }
    case 'rocketExhaust': {
      // Legacy alias for fallingExhaust — keep so older configs render.
      const flicker = Math.floor(time / 50) % 3
      ctx.fillStyle = '#ffd24a'
      ctx.fillRect(x, y + h - 8, w, 8)
      ctx.fillStyle = '#ff7a2a'
      ctx.fillRect(x + 2, y + h - 24, w - 4, 16)
      ctx.fillStyle = flicker === 0 ? '#fff7c2' : '#ffd24a'
      ctx.fillRect(x + 6, y + h - 50, w - 12, 26)
      ctx.fillStyle = '#fff'
      ctx.fillRect(x + 8, y + 4, w - 16, h - 60)
      break
    }

    /* ─── World 7 (Austin home, 2014–present) ───
     *
     * Hill-country platformer. Re-skins the existing platform geometry:
     * cactus pads (low jump), baby blocks (lettered toys), a lake
     * paddleboard (lying flat), "Now Hiring" tech-recruiter signs (tall
     * pole), wedding rings (coin-style decoration), bluebonnet patches
     * (decorative ground flower). Boss zone: chibi summits beside her
     * silhouetted family of four. */
    case 'cactusPad': {
      // Single prickly-pear pad on a short trunk. Replaces the W7 ground
      // armadillo as the basic low-jump obstacle. Low enough that a tap
      // jump clears it.
      ctx.fillStyle = '#3aa84a'
      ctx.fillRect(x + 4, y + 4, w - 8, h - 6)
      ctx.fillStyle = '#2c7d34'
      ctx.fillRect(x + 4, y + 4, 1, h - 6)
      // Pad highlights
      ctx.fillStyle = '#7ed957'
      ctx.fillRect(x + 6, y + 5, 2, 3)
      // Trunk
      ctx.fillStyle = '#5a3614'
      ctx.fillRect(x + Math.floor(w / 2) - 1, y + h - 4, 2, 4)
      // Spines
      ctx.fillStyle = '#fdf6dd'
      ctx.fillRect(x + 5, y + 6, 1, 1)
      ctx.fillRect(x + 8, y + 7, 1, 1)
      ctx.fillRect(x + w - 6, y + 7, 1, 1)
      // Tiny pink flower atop
      ctx.fillStyle = '#f29ac0'
      ctx.fillRect(x + w - 6, y + 3, 2, 2)
      break
    }
    case 'babyBlock': {
      // Wooden alphabet block with a single pixel letter. Three colors
      // cycle by x-position so adjacent blocks read as different.
      const palette: Array<[string, string]> = [
        ['#f29ac0', '#a04060'], // pink
        ['#5fc6e6', '#2a78a8'], // cyan
        ['#ffd24a', '#a8771a'], // yellow
      ]
      const idx = (Math.floor(x / 22) % 3 + 3) % 3
      const [fill, shade] = palette[idx]
      pixelBox(ctx, x + 1, y + 1, w - 2, h - 2, fill, shade)
      // Letter
      ctx.fillStyle = '#fdf6dd'
      const letter = ['A', 'B', 'C'][idx]
      drawText(ctx, letter, x + Math.floor(w / 2) - 3, y + 2, 8, '#fdf6dd')
      // Bevel highlight
      ctx.fillStyle = '#fff7c2'
      ctx.fillRect(x + 1, y + 1, w - 2, 1)
      break
    }
    case 'paddleboard': {
      // Lady Bird Lake SUP — long thin flat board with a paddle laying
      // across it. Single low obstacle near the lake-edge platform.
      pixelBox(ctx, x, y + h - 4, w, 4, '#7adcd0', '#2a78a8')
      ctx.fillStyle = '#fdf6dd'
      ctx.fillRect(x + 2, y + h - 3, w - 4, 1)
      // Paddle shaft + blade
      ctx.fillStyle = '#7a5a14'
      ctx.fillRect(x + 2, y + h - 7, w - 8, 1)
      ctx.fillStyle = '#cfa44a'
      ctx.fillRect(x + w - 6, y + h - 9, 4, 4)
      break
    }
    case 'nowHiringSign': {
      // Tall pole with a "NOW HIRING" recruiter sign — the W7 obstacle
      // version (replaces parkingSignTall). Sign reads in cream + black,
      // sized to fit the existing bbox without overspilling much.
      ctx.fillStyle = '#9aa3ad'
      ctx.fillRect(x + Math.floor(w / 2) - 1, y, 2, h)
      pixelBox(ctx, x - 8, y - 4, 22, 14, '#fdf6dd', '#7a5a14')
      ctx.fillStyle = '#1d1d1d'
      drawText(ctx, 'NOW', x - 6, y - 3, 5, '#1d1d1d')
      drawText(ctx, 'HIRE', x - 6, y + 3, 5, '#bf5700')
      break
    }
    case 'weddingRing': {
      // Decorative floating wedding ring (no collision in this build —
      // placed via the decoration array so callers can scatter a few).
      // Two thin gold concentric rings + a tiny diamond sparkle.
      ctx.fillStyle = '#cfa44a'
      ctx.fillRect(x + 1, y, w - 2, 2)
      ctx.fillRect(x + 1, y + 4, w - 2, 2)
      ctx.fillRect(x, y + 1, 2, 4)
      ctx.fillRect(x + w - 2, y + 1, 2, 4)
      ctx.fillStyle = '#ffd24a'
      ctx.fillRect(x + 2, y + 1, w - 4, 1)
      // Diamond sparkle
      ctx.fillStyle = '#fdfdfd'
      ctx.fillRect(x + Math.floor(w / 2) - 1, y - 2, 2, 2)
      ctx.fillStyle = '#5fc6e6'
      ctx.fillRect(x + Math.floor(w / 2), y - 1, 1, 1)
      break
    }
    case 'bluebonnetPatch': {
      // Decorative cluster of pixel bluebonnets — Texas state flower.
      // Bluebonnet = upright stalk with stepped blue blooms + a tiny
      // white tip. Decoration only; placed via decorations array.
      const stalks = 3
      for (let i = 0; i < stalks; i++) {
        const sx = x + i * 4
        // Stalk
        ctx.fillStyle = '#3aa84a'
        ctx.fillRect(sx + 1, y + h - 6, 1, 6)
        // Bloom (stepped indigo)
        ctx.fillStyle = '#5a78c8'
        ctx.fillRect(sx, y + h - 10, 3, 1)
        ctx.fillRect(sx, y + h - 9, 3, 2)
        ctx.fillStyle = '#3a5aa0'
        ctx.fillRect(sx, y + h - 7, 3, 1)
        // White tip
        ctx.fillStyle = '#fdfdfd'
        ctx.fillRect(sx + 1, y + h - 11, 1, 1)
      }
      // A sprinkle of Indian paintbrush red dabs to the side
      ctx.fillStyle = '#e85040'
      ctx.fillRect(x + 13, y + h - 6, 2, 2)
      ctx.fillRect(x + 13, y + h - 4, 1, 1)
      ctx.fillStyle = '#3aa84a'
      ctx.fillRect(x + 13, y + h - 2, 2, 2)
      break
    }
    case 'parkingSign': {
      // Legacy W7 — short blue P sign on a pole, kept as decoration.
      ctx.fillStyle = '#9aa3ad'
      ctx.fillRect(x + 2, y, 2, 20)
      pixelBox(ctx, x - 4, y - 16, 14, 12, '#3a78c4', '#1a3a6a')
      drawText(ctx, 'P', x, y - 14, 9, '#fff')
      break
    }
    case 'parkingSignTall': {
      // Legacy alias — same look as nowHiringSign for backwards compat.
      ctx.fillStyle = '#9aa3ad'
      ctx.fillRect(x + w / 2 - 1, y, 2, h)
      pixelBox(ctx, x - 6, y - 4, 20, 14, '#3a78c4', '#1a3a6a')
      drawText(ctx, 'P', x - 1, y - 2, 10, '#fff')
      break
    }
    case 'armadillo': {
      // Legacy W7 ground armadillo. Kept as a decoration option so
      // playtest worlds still have a critter on the streets.
      ctx.fillStyle = '#a87f1e'
      ctx.fillRect(x + 2, y + 4, w - 4, h - 4)
      ctx.fillStyle = '#7a5a14'
      ctx.fillRect(x + 4, y + 6, w - 8, 1)
      ctx.fillRect(x + 4, y + 10, w - 8, 1)
      ctx.fillStyle = '#a87f1e'
      ctx.fillRect(x + w - 4, y + 8, 4, 6)
      ctx.fillRect(x, y + 10, 2, 4)
      ctx.fillStyle = '#5a3614'
      ctx.fillRect(x + 4, y + h - 2, 2, 2)
      ctx.fillRect(x + w - 6, y + h - 2, 2, 2)
      break
    }
    case 'pigeon': {
      // Legacy W7 perch obstacle, kept since W7's platform tops can
      // still have an occasional bird in decoration mode.
      pixelBox(ctx, x + 2, y + 2, w - 4, h - 4, '#9aa3ad', '#5a6068')
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + w - 4, y + 4, 2, 2)
      ctx.fillStyle = '#ff7a2a'
      ctx.fillRect(x + w - 2, y + 5, 2, 2)
      break
    }
    case 'capitolColumn': {
      pixelBox(ctx, x, y, 16, 200, '#fdf6dd', '#7a6a3a')
      break
    }
    case 'austinFamilyBoss': {
      // Chibi family-of-four payoff at the top of the climb. Lan-shape
      // chibi (already drawn separately by the renderer), Granger-tall
      // silhouette next to her, and two small kid silhouettes. Sized to
      // sit on the cupola platform.
      // Tiny banner (optional, not the focus)
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x - 16, y - 14, w + 32, 10)
      ctx.fillStyle = '#bf5700'
      ctx.fillRect(x - 14, y - 12, w + 28, 6)
      drawText(ctx, 'HOME', x + Math.floor(w / 2) - 8, y - 13, 6, '#fdfdfd')
      // Granger silhouette (tall, dark green plaid suggestion)
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + 4, y + 2, 6, 4)
      ctx.fillStyle = '#f4c89a'
      ctx.fillRect(x + 5, y + 4, 4, 2)
      ctx.fillStyle = '#3a6a4a'
      ctx.fillRect(x + 3, y + 6, 8, 12)
      // Kid 1 (toddler) — to Granger's left, small
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x - 4, y + 10, 4, 3)
      ctx.fillStyle = '#f4c89a'
      ctx.fillRect(x - 3, y + 12, 2, 1)
      ctx.fillStyle = '#f29ac0'
      ctx.fillRect(x - 4, y + 13, 4, 5)
      // Kid 2 (baby — held in arms or beside)
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + 12, y + 12, 3, 3)
      ctx.fillStyle = '#f4c89a'
      ctx.fillRect(x + 13, y + 14, 1, 1)
      ctx.fillStyle = '#ffd24a'
      ctx.fillRect(x + 12, y + 14, 3, 4)
      // Floor — a thin Capitol-dome ridge line under the group
      ctx.fillStyle = '#bf5700'
      ctx.fillRect(x - 4, y + h - 1, w + 8, 1)
      break
    }
    case 'flagPole': {
      // Legacy alias for austinFamilyBoss — kept so older bossArt refs
      // don't fall through to magenta. Tiny flagpole + Texas star flag.
      ctx.fillStyle = '#9aa3ad'
      ctx.fillRect(x + w / 2, y, 2, h)
      ctx.fillStyle = '#bf5700'
      ctx.fillRect(x + w / 2 + 2, y + 2, 14, 8)
      ctx.fillStyle = '#fdf6dd'
      drawText(ctx, '★', x + w / 2 + 5, y + 2, 8, '#fff')
      break
    }

    /* ─── Fallback ─── */
    default: {
      pixelBox(ctx, x, y, w, h, '#d63b2c', '#7a1a14')
      drawText(ctx, art.slice(0, 6), x + 1, y + 1, 6, '#fff')
      break
    }
  }
}

/** Renders a platform tile. */
function drawPlatform(ctx: DrawCtx, p: Platform) {
  switch (p.art) {
    case 'grass':
      // Legacy W7 grass tile — kept for backwards compatibility with
      // older platformer configs.
      pixelBox(ctx, p.x, p.y, p.w, p.h, '#3aa84a', '#2c7d34')
      ctx.fillStyle = '#7ed957'
      ctx.fillRect(p.x, p.y, p.w, 2)
      break
    case 'limestoneHill':
      // Cream limestone hill tile with darker shadow underside — the
      // visual base of the W7 hill-country climb.
      pixelBox(ctx, p.x, p.y, p.w, p.h, '#e8d8a8', '#a8907a')
      ctx.fillStyle = '#f4e8c2'
      ctx.fillRect(p.x, p.y, p.w, 2)
      // A few patches of moss / grass on top
      ctx.fillStyle = '#7ed957'
      for (let gx = p.x + 4; gx < p.x + p.w - 4; gx += 14) {
        ctx.fillRect(gx, p.y - 1, 4, 1)
      }
      ctx.fillStyle = '#3aa84a'
      for (let gx = p.x + 6; gx < p.x + p.w - 4; gx += 14) {
        ctx.fillRect(gx, p.y - 2, 2, 1)
      }
      break
    case 'capitolStep':
      pixelBox(ctx, p.x, p.y, p.w, p.h, '#fdf6dd', '#7a6a3a')
      ctx.fillStyle = '#bf5700'
      ctx.fillRect(p.x, p.y, p.w, 1)
      break
    case 'capitolPlat':
      pixelBox(ctx, p.x, p.y, p.w, p.h, '#fdf6dd', '#7a6a3a')
      break
    case 'techSignPlat': {
      // Career-arc tech-company-sign platform top. Each platform takes
      // on a different colour deterministically from its x position so
      // the climb reads as a "tower of career steps": Openlistings →
      // Opendoor → Better → Sunroom → Utility Profit. The labels match
      // the parallax billboards in the backdrop.
      const palette: Array<[string, string, string]> = [
        ['#bf5700', '#7a3814', 'LISTINGS'],
        ['#3a78c4', '#1a3a6a', 'OPENDOOR'],
        ['#3aa84a', '#1a4a2a', 'BETTER'],
        ['#f29ac0', '#a04060', 'SUNROOM'],
        ['#a04060', '#5a2030', 'UTIL PROFIT'],
      ]
      const idx = (Math.floor(p.x / 110) % palette.length + palette.length) % palette.length
      const [fill, shade, label] = palette[idx]
      pixelBox(ctx, p.x, p.y, p.w, p.h, fill, shade)
      // Top highlight
      ctx.fillStyle = '#fdfdfd'
      ctx.fillRect(p.x, p.y, p.w, 1)
      // Pixel-letter label (only if the platform is wide enough)
      if (p.w >= 60) {
        drawText(ctx, label, p.x + 4, p.y + 4, 6, '#fdfdfd')
      }
      break
    }
    case 'dome':
      pixelBox(ctx, p.x, p.y, p.w, p.h, '#d8a8a0', '#b07878')
      ctx.fillStyle = '#fdf6dd'
      ctx.fillRect(p.x, p.y, p.w, 2)
      // Pink-granite dome curve hint
      ctx.fillStyle = '#b07878'
      ctx.fillRect(p.x + 4, p.y + 4, p.w - 8, 1)
      break
    case 'cupola':
      // Cupola — the W7 summit. Cream stone w/ a goldenrod cap line.
      pixelBox(ctx, p.x, p.y, p.w, p.h, '#fdf6dd', '#7a6a3a')
      ctx.fillStyle = '#cfa44a'
      ctx.fillRect(p.x, p.y, p.w, 1)
      break
    default:
      pixelBox(ctx, p.x, p.y, p.w, p.h, '#7a6a3a', '#3a2410')
  }
}

/* ───────────────────── World 1: 80s Saigon ───────────────────── */
/**
 * Bespoke parallax stack for the Vietnam (1985–1992) auto-runner. Built to
 * hit the same target as the reference photos: sun-bleached pastel sky,
 * Bến Thành clock tower, colonial low-rise ochre buildings with shutters,
 * a propaganda banner, palm trees, power lines, dusty asphalt.
 *
 * Layers (back → front):
 *   0. Stepped sky bands (no parallax)
 *   1. Distant clock-tower silhouette band (parallax 0.25)
 *   2. Colonial buildings + propaganda banner + signage (parallax 0.45)
 *   3. Power lines (parallax 0.55)
 *   4. Asphalt + curb (no parallax)
 *   5. Heat-haze shimmer (motion — disabled under prefers-reduced-motion)
 *
 * Decorations (palm fronds, áo dài-mom) scroll on top of this from runs.ts.
 */
function drawVietnamBackground(
  ctx: DrawCtx,
  scrollX: number,
  height: number,
  time: number
) {
  // ── 0. Stepped pastel sky (no smooth gradient — 16-bit aesthetic). ──
  const skyBands: Array<[number, string]> = [
    [50, '#cfe6da'],
    [100, '#dde9d9'],
    [150, '#f0d4b0'],
    [GROUND_Y, '#f4cba0'],
  ]
  let prevY = 0
  for (const [bandBottom, color] of skyBands) {
    ctx.fillStyle = color
    ctx.fillRect(0, prevY, W, bandBottom - prevY)
    prevY = bandBottom
  }

  // ── 1. Distant Bến Thành-style tower silhouettes (parallax 0.25). ──
  const farScroll = Math.floor(scrollX * 0.25) % 320
  for (let i = -1; i < 4; i++) {
    const bx = i * 320 - farScroll
    ctx.fillStyle = '#c89576'
    ctx.fillRect(bx + 20, GROUND_Y - 36, 80, 36)
    ctx.fillRect(bx + 140, GROUND_Y - 30, 60, 30)
    ctx.fillRect(bx + 220, GROUND_Y - 40, 70, 40)
    ctx.fillStyle = '#c8915a'
    ctx.fillRect(bx + 110, GROUND_Y - 60, 22, 24)
    ctx.fillStyle = '#9a3a30'
    ctx.fillRect(bx + 113, GROUND_Y - 66, 16, 6)
    ctx.fillRect(bx + 115, GROUND_Y - 70, 12, 4)
    ctx.fillStyle = '#7a2e26'
    ctx.fillRect(bx + 120, GROUND_Y - 74, 2, 4)
  }

  // ── 2. Colonial low-rise buildings (parallax 0.45). ──
  const midScroll = Math.floor(scrollX * 0.45) % 480
  for (let i = -1; i < 4; i++) {
    const bx = i * 480 - midScroll
    drawSaigonBuilding(ctx, bx + 0,   GROUND_Y - 64, 110, 64, '#d6a86a', '#a8784a')
    drawSaigonBuilding(ctx, bx + 120, GROUND_Y - 56, 90,  56, '#c89576', '#9a6a4a')
    drawSaigonBuilding(ctx, bx + 220, GROUND_Y - 70, 120, 70, '#9eb8a0', '#6e8a72')
    drawSaigonBuilding(ctx, bx + 350, GROUND_Y - 50, 100, 50, '#d6a86a', '#a8784a')
    // Stylized GIMIKO/CAMLY-era red signage
    ctx.fillStyle = '#c0282a'
    ctx.fillRect(bx + 8, GROUND_Y - 62, 60, 8)
    ctx.fillStyle = '#f5d04a'
    for (let k = 0; k < 7; k++) {
      ctx.fillRect(bx + 12 + k * 8, GROUND_Y - 60, 4, 4)
    }
    drawPropagandaBanner(ctx, bx + 230, GROUND_Y - 50, 100, time)
  }

  // ── 3. Power lines + poles (parallax 0.55). ──
  const lineScroll = Math.floor(scrollX * 0.55) % 200
  ctx.fillStyle = '#2a2418'
  for (let i = -1; i < 5; i++) {
    const px = i * 200 - lineScroll
    ctx.fillRect(px + 20, GROUND_Y - 92, 2, 22)
    ctx.fillRect(px + 14, GROUND_Y - 90, 14, 1)
    ctx.fillStyle = '#1a1410'
    ctx.fillRect(px + 26, GROUND_Y - 88, 4, 6)
    ctx.fillStyle = '#2a2418'
    ctx.fillRect(px + 22, GROUND_Y - 88, 200, 1)
    ctx.fillRect(px + 22, GROUND_Y - 84, 200, 1)
  }

  // ── 4. Asphalt + tan curb (no parallax). ──
  ctx.fillStyle = '#c89576'
  ctx.fillRect(0, GROUND_Y, W, 3)
  ctx.fillStyle = '#a8784a'
  ctx.fillRect(0, GROUND_Y + 3, W, 1)
  // Asphalt — warm grey, distinct from LA's cool grey + Seoul's blue-black
  ctx.fillStyle = '#3a3a36'
  ctx.fillRect(0, GROUND_Y + 4, W, height - GROUND_Y - 4)
  // Bicycle-tire scuff marks scrolling at run speed
  const tireScroll = Math.floor(scrollX) % 80
  ctx.fillStyle = '#2a2a26'
  for (let i = -1; i < 9; i++) {
    const tx = i * 80 - tireScroll
    ctx.fillRect(tx + 10, GROUND_Y + 12, 18, 1)
    ctx.fillRect(tx + 40, GROUND_Y + 18, 12, 1)
  }

  // ── 5. Heat-haze shimmer above asphalt (off under prefers-reduced-motion).
  if (!prefersReducedMotion()) {
    const phase = Math.floor(time / 120) % 4
    ctx.fillStyle = 'rgba(255, 240, 200, 0.18)'
    for (let i = 0; i < W; i += 4) {
      const offset = ((i + phase * 2) % 8) < 4 ? 0 : 1
      ctx.fillRect(i, GROUND_Y - 1 + offset, 2, 1)
    }
  }
}

/** A single colonial-era low-rise: shuttered windows, awning trim. */
function drawSaigonBuilding(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  wall: string,
  shade: string
) {
  ctx.fillStyle = wall
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = shade
  ctx.fillRect(x, y + h - 2, w, 2)
  ctx.fillRect(x + w - 1, y, 1, h)
  ctx.fillStyle = '#a04032'
  ctx.fillRect(x, y, w, 2)
  for (let wx = x + 8; wx < x + w - 8; wx += 16) {
    ctx.fillStyle = '#3a2516'
    ctx.fillRect(wx, y + 14, 8, 12)
    ctx.fillStyle = '#8a4a2a'
    ctx.fillRect(wx + 1, y + 15, 3, 10)
    ctx.fillRect(wx + 4, y + 15, 3, 10)
    ctx.fillStyle = '#3a2516'
    ctx.fillRect(wx - 1, y + 26, 10, 1)
  }
  ctx.fillStyle = '#3a2516'
  ctx.fillRect(x + 4, y + h - 14, 6, 12)
}

/**
 * Red propaganda banner with stylized yellow pixel-letter impression.
 * Spec: pixel impression of "ĐỘC LẬP – TỰ DO – HẠNH PHÚC". We do NOT
 * render real Unicode — just rough dabs that read as "letters" at a
 * glance. A subtle 1-px ripple is applied unless prefers-reduced-motion.
 */
function drawPropagandaBanner(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  time: number
) {
  const ripple = prefersReducedMotion() ? 0 : Math.floor(time / 240) % 2
  ctx.fillStyle = '#b8242a'
  ctx.fillRect(x, y + ripple, w, 10)
  ctx.fillStyle = '#7a1a14'
  ctx.fillRect(x, y + 9 + ripple, w, 1)
  ctx.fillStyle = '#f5d04a'
  const groups = [4, 4, 6]
  let gx = x + 4
  for (const g of groups) {
    for (let i = 0; i < g; i++) {
      ctx.fillRect(gx, y + 3 + ripple, 2, 4)
      gx += 4
    }
    ctx.fillRect(gx + 1, y + 4 + ripple, 2, 2)
    gx += 6
  }
  ctx.fillStyle = '#3a2516'
  ctx.fillRect(x - 1, y - 1, 1, 4)
  ctx.fillRect(x + w, y - 1, 1, 4)
}

/* ───────────────────── Biome backgrounds ───────────────────── */

function drawBiomeBackground(
  ctx: DrawCtx,
  biome: Biome,
  scrollX: number,
  height: number,
  time: number
) {
  // Vietnam (W1) gets its own bespoke 80s Saigon parallax stack — sun-
  // bleached sky, Bến Thành clock-tower silhouette, colonial low-rises with
  // shutters, propaganda banner, palm trees, power lines, dusty asphalt.
  if (biome === 'vietnam') {
    drawVietnamBackground(ctx, scrollX, height, time)
    return
  }
  // LA (W4) gets its own bespoke layered scene — pixel-stepped sunset
  // bands, Hollywood Hills + sign parallax, palm-tree silhouettes,
  // marquee/billboard horizon, Walk-of-Fame ground tiles.
  if (biome === 'los-angeles') {
    drawLosAngelesBackground(ctx, scrollX, height)
    return
  }
  // Seoul (W5) — twilight Hangang skyline: stepped indigo→plum sky,
  // 4–6 rectangular high-rises with sprinkled lit windows, a
  // Lotte-World-style tapering super-tall for skyline identity, and
  // two parallaxing hangul-impression neon signs (노래방, 편의점).
  if (biome === 'seoul') {
    drawSeoulBackground(ctx, scrollX, height)
    return
  }
  // Texas (W2) — Dallas-suburb at noon. Big sky, brown-grass hills,
  // gabled stucco / brick homes, a Lone Star school flagpole, a
  // walk-through metal-detector arch in the boss-zone lane.
  if (biome === 'texas') {
    drawTexasBackground(ctx, scrollX, height, time)
    return
  }
  // UT Austin (W3) — sunset campus. Burnt-orange UT Tower silhouette,
  // limestone + red-brick campus buildings, live oaks, a passing
  // Capital Metro bus, brick sidewalk strewn with ginkgo leaves.
  if (biome === 'austin-ut') {
    drawUTAustinBackground(ctx, scrollX, height, time)
    return
  }
  // Houston (W6) — hazy Texas heat. Saturn V monument with the NASA
  // meatball, downtown silhouette, mission-control building, palm
  // trees, a Vietnamese-TV-station antenna with a small dish on top.
  if (biome === 'houston') {
    drawHoustonBackground(ctx, scrollX, height, time)
    return
  }
  // Sky gradient base (fallback path for any future biomes).
  const palettes: Record<
    Biome,
    {
      sky: [string, string]
      ground: string
      groundDark: string
      mid?: string
    }
  > = {
    vietnam: {
      sky: ['#a8e0ff', '#fff7c2'],
      ground: '#e0c98a',
      groundDark: '#a8884a',
      mid: '#3aa84a',
    },
    texas: {
      sky: ['#fff0a0', '#f5b95a'],
      ground: '#d4a04a',
      groundDark: '#7a5a14',
      mid: '#bf5700',
    },
    'austin-ut': {
      sky: ['#fff7c2', '#ffd58a'],
      ground: '#d4a04a',
      groundDark: '#7a5a14',
      mid: '#bf5700',
    },
    'los-angeles': {
      sky: ['#ffd1c2', '#ffe9a8'],
      ground: '#9aa3ad',
      groundDark: '#5a6068',
      mid: '#f29ac0',
    },
    seoul: {
      sky: ['#bcd6ff', '#fdf6dd'],
      ground: '#cdd2d7',
      groundDark: '#7a8088',
      mid: '#3a78c4',
    },
    houston: {
      sky: ['#1a3a6a', '#3a78c4'],
      ground: '#3a3a4a',
      groundDark: '#1a1a2a',
      mid: '#5fc6e6',
    },
    'austin-home': {
      sky: ['#a8e0ff', '#fff7c2'],
      ground: '#7ed957',
      groundDark: '#2c7d34',
      mid: '#bf5700',
    },
  }
  const p = palettes[biome]
  const grad = ctx.createLinearGradient(0, 0, 0, height)
  grad.addColorStop(0, p.sky[0])
  grad.addColorStop(1, p.sky[1])
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, height)

  // Far hills (parallax 0.3)
  const farScroll = Math.floor(scrollX * 0.3) % 200
  ctx.fillStyle = p.mid ?? '#3aa84a'
  ctx.globalAlpha = 0.5
  for (let i = -1; i < 5; i++) {
    const hx = i * 200 - farScroll
    ctx.beginPath()
    ctx.moveTo(hx, GROUND_Y - 20)
    ctx.lineTo(hx + 60, GROUND_Y - 50)
    ctx.lineTo(hx + 120, GROUND_Y - 30)
    ctx.lineTo(hx + 180, GROUND_Y - 60)
    ctx.lineTo(hx + 200, GROUND_Y - 20)
    ctx.lineTo(hx + 200, GROUND_Y)
    ctx.lineTo(hx, GROUND_Y)
    ctx.closePath()
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // Clouds (parallax 0.4)
  const cloudScroll = Math.floor(scrollX * 0.4) % 300
  ctx.fillStyle = '#fff'
  for (let i = -1; i < 4; i++) {
    const cx = i * 300 - cloudScroll
    ctx.fillRect(cx + 40, 28, 40, 6)
    ctx.fillRect(cx + 50, 24, 24, 6)
    ctx.fillRect(cx + 200, 60, 50, 6)
    ctx.fillRect(cx + 210, 56, 30, 6)
  }
  // Ground band (no parallax)
  ctx.fillStyle = p.ground
  ctx.fillRect(0, GROUND_Y, W, height - GROUND_Y)
  ctx.fillStyle = p.groundDark
  ctx.fillRect(0, GROUND_Y, W, 2)
}

/**
 * Bespoke LA / Hollywood (W4) parallax stack — layers, back → front:
 *
 *   0. Pixel-stepped sunset sky bands (pink → coral → peach), no parallax
 *   1. Hollywood Hills silhouette + HOLLYWOOD sign  (parallax 0.18)
 *   2. Distant palm-tree silhouettes               (parallax 0.32)
 *   3. Marquee + billboard horizon                  (parallax 0.55)
 *   4. Walk-of-Fame pink-granite tile ground        (no parallax)
 *
 * Designed to read as "glittery surface, gridlocked underneath, the path
 * forward is to leave" — sunset glamour at the back, vintage marquee
 * theatre signs near the player, no clouds (LA = no weather).
 */
function drawLosAngelesBackground(
  ctx: DrawCtx,
  scrollX: number,
  height: number
) {
  // ── 0. Stepped sunset bands (no parallax) ──
  // Three crisp horizontal bands — pink → coral → peach — capped by the
  // ground line. Strict 16-bit: no smooth gradients.
  const bands: Array<[number, string]> = [
    [60, '#ffa3c4'],
    [110, '#ffbb95'],
    [GROUND_Y, '#ffd9a3'],
  ]
  let prevY = 0
  for (const [bandBottom, color] of bands) {
    ctx.fillStyle = color
    ctx.fillRect(0, prevY, W, bandBottom - prevY)
    prevY = bandBottom
  }
  // A pixel sun, slightly offset right.
  ctx.fillStyle = '#fff7c2'
  ctx.fillRect(W - 110, 28, 18, 14)
  ctx.fillRect(W - 112, 30, 22, 10)
  ctx.fillStyle = '#ffd9a3'
  ctx.fillRect(W - 108, 30, 14, 10)

  // ── 1. Hollywood Hills silhouette + HOLLYWOOD sign (parallax 0.18) ──
  const hillScroll = Math.floor(scrollX * 0.18)
  ctx.fillStyle = '#3a4a5e'
  for (let tile = -1; tile < 4; tile++) {
    const tw = 360
    const bx = tile * tw - (hillScroll % tw)
    // Two-peak pixel-stepped hill silhouette per tile.
    ctx.beginPath()
    ctx.moveTo(bx,        GROUND_Y - 8)
    ctx.lineTo(bx + 30,   GROUND_Y - 28)
    ctx.lineTo(bx + 80,   GROUND_Y - 60)
    ctx.lineTo(bx + 130,  GROUND_Y - 30)
    ctx.lineTo(bx + 180,  GROUND_Y - 70)
    ctx.lineTo(bx + 230,  GROUND_Y - 40)
    ctx.lineTo(bx + 290,  GROUND_Y - 56)
    ctx.lineTo(bx + 340,  GROUND_Y - 24)
    ctx.lineTo(bx + tw,   GROUND_Y - 12)
    ctx.lineTo(bx + tw,   GROUND_Y)
    ctx.lineTo(bx,        GROUND_Y)
    ctx.closePath()
    ctx.fill()
    // Pixel-stepped highlight ridge (slightly lighter).
    ctx.fillStyle = '#4a5a72'
    ctx.fillRect(bx + 80,  GROUND_Y - 60, 2, 2)
    ctx.fillRect(bx + 180, GROUND_Y - 70, 2, 2)
    ctx.fillRect(bx + 290, GROUND_Y - 56, 2, 2)
    ctx.fillStyle = '#3a4a5e'
  }
  // HOLLYWOOD sign — fixed to the world, parallax-locked to the hills layer.
  // Single instance well into the run so it doesn't over-repeat.
  const signX = 460 - hillScroll
  drawHollywoodSign(ctx, signX, GROUND_Y - 78)
  // A second sign instance further along to keep coverage as the player runs.
  drawHollywoodSign(ctx, signX + 720, GROUND_Y - 78)

  // ── 2. Distant palm silhouettes (parallax 0.32) ──
  const palmScroll = Math.floor(scrollX * 0.32)
  ctx.fillStyle = '#2b3548'
  const palmsPerTile = 5
  const palmTileW = 320
  for (let tile = -1; tile < 4; tile++) {
    const bx = tile * palmTileW - (palmScroll % palmTileW)
    for (let pi = 0; pi < palmsPerTile; pi++) {
      const px = bx + 30 + pi * 60 + ((pi * 17) % 12)
      const trunkH = 36 + ((pi * 7) % 14)
      const trunkY = GROUND_Y - trunkH
      // Slim trunk
      ctx.fillRect(px, trunkY, 2, trunkH)
      // Cluster of fronds at the top
      ctx.fillRect(px - 6, trunkY - 3, 14, 2)
      ctx.fillRect(px - 4, trunkY - 6, 10, 2)
      ctx.fillRect(px - 8, trunkY - 1, 4, 2)
      ctx.fillRect(px + 4, trunkY - 1, 4, 2)
      ctx.fillRect(px - 1, trunkY - 9, 4, 3)
    }
  }

  // ── 3. Marquee + billboard horizon (parallax 0.55) ──
  // Vintage theatre marquees + an LA billboard, deeper saturation, scrolls
  // closer to player speed so it reads as the near skyline.
  const sgnScroll = Math.floor(scrollX * 0.55)
  const sgnTileW = 480
  for (let tile = -1; tile < 4; tile++) {
    const bx = tile * sgnTileW - (sgnScroll % sgnTileW)
    // Marquee 1 — tall vertical THEATRE sign
    ctx.fillStyle = '#1d1d1d'
    ctx.fillRect(bx + 20, GROUND_Y - 56, 12, 56)
    ctx.fillStyle = '#d6324c'
    ctx.fillRect(bx + 22, GROUND_Y - 54, 8, 50)
    ctx.fillStyle = '#fff7c2'
    for (let dy = 4; dy < 50; dy += 10) {
      ctx.fillRect(bx + 24, GROUND_Y - 54 + dy, 4, 4)
    }
    ctx.fillStyle = '#1d1d1d'
    ctx.fillRect(bx + 18, GROUND_Y - 60, 16, 4)
    // Billboard
    ctx.fillStyle = '#3c364a'
    ctx.fillRect(bx + 80, GROUND_Y - 36, 60, 28)
    ctx.fillStyle = '#a02038'
    ctx.fillRect(bx + 82, GROUND_Y - 34, 56, 24)
    ctx.fillStyle = '#fdf6dd'
    ctx.fillRect(bx + 86, GROUND_Y - 30, 12, 2)
    ctx.fillRect(bx + 86, GROUND_Y - 26, 22, 2)
    ctx.fillRect(bx + 86, GROUND_Y - 22, 18, 2)
    ctx.fillStyle = '#1d1d1d'
    ctx.fillRect(bx + 100, GROUND_Y - 8, 2, 8)
    ctx.fillRect(bx + 124, GROUND_Y - 8, 2, 8)
    // Streetlight pole
    ctx.fillStyle = '#1d1d1d'
    ctx.fillRect(bx + 200, GROUND_Y - 70, 2, 70)
    ctx.fillRect(bx + 200, GROUND_Y - 70, 14, 2)
    ctx.fillStyle = '#fff7c2'
    ctx.fillRect(bx + 213, GROUND_Y - 71, 4, 4)
    // Marquee 2 — wider horizontal LA marquee
    ctx.fillStyle = '#1d1d1d'
    ctx.fillRect(bx + 290, GROUND_Y - 38, 50, 6)
    ctx.fillStyle = '#cfa44a'
    ctx.fillRect(bx + 292, GROUND_Y - 36, 46, 2)
    ctx.fillStyle = '#1d1d1d'
    ctx.fillRect(bx + 290, GROUND_Y - 32, 50, 32)
    ctx.fillStyle = '#fff7c2'
    for (let dx = 0; dx < 46; dx += 4) {
      ctx.fillRect(bx + 292 + dx, GROUND_Y - 38, 2, 1)
    }
    ctx.fillStyle = '#3a4a5e'
    ctx.fillRect(bx + 410, GROUND_Y - 50, 30, 50)
    ctx.fillStyle = '#fff7c2'
    for (let wy = 0; wy < 5; wy++) {
      for (let wx = 0; wx < 3; wx++) {
        if (((wx + wy) % 2) === 0) {
          ctx.fillRect(bx + 414 + wx * 8, GROUND_Y - 46 + wy * 8, 4, 4)
        }
      }
    }
  }

  // ── 4. Walk-of-Fame pink-granite tile ground (no parallax) ──
  ctx.fillStyle = '#d8a3b0'
  ctx.fillRect(0, GROUND_Y, W, height - GROUND_Y)
  // Tile seams every 32 px (dark mortar lines).
  ctx.fillStyle = '#8b5a6b'
  ctx.fillRect(0, GROUND_Y, W, 1)
  for (let tx = 0; tx < W; tx += 32) {
    ctx.fillRect(tx, GROUND_Y + 1, 1, height - GROUND_Y - 1)
  }
  // Embedded star inlays — paler `#e8c5cf` with bronze ink.
  const tileScroll = Math.floor(scrollX) % 64
  for (let i = -1; i < 12; i++) {
    const cx = i * 64 + 32 - tileScroll
    const cy = GROUND_Y + 14
    ctx.fillStyle = '#e8c5cf'
    drawTinyStar(ctx, cx, cy, 5)
    ctx.fillStyle = '#8b5a6b'
    drawTinyStar(ctx, cx, cy, 2)
  }
}

/**
 * Bespoke Seoul (W5) parallax stack — minimum-viable twilight skyline.
 * Layers, back → front:
 *
 *   0. Stepped twilight→midnight sky bands (no parallax)
 *   1. Distant skyline silhouette + lit windows + Lotte super-tall
 *      (parallax 0.22)
 *   2. Two hangul-impression neon storefront signs               (parallax 0.55)
 *   3. Asphalt ground band + butter-yellow lane line             (no parallax)
 *
 * Intentionally scoped down from the original W5 spec — apartment-
 * window animation, subway whoosh, falling leaves, and the
 * convenience-store boss zone are deferred to a v2 pass. This is
 * just enough Seoul identity to land the rest of the W1+W4+W5
 * polish in a single deploy.
 */
function drawSeoulBackground(
  ctx: DrawCtx,
  scrollX: number,
  height: number
) {
  // ── 0. Stepped twilight sky (no smooth gradient). ──
  const skyBands: Array<[number, string]> = [
    [50, '#1a1d3d'],
    [100, '#2a1f4a'],
    [150, '#3a2a5a'],
    [GROUND_Y, '#4a3a6a'],
  ]
  let prevY = 0
  for (const [bandBottom, color] of skyBands) {
    ctx.fillStyle = color
    ctx.fillRect(0, prevY, W, bandBottom - prevY)
    prevY = bandBottom
  }
  // A handful of static stars in the upper band.
  ctx.fillStyle = '#fdf6dd'
  for (let i = 0; i < 14; i++) {
    const sx = (i * 53 + 11) % W
    const sy = (i * 19 + 5) % 44
    ctx.fillRect(sx, sy, 1, 1)
  }

  // ── 1. Distant skyline silhouette + Lotte-World-style super-tall. ──
  const skyScroll = Math.floor(scrollX * 0.22) % 480
  const winLit = '#ffd97a'
  const winCool = '#7adcd0'
  // Block layout per 480-px tile: [x, w, h, sprinkleStride].
  // Heights kept tall enough to read as a city, short enough to leave
  // sky breathing room for the neon signs in front.
  const blocks: Array<[number, number, number, number]> = [
    [10,  44, 70,  8],
    [62,  32, 56,  8],
    [102, 56, 92,  8], // taller anchor
    [168, 36, 64,  8],
    [212, 50, 80,  8],
    [274, 30, 50,  8],
  ]
  for (let tile = -1; tile < 3; tile++) {
    const bx = tile * 480 - skyScroll
    for (const [ox, w, h, stride] of blocks) {
      const x = bx + ox
      // Block body — plum silhouette, slightly lighter than the back band.
      ctx.fillStyle = '#3a2a5a'
      ctx.fillRect(x, GROUND_Y - h, w, h)
      // Lighter top edge gives a pixel-stepped highlight.
      ctx.fillStyle = '#4a3a6a'
      ctx.fillRect(x, GROUND_Y - h, w, 1)
      // Sprinkle lit windows — deterministic so it doesn't flicker frame-to-frame.
      for (let wy = GROUND_Y - h + 6; wy < GROUND_Y - 4; wy += stride) {
        for (let wx = x + 4; wx < x + w - 4; wx += 6) {
          // Pseudo-random gate from the world-space tile coords; cheap and stable.
          const seed = (wx * 13 + wy * 7) | 0
          const lit = (seed & 7) < 4
          if (!lit) continue
          ctx.fillStyle = (seed & 1) ? winLit : winCool
          ctx.fillRect(wx, wy, 2, 2)
        }
      }
    }
    // ── Lotte-style super-tall: tapering pyramidal silhouette once per tile. ──
    const lx = bx + 350
    const lTopH = 130
    // Stacked rectangles taper inward in 4 steps for the pyramidal cap.
    ctx.fillStyle = '#3a2a5a'
    ctx.fillRect(lx,      GROUND_Y - 90,   30, 90)
    ctx.fillRect(lx + 2,  GROUND_Y - 110,  26, 20)
    ctx.fillRect(lx + 5,  GROUND_Y - lTopH, 20, 20)
    // Highlight on the leading edge.
    ctx.fillStyle = '#5a4a7a'
    ctx.fillRect(lx,      GROUND_Y - 90,   1, 90)
    ctx.fillRect(lx + 2,  GROUND_Y - 110,  1, 20)
    ctx.fillRect(lx + 5,  GROUND_Y - lTopH, 1, 20)
    // Beacon at the very tip.
    ctx.fillStyle = '#ff3aa3'
    ctx.fillRect(lx + 13, GROUND_Y - lTopH - 3, 2, 3)
    // A few lit windows down the shaft.
    for (let wy = GROUND_Y - 84; wy < GROUND_Y - 8; wy += 10) {
      ctx.fillStyle = ((wy / 10) | 0) % 2 ? winLit : winCool
      ctx.fillRect(lx + 6,  wy, 2, 2)
      ctx.fillRect(lx + 14, wy, 2, 2)
      ctx.fillRect(lx + 22, wy, 2, 2)
    }
  }

  // ── 2. Two parallax neon storefront signs. ──
  // Mounted on small dark backboards that hide the sign post.
  const neonScroll = Math.floor(scrollX * 0.55) % 360
  const signs: Array<{ keys: string[]; color: string; ox: number; oy: number }> = [
    // 노래방 — noraebang (karaoke), hot magenta.
    { keys: ['no', 'rae', 'bang'], color: '#ff3aa3', ox: 40,  oy: 78 },
    // 편의점 — pyeonuijeom (convenience store), cool teal.
    { keys: ['pyeon', 'ui', 'jeom'], color: '#3ad4d4', ox: 220, oy: 60 },
  ]
  for (let tile = -1; tile < 3; tile++) {
    const bx = tile * 360 - neonScroll
    for (const sign of signs) {
      const sx = bx + sign.ox
      const sy = GROUND_Y - sign.oy
      const textW = sign.keys.length * (HANGUL_GLYPH_W + 1) - 1
      const padX = 3
      const padY = 2
      // Backboard.
      ctx.fillStyle = '#1a1226'
      ctx.fillRect(sx - padX, sy - padY, textW + padX * 2, HANGUL_GLYPH_H + padY * 2)
      // Faint outer glow halo (1 px ring at low alpha).
      ctx.fillStyle = applyAlpha(sign.color, 0.35)
      ctx.fillRect(sx - padX - 1, sy - padY, 1, HANGUL_GLYPH_H + padY * 2)
      ctx.fillRect(sx + textW + padX, sy - padY, 1, HANGUL_GLYPH_H + padY * 2)
      ctx.fillRect(sx - padX, sy - padY - 1, textW + padX * 2, 1)
      ctx.fillRect(sx - padX, sy + HANGUL_GLYPH_H + padY, textW + padX * 2, 1)
      // The hangul-impression text itself.
      drawHangulText(ctx, sign.keys, sx, sy, sign.color)
      // Mounting bracket — short black post into the building.
      ctx.fillStyle = '#1a1226'
      ctx.fillRect(sx + textW / 2, sy + HANGUL_GLYPH_H + padY + 1, 1, 4)
    }
  }

  // ── 3. Asphalt ground + butter-yellow lane line. ──
  ctx.fillStyle = '#1a1a26'
  ctx.fillRect(0, GROUND_Y, W, height - GROUND_Y)
  ctx.fillStyle = '#2a2a3a'
  ctx.fillRect(0, GROUND_Y, W, 1)
  // Dashed yellow lane line scrolling at run speed.
  const laneScroll = Math.floor(scrollX) % 32
  ctx.fillStyle = '#f0c668'
  for (let i = -1; i < W / 32 + 2; i++) {
    const lx = i * 32 - laneScroll
    ctx.fillRect(lx, GROUND_Y + 14, 16, 2)
  }
}

/**
 * Bespoke Texas (W2) parallax stack — Dallas-suburb at noon.
 * Layers, back → front:
 *
 *   0. Stepped pastel big-sky bands                            (no parallax)
 *   1. Rolling brown-grass hills + scrubby trees               (parallax 0.25)
 *   2. Suburban single-family homes (gabled rooflines)         (parallax 0.45)
 *   3. School flagpole flying the Texas Lone Star flag         (parallax 0.6)
 *   4. Cracked asphalt driveway / sidewalk with "STOP" lettering (no parallax)
 *   5. Heat-shimmer above asphalt (off under prefers-reduced-motion)
 *
 * The hero element — a walk-through metal-detector arch — is rendered as
 * an obstacle (see W2 obstacle mix), not in the background, so it can be
 * placed at the precise lane-blocking x positions the level designer
 * picked.
 */
function drawTexasBackground(
  ctx: DrawCtx,
  scrollX: number,
  height: number,
  time: number
) {
  // ── 0. Stepped pastel big-sky (no smooth gradients). ──
  const skyBands: Array<[number, string]> = [
    [40, '#a8c4e8'],
    [90, '#d4d4f0'],
    [140, '#ffe1b8'],
    [GROUND_Y, '#fff5d8'],
  ]
  let prevY = 0
  for (const [bandBottom, color] of skyBands) {
    ctx.fillStyle = color
    ctx.fillRect(0, prevY, W, bandBottom - prevY)
    prevY = bandBottom
  }
  // A few cumulus puffs scattered across the upper band.
  ctx.fillStyle = '#fff'
  const cloudScroll = Math.floor(scrollX * 0.15) % 320
  for (let tile = -1; tile < 4; tile++) {
    const cx = tile * 320 - cloudScroll
    ctx.fillRect(cx + 40, 24, 36, 6)
    ctx.fillRect(cx + 50, 20, 22, 4)
    ctx.fillRect(cx + 200, 50, 44, 6)
    ctx.fillRect(cx + 212, 46, 24, 4)
  }

  // ── 1. Rolling brown-grass hills + scrubby trees. ──
  const farScroll = Math.floor(scrollX * 0.25) % 360
  for (let tile = -1; tile < 4; tile++) {
    const bx = tile * 360 - farScroll
    // Hill silhouette (back layer)
    ctx.fillStyle = '#8f6e3a'
    ctx.beginPath()
    ctx.moveTo(bx, GROUND_Y - 8)
    ctx.lineTo(bx + 40, GROUND_Y - 30)
    ctx.lineTo(bx + 120, GROUND_Y - 24)
    ctx.lineTo(bx + 200, GROUND_Y - 40)
    ctx.lineTo(bx + 280, GROUND_Y - 24)
    ctx.lineTo(bx + 360, GROUND_Y - 12)
    ctx.lineTo(bx + 360, GROUND_Y)
    ctx.lineTo(bx, GROUND_Y)
    ctx.closePath()
    ctx.fill()
    // Lighter front edge
    ctx.fillStyle = '#c4a36a'
    ctx.fillRect(bx + 40, GROUND_Y - 31, 4, 2)
    ctx.fillRect(bx + 200, GROUND_Y - 41, 4, 2)
    ctx.fillRect(bx + 280, GROUND_Y - 25, 4, 2)
    // Scrubby cedar elm silhouettes
    ctx.fillStyle = '#5a3614'
    ctx.fillRect(bx + 80, GROUND_Y - 26, 2, 8)
    ctx.fillStyle = '#3a6a4a'
    ctx.fillRect(bx + 78, GROUND_Y - 32, 6, 6)
    ctx.fillStyle = '#5a3614'
    ctx.fillRect(bx + 240, GROUND_Y - 30, 2, 10)
    ctx.fillStyle = '#3a6a4a'
    ctx.fillRect(bx + 236, GROUND_Y - 38, 10, 8)
  }

  // ── 2. Suburban single-family homes (parallax 0.45). ──
  const midScroll = Math.floor(scrollX * 0.45) % 440
  for (let tile = -1; tile < 4; tile++) {
    const bx = tile * 440 - midScroll
    drawSuburbanHouse(ctx, bx + 8,   GROUND_Y - 56, 88,  56, 'beige')
    drawSuburbanHouse(ctx, bx + 108, GROUND_Y - 50, 78,  50, 'brick')
    drawSuburbanHouse(ctx, bx + 200, GROUND_Y - 60, 96,  60, 'beige')
    drawSuburbanHouse(ctx, bx + 308, GROUND_Y - 48, 76,  48, 'brick')
    // One "FOR SALE" sign per tile, anchored in a yard between houses
    drawForSaleSign(ctx, bx + 96, GROUND_Y - 14)
    drawForSaleSign(ctx, bx + 296, GROUND_Y - 14)
  }

  // ── 3. School flagpole flying Lone Star flag (parallax 0.6) ──
  // Placed once well into the run so it doesn't over-repeat; tied to
  // the home-tile coordinate frame.
  const flagScroll = Math.floor(scrollX * 0.6)
  const flagTileW = 880
  for (let tile = -1; tile < 3; tile++) {
    const bx = tile * flagTileW - (flagScroll % flagTileW)
    drawTexasSchoolFlag(ctx, bx + 360, GROUND_Y - 88, time)
  }

  // ── 4. Cracked asphalt driveway / sidewalk + STOP lettering. ──
  // Tan curb + asphalt — slightly different palette from W1's Saigon
  // street so the worlds don't blur together.
  ctx.fillStyle = '#a8907a'
  ctx.fillRect(0, GROUND_Y, W, 3)
  ctx.fillStyle = '#7a5a14'
  ctx.fillRect(0, GROUND_Y + 3, W, 1)
  ctx.fillStyle = '#4a464a'
  ctx.fillRect(0, GROUND_Y + 4, W, height - GROUND_Y - 4)
  // Asphalt cracks scrolling at run speed
  const crackScroll = Math.floor(scrollX) % 80
  ctx.fillStyle = '#3a363a'
  for (let i = -1; i < 9; i++) {
    const tx = i * 80 - crackScroll
    ctx.fillRect(tx + 12, GROUND_Y + 10, 16, 1)
    ctx.fillRect(tx + 36, GROUND_Y + 16, 12, 1)
    ctx.fillRect(tx + 22, GROUND_Y + 22, 8, 1)
  }
  // "STOP" pavement marker once per scroll tile
  const stopScroll = Math.floor(scrollX) % 480
  for (let tile = -1; tile < 3; tile++) {
    const sx = tile * 480 - stopScroll + 200
    ctx.fillStyle = '#fdfdfd'
    drawText(ctx, 'STOP', sx, GROUND_Y + 14, 7, '#fdfdfd')
  }

  // ── 5. Heat shimmer over the asphalt (suppressed by reduce-motion). ──
  if (!prefersReducedMotion()) {
    const phase = Math.floor(time / 120) % 4
    ctx.fillStyle = 'rgba(255, 240, 200, 0.16)'
    for (let i = 0; i < W; i += 4) {
      const offset = ((i + phase * 2) % 8) < 4 ? 0 : 1
      ctx.fillRect(i, GROUND_Y - 1 + offset, 2, 1)
    }
  }
}

/** A single suburban gabled house — stucco / brick variant. */
function drawSuburbanHouse(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  variant: 'beige' | 'brick'
) {
  const wall = variant === 'beige' ? '#d4b894' : '#a87060'
  const wallShade = variant === 'beige' ? '#9a7a5a' : '#6a3a2a'
  // Wall body
  ctx.fillStyle = wall
  ctx.fillRect(x, y + 8, w, h - 8)
  ctx.fillStyle = wallShade
  ctx.fillRect(x + w - 1, y + 8, 1, h - 8)
  // Brick texture for the brick variant
  if (variant === 'brick') {
    ctx.fillStyle = '#7a4a3a'
    for (let by = y + 14; by < y + h - 2; by += 4) {
      const offset = ((by - y - 14) / 4) % 2 === 0 ? 0 : 4
      for (let bx = x + offset; bx < x + w; bx += 8) {
        ctx.fillRect(bx, by, 6, 1)
      }
    }
  }
  // Gabled roof (triangle approximation)
  ctx.fillStyle = '#3a3a2a'
  const peakX = x + Math.floor(w / 2)
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(x + i, y + 8 - i, w - i * 2, 1)
  }
  // Roof ridge highlight
  ctx.fillStyle = '#5a5a4a'
  ctx.fillRect(peakX - 1, y, 2, 2)
  // Garage door (2-car) — wide on the right portion of the house
  const garageX = x + Math.floor(w * 0.5)
  const garageW = Math.floor(w * 0.42)
  const garageH = Math.floor((h - 8) * 0.55)
  const garageY = y + h - garageH
  ctx.fillStyle = '#9aa3ad'
  ctx.fillRect(garageX, garageY, garageW, garageH)
  ctx.fillStyle = '#5a6068'
  ctx.fillRect(garageX, garageY, garageW, 1)
  // Garage door panels
  ctx.fillStyle = '#7a8088'
  for (let py = garageY + 3; py < garageY + garageH - 1; py += 3) {
    ctx.fillRect(garageX + 1, py, garageW - 2, 1)
  }
  // Front door (left half)
  const doorH = Math.floor((h - 8) * 0.5)
  const doorW = 8
  const doorX = x + Math.floor(w * 0.18)
  const doorY = y + h - doorH
  ctx.fillStyle = '#5a2a14'
  ctx.fillRect(doorX, doorY, doorW, doorH)
  ctx.fillStyle = '#ffd24a'
  ctx.fillRect(doorX + doorW - 2, doorY + Math.floor(doorH / 2), 1, 1)
  // Two small windows
  ctx.fillStyle = '#5fc6e6'
  ctx.fillRect(x + 4, y + 14, 6, 6)
  ctx.fillRect(x + Math.floor(w * 0.34), y + 14, 6, 6)
  ctx.fillStyle = '#fff'
  ctx.fillRect(x + 4, y + 14, 6, 1)
  ctx.fillRect(x + Math.floor(w * 0.34), y + 14, 6, 1)
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + 4, y + 13, 6, 1)
  ctx.fillRect(x + Math.floor(w * 0.34), y + 13, 6, 1)
}

/** Red + white "FOR SALE" yard sign, low to the ground. */
function drawForSaleSign(ctx: DrawCtx, x: number, y: number) {
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + 4, y, 1, 12)
  ctx.fillRect(x + 12, y, 1, 12)
  ctx.fillStyle = '#fdfdfd'
  ctx.fillRect(x, y - 6, 18, 8)
  ctx.fillStyle = '#d63b2c'
  ctx.fillRect(x, y - 6, 18, 3)
  drawText(ctx, 'SALE', x + 1, y - 2, 4, '#1d1d1d')
}

/** Texas school flagpole — silver pole, Lone Star flag rippling at top. */
function drawTexasSchoolFlag(
  ctx: DrawCtx,
  x: number,
  y: number,
  time: number
) {
  // Pole
  ctx.fillStyle = '#9aa3ad'
  ctx.fillRect(x, y, 2, 88)
  ctx.fillStyle = '#5a6068'
  ctx.fillRect(x + 1, y, 1, 88)
  ctx.fillStyle = '#cfa44a'
  ctx.fillRect(x - 1, y - 2, 4, 2)
  // Flag — 26 × 14 to the right of the pole
  const fx = x + 2
  const fy = y + 4
  const fw = 26
  const fh = 14
  const ripple = prefersReducedMotion() ? 0 : Math.floor(time / 200) % 2
  // Hoist field (blue, full height left third)
  ctx.fillStyle = '#1a3a78'
  ctx.fillRect(fx, fy + ripple, 9, fh)
  // White top stripe
  ctx.fillStyle = '#fdfdfd'
  ctx.fillRect(fx + 9, fy + ripple, fw - 9, 7)
  // Red bottom stripe
  ctx.fillStyle = '#bf2a2a'
  ctx.fillRect(fx + 9, fy + 7 + ripple, fw - 9, 7)
  // White star centered on blue field
  ctx.fillStyle = '#fdfdfd'
  drawTinyStar(ctx, fx + 4, fy + Math.floor(fh / 2) + ripple, 2)
  // Pulley
  ctx.fillStyle = '#1d1d1d'
  ctx.fillRect(x - 1, fy + Math.floor(fh / 2), 2, 1)
}

/**
 * Bespoke UT-Austin (W3) parallax stack — campus at sunset.
 * Layers, back → front:
 *
 *   0. Warm sunset bands (orange → coral → burnt-orange horizon)  (no parallax)
 *   1. UT Tower silhouette — single iconic landmark on the right  (parallax 0.18)
 *   2. Campus buildings cluster (limestone + red brick)            (parallax 0.32)
 *   3. Live oaks with dense crowns                                 (parallax 0.45)
 *   4. Passing Capital Metro bus (yellow + silver)                 (parallax 0.7)
 *   5. Brick sidewalk with scattered ginkgo leaves                 (no parallax)
 */
function drawUTAustinBackground(
  ctx: DrawCtx,
  scrollX: number,
  height: number,
  time: number
) {
  // ── 0. Stepped warm-sunset bands. ──
  const skyBands: Array<[number, string]> = [
    [40, '#ffc8a0'],
    [100, '#ffa078'],
    [GROUND_Y, '#f57848'],
  ]
  let prevY = 0
  for (const [bandBottom, color] of skyBands) {
    ctx.fillStyle = color
    ctx.fillRect(0, prevY, W, bandBottom - prevY)
    prevY = bandBottom
  }
  // Setting sun, a touch left of the tower
  ctx.fillStyle = '#fff7c2'
  ctx.fillRect(W - 220, 50, 14, 12)
  ctx.fillRect(W - 222, 52, 18, 8)
  ctx.fillStyle = '#ffd9a3'
  ctx.fillRect(W - 220, 52, 14, 8)

  // ── 1. UT Tower (parallax 0.18). One instance per long tile. ──
  const towerScroll = Math.floor(scrollX * 0.18)
  const towerTileW = 720
  for (let tile = -1; tile < 3; tile++) {
    const bx = tile * towerTileW - (towerScroll % towerTileW)
    drawUTTowerBackdrop(ctx, bx + 480, GROUND_Y - 110, time)
  }

  // ── 2. Campus buildings — limestone + red-brick mix. ──
  const bldgScroll = Math.floor(scrollX * 0.32) % 420
  for (let tile = -1; tile < 4; tile++) {
    const bx = tile * 420 - bldgScroll
    drawCampusBuilding(ctx, bx + 0,   GROUND_Y - 50, 86,  50, 'limestone')
    drawCampusBuilding(ctx, bx + 96,  GROUND_Y - 58, 96,  58, 'brick')
    drawCampusBuilding(ctx, bx + 200, GROUND_Y - 44, 80,  44, 'limestone')
    drawCampusBuilding(ctx, bx + 290, GROUND_Y - 54, 110, 54, 'brick')
  }

  // ── 3. Live oaks (parallax 0.45). ──
  const oakScroll = Math.floor(scrollX * 0.45) % 220
  for (let tile = -1; tile < 5; tile++) {
    const bx = tile * 220 - oakScroll
    drawLiveOak(ctx, bx + 40, GROUND_Y - 30)
    drawLiveOak(ctx, bx + 140, GROUND_Y - 26)
  }

  // ── 4. Capital Metro bus — yellow + silver, passing in the lane. ──
  // Parallax 0.7 so it reads as right in front of the buildings.
  const busTileW = 640
  const busScroll = Math.floor(scrollX * 0.7) % busTileW
  for (let tile = -1; tile < 3; tile++) {
    const bx = tile * busTileW - busScroll
    drawCapMetroBus(ctx, bx + 200, GROUND_Y - 22)
  }

  // ── 5. Brick sidewalk + scattered ginkgo leaves. ──
  ctx.fillStyle = '#9a5a4a'
  ctx.fillRect(0, GROUND_Y, W, height - GROUND_Y)
  // Brick course lines
  ctx.fillStyle = '#7a3a2a'
  ctx.fillRect(0, GROUND_Y, W, 1)
  const brickScroll = Math.floor(scrollX) % 16
  for (let i = -1; i < W / 16 + 2; i++) {
    const bx = i * 16 - brickScroll
    ctx.fillRect(bx, GROUND_Y + 8, 1, height - GROUND_Y - 8)
    ctx.fillRect(bx + 8, GROUND_Y + 16, 1, height - GROUND_Y - 16)
  }
  ctx.fillStyle = '#7a3a2a'
  ctx.fillRect(0, GROUND_Y + 8, W, 1)
  ctx.fillRect(0, GROUND_Y + 16, W, 1)
  // Ginkgo leaves scattered on the sidewalk
  const leafScroll = Math.floor(scrollX) % 64
  for (let i = -1; i < W / 64 + 2; i++) {
    const lx = i * 64 - leafScroll + 12
    ctx.fillStyle = '#f0c060'
    ctx.fillRect(lx + 1, GROUND_Y + 11, 4, 1)
    ctx.fillRect(lx, GROUND_Y + 12, 6, 2)
    ctx.fillStyle = '#cfa44a'
    ctx.fillRect(lx + 2, GROUND_Y + 13, 2, 1)
    // A second leaf
    ctx.fillStyle = '#f0c060'
    ctx.fillRect(lx + 30, GROUND_Y + 20, 4, 1)
    ctx.fillRect(lx + 29, GROUND_Y + 21, 6, 2)
  }
}

/** UT Tower silhouette — burnt-orange stone with a glowing white clock. */
function drawUTTowerBackdrop(
  ctx: DrawCtx,
  x: number,
  y: number,
  time: number
) {
  const w = 30
  const baseY = y + 110
  // Limestone shaft
  ctx.fillStyle = '#d8c8a0'
  ctx.fillRect(x, baseY - 100, w, 100)
  // Burnt-orange band
  ctx.fillStyle = '#bf5700'
  ctx.fillRect(x, baseY - 100, w, 6)
  // Belfry block (slightly wider)
  ctx.fillStyle = '#d8c8a0'
  ctx.fillRect(x - 2, baseY - 110, w + 4, 12)
  ctx.fillStyle = '#bf5700'
  ctx.fillRect(x - 2, baseY - 110, w + 4, 2)
  // Clock face — pulse subtle glow (warm cream)
  const pulse = prefersReducedMotion() ? 0 : (Math.floor(time / 600) % 2)
  const faceColor = pulse ? '#fff7c2' : '#fdf6dd'
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + Math.floor(w / 2) - 6, baseY - 80, 12, 12)
  ctx.fillStyle = faceColor
  ctx.fillRect(x + Math.floor(w / 2) - 4, baseY - 78, 8, 8)
  // Clock hands
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + Math.floor(w / 2), baseY - 76, 1, 4)
  ctx.fillRect(x + Math.floor(w / 2), baseY - 74, 3, 1)
  // Stepped pyramidal cap
  ctx.fillStyle = '#7a3814'
  ctx.fillRect(x + 4, baseY - 114, w - 8, 4)
  ctx.fillRect(x + 8, baseY - 118, w - 16, 4)
  // Tip
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + Math.floor(w / 2), baseY - 124, 2, 6)
  // Doorway hint at the base
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + Math.floor(w / 2) - 3, baseY - 8, 6, 8)
}

/** A single campus building — limestone or red-brick variant. */
function drawCampusBuilding(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  variant: 'limestone' | 'brick'
) {
  const wall = variant === 'limestone' ? '#d8c8a0' : '#7a4a3a'
  const wallShade = variant === 'limestone' ? '#a89878' : '#5a2a1e'
  ctx.fillStyle = wall
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = wallShade
  ctx.fillRect(x + w - 1, y, 1, h)
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x, y, w, 2)
  ctx.fillRect(x, y + h - 2, w, 2)
  // Grid windows — 2 rows, ~4-5 per row
  for (let wy = y + 8; wy < y + h - 6; wy += 12) {
    for (let wx = x + 6; wx < x + w - 8; wx += 12) {
      ctx.fillStyle = '#3a2410'
      ctx.fillRect(wx, wy, 6, 6)
      ctx.fillStyle = '#ffd58a'
      ctx.fillRect(wx + 1, wy + 1, 4, 4)
      // A few unlit (deterministic by position)
      if ((wx * 31 + wy * 17) % 5 === 0) {
        ctx.fillStyle = '#3a2410'
        ctx.fillRect(wx + 1, wy + 1, 4, 4)
      }
    }
  }
}

/** Live oak silhouette — short trunk, wide dense crown. */
function drawLiveOak(ctx: DrawCtx, x: number, y: number) {
  ctx.fillStyle = '#5a3614'
  ctx.fillRect(x + 3, y + 8, 2, 10)
  ctx.fillRect(x + 4, y + 12, 4, 1)
  ctx.fillStyle = '#3a6a4a'
  ctx.fillRect(x - 4, y, 16, 8)
  ctx.fillRect(x - 6, y + 2, 20, 6)
  ctx.fillRect(x - 2, y - 2, 12, 4)
  // Highlight dabs
  ctx.fillStyle = '#5a8a4a'
  ctx.fillRect(x - 2, y, 4, 2)
  ctx.fillRect(x + 6, y + 2, 4, 2)
}

/** Capital Metro yellow + silver city bus passing along the lane. */
function drawCapMetroBus(ctx: DrawCtx, x: number, y: number) {
  const w = 60
  // Body — silver + yellow
  ctx.fillStyle = '#cdd2d7'
  ctx.fillRect(x, y, w, 14)
  ctx.fillStyle = '#f5c63a'
  ctx.fillRect(x, y + 8, w, 6)
  ctx.fillStyle = '#9aa3ad'
  ctx.fillRect(x, y + 13, w, 1)
  // Windows
  ctx.fillStyle = '#3a4a5e'
  for (let wx = x + 4; wx < x + w - 6; wx += 10) {
    ctx.fillRect(wx, y + 2, 8, 5)
  }
  ctx.fillStyle = '#5fc6e6'
  for (let wx = x + 5; wx < x + w - 6; wx += 10) {
    ctx.fillRect(wx, y + 3, 6, 3)
  }
  // Front door
  ctx.fillStyle = '#1d1d1d'
  ctx.fillRect(x + w - 8, y + 2, 4, 12)
  ctx.fillStyle = '#5fc6e6'
  ctx.fillRect(x + w - 7, y + 3, 2, 6)
  // Wheels
  ctx.fillStyle = '#1d1d1d'
  ctx.fillRect(x + 6, y + 14, 8, 6)
  ctx.fillRect(x + w - 14, y + 14, 8, 6)
  ctx.fillStyle = '#5a6068'
  ctx.fillRect(x + 8, y + 16, 4, 3)
  ctx.fillRect(x + w - 12, y + 16, 4, 3)
  // Tiny CapMetro logo dot
  ctx.fillStyle = '#3aa84a'
  ctx.fillRect(x + 2, y + 2, 2, 2)
}

/**
 * Bespoke Houston (W6) parallax stack — NASA + Vietnamese-TV-station.
 * Layers, back → front:
 *
 *   0. Hazy hot stepped sky bands                          (no parallax)
 *   1. Saturn V monument on its side + NASA meatball       (parallax 0.18)
 *   2. Houston downtown silhouette (4-5 office towers)     (parallax 0.32)
 *   3. Palm trees + mission-control building               (parallax 0.45)
 *   4. TV-station antenna with "TV-NHA-VIET" sign          (parallax 0.6)
 *   5. Asphalt + yellow center line                        (no parallax)
 *
 * Heat haze suppressed under prefers-reduced-motion.
 */
function drawHoustonBackground(
  ctx: DrawCtx,
  scrollX: number,
  height: number,
  time: number
) {
  // ── 0. Hazy hot sky. ──
  const skyBands: Array<[number, string]> = [
    [40, '#ffe8c8'],
    [100, '#ffcc9c'],
    [GROUND_Y, '#f8a878'],
  ]
  let prevY = 0
  for (const [bandBottom, color] of skyBands) {
    ctx.fillStyle = color
    ctx.fillRect(0, prevY, W, bandBottom - prevY)
    prevY = bandBottom
  }
  // High sun (centered, hot)
  ctx.fillStyle = '#fff7c2'
  ctx.fillRect(W / 2 - 8, 20, 18, 16)
  ctx.fillRect(W / 2 - 10, 24, 22, 8)

  // ── 1. Saturn V monument on its side. ──
  const sat5Scroll = Math.floor(scrollX * 0.18)
  const sat5TileW = 760
  for (let tile = -1; tile < 3; tile++) {
    const bx = tile * sat5TileW - (sat5Scroll % sat5TileW)
    drawSaturnV(ctx, bx + 60, GROUND_Y - 78)
    // NASA meatball logo to the right of the rocket
    drawNasaMeatball(ctx, bx + 380, GROUND_Y - 86)
  }

  // ── 2. Houston downtown silhouette. ──
  const dtScroll = Math.floor(scrollX * 0.32) % 420
  const towers: Array<[number, number, number]> = [
    [10,  28, 70],
    [44,  20, 56],
    [70,  32, 90],
    [106, 22, 64],
    [134, 36, 84],
    [176, 24, 70],
  ]
  for (let tile = -1; tile < 4; tile++) {
    const bx = tile * 420 - dtScroll
    for (const [ox, tw, th] of towers) {
      const tx = bx + ox
      ctx.fillStyle = '#4a5060'
      ctx.fillRect(tx, GROUND_Y - th, tw, th)
      ctx.fillStyle = '#5a6070'
      ctx.fillRect(tx, GROUND_Y - th, tw, 1)
      // Window grid
      ctx.fillStyle = '#7a8088'
      for (let wy = GROUND_Y - th + 4; wy < GROUND_Y - 4; wy += 6) {
        for (let wx = tx + 3; wx < tx + tw - 3; wx += 5) {
          if (((wx * 11 + wy * 7) & 7) < 3) continue
          ctx.fillRect(wx, wy, 2, 2)
        }
      }
    }
  }

  // ── 3. Palm trees + mission-control building. ──
  const midScroll = Math.floor(scrollX * 0.45) % 380
  for (let tile = -1; tile < 4; tile++) {
    const bx = tile * 380 - midScroll
    drawHoustonPalm(ctx, bx + 40, GROUND_Y - 50)
    drawHoustonPalm(ctx, bx + 220, GROUND_Y - 60)
    // Mission-control style building w/ curved facade
    drawMissionControlSilhouette(ctx, bx + 100, GROUND_Y - 38)
  }

  // ── 4. TV-station antenna tower. ──
  const antScroll = Math.floor(scrollX * 0.6)
  const antTileW = 540
  for (let tile = -1; tile < 3; tile++) {
    const bx = tile * antTileW - (antScroll % antTileW)
    drawTVStationAntenna(ctx, bx + 320, GROUND_Y - 70, time)
  }

  // ── 5. Asphalt + yellow center line. ──
  ctx.fillStyle = '#6a6a6a'
  ctx.fillRect(0, GROUND_Y, W, height - GROUND_Y)
  ctx.fillStyle = '#3a3a3a'
  ctx.fillRect(0, GROUND_Y, W, 1)
  // Dashed yellow lane line scrolling at run speed
  const laneScroll = Math.floor(scrollX) % 32
  ctx.fillStyle = '#f0c668'
  for (let i = -1; i < W / 32 + 2; i++) {
    const lx = i * 32 - laneScroll
    ctx.fillRect(lx, GROUND_Y + 14, 16, 2)
  }
  // A few scattered cypress / mesquite leaves
  const leafScroll = Math.floor(scrollX) % 96
  for (let i = -1; i < W / 96 + 2; i++) {
    const lx = i * 96 - leafScroll + 16
    ctx.fillStyle = '#5a7a3a'
    ctx.fillRect(lx, GROUND_Y + 24, 3, 1)
    ctx.fillRect(lx + 1, GROUND_Y + 25, 2, 1)
    ctx.fillStyle = '#3a5a2a'
    ctx.fillRect(lx + 30, GROUND_Y + 20, 3, 1)
    ctx.fillRect(lx + 31, GROUND_Y + 21, 2, 1)
  }

  // Heat haze suppressed by reduce-motion
  if (!prefersReducedMotion()) {
    const phase = Math.floor(time / 100) % 4
    ctx.fillStyle = 'rgba(255, 220, 180, 0.18)'
    for (let i = 0; i < W; i += 4) {
      const offset = ((i + phase * 2) % 8) < 4 ? 0 : 1
      ctx.fillRect(i, GROUND_Y - 1 + offset, 2, 1)
    }
  }
}

/** Saturn V on its side — distant white horizontal cylinder with stages. */
function drawSaturnV(ctx: DrawCtx, x: number, y: number) {
  const len = 220
  const r = 10
  // Body
  ctx.fillStyle = '#fdfdfd'
  ctx.fillRect(x, y, len, r)
  ctx.fillStyle = '#c8c8d0'
  ctx.fillRect(x, y + r - 1, len, 1)
  // Stage rings (black bands)
  ctx.fillStyle = '#1d1d1d'
  ctx.fillRect(x + 70, y, 2, r)
  ctx.fillRect(x + 130, y, 2, r)
  ctx.fillRect(x + 180, y, 2, r)
  // Engine nozzles at the right (5 of them)
  ctx.fillStyle = '#5a6068'
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(x + len + i * 3, y + 1 + (i % 2 ? 2 : 4), 3, 4)
  }
  // Nose cone on the left (tapered)
  ctx.fillStyle = '#fdfdfd'
  ctx.fillRect(x - 6, y + 2, 6, r - 4)
  ctx.fillRect(x - 10, y + 4, 4, r - 8)
  // USA + flag dabs
  ctx.fillStyle = '#1a3a78'
  ctx.fillRect(x + 26, y + 2, 6, 6)
  ctx.fillStyle = '#bf2a2a'
  ctx.fillRect(x + 34, y + 5, 8, 3)
  ctx.fillStyle = '#fdfdfd'
  drawText(ctx, 'USA', x + 28, y + 2, 5, '#fdfdfd')
  // Support cradles under the rocket
  ctx.fillStyle = '#3a3a40'
  ctx.fillRect(x + 40, y + r, 8, 4)
  ctx.fillRect(x + 130, y + r, 8, 4)
  ctx.fillRect(x + 200, y + r, 8, 4)
}

/** NASA "meatball" logo impression — blue circle + red swoosh + white stars. */
function drawNasaMeatball(ctx: DrawCtx, x: number, y: number) {
  // Blue disk (square approximation)
  ctx.fillStyle = '#1a3a78'
  ctx.fillRect(x + 1, y, 14, 16)
  ctx.fillRect(x, y + 1, 16, 14)
  // White star sprinkles
  ctx.fillStyle = '#fdfdfd'
  ctx.fillRect(x + 3, y + 3, 1, 1)
  ctx.fillRect(x + 12, y + 4, 1, 1)
  ctx.fillRect(x + 5, y + 10, 1, 1)
  // White "NASA" text
  drawText(ctx, 'NASA', x + 2, y + 5, 5, '#fdfdfd')
  // Red swoosh through the middle
  ctx.fillStyle = '#bf2a2a'
  ctx.fillRect(x, y + 8, 6, 1)
  ctx.fillRect(x + 4, y + 7, 6, 1)
  ctx.fillRect(x + 8, y + 8, 8, 1)
}

/** Houston palm tree silhouette. */
function drawHoustonPalm(ctx: DrawCtx, x: number, y: number) {
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + 2, y + 6, 2, 28)
  ctx.fillStyle = '#5a3614'
  ctx.fillRect(x + 2, y + 8, 1, 22)
  // Fronds
  ctx.fillStyle = '#3a6a4a'
  ctx.fillRect(x - 6, y + 4, 16, 2)
  ctx.fillRect(x - 4, y, 14, 2)
  ctx.fillRect(x - 8, y + 6, 6, 2)
  ctx.fillRect(x + 6, y + 6, 6, 2)
  ctx.fillRect(x, y - 2, 6, 4)
  ctx.fillStyle = '#5a8a4a'
  ctx.fillRect(x - 4, y + 4, 4, 1)
  ctx.fillRect(x + 6, y + 4, 4, 1)
}

/** Mission-control building silhouette — short, with curved facade hint. */
function drawMissionControlSilhouette(ctx: DrawCtx, x: number, y: number) {
  // Main body
  ctx.fillStyle = '#5a6068'
  ctx.fillRect(x, y + 4, 60, 34)
  ctx.fillStyle = '#7a8088'
  ctx.fillRect(x, y + 4, 60, 1)
  // Curved-facade hint (stepped top)
  ctx.fillStyle = '#5a6068'
  ctx.fillRect(x + 8, y, 44, 4)
  ctx.fillRect(x + 18, y - 4, 24, 4)
  // Antenna stub
  ctx.fillStyle = '#1d1d1d'
  ctx.fillRect(x + 28, y - 12, 2, 8)
  ctx.fillStyle = '#bf2a2a'
  ctx.fillRect(x + 27, y - 12, 4, 1)
  // Door
  ctx.fillStyle = '#3a3a40'
  ctx.fillRect(x + 26, y + 26, 8, 12)
  ctx.fillStyle = '#ffd24a'
  ctx.fillRect(x + 32, y + 32, 1, 1)
  // Side windows
  ctx.fillStyle = '#3aa84a'
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(x + 4 + i * 6, y + 12, 4, 6)
    ctx.fillRect(x + 38 + i * 5, y + 12, 4, 6)
  }
}

/** TV-station antenna — red+white striped pole, dish at top, station sign. */
function drawTVStationAntenna(
  ctx: DrawCtx,
  x: number,
  y: number,
  time: number
) {
  // Pole (striped)
  for (let py = y; py < y + 70; py += 4) {
    ctx.fillStyle = ((py - y) / 4) % 2 === 0 ? '#bf2a2a' : '#fdfdfd'
    ctx.fillRect(x, py, 2, 4)
  }
  // Guy-wire dabs
  ctx.fillStyle = '#5a6068'
  ctx.fillRect(x - 8, y + 32, 8, 1)
  ctx.fillRect(x + 2, y + 32, 8, 1)
  // Dish at top
  ctx.fillStyle = '#cdd2d7'
  ctx.fillRect(x - 5, y - 6, 12, 4)
  ctx.fillRect(x - 6, y - 4, 14, 2)
  ctx.fillStyle = '#9aa3ad'
  ctx.fillRect(x - 5, y - 6, 1, 4)
  // Red beacon (blink under non-reduced-motion)
  const blink = prefersReducedMotion() ? 1 : (Math.floor(time / 500) % 2)
  ctx.fillStyle = blink ? '#bf2a2a' : '#7a1a1a'
  ctx.fillRect(x, y - 9, 2, 2)
  // Station sign at the base
  ctx.fillStyle = '#1d1d1d'
  ctx.fillRect(x - 16, y + 70, 38, 12)
  ctx.fillStyle = '#bf2a2a'
  ctx.fillRect(x - 16, y + 70, 38, 2)
  drawText(ctx, 'TV-NHA', x - 14, y + 72, 5, '#ffd24a')
  drawText(ctx, 'VIET', x - 12, y + 78, 4, '#ffd24a')
}

/** HOLLYWOOD sign drawn in white block letters atop the hill silhouette. */
function drawHollywoodSign(ctx: DrawCtx, x: number, y: number) {
  const letterW = 6
  const letterH = 12
  const letters = 'HOLLYWOOD'
  ctx.fillStyle = '#fdf6dd'
  for (let i = 0; i < letters.length; i++) {
    const lx = x + i * (letterW + 1)
    ctx.fillRect(lx, y, letterW, letterH)
  }
  // Scaffolding shadow line under the letters.
  ctx.fillStyle = '#3a4a5e'
  for (let i = 0; i < letters.length; i++) {
    const lx = x + i * (letterW + 1)
    ctx.fillRect(lx, y + letterH, letterW, 1)
    ctx.fillRect(lx + letterW / 2, y + letterH, 1, 3)
  }
  // Re-draw letter ink so the silhouette stays crisp.
  ctx.fillStyle = '#3a2410'
  for (let i = 0; i < letters.length; i++) {
    const lx = x + i * (letterW + 1)
    ctx.fillRect(lx + letterW - 1, y, 1, letterH)
  }
}

/**
 * Bespoke Austin-home (W7) platformer backdrop — hill-country sunset.
 * Layers, back → front (camera-relative drawing — note camX/camY come
 * from the platformer camera and we offset everything by them):
 *
 *   0. Warm sunset bands (golden → coral → magenta toward the top)
 *   1. Texas Capitol dome silhouette on the right                (parallax 0.15)
 *   2. Downtown Austin skyline (Frost Bank "owl crown", Austonian, etc)
 *      (parallax 0.3)
 *   3. Rolling hill-country silhouettes + Lady Bird Lake band    (parallax 0.5)
 *   4. Career-arc tech billboards climbing a hill                (parallax 0.8)
 *   5. Limestone path + bluebonnets + Indian paintbrush          (world-fixed)
 *
 * The W7 climb tops out at the Capitol dome — its silhouette anchors the
 * background so the player can see their destination from the start.
 */
function drawPlatformerBackdrop(
  ctx: DrawCtx,
  config: RunConfig,
  camX: number,
  camY: number
) {
  const worldH = config.height ?? 720

  // ── 0. Warm sunset bands (no parallax). ──
  // Painted upward — top of the screen is the most saturated.
  const bands: Array<[number, string]> = [
    [40,  '#9a4a78'],
    [90,  '#e87850'],
    [140, '#ffac68'],
    [H,   '#ffd8a0'],
  ]
  let prevY = 0
  for (const [bandBottom, color] of bands) {
    ctx.fillStyle = color
    ctx.fillRect(0, prevY, W, bandBottom - prevY)
    prevY = bandBottom
  }
  // Setting sun, low and to the right
  ctx.fillStyle = '#fff7c2'
  ctx.fillRect(W - 90, 90, 18, 16)
  ctx.fillRect(W - 92, 92, 22, 10)
  ctx.fillStyle = '#ffd9a3'
  ctx.fillRect(W - 90, 92, 18, 10)

  // ── 1. Texas Capitol dome silhouette (parallax 0.15). ──
  // The dome is the climb destination — it always reads on the right of
  // the visible viewport so the player knows where they're heading.
  const domeX = W - 130 - Math.floor(camX * 0.15)
  drawCapitolDomeBackdrop(ctx, domeX, 110)

  // ── 2. Downtown Austin skyline (parallax 0.3). ──
  const skylineScroll = Math.floor(camX * 0.3)
  // Building cluster (Frost Bank "owl crown", Austonian, generic towers).
  const skyline: Array<{ x: number; w: number; h: number; kind: 'frost' | 'plain' | 'austonian' }> = [
    { x: 30,  w: 28, h: 64,  kind: 'plain' },
    { x: 60,  w: 22, h: 50,  kind: 'plain' },
    { x: 84,  w: 32, h: 86,  kind: 'frost' },     // Frost Bank
    { x: 118, w: 26, h: 60,  kind: 'plain' },
    { x: 146, w: 24, h: 96,  kind: 'austonian' }, // Austonian
    { x: 172, w: 22, h: 54,  kind: 'plain' },
    { x: 196, w: 28, h: 70,  kind: 'plain' },
  ]
  const skylineTileW = 240
  for (let tile = -1; tile < 4; tile++) {
    const tx = tile * skylineTileW - (skylineScroll % skylineTileW)
    for (const b of skyline) {
      drawAustinSkylineTower(ctx, tx + b.x, 200 - b.h, b.w, b.h, b.kind)
    }
  }

  // ── 3. Hill-country silhouettes + Lady Bird Lake band (parallax 0.5). ──
  const hillScroll = Math.floor(camX * 0.5)
  ctx.fillStyle = '#5a7a8a'
  ctx.globalAlpha = 0.85
  for (let tile = -1; tile < 4; tile++) {
    const hx = tile * 240 - (hillScroll % 240)
    ctx.beginPath()
    ctx.moveTo(hx,        210)
    ctx.lineTo(hx + 50,   190)
    ctx.lineTo(hx + 110,  200)
    ctx.lineTo(hx + 170,  178)
    ctx.lineTo(hx + 240,  204)
    ctx.lineTo(hx + 240,  220)
    ctx.lineTo(hx,        220)
    ctx.closePath()
    ctx.fill()
  }
  ctx.globalAlpha = 1
  // Lady Bird Lake band — horizontal blue band beneath the hills.
  ctx.fillStyle = '#5a8aa0'
  ctx.fillRect(0, 220, W, 6)
  ctx.fillStyle = '#7adcd0'
  ctx.fillRect(0, 220, W, 1)
  // A wee bridge over the lake every couple of tiles.
  for (let tile = -1; tile < 4; tile++) {
    const bx = tile * 360 - (hillScroll % 360)
    ctx.fillStyle = '#3a2410'
    ctx.fillRect(bx + 120, 219, 40, 1)
    ctx.fillRect(bx + 122, 220, 1, 4)
    ctx.fillRect(bx + 140, 220, 1, 4)
    ctx.fillRect(bx + 158, 220, 1, 4)
  }

  // ── 4. Career-arc tech billboards climbing a hill (parallax 0.8). ──
  // This is the W7 chapter callback — a tower of company logos in the
  // mid-near layer. Five companies, each on its own little stake.
  const careerScroll = Math.floor(camX * 0.8)
  const careerTileW = 520
  type CareerCard = { dx: number; dy: number; color: string; text: string }
  const career: CareerCard[] = [
    { dx: 0,   dy: 0,   color: '#bf5700', text: 'OPENLISTINGS' },
    { dx: 70,  dy: -14, color: '#3a78c4', text: 'OPENDOOR' },
    { dx: 150, dy: -28, color: '#3aa84a', text: 'BETTER' },
    { dx: 220, dy: -42, color: '#f29ac0', text: 'SUNROOM' },
    { dx: 300, dy: -56, color: '#a04060', text: 'UTILITY PROFIT' },
  ]
  for (let tile = -1; tile < 3; tile++) {
    const baseX = tile * careerTileW - (careerScroll % careerTileW) + 60
    for (const c of career) {
      drawCareerStakeSign(ctx, baseX + c.dx, 220 - c.dy * -1, c.color, c.text)
    }
  }

  // ── 5. World floor (limestone path + bluebonnets + paintbrush). ──
  // World-fixed: drawn relative to camY so it scrolls with the camera.
  const floorTopScreen = 680 - camY
  if (floorTopScreen < H) {
    ctx.fillStyle = '#e8d8a8'
    ctx.fillRect(0, floorTopScreen, W, Math.min(H - floorTopScreen, worldH - 680))
    ctx.fillStyle = '#a8907a'
    ctx.fillRect(0, floorTopScreen, W, 2)
    // Limestone cracks
    for (let i = 0; i < 10; i++) {
      const fx = (i * 73 + Math.floor(camX * 0.1)) % W
      ctx.fillStyle = '#a8907a'
      ctx.fillRect(fx, floorTopScreen + 6 + (i % 3) * 6, 8, 1)
    }
    // Scattered bluebonnet + paintbrush dabs along the path edge
    for (let i = 0; i < 14; i++) {
      const fx = (i * 53 + Math.floor(camX * 0.3)) % W
      const fy = floorTopScreen + 18 + (i % 4) * 4
      // Bluebonnet stalk
      ctx.fillStyle = '#3aa84a'
      ctx.fillRect(fx + 1, fy - 4, 1, 4)
      ctx.fillStyle = '#5a78c8'
      ctx.fillRect(fx, fy - 6, 3, 1)
      ctx.fillRect(fx, fy - 5, 3, 2)
      ctx.fillStyle = '#fdfdfd'
      ctx.fillRect(fx + 1, fy - 7, 1, 1)
      // Indian paintbrush
      if (i % 3 === 0) {
        ctx.fillStyle = '#3aa84a'
        ctx.fillRect(fx + 7, fy - 3, 1, 3)
        ctx.fillStyle = '#e85040'
        ctx.fillRect(fx + 6, fy - 5, 3, 2)
      }
    }
  }
}

/** Texas Capitol pink-granite dome silhouette anchored on the right. */
function drawCapitolDomeBackdrop(ctx: DrawCtx, x: number, y: number) {
  // Main rotunda body
  ctx.fillStyle = '#d8a8a0'
  ctx.fillRect(x, y + 40, 80, 30)
  ctx.fillStyle = '#b07878'
  ctx.fillRect(x + 78, y + 40, 2, 30)
  // Dome (stepped pixel ellipse)
  ctx.fillStyle = '#d8a8a0'
  ctx.fillRect(x + 6,  y + 28, 68, 14)
  ctx.fillRect(x + 12, y + 20, 56, 10)
  ctx.fillRect(x + 20, y + 12, 40, 10)
  ctx.fillRect(x + 28, y + 6,  24, 8)
  // Dome highlight
  ctx.fillStyle = '#e8c0b8'
  ctx.fillRect(x + 14, y + 24, 4, 2)
  ctx.fillRect(x + 22, y + 16, 4, 2)
  ctx.fillRect(x + 30, y + 10, 4, 2)
  // Lantern + flag at the very top
  ctx.fillStyle = '#fdf6dd'
  ctx.fillRect(x + 36, y, 8, 8)
  ctx.fillStyle = '#7a3814'
  ctx.fillRect(x + 39, y - 6, 2, 6)
  ctx.fillStyle = '#bf2a2a'
  ctx.fillRect(x + 41, y - 6, 6, 4)
  // Wing extensions (low silhouette)
  ctx.fillStyle = '#b07878'
  ctx.fillRect(x - 24, y + 56, 24, 14)
  ctx.fillRect(x + 80, y + 56, 24, 14)
}

/**
 * A single Austin downtown tower silhouette, with optional "owl crown"
 * (Frost Bank) or chevron-cap (Austonian) treatment.
 */
function drawAustinSkylineTower(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  kind: 'frost' | 'plain' | 'austonian'
) {
  ctx.fillStyle = '#4a5060'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = '#5a6070'
  ctx.fillRect(x, y, w, 1)
  // Window grid
  ctx.fillStyle = '#7a8088'
  for (let wy = y + 4; wy < y + h - 4; wy += 6) {
    for (let wx = x + 3; wx < x + w - 3; wx += 5) {
      if (((wx * 13 + wy * 7) & 7) < 3) continue
      ctx.fillRect(wx, wy, 2, 2)
    }
  }
  // Cap treatment
  if (kind === 'frost') {
    // Owl-crown: two pointed "ears" on either side
    ctx.fillStyle = '#4a5060'
    ctx.fillRect(x - 2, y - 6, 6, 6)
    ctx.fillRect(x + w - 4, y - 6, 6, 6)
    // Center crown
    ctx.fillRect(x + Math.floor(w / 2) - 4, y - 4, 8, 4)
    // Glow dab
    ctx.fillStyle = '#7adcd0'
    ctx.fillRect(x + Math.floor(w / 2) - 1, y - 1, 2, 1)
  } else if (kind === 'austonian') {
    // Stepped chevron cap
    ctx.fillStyle = '#4a5060'
    ctx.fillRect(x + 2, y - 4, w - 4, 4)
    ctx.fillRect(x + 6, y - 8, w - 12, 4)
    // Antenna
    ctx.fillStyle = '#1d1d1d'
    ctx.fillRect(x + Math.floor(w / 2) - 1, y - 16, 2, 8)
    ctx.fillStyle = '#bf2a2a'
    ctx.fillRect(x + Math.floor(w / 2) - 1, y - 16, 2, 2)
  }
}

/** A small career-step billboard — colored panel + bold pixel-letters. */
function drawCareerStakeSign(
  ctx: DrawCtx,
  x: number,
  y: number,
  color: string,
  text: string
) {
  // Stake pole
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + 9, y, 2, 16)
  // Panel
  ctx.fillStyle = color
  ctx.fillRect(x, y - 14, 56, 12)
  ctx.fillStyle = '#1d1d1d'
  ctx.fillRect(x, y - 14, 56, 1)
  ctx.fillRect(x, y - 3, 56, 1)
  ctx.fillRect(x, y - 14, 1, 12)
  ctx.fillRect(x + 55, y - 14, 1, 12)
  drawText(ctx, text, x + 2, y - 12, 6, '#fdfdfd')
}

/* ─────────────────────────── Game state ──────────────────────────── */

interface GameState {
  worldX: number // autoRunner only: how far the camera has scrolled
  camX: number
  camY: number
  avatarX: number // platformer only
  avatarY: number // bottom of avatar (in world y for platformer, screen-space-ish for autoRunner)
  vy: number
  onGround: boolean
  facing: 1 | -1
  coyoteUntilMs: number
  startedAtMs: number
  failedAtMs: number
  shakeUntilMs: number
}

function makeInitialState(config: RunConfig, startedAt = 0): GameState {
  if (config.mode === 'autoRunner') {
    return {
      worldX: 0,
      camX: 0,
      camY: 0,
      avatarX: 80,
      avatarY: GROUND_Y,
      vy: 0,
      onGround: true,
      facing: 1,
      coyoteUntilMs: 0,
      startedAtMs: startedAt,
      failedAtMs: 0,
      shakeUntilMs: 0,
    }
  }
  const spawn = config.spawn ?? { x: 40, y: 680 }
  const worldH = config.height ?? 720
  return {
    worldX: 0,
    camX: clampCamX(spawn.x - W / 2, config),
    camY: clampCamY(spawn.y - H + 60, worldH),
    avatarX: spawn.x,
    avatarY: spawn.y,
    vy: 0,
    onGround: true,
    facing: 1,
    coyoteUntilMs: 0,
    startedAtMs: startedAt,
    failedAtMs: 0,
    shakeUntilMs: 0,
  }
}

function clampCamX(x: number, config: RunConfig) {
  return Math.max(0, Math.min(x, config.length - W))
}
function clampCamY(y: number, worldH: number) {
  return Math.max(0, Math.min(y, worldH - H))
}

/** AABB overlap. */
function overlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  )
}

type ProjectilePhase = 'off' | 'windup' | 'fire'

/**
 * Three-state projectile timing used by the LA paparazzi flashbulbs and
 * klieg sweeps:
 *
 *   |         period          |
 *   | windup | fire |   off    |
 *
 * - `windup`: telegraph window — drawn but NOT collidable. Lets the player
 *   read "this thing is about to fire". Length = `windupMs ?? 0`.
 * - `fire`: active hazard window — drawn AND collidable. Length = `activeMs`.
 * - `off`: gone — not drawn, not collidable.
 *
 * Old projectiles (without `windupMs`) collapse to the old two-state cycle
 * (active vs. off) cleanly — `windupMs ?? 0` makes the windup window empty.
 */
function projectilePhase(
  o: Obstacle,
  runMs: number
): { phase: ProjectilePhase; elapsedMs: number; phaseMsTotal: number } {
  if (o.kind !== 'projectile') {
    return { phase: 'fire', elapsedMs: 0, phaseMsTotal: 0 }
  }
  const period = o.periodMs ?? 1000
  const active = o.activeMs ?? Math.floor(period * 0.5)
  const windup = Math.max(0, o.windupMs ?? 0)
  const phaseOff = o.phaseMs ?? 0
  const tMs = ((runMs + phaseOff) % period + period) % period
  if (tMs < windup) {
    return { phase: 'windup', elapsedMs: tMs, phaseMsTotal: windup }
  }
  if (tMs < windup + active) {
    return {
      phase: 'fire',
      elapsedMs: tMs - windup,
      phaseMsTotal: active,
    }
  }
  return {
    phase: 'off',
    elapsedMs: tMs - windup - active,
    phaseMsTotal: Math.max(1, period - windup - active),
  }
}

function projectileActive(o: Obstacle, runMs: number): boolean {
  if (o.kind !== 'projectile') return true
  return projectilePhase(o, runMs).phase === 'fire'
}

/** Drawable but possibly-not-collidable: `windup` and `fire` both render. */
function projectileVisible(o: Obstacle, runMs: number): boolean {
  if (o.kind !== 'projectile') return true
  const p = projectilePhase(o, runMs).phase
  return p === 'windup' || p === 'fire'
}

function avatarRect(state: GameState, mode: 'autoRunner' | 'platformer') {
  if (mode === 'autoRunner') {
    return {
      x: state.worldX + state.avatarX,
      y: state.avatarY - AVATAR_H,
      w: AVATAR_W,
      h: AVATAR_H,
    }
  }
  return {
    x: state.avatarX,
    y: state.avatarY - AVATAR_H,
    w: AVATAR_W,
    h: AVATAR_H,
  }
}

/* ─────────────────────────── React component ────────────────────────── */

interface Sfx {
  playClick: () => void
  playSecret: () => void
  playJump: () => void
  playFail: () => void
}

interface BossRunProps {
  config: RunConfig
  cleared: boolean
  levelNumber: number
  /** Called the instant the avatar contacts the boss zone. */
  onWin: () => void
  /** Called by the "exit to map" controls inside the run. */
  onExit: () => void
  sfx: Sfx
}

type Phase = 'pre-run' | 'running' | 'paused' | 'won'

export function BossRun({
  config,
  cleared,
  levelNumber,
  onWin,
  onExit,
  sfx,
}: BossRunProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase] = useState<Phase>(cleared ? 'won' : 'pre-run')
  const phaseRef = useRef<Phase>(phase)
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const stateRef = useRef<GameState>(makeInitialState(config))
  const jumpHeldRef = useRef(false)
  const leftHeldRef = useRef(false)
  const rightHeldRef = useRef(false)
  const onWinRef = useRef(onWin)
  useEffect(() => {
    onWinRef.current = onWin
  }, [onWin])

  const beginRun = useCallback(() => {
    stateRef.current = makeInitialState(config, performance.now())
    // Drop focus off the Begin button so a subsequent Space/Enter doesn't
    // re-activate something underneath. We move focus to body explicitly.
    if (typeof document !== 'undefined') {
      const active = document.activeElement as HTMLElement | null
      active?.blur()
    }
    setPhase('running')
  }, [config])

  const tryJump = useCallback(() => {
    const now = performance.now()
    const s = stateRef.current
    if (s.failedAtMs > 0) return
    const canJump = s.onGround || now <= s.coyoteUntilMs
    if (!canJump) return
    s.vy = -JUMP_VEL
    s.onGround = false
    s.coyoteUntilMs = 0
    sfx.playJump()
  }, [sfx])

  /* ────────── Input handlers (window keydown / keyup) ────────── */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      const p = phaseRef.current
      if (p === 'pre-run' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        e.stopPropagation()
        beginRun()
        return
      }
      if (p !== 'running' && p !== 'paused') return
      // Escape: pause / resume
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        if (p === 'running') setPhase('paused')
        else setPhase('running')
        return
      }
      if (p !== 'running') return
      // Jump
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault()
        e.stopPropagation()
        jumpHeldRef.current = true
        tryJump()
        return
      }
      // Platformer movement
      if (config.mode === 'platformer') {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
          e.preventDefault()
          e.stopPropagation()
          leftHeldRef.current = true
        }
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          e.preventDefault()
          e.stopPropagation()
          rightHeldRef.current = true
        }
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const p = phaseRef.current
      const consumesGameKeys = p === 'running' || p === 'paused'
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        // Without preventDefault here, a Space-up on a focused button (e.g.
        // the Skip link, or a stale-focused footer button) would activate it.
        if (consumesGameKeys) {
          e.preventDefault()
          e.stopPropagation()
        }
        jumpHeldRef.current = false
      }
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        if (consumesGameKeys) {
          e.preventDefault()
          e.stopPropagation()
        }
        leftHeldRef.current = false
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        if (consumesGameKeys) {
          e.preventDefault()
          e.stopPropagation()
        }
        rightHeldRef.current = false
      }
    }
    // Capture so we beat the modal's own keydown listener.
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
    }
  }, [beginRun, tryJump, config.mode])

  /* ───────────── RAF loop ───────────── */
  useEffect(() => {
    if (phase !== 'running') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false

    let raf = 0
    let lastT = performance.now()

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastT) / 1000)
      lastT = now
      const s = stateRef.current

      // Failed pause: wait, then reset.
      if (s.failedAtMs > 0) {
        if (now - s.failedAtMs > FAIL_PAUSE_MS) {
          stateRef.current = makeInitialState(config, now)
        }
        renderFrame(ctx, config, stateRef.current, now, /*flashFail*/ true)
        raf = requestAnimationFrame(loop)
        return
      }

      // ── Physics ──
      // Variable jump cut: if jump released mid-rise.
      if (!jumpHeldRef.current && s.vy < -JUMP_VEL * JUMP_CUT_FACTOR) {
        s.vy = -JUMP_VEL * JUMP_CUT_FACTOR
      }
      s.vy += GRAVITY * dt
      s.avatarY += s.vy * dt

      if (config.mode === 'autoRunner') {
        s.worldX += (config.speed ?? RUN_SPEED_DEFAULT) * dt
        s.facing = 1
      } else {
        let vx = 0
        if (leftHeldRef.current) vx -= config.speed ?? PLATFORMER_RUN_SPEED
        if (rightHeldRef.current) vx += config.speed ?? PLATFORMER_RUN_SPEED
        s.avatarX += vx * dt
        if (vx > 0) s.facing = 1
        else if (vx < 0) s.facing = -1
        s.avatarX = Math.max(0, Math.min(s.avatarX, config.length - AVATAR_W))
      }

      // ── Ground & platform collision ──
      const wasInAir = !s.onGround
      s.onGround = false
      if (config.mode === 'autoRunner') {
        if (s.avatarY >= GROUND_Y) {
          s.avatarY = GROUND_Y
          s.vy = 0
          s.onGround = true
        }
      } else {
        const worldH = config.height ?? 720
        if (s.avatarY >= worldH) {
          s.avatarY = worldH
          s.vy = 0
          s.onGround = true
        }
        // Platforms: land only when falling.
        for (const p of config.platforms ?? []) {
          if (s.vy < 0) continue
          const aLeft = s.avatarX
          const aRight = s.avatarX + AVATAR_W
          const pLeft = p.x
          const pRight = p.x + p.w
          if (aRight <= pLeft || aLeft >= pRight) continue
          const prevBottom = s.avatarY - s.vy * dt
          if (prevBottom <= p.y + 0.5 && s.avatarY >= p.y) {
            s.avatarY = p.y
            s.vy = 0
            s.onGround = true
            break
          }
        }
      }
      if (wasInAir && s.onGround) {
        s.coyoteUntilMs = now + COYOTE_TIME_MS
      } else if (s.onGround) {
        s.coyoteUntilMs = now + COYOTE_TIME_MS
      }

      // Platformer camera follow.
      if (config.mode === 'platformer') {
        const targetCamX = s.avatarX - W / 2
        const targetCamY = s.avatarY - H * 0.7
        s.camX = clampCamX(s.camX + (targetCamX - s.camX) * 0.18, config)
        s.camY = clampCamY(
          s.camY + (targetCamY - s.camY) * 0.18,
          config.height ?? 720
        )
      }

      // ── Collision: boss + obstacles ──
      const aRect = avatarRect(s, config.mode)
      if (overlap(aRect, config.bossZone)) {
        setPhase('won')
        onWinRef.current()
        renderFrame(ctx, config, s, now, false)
        return
      }
      const runMs = now - s.startedAtMs
      for (const o of config.obstacles) {
        if (!projectileActive(o, runMs)) continue
        if (overlap(aRect, o)) {
          s.failedAtMs = now
          s.shakeUntilMs = now + 220
          sfx.playFail()
          break
        }
      }

      renderFrame(ctx, config, s, now, false)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [phase, config, sfx])

  /* ──────── Touch / click handlers on the canvas ──────── */
  const handleCanvasInput = (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (phase === 'pre-run') {
      beginRun()
      return
    }
    if (phase !== 'running') return
    jumpHeldRef.current = true
    tryJump()
    // Auto-release after a beat for taps on touch devices.
    window.setTimeout(() => {
      jumpHeldRef.current = false
    }, 220)
  }

  /* ─────────── Skip / win handlers ─────────── */
  const handleSkip = () => {
    sfx.playClick()
    onWin()
    setPhase('won')
  }

  /* ───────────────── Render UI ───────────────── */
  return (
    <section className="boss-run" aria-label={`World ${levelNumber} boss run`}>
      <header className="boss-run__head">
        <h3 className="chapter__heading">
          <span className="chapter__year">!</span>
          Boss run · World {levelNumber}
        </h3>
        {!cleared && phase !== 'won' && (
          <button
            type="button"
            className="boss-run__skip-link"
            onClick={handleSkip}
            title="Skip the run and mark this world cleared. No judgement."
          >
            Skip & mark cleared
          </button>
        )}
      </header>

      <div
        className={`boss-run__viewport${phase === 'running' ? ' is-playing' : ''}`}
      >
        <canvas
          ref={canvasRef}
          className="boss-run__canvas"
          width={W}
          height={H}
          onClick={handleCanvasInput}
          onTouchStart={handleCanvasInput}
        />

        {phase === 'pre-run' && (
          <div className="boss-run__overlay boss-run__overlay--pre">
            <p className="boss-run__flavor">{config.preRunFlavor}</p>
            <p className="boss-run__boss-preview">{config.bossPreview}</p>
            <button
              type="button"
              className="pixel-btn boss-run__begin"
              onClick={beginRun}
            >
              Begin run ▶
            </button>
          </div>
        )}

        {phase === 'paused' && (
          <div className="boss-run__overlay boss-run__overlay--pause">
            <p className="boss-run__overlay-title">Paused</p>
            <div className="boss-run__overlay-buttons">
              <button
                type="button"
                className="pixel-btn"
                onClick={() => setPhase('running')}
              >
                Resume
              </button>
              <button
                type="button"
                className="pixel-btn"
                onClick={handleSkip}
              >
                Skip
              </button>
              <button
                type="button"
                className="pixel-btn"
                onClick={() => {
                  sfx.playClick()
                  onExit()
                }}
              >
                Exit to map
              </button>
            </div>
          </div>
        )}

        {phase === 'won' && (
          <div className="boss-run__overlay boss-run__overlay--win">
            <p className="boss-run__overlay-title">
              ★ World {levelNumber} cleared ★
            </p>
            <p className="boss-run__overlay-sub">{config.postWinFlavor}</p>
          </div>
        )}
      </div>

      {/* On-screen controls visible during platformer mode only. */}
      {config.mode === 'platformer' && phase === 'running' && (
        <div className="boss-run__touch-controls" aria-hidden="false">
          <button
            type="button"
            className="boss-run__touch-btn"
            onPointerDown={() => (leftHeldRef.current = true)}
            onPointerUp={() => (leftHeldRef.current = false)}
            onPointerLeave={() => (leftHeldRef.current = false)}
            onPointerCancel={() => (leftHeldRef.current = false)}
            aria-label="Move left"
          >
            ◀
          </button>
          <button
            type="button"
            className="boss-run__touch-btn"
            onPointerDown={() => (rightHeldRef.current = true)}
            onPointerUp={() => (rightHeldRef.current = false)}
            onPointerLeave={() => (rightHeldRef.current = false)}
            onPointerCancel={() => (rightHeldRef.current = false)}
            aria-label="Move right"
          >
            ▶
          </button>
          <button
            type="button"
            className="boss-run__touch-btn boss-run__touch-btn--jump"
            onPointerDown={() => {
              jumpHeldRef.current = true
              tryJump()
            }}
            onPointerUp={() => (jumpHeldRef.current = false)}
            onPointerLeave={() => (jumpHeldRef.current = false)}
            aria-label="Jump"
          >
            ↑
          </button>
        </div>
      )}

      <p className="boss-run__hud">
        {config.mode === 'autoRunner' ? (
          <>
            <kbd>↑</kbd>/<kbd>Space</kbd> — jump (hold for higher)
            {' · '}
            <kbd>tap</kbd> — jump
            {' · '}
            <kbd>Esc</kbd> — pause
          </>
        ) : (
          <>
            <kbd>← →</kbd> — move{' · '}
            <kbd>↑</kbd>/<kbd>Space</kbd> — jump{' · '}
            <kbd>Esc</kbd> — pause
          </>
        )}
      </p>
    </section>
  )
}

/* ───────────────────────── Render frame ───────────────────────── */

function renderFrame(
  ctx: DrawCtx,
  config: RunConfig,
  s: GameState,
  now: number,
  flashFail: boolean
) {
  // Determine camera offset.
  const camX = config.mode === 'autoRunner' ? s.worldX : s.camX
  const camY = config.mode === 'autoRunner' ? 0 : s.camY

  // Screen-shake offset on collision.
  let shakeX = 0
  let shakeY = 0
  if (s.shakeUntilMs > now) {
    const t = (s.shakeUntilMs - now) / 220
    const amp = 4 * t
    shakeX = (Math.random() - 0.5) * 2 * amp
    shakeY = (Math.random() - 0.5) * 2 * amp
  }

  ctx.save()
  ctx.translate(shakeX, shakeY)

  // Background.
  if (config.mode === 'autoRunner') {
    drawBiomeBackground(ctx, config.biome, camX, H, now)
  } else {
    drawPlatformerBackdrop(ctx, config, camX, camY)
  }

  // Apply camera transform for everything in world space (excluding bg).
  ctx.save()
  ctx.translate(-camX, -camY)

  // Decorations.
  for (const d of config.decorations ?? []) {
    drawDecoration(ctx, d, camX, now)
  }

  // Platforms (platformer only).
  if (config.platforms) {
    for (const p of config.platforms) drawPlatform(ctx, p)
  }

  // Obstacles. For projectiles, we draw both the `windup` (telegraph) and
  // `fire` (active) phases — only `fire` is collidable, but the player needs
  // to *see* the windup to read the timing.
  const runMs = now - s.startedAtMs
  for (const o of config.obstacles) {
    if (!projectileVisible(o, runMs)) continue
    const ph = projectilePhase(o, runMs)
    drawArt(o.art, {
      ctx,
      x: o.x,
      y: o.y,
      w: o.w,
      h: o.h,
      time: now,
      phase: ph.phase,
      phaseElapsedMs: ph.elapsedMs,
      phaseTotalMs: ph.phaseMsTotal,
    })
  }

  // Boss zone.
  drawArt(config.bossArt, {
    ctx,
    x: config.bossZone.x,
    y: config.bossZone.y,
    w: config.bossZone.w,
    h: config.bossZone.h,
    time: now,
  })

  // Avatar.
  const ar = avatarRect(s, config.mode)
  // Bob: 1 px shift every other tick when on-ground & running.
  const bob = s.onGround && Math.floor(now / 120) % 2 === 0 ? 1 : 0
  drawChibi(ctx, ar.x, ar.y + bob, s.facing, !s.onGround)
  // Tiny shadow on ground.
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  if (config.mode === 'autoRunner') {
    ctx.fillRect(ar.x + 1, GROUND_Y - 1, AVATAR_W - 2, 1)
  } else {
    // Find nearest platform/floor below the avatar for shadow.
    const worldH = config.height ?? 720
    let shadowY = worldH
    for (const p of config.platforms ?? []) {
      const aLeft = ar.x
      const aRight = ar.x + ar.w
      if (aRight <= p.x || aLeft >= p.x + p.w) continue
      if (p.y >= s.avatarY && p.y < shadowY) shadowY = p.y
    }
    ctx.fillRect(ar.x + 1, shadowY - 1, AVATAR_W - 2, 1)
  }

  ctx.restore() // camera

  // Paparazzi screen-flash overlay (LA biome only). When any visible
  // flashbulb is in its `fire` phase, briefly tint the whole canvas white
  // — pixel-art "they got the shot" reaction. `prefers-reduced-motion`
  // dampens the peak alpha so the flash is a soft pulse instead of a
  // full whiteout.
  if (config.biome === 'los-angeles') {
    const reduceMotion = prefersReducedMotion()
    let flashAlpha = 0
    for (const o of config.obstacles) {
      if (o.kind !== 'projectile' || o.art !== 'flashbulb') continue
      const ph = projectilePhase(o, runMs)
      if (ph.phase !== 'fire') continue
      const onScreen = o.x + o.w >= camX - 20 && o.x <= camX + W + 20
      if (!onScreen) continue
      const t = Math.max(
        0,
        Math.min(1, ph.elapsedMs / Math.max(40, ph.phaseMsTotal))
      )
      const peak = reduceMotion ? 0.18 : 0.55
      flashAlpha = Math.max(flashAlpha, peak * (1 - t))
    }
    if (flashAlpha > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha.toFixed(3)})`
      ctx.fillRect(0, 0, W, H)
    }
  }

  // Fail flash overlay.
  if (flashFail && s.failedAtMs > 0) {
    const elapsed = now - s.failedAtMs
    const a = Math.max(0, 0.5 - elapsed / FAIL_PAUSE_MS)
    ctx.fillStyle = `rgba(214, 59, 44, ${a})`
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#fff'
    ctx.font = '14px "Press Start 2P", monospace'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillText('OUCH — RETRY', W / 2, H / 2)
    ctx.textAlign = 'left'
  }

  ctx.restore() // shake
}

function drawDecoration(
  ctx: DrawCtx,
  d: Decoration,
  camX: number,
  now: number
) {
  // Apply parallax: shift decoration by (1 - parallax) * camX so a parallax
  // value of 1 scrolls naturally with the camera, 0.5 scrolls half-speed.
  const par = d.parallax ?? 1
  const dx = d.x + (1 - par) * camX
  drawArt(d.art, { ctx, x: dx, y: d.y, w: 16, h: 22, time: now })
}
