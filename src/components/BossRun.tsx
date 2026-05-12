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

    /* ─── World 2 (Texas) ─── */
    case 'metalDetectorTop': {
      // Top bar (the actual hazard)
      pixelBox(ctx, x, y, w, h, '#9aa3ad', '#5a6068')
      // Decorative legs (visual only — collision is on the top bar)
      ctx.fillStyle = '#9aa3ad'
      ctx.fillRect(x + 2, y + h, 4, GROUND_Y - (y + h))
      ctx.fillRect(x + w - 6, y + h, 4, GROUND_Y - (y + h))
      ctx.fillStyle = '#ffd24a'
      ctx.fillRect(x + w / 2 - 1, y + 4, 2, 4) // beep light
      drawText(ctx, 'TSA-ish', x - 4, y - 10, 6, '#1d1d1d')
      break
    }
    case 'eslBubble': {
      pixelBox(ctx, x, y, w, h, '#fdf6dd', '#7a6a3a')
      drawText(ctx, 'ESL', x + 3, y + 4, 7, '#8a2a2a')
      ctx.fillStyle = '#fdf6dd'
      ctx.fillRect(x + 4, y + h, 2, 3)
      break
    }
    case 'longhorn': {
      // Body
      pixelBox(ctx, x + 4, y + 8, w - 8, h - 8, '#a8651e', '#5a3614')
      // Head
      ctx.fillStyle = '#a8651e'
      ctx.fillRect(x, y + 12, 8, 10)
      // Horns
      ctx.fillStyle = '#fdf6dd'
      ctx.fillRect(x - 4, y + 10, 12, 2)
      ctx.fillRect(x - 6, y + 8, 4, 2)
      ctx.fillRect(x + 6, y + 8, 4, 2)
      // Legs
      ctx.fillStyle = '#5a3614'
      ctx.fillRect(x + 6, y + h - 4, 2, 4)
      ctx.fillRect(x + w - 8, y + h - 4, 2, 4)
      break
    }
    case 'longhornCharge': {
      // Charging longhorn — same shape but with motion lines + facing left.
      ctx.save()
      ctx.translate(x + w, y)
      ctx.scale(-1, 1)
      const lx = 0
      const ly = 0
      pixelBox(ctx, lx + 4, ly + 8, w - 8, h - 8, '#a8651e', '#5a3614')
      ctx.fillStyle = '#a8651e'
      ctx.fillRect(lx, ly + 12, 8, 10)
      ctx.fillStyle = '#fdf6dd'
      ctx.fillRect(lx - 4, ly + 10, 12, 2)
      ctx.fillRect(lx - 6, ly + 8, 4, 2)
      ctx.fillRect(lx + 6, ly + 8, 4, 2)
      ctx.fillStyle = '#5a3614'
      ctx.fillRect(lx + 6, ly + h - 4, 2, 4)
      ctx.fillRect(lx + w - 8, ly + h - 4, 2, 4)
      ctx.restore()
      // Motion lines behind the charging head
      ctx.fillStyle = '#fff8'
      const off = Math.floor(time / 60) % 4
      ctx.fillRect(x + w + 2 + off, y + 14, 6, 1)
      ctx.fillRect(x + w + 4 + off, y + 18, 4, 1)
      break
    }
    case 'reportCard': {
      pixelBox(ctx, x, y, w, h, '#fdf6dd', '#7a6a3a')
      drawText(ctx, 'REPORT', x + 4, y + 6, 7, '#1d1d1d')
      drawText(ctx, 'CARD', x + 8, y + 16, 7, '#1d1d1d')
      // Big stamp
      ctx.fillStyle = '#d63b2c'
      ctx.fillRect(x + w / 2 - 10, y + 28, 20, 16)
      drawText(ctx, 'B-', x + w / 2 - 6, y + 32, 10, '#fff')
      break
    }
    case 'cactus': {
      ctx.fillStyle = '#3aa84a'
      ctx.fillRect(x + 8, y, 4, 22)
      ctx.fillRect(x + 4, y + 8, 4, 6)
      ctx.fillRect(x + 12, y + 4, 4, 8)
      ctx.fillStyle = '#2c7d34'
      ctx.fillRect(x + 8, y, 1, 22)
      break
    }

    /* ─── World 3 (UT) ─── */
    case 'alarmClock': {
      pixelBox(ctx, x, y, w, h, '#bf5700', '#5a2200')
      ctx.fillStyle = '#fdf6dd'
      ctx.fillRect(x + 3, y + 3, w - 6, h - 6)
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + w / 2, y + h / 2, 1, 4) // hand
      ctx.fillRect(x + w / 2, y + h / 2, 4, 1) // hand
      ctx.fillStyle = '#bf5700'
      ctx.fillRect(x + 1, y - 2, 4, 3)
      ctx.fillRect(x + w - 5, y - 2, 4, 3)
      break
    }
    case 'libraryBook': {
      pixelBox(ctx, x, y, w, h, '#bf5700', '#5a2200')
      ctx.fillStyle = '#fdf6dd'
      ctx.fillRect(x + 1, y + 4, w - 2, 1)
      ctx.fillRect(x + 1, y + 9, w - 2, 1)
      ctx.fillRect(x + 1, y + 14, w - 2, 1)
      break
    }
    case 'utTowerBell': {
      pixelBox(ctx, x + 4, y, w - 8, 70, '#fdf6dd', '#7a6a3a')
      ctx.fillStyle = '#bf5700'
      ctx.fillRect(x + 4, y, w - 8, 4)
      drawText(ctx, 'UT', x + w / 2 - 8, y + 14, 10, '#bf5700')
      // Clock face
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + w / 2 - 6, y + 30, 12, 12)
      ctx.fillStyle = '#fdf6dd'
      ctx.fillRect(x + w / 2 - 4, y + 32, 8, 8)
      // Bell on top
      ctx.fillStyle = '#a87f1e'
      ctx.fillRect(x + w / 2 - 6, y + 70, 12, 8)
      ctx.fillRect(x + w / 2 - 8, y + 78, 16, 4)
      drawText(ctx, 'TOWER', x + 4, y + h + 4, 7, '#fff')
      break
    }
    case 'sidewalkCrack': {
      ctx.fillStyle = '#3a2410'
      ctx.fillRect(x, y, 12, 1)
      ctx.fillRect(x + 4, y - 2, 4, 4)
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

    /* ─── World 6 (Houston) ─── */
    case 'rocketExhaust': {
      // Animated upward fire — only drawn while active. Color flicker.
      const flicker = Math.floor(time / 50) % 3
      ctx.fillStyle = '#ffd24a'
      ctx.fillRect(x, y + h - 8, w, 8)
      ctx.fillStyle = '#ff7a2a'
      ctx.fillRect(x + 2, y + h - 24, w - 4, 16)
      ctx.fillStyle = flicker === 0 ? '#fff7c2' : '#ffd24a'
      ctx.fillRect(x + 6, y + h - 50, w - 12, 26)
      ctx.fillStyle = '#fff'
      ctx.fillRect(x + 8, y + 4, w - 16, h - 60)
      // Faint puffs at top
      ctx.fillStyle = '#ddd'
      ctx.fillRect(x + 4, y, 6, 4)
      ctx.fillRect(x + w - 10, y - 2, 6, 4)
      break
    }
    case 'humidity': {
      const off = Math.floor(time / 80) % 3
      ctx.fillStyle = '#bdf'
      ctx.fillRect(x, y + 6, w, h - 6)
      ctx.fillStyle = '#fff'
      ctx.fillRect(x + 2, y + 4 - off, 6, 4)
      ctx.fillRect(x + w - 8, y + 2 - off, 6, 4)
      break
    }
    case 'monitor': {
      pixelBox(ctx, x, y, 28, 24, '#1d1d1d', '#000')
      ctx.fillStyle = '#3aa84a'
      ctx.fillRect(x + 2, y + 2, 24, 20)
      ctx.fillStyle = '#1d1d1d'
      ctx.fillRect(x + 4, y + 6, 8, 2)
      ctx.fillRect(x + 4, y + 10, 14, 2)
      ctx.fillRect(x + 4, y + 14, 10, 2)
      break
    }
    case 'launchButton': {
      pixelBox(ctx, x, y, w, h, '#1d1d1d', '#000')
      pixelBox(ctx, x + 4, y + 4, w - 8, h - 8, '#d63b2c', '#7a1a14')
      drawText(ctx, 'LAUNCH', x + 4, y + h / 2 - 4, 8, '#fff')
      break
    }

    /* ─── World 7 (Austin home) ─── */
    case 'armadillo': {
      ctx.fillStyle = '#a87f1e'
      ctx.fillRect(x + 2, y + 4, w - 4, h - 4)
      ctx.fillStyle = '#7a5a14'
      // Banded shell stripes
      ctx.fillRect(x + 4, y + 6, w - 8, 1)
      ctx.fillRect(x + 4, y + 10, w - 8, 1)
      // Head
      ctx.fillStyle = '#a87f1e'
      ctx.fillRect(x + w - 4, y + 8, 4, 6)
      // Tail
      ctx.fillRect(x, y + 10, 2, 4)
      // Legs
      ctx.fillStyle = '#5a3614'
      ctx.fillRect(x + 4, y + h - 2, 2, 2)
      ctx.fillRect(x + w - 6, y + h - 2, 2, 2)
      break
    }
    case 'parkingSign': {
      ctx.fillStyle = '#9aa3ad'
      ctx.fillRect(x + 2, y, 2, 20)
      pixelBox(ctx, x - 4, y - 16, 14, 12, '#3a78c4', '#1a3a6a')
      drawText(ctx, 'P', x, y - 14, 9, '#fff')
      break
    }
    case 'parkingSignTall': {
      ctx.fillStyle = '#9aa3ad'
      ctx.fillRect(x + w / 2 - 1, y, 2, h)
      pixelBox(ctx, x - 6, y - 4, 20, 14, '#3a78c4', '#1a3a6a')
      drawText(ctx, 'P', x - 1, y - 2, 10, '#fff')
      break
    }
    case 'pigeon': {
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
    case 'flagPole': {
      ctx.fillStyle = '#9aa3ad'
      ctx.fillRect(x + w / 2, y, 2, h)
      // Flag
      ctx.fillStyle = '#bf5700'
      ctx.fillRect(x + w / 2 + 2, y + 2, 14, 8)
      ctx.fillStyle = '#fdf6dd'
      drawText(ctx, '★', x + w / 2 + 5, y + 2, 8, '#fff')
      drawText(ctx, 'CUPOLA', x - 6, y + h + 4, 7, '#fff')
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
      pixelBox(ctx, p.x, p.y, p.w, p.h, '#3aa84a', '#2c7d34')
      ctx.fillStyle = '#7ed957'
      ctx.fillRect(p.x, p.y, p.w, 2)
      break
    case 'capitolStep':
      pixelBox(ctx, p.x, p.y, p.w, p.h, '#fdf6dd', '#7a6a3a')
      ctx.fillStyle = '#bf5700'
      ctx.fillRect(p.x, p.y, p.w, 1)
      break
    case 'capitolPlat':
      pixelBox(ctx, p.x, p.y, p.w, p.h, '#fdf6dd', '#7a6a3a')
      break
    case 'dome':
      pixelBox(ctx, p.x, p.y, p.w, p.h, '#bf5700', '#7a3814')
      ctx.fillStyle = '#fdf6dd'
      ctx.fillRect(p.x, p.y, p.w, 2)
      // Dome curve hint
      ctx.fillStyle = '#a83814'
      ctx.fillRect(p.x + 4, p.y + 4, p.w - 8, 1)
      break
    case 'cupola':
      pixelBox(ctx, p.x, p.y, p.w, p.h, '#fdf6dd', '#7a6a3a')
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
  // Sky gradient base.
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
  if (biome === 'houston') {
    // Stars in dark sky
    ctx.fillStyle = '#fff'
    for (let i = 0; i < 18; i++) {
      const sx = (i * 47 + 13) % W
      const sy = (i * 23 + 7) % 80
      ctx.fillRect(sx, sy, 1, 1)
    }
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

/** Static, full-world platformer backdrop (Austin home). */
function drawPlatformerBackdrop(
  ctx: DrawCtx,
  config: RunConfig,
  camX: number,
  camY: number
) {
  const worldH = config.height ?? 720
  // Sky gradient covers full visible area.
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, '#a8e0ff')
  grad.addColorStop(1, '#fff7c2')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // Distant hills at ~y=620 in world space.
  ctx.fillStyle = '#3aa84a'
  ctx.globalAlpha = 0.6
  for (let i = 0; i < 4; i++) {
    const hx = i * 220 - camX * 0.3
    ctx.beginPath()
    ctx.moveTo(hx, 620 - camY)
    ctx.lineTo(hx + 80, 580 - camY)
    ctx.lineTo(hx + 160, 600 - camY)
    ctx.lineTo(hx + 220, 580 - camY)
    ctx.lineTo(hx + 220, 720 - camY)
    ctx.lineTo(hx, 720 - camY)
    ctx.closePath()
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // World floor (austin streets)
  ctx.fillStyle = '#7ed957'
  ctx.fillRect(0, 680 - camY, W, worldH - 680)
  ctx.fillStyle = '#3aa84a'
  ctx.fillRect(0, 680 - camY, W, 2)
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
