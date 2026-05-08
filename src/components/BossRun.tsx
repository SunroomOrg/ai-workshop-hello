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

    /* ─── World 4 (LA) ─── */
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
    case 'flashbulb': {
      const pulse = Math.floor(time / 60) % 2 === 0
      ctx.fillStyle = pulse ? '#fff7c2' : '#fff'
      ctx.fillRect(x + 4, y + 4, w - 8, h - 8)
      ctx.fillStyle = pulse ? '#fff' : '#fff7c2'
      ctx.fillRect(x, y + h / 2 - 2, w, 4)
      ctx.fillRect(x + w / 2 - 2, y, 4, h)
      break
    }
    case 'walkOfFameStar': {
      pixelBox(ctx, x, y, w, h, '#3a2410', '#1d1d1d')
      ctx.fillStyle = '#ffd24a'
      // Five-pointed star (rough)
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

/* ───────────────────── Biome backgrounds ───────────────────── */

function drawBiomeBackground(
  ctx: DrawCtx,
  biome: Biome,
  scrollX: number,
  height: number
) {
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

function projectileActive(o: Obstacle, runMs: number): boolean {
  if (o.kind !== 'projectile') return true
  const phase = o.phaseMs ?? 0
  const period = o.periodMs ?? 1000
  const tMs = (runMs + phase) % period
  return tMs <= (o.activeMs ?? Math.floor(period * 0.5))
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
    drawBiomeBackground(ctx, config.biome, camX, H)
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

  // Obstacles.
  const runMs = now - s.startedAtMs
  for (const o of config.obstacles) {
    if (o.kind === 'projectile' && !projectileActive(o, runMs)) continue
    drawArt(o.art, { ctx, x: o.x, y: o.y, w: o.w, h: o.h, time: now })
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
