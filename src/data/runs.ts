import type { RunConfig } from './types'

/**
 * Per-world boss-run configurations. Consumed by `<BossRun>` to spin up a
 * tiny canvas auto-runner (worlds 1–6) or controllable platformer (world 7).
 *
 * Pacing budget — autoRunner:
 *   - speed         : 140 px/s
 *   - length        : ≤ 3500 px so a clean run lands at ≈25s (cap ≤30s)
 *   - obstacles     : 10–14 per run, every ~2s on average
 *   - difficulty    : ramped — first ⅓ static, middle ⅓ mixes timing hazards,
 *                     final ⅓ denser before boss zone
 *   - obstacle kinds: at minimum one moving / projectile per world for rhythm
 *
 * Coordinate system (autoRunner):
 *   - canvas 640 × 240 logical px
 *   - ground y = 200; sky above, dirt strip below
 *   - obstacle (x, y) = top-left corner in **world** space; world scrolls left
 *
 * Coordinate system (platformer, world 7):
 *   - world is `length × height` logical px
 *   - y grows downward; the climb goes toward smaller y values
 *
 * Voice: deadpan / RPG-narrator, matching `levels.ts`.
 */

const GROUND_Y = 200

/** Standard auto-runner knobs reused by worlds 1–6. */
const AUTO = {
  length: 3500,
  speed: 140,
}

/** Helper: sit a sprite on the ground line. */
const onGround = (h: number) => GROUND_Y - h

/* ───────────────────────── WORLD 1: VIETNAM ───────────────────────── */
/** ~25s clean run. 13 hazards. Static palm trunks + frosting + cake +
 *  timing-based tear-droplets that pulse on/off. */
const VIETNAM_1985: RunConfig = {
  levelId: 'vietnam-1985',
  mode: 'autoRunner',
  length: AUTO.length,
  speed: AUTO.speed,
  biome: 'vietnam',
  bossZone: { x: AUTO.length - 80, y: GROUND_Y - 56, w: 56, h: 56 },
  bossArt: 'tearBoss',
  bossLabel: '12-HR CRY',
  preRunFlavor:
    'Boss: outlast the 12-hour cry. Hazards: cake, tears, your own emotional weather.',
  bossPreview: 'A giant tear-drop labelled “12-HR CRY”. Touch to absorb-reverse it.',
  postWinFlavor: 'Survived round one. Save data: vibes only.',
  decorations: [
    { x: 220,  y: GROUND_Y - 70, art: 'palmFrond', parallax: 0.6 },
    { x: 720,  y: GROUND_Y - 80, art: 'palmFrond', parallax: 0.6 },
    { x: 1380, y: GROUND_Y - 70, art: 'palmFrond', parallax: 0.6 },
    { x: 2080, y: GROUND_Y - 80, art: 'palmFrond', parallax: 0.6 },
    { x: 2680, y: GROUND_Y - 70, art: 'palmFrond', parallax: 0.6 },
  ],
  // Difficulty ramp: 360..1100 = intro, 1200..2200 = mix, 2300..3300 = dense.
  obstacles: [
    // ── Intro third (~5s in)
    { x: 360,  y: onGround(48), w: 12, h: 48, art: 'palmTrunk', kind: 'jump' },
    { x: 640,  y: onGround(8),  w: 28, h: 8,  art: 'frosting',  kind: 'jump' },
    { x: 920,  y: onGround(20), w: 18, h: 20, art: 'cakeSlice', kind: 'jump' },
    // ── Middle third — introduce timing tear-rain
    { x: 1200, y: onGround(48), w: 12, h: 48, art: 'palmTrunk', kind: 'jump' },
    {
      x: 1380, y: 70, w: 10, h: 16, art: 'tearDrop',
      kind: 'projectile', periodMs: 1100, activeMs: 600, phaseMs: 0,
    },
    { x: 1560, y: onGround(8),  w: 36, h: 8,  art: 'frosting',  kind: 'jump' },
    { x: 1780, y: onGround(20), w: 18, h: 20, art: 'cakeSlice', kind: 'jump' },
    {
      x: 1960, y: 60, w: 10, h: 16, art: 'tearDrop',
      kind: 'projectile', periodMs: 1100, activeMs: 600, phaseMs: 500,
    },
    // ── Final third — dense run-up to boss
    { x: 2160, y: onGround(48), w: 12, h: 48, art: 'palmTrunk', kind: 'jump' },
    { x: 2360, y: onGround(8),  w: 36, h: 8,  art: 'frosting',  kind: 'jump' },
    { x: 2540, y: onGround(20), w: 18, h: 20, art: 'cakeSlice', kind: 'jump' },
    {
      x: 2720, y: 80, w: 10, h: 16, art: 'tearDrop',
      kind: 'projectile', periodMs: 950, activeMs: 600, phaseMs: 0,
    },
    { x: 2900, y: onGround(48), w: 12, h: 48, art: 'palmTrunk', kind: 'jump' },
    { x: 3120, y: onGround(20), w: 18, h: 20, art: 'cakeSlice', kind: 'jump' },
  ],
}

/* ───────────────────────── WORLD 2: TEXAS ─────────────────────────── */
/** ~25s clean run. 13 hazards. Metal-detector arches + ESL bubbles +
 *  a longhorn that periodically charges (projectile). */
const TEXAS_1992: RunConfig = {
  levelId: 'texas-1992',
  mode: 'autoRunner',
  length: AUTO.length,
  speed: AUTO.speed,
  biome: 'texas',
  bossZone: { x: AUTO.length - 80, y: GROUND_Y - 64, w: 56, h: 64 },
  bossArt: 'reportCard',
  bossLabel: 'B-',
  preRunFlavor: 'Daily checkpoint: walk-through metal detector. Don’t beep.',
  bossPreview: 'Final boss: a giant report card stamped “B-”. Touch to clear.',
  postWinFlavor: 'B-, but the run is completed.',
  decorations: [
    { x: 200,  y: GROUND_Y - 22, art: 'cactus', parallax: 0.8 },
    { x: 950,  y: GROUND_Y - 22, art: 'cactus', parallax: 0.8 },
    { x: 1700, y: GROUND_Y - 22, art: 'cactus', parallax: 0.8 },
    { x: 2400, y: GROUND_Y - 22, art: 'cactus', parallax: 0.8 },
  ],
  obstacles: [
    // ── Intro
    { x: 360,  y: onGround(18), w: 22, h: 18, art: 'eslBubble',        kind: 'jump' },
    { x: 600,  y: GROUND_Y - 72, w: 40, h: 12, art: 'metalDetectorTop', kind: 'jump' },
    { x: 880,  y: onGround(28), w: 36, h: 28, art: 'longhorn',         kind: 'jump' },
    // ── Mix
    { x: 1140, y: onGround(18), w: 22, h: 18, art: 'eslBubble',        kind: 'jump' },
    { x: 1380, y: GROUND_Y - 72, w: 40, h: 12, art: 'metalDetectorTop', kind: 'jump' },
    {
      x: 1620, y: onGround(28), w: 40, h: 28, art: 'longhornCharge',
      kind: 'projectile', periodMs: 1400, activeMs: 800, phaseMs: 0,
    },
    { x: 1860, y: onGround(18), w: 22, h: 18, art: 'eslBubble',        kind: 'jump' },
    { x: 2080, y: GROUND_Y - 72, w: 40, h: 12, art: 'metalDetectorTop', kind: 'jump' },
    // ── Dense
    {
      x: 2320, y: onGround(28), w: 40, h: 28, art: 'longhornCharge',
      kind: 'projectile', periodMs: 1300, activeMs: 800, phaseMs: 600,
    },
    { x: 2540, y: onGround(28), w: 36, h: 28, art: 'longhorn',         kind: 'jump' },
    { x: 2740, y: GROUND_Y - 72, w: 40, h: 12, art: 'metalDetectorTop', kind: 'jump' },
    { x: 2940, y: onGround(18), w: 22, h: 18, art: 'eslBubble',        kind: 'jump' },
    { x: 3120, y: onGround(28), w: 36, h: 28, art: 'longhorn',         kind: 'jump' },
  ],
}

/* ─────────────────────── WORLD 3: AUSTIN UT ───────────────────────── */
/** ~25s clean run. 13 hazards. Alarm clocks + library books + a "rolling
 *  alarm" (projectile that pops up briefly to time the jump). */
const AUSTIN_UT: RunConfig = {
  levelId: 'austin-ut-2005',
  mode: 'autoRunner',
  length: AUTO.length,
  speed: AUTO.speed,
  biome: 'austin-ut',
  bossZone: { x: AUTO.length - 80, y: GROUND_Y - 90, w: 60, h: 90 },
  bossArt: 'utTowerBell',
  bossLabel: 'TOWER',
  preRunFlavor:
    'Best years arc: don’t drop the books, don’t oversleep, don’t miss the bus.',
  bossPreview: 'Final boss: the UT Tower bell. Touch to ring.',
  postWinFlavor: 'Stat: degree obtained. Save updated.',
  decorations: [
    { x: 250,  y: GROUND_Y - 10, art: 'sidewalkCrack', parallax: 1 },
    { x: 1500, y: GROUND_Y - 10, art: 'sidewalkCrack', parallax: 1 },
  ],
  obstacles: [
    // ── Intro
    { x: 360,  y: onGround(14), w: 20, h: 14, art: 'alarmClock',  kind: 'jump' },
    { x: 600,  y: onGround(18), w: 22, h: 18, art: 'libraryBook', kind: 'jump' },
    { x: 840,  y: onGround(14), w: 20, h: 14, art: 'alarmClock',  kind: 'jump' },
    // ── Mix
    { x: 1080, y: onGround(18), w: 22, h: 18, art: 'libraryBook', kind: 'jump' },
    {
      x: 1300, y: onGround(20), w: 22, h: 20, art: 'alarmClock',
      kind: 'projectile', periodMs: 1200, activeMs: 700, phaseMs: 0,
    },
    { x: 1540, y: onGround(14), w: 20, h: 14, art: 'alarmClock',  kind: 'jump' },
    { x: 1760, y: onGround(18), w: 22, h: 18, art: 'libraryBook', kind: 'jump' },
    {
      x: 1980, y: onGround(20), w: 22, h: 20, art: 'alarmClock',
      kind: 'projectile', periodMs: 1100, activeMs: 600, phaseMs: 400,
    },
    // ── Dense
    { x: 2200, y: onGround(14), w: 20, h: 14, art: 'alarmClock',  kind: 'jump' },
    { x: 2400, y: onGround(18), w: 22, h: 18, art: 'libraryBook', kind: 'jump' },
    { x: 2600, y: onGround(14), w: 20, h: 14, art: 'alarmClock',  kind: 'jump' },
    { x: 2800, y: onGround(18), w: 22, h: 18, art: 'libraryBook', kind: 'jump' },
    { x: 3040, y: onGround(14), w: 20, h: 14, art: 'alarmClock',  kind: 'jump' },
  ],
}

/* ─────────────────────── WORLD 4: LOS ANGELES ─────────────────────── */
/** ~25s clean run. 13 hazards. Cones + Hollywood O letters + pulsing
 *  paparazzi flashbulbs (projectile) — busiest of the early worlds. */
const LA_2008: RunConfig = {
  levelId: 'la-2008',
  mode: 'autoRunner',
  length: AUTO.length,
  speed: AUTO.speed,
  biome: 'los-angeles',
  bossZone: { x: AUTO.length - 80, y: GROUND_Y - 40, w: 60, h: 40 },
  bossArt: 'walkOfFameStar',
  bossLabel: 'STAR',
  preRunFlavor: 'Stuck zone. Obstacles compound. There’s an exit somewhere.',
  bossPreview: 'Final boss: a star on the Walk of Fame. Touch to clear.',
  postWinFlavor: 'Exit found: → Korea.',
  decorations: [
    { x: 220,  y: GROUND_Y - 70, art: 'palmFrond', parallax: 0.6 },
    { x: 980,  y: GROUND_Y - 80, art: 'palmFrond', parallax: 0.6 },
    { x: 1820, y: GROUND_Y - 70, art: 'palmFrond', parallax: 0.6 },
    { x: 2560, y: GROUND_Y - 80, art: 'palmFrond', parallax: 0.6 },
  ],
  obstacles: [
    // ── Intro
    { x: 360,  y: onGround(20), w: 16, h: 20, art: 'trafficCone', kind: 'jump' },
    { x: 600,  y: onGround(22), w: 22, h: 22, art: 'hollywoodO',  kind: 'jump' },
    { x: 840,  y: onGround(20), w: 16, h: 20, art: 'trafficCone', kind: 'jump' },
    // ── Mix
    {
      x: 1080, y: onGround(40), w: 22, h: 22, art: 'flashbulb',
      kind: 'projectile', periodMs: 950, activeMs: 450, phaseMs: 0,
    },
    { x: 1300, y: onGround(22), w: 22, h: 22, art: 'hollywoodO',  kind: 'jump' },
    { x: 1500, y: onGround(20), w: 16, h: 20, art: 'trafficCone', kind: 'jump' },
    {
      x: 1700, y: onGround(40), w: 22, h: 22, art: 'flashbulb',
      kind: 'projectile', periodMs: 950, activeMs: 450, phaseMs: 350,
    },
    { x: 1920, y: onGround(22), w: 22, h: 22, art: 'hollywoodO',  kind: 'jump' },
    // ── Dense
    { x: 2160, y: onGround(20), w: 16, h: 20, art: 'trafficCone', kind: 'jump' },
    {
      x: 2360, y: onGround(40), w: 22, h: 22, art: 'flashbulb',
      kind: 'projectile', periodMs: 850, activeMs: 450, phaseMs: 100,
    },
    { x: 2580, y: onGround(22), w: 22, h: 22, art: 'hollywoodO',  kind: 'jump' },
    { x: 2820, y: onGround(20), w: 16, h: 20, art: 'trafficCone', kind: 'jump' },
    { x: 3060, y: onGround(22), w: 22, h: 22, art: 'hollywoodO',  kind: 'jump' },
  ],
}

/* ───────────────────────── WORLD 5: SEOUL ─────────────────────────── */
/** ~25s clean run. 13 hazards. Soup bowls + stair steps + kimchi jars +
 *  rising/falling steam (projectile pulses up from the soup). */
const SEOUL_2010: RunConfig = {
  levelId: 'seoul-2010',
  mode: 'autoRunner',
  length: AUTO.length,
  speed: AUTO.speed,
  biome: 'seoul',
  bossZone: { x: AUTO.length - 80, y: GROUND_Y - 90, w: 60, h: 90 },
  bossArt: 'nSeoulTower',
  bossLabel: 'NAMSAN',
  preRunFlavor: 'Way too fun. Try not to over-rotate.',
  bossPreview: 'Final boss: N Seoul Tower. Touch the antenna to clear.',
  postWinFlavor: 'Save & exit. Snacks +50.',
  decorations: [
    { x: 350,  y: GROUND_Y - 28, art: 'lantern', parallax: 0.8 },
    { x: 1200, y: GROUND_Y - 28, art: 'lantern', parallax: 0.8 },
    { x: 2100, y: GROUND_Y - 28, art: 'lantern', parallax: 0.8 },
  ],
  obstacles: [
    // ── Intro
    { x: 360,  y: onGround(20), w: 22, h: 20, art: 'soupBowl',  kind: 'jump' },
    { x: 600,  y: onGround(16), w: 28, h: 16, art: 'stairStep', kind: 'jump' },
    { x: 840,  y: onGround(28), w: 28, h: 28, art: 'stairStep', kind: 'jump' },
    // ── Mix
    {
      x: 1080, y: onGround(46), w: 14, h: 22, art: 'steamPuff',
      kind: 'projectile', periodMs: 1100, activeMs: 550, phaseMs: 0,
    },
    { x: 1300, y: onGround(20), w: 22, h: 20, art: 'kimchiJar', kind: 'jump' },
    { x: 1520, y: onGround(20), w: 22, h: 20, art: 'soupBowl',  kind: 'jump' },
    {
      x: 1740, y: onGround(46), w: 14, h: 22, art: 'steamPuff',
      kind: 'projectile', periodMs: 1100, activeMs: 550, phaseMs: 400,
    },
    { x: 1960, y: onGround(28), w: 28, h: 28, art: 'stairStep', kind: 'jump' },
    // ── Dense
    { x: 2200, y: onGround(20), w: 22, h: 20, art: 'kimchiJar', kind: 'jump' },
    { x: 2400, y: onGround(20), w: 22, h: 20, art: 'soupBowl',  kind: 'jump' },
    { x: 2620, y: onGround(28), w: 28, h: 28, art: 'stairStep', kind: 'jump' },
    {
      x: 2840, y: onGround(46), w: 14, h: 22, art: 'steamPuff',
      kind: 'projectile', periodMs: 950, activeMs: 550, phaseMs: 200,
    },
    { x: 3080, y: onGround(20), w: 22, h: 20, art: 'kimchiJar', kind: 'jump' },
  ],
}

/* ───────────────────────── WORLD 6: HOUSTON ───────────────────────── */
/** ~25s clean run. 14 hazards. Rocket-exhaust (projectile, original) +
 *  humidity puffs + monitors. Dense, timing-heavy ending. */
const HOUSTON_2011: RunConfig = {
  levelId: 'houston-2011',
  mode: 'autoRunner',
  length: AUTO.length,
  speed: AUTO.speed,
  biome: 'houston',
  bossZone: { x: AUTO.length - 80, y: GROUND_Y - 60, w: 60, h: 60 },
  bossArt: 'launchButton',
  bossLabel: 'LAUNCH',
  preRunFlavor:
    'Texas re-entry. Boss: humidity. The right mentor is somewhere on the next screen.',
  bossPreview: 'Final boss: the LAUNCH button. Touch to lift off.',
  postWinFlavor: 'Posting accepted. Most meaningful job to date.',
  decorations: [
    { x: 280,  y: GROUND_Y - 36, art: 'monitor', parallax: 0.9 },
    { x: 1180, y: GROUND_Y - 36, art: 'monitor', parallax: 0.9 },
    { x: 2080, y: GROUND_Y - 36, art: 'monitor', parallax: 0.9 },
  ],
  obstacles: [
    // ── Intro
    { x: 360,  y: onGround(20), w: 26, h: 20, art: 'humidity', kind: 'jump' },
    {
      x: 600,  y: onGround(80), w: 30, h: 80, art: 'rocketExhaust',
      kind: 'projectile', periodMs: 1500, activeMs: 700, phaseMs: 0,
    },
    { x: 820,  y: onGround(20), w: 26, h: 20, art: 'humidity', kind: 'jump' },
    // ── Mix
    {
      x: 1060, y: onGround(80), w: 30, h: 80, art: 'rocketExhaust',
      kind: 'projectile', periodMs: 1400, activeMs: 700, phaseMs: 600,
    },
    { x: 1300, y: onGround(20), w: 26, h: 20, art: 'humidity', kind: 'jump' },
    {
      x: 1520, y: onGround(80), w: 30, h: 80, art: 'rocketExhaust',
      kind: 'projectile', periodMs: 1450, activeMs: 700, phaseMs: 100,
    },
    { x: 1760, y: onGround(20), w: 26, h: 20, art: 'humidity', kind: 'jump' },
    {
      x: 1980, y: onGround(80), w: 30, h: 80, art: 'rocketExhaust',
      kind: 'projectile', periodMs: 1300, activeMs: 700, phaseMs: 700,
    },
    // ── Dense
    { x: 2220, y: onGround(20), w: 26, h: 20, art: 'humidity', kind: 'jump' },
    {
      x: 2420, y: onGround(80), w: 30, h: 80, art: 'rocketExhaust',
      kind: 'projectile', periodMs: 1200, activeMs: 700, phaseMs: 200,
    },
    { x: 2640, y: onGround(20), w: 26, h: 20, art: 'humidity', kind: 'jump' },
    {
      x: 2860, y: onGround(80), w: 30, h: 80, art: 'rocketExhaust',
      kind: 'projectile', periodMs: 1250, activeMs: 700, phaseMs: 300,
    },
    { x: 3080, y: onGround(20), w: 26, h: 20, art: 'humidity', kind: 'jump' },
    {
      x: 3260, y: onGround(80), w: 30, h: 80, art: 'rocketExhaust',
      kind: 'projectile', periodMs: 1300, activeMs: 700, phaseMs: 600,
    },
  ],
}

/* ─────────────── WORLD 7: AUSTIN HOME (PLATFORMER) ─────────────── */
/**
 * Vertical climb. World 800 × 720. ~30–40s. 16 placed obstacles.
 * Avatar spawns bottom-left; reaches the cupola at top-right.
 *
 * Layout (y values get smaller as you climb):
 *   y=680..720: ground (Austin streets) — implicit floor
 *   y=600     : hill platforms 1
 *   y=540..480: hill platforms 2
 *   y=440..380: rising mid platforms
 *   y=340..300: Capitol staircase
 *   y=240..220: Capitol portico (3 columns separated by gaps)
 *   y=160..120: dome ledge
 *   y=60..30  : cupola — bossZone
 */
const AUSTIN_HOME: RunConfig = {
  levelId: 'austin-home-2014',
  mode: 'platformer',
  length: 800,
  height: 720,
  speed: 130,
  biome: 'austin-home',
  spawn: { x: 40, y: 680 },
  bossZone: { x: 600, y: 30, w: 60, h: 30 },
  bossArt: 'flagPole',
  bossLabel: 'PLANT FLAG',
  preRunFlavor: 'Final castle. Climb to the dome.',
  bossPreview: 'Final boss: the cupola. Touch the flagpole to plant the flag.',
  postWinFlavor: 'Flag planted. Forever endgame engaged.',
  decorations: [
    { x: 100, y: 660, art: 'parkingSign',   parallax: 1 },
    { x: 480, y: 660, art: 'parkingSign',   parallax: 1 },
    { x: 240, y: 220, art: 'capitolColumn', parallax: 1 },
    { x: 360, y: 220, art: 'capitolColumn', parallax: 1 },
    { x: 480, y: 220, art: 'capitolColumn', parallax: 1 },
    { x: 580, y: 220, art: 'capitolColumn', parallax: 1 },
  ],
  platforms: [
    // Hill platforms (low climb)
    { x: 120, y: 600, w: 100, h: 16, art: 'grass' },
    { x: 320, y: 540, w: 90,  h: 16, art: 'grass' },
    { x: 520, y: 600, w: 100, h: 16, art: 'grass' },
    // Mid-air step toward staircase
    { x: 220, y: 480, w: 80,  h: 14, art: 'grass' },
    { x: 420, y: 440, w: 80,  h: 14, art: 'grass' },
    // Capitol staircase
    { x: 540, y: 380, w: 80,  h: 14, art: 'capitolStep' },
    { x: 380, y: 340, w: 80,  h: 14, art: 'capitolStep' },
    { x: 220, y: 300, w: 80,  h: 14, art: 'capitolStep' },
    // Capitol portico — top of columns (with gaps to jump between)
    { x: 220, y: 240, w: 60,  h: 14, art: 'capitolPlat' },
    { x: 340, y: 240, w: 60,  h: 14, art: 'capitolPlat' },
    { x: 460, y: 240, w: 60,  h: 14, art: 'capitolPlat' },
    { x: 580, y: 240, w: 100, h: 14, art: 'capitolPlat' },
    // Dome ledge
    { x: 480, y: 160, w: 200, h: 16, art: 'dome' },
    // Cupola
    { x: 580, y: 60,  w: 100, h: 14, art: 'cupola' },
  ],
  obstacles: [
    // Ground-level: armadillos + parking signs (must jump or detour)
    { x: 200, y: 680 - 16, w: 22, h: 16, art: 'armadillo',       kind: 'jump' },
    { x: 380, y: 680 - 16, w: 22, h: 16, art: 'armadillo',       kind: 'jump' },
    { x: 560, y: 680 - 16, w: 22, h: 16, art: 'armadillo',       kind: 'jump' },
    { x: 730, y: 680 - 16, w: 22, h: 16, art: 'armadillo',       kind: 'jump' },
    // Tall parking-sign post on a mid-platform path (have to vault over)
    { x: 360, y: 504, w: 8, h: 26, art: 'parkingSignTall',       kind: 'jump' },
    { x: 280, y: 444, w: 8, h: 26, art: 'parkingSignTall',       kind: 'jump' },
    // Pigeons on stair platforms
    { x: 460, y: 376 - 12, w: 14, h: 12, art: 'pigeon',          kind: 'jump' },
    { x: 300, y: 336 - 12, w: 14, h: 12, art: 'pigeon',          kind: 'jump' },
    { x: 240, y: 296 - 12, w: 14, h: 12, art: 'pigeon',          kind: 'jump' },
    // Pigeons on portico tops
    { x: 240, y: 236 - 12, w: 14, h: 12, art: 'pigeon',          kind: 'jump' },
    { x: 360, y: 236 - 12, w: 14, h: 12, art: 'pigeon',          kind: 'jump' },
    { x: 480, y: 236 - 12, w: 14, h: 12, art: 'pigeon',          kind: 'jump' },
    // Dome pigeons (pre-cupola)
    { x: 540, y: 156 - 12, w: 14, h: 12, art: 'pigeon',          kind: 'jump' },
    { x: 600, y: 156 - 12, w: 14, h: 12, art: 'pigeon',          kind: 'jump' },
    { x: 660, y: 156 - 12, w: 14, h: 12, art: 'pigeon',          kind: 'jump' },
    // Cupola pigeon (one last hop guard)
    { x: 600, y: 56  - 12, w: 14, h: 12, art: 'pigeon',          kind: 'jump' },
  ],
}

/** Lookup keyed by `Level.id`. */
export const RUNS: Record<string, RunConfig> = {
  [VIETNAM_1985.levelId]: VIETNAM_1985,
  [TEXAS_1992.levelId]: TEXAS_1992,
  [AUSTIN_UT.levelId]: AUSTIN_UT,
  [LA_2008.levelId]: LA_2008,
  [SEOUL_2010.levelId]: SEOUL_2010,
  [HOUSTON_2011.levelId]: HOUSTON_2011,
  [AUSTIN_HOME.levelId]: AUSTIN_HOME,
}
