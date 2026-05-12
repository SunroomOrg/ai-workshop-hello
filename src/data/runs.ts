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
/**
 * 80s Saigon (1985–1992) re-skin. ~25s clean run, 14 hazards.
 *
 * Story-anchor hazards (KEEP — these are the joke of the world: toddler-
 * Lan crying through her own auntie's wedding):
 *   - 1 cake slice  + 1 frosting puddle  (auntie-wedding callback)
 *   - 3 tear-drop projectiles            (12-hour-cry boss energy)
 *
 * 80s Saigon street hazards (NEW — reskinning the generic palm-trunk run):
 *   - 2 cyclos (xích lô — bicycle rickshaws, photo 1 reference)
 *   - 1 vintage Honda Cub
 *   - 1 bicycle wheel on the ground
 *   - 2 nón lá (conical hat) stacks
 *   - 1 plastic vendor stool
 *   - 1 tropical-fruit cart (dragonfruit + mangosteen + rambutan)
 *   - 1 phở bowl
 *
 * Boss zone is reskinned as the Bến Thành Market clock tower (photo 2),
 * with mom waiting at the base in a yellow áo dài.
 */
const VIETNAM_1985: RunConfig = {
  levelId: 'vietnam-1985',
  mode: 'autoRunner',
  length: AUTO.length,
  speed: AUTO.speed,
  biome: 'vietnam',
  // Boss zone is wider/taller because the clock tower needs presence.
  // Collision still triggers as soon as the chibi reaches the base.
  bossZone: { x: AUTO.length - 96, y: GROUND_Y - 70, w: 70, h: 70 },
  bossArt: 'clockTowerBoss',
  bossLabel: 'BẾN THÀNH',
  preRunFlavor:
    'Boss: outlast the 12-hour cry. Hazards: cake, tears, your own emotional weather.',
  bossPreview:
    'Final landmark: the Bến Thành clock tower. Mom waits at the base — you just have to get there.',
  postWinFlavor: 'Survived round one. Save data: vibes only.',
  decorations: [
    // Mid-far palm fronds (parallax) — scattered along the run.
    { x: 220,  y: GROUND_Y - 70, art: 'palmFrond', parallax: 0.6 },
    { x: 720,  y: GROUND_Y - 80, art: 'palmFrond', parallax: 0.6 },
    { x: 1380, y: GROUND_Y - 70, art: 'palmFrond', parallax: 0.6 },
    { x: 2080, y: GROUND_Y - 80, art: 'palmFrond', parallax: 0.6 },
    { x: 2680, y: GROUND_Y - 70, art: 'palmFrond', parallax: 0.6 },
    // Áo dài-mom waiting at the base of the clock tower (boss-zone payoff).
    // Parallax 1 so she sits in the world; placed just left of the tower.
    {
      x: AUTO.length - 36,
      y: GROUND_Y - 24,
      art: 'aoDaiMom',
      parallax: 1,
    },
  ],
  // Difficulty ramp: 360..1100 = intro, 1180..2200 = mix, 2300..3300 = dense.
  // Cake + frosting + tears live in the late stretch where the "12-hour cry"
  // tension peaks (chapter 1-3.5 callback).
  obstacles: [
    // ── Intro third (~5s in) — easy reads, low jumps
    { x: 380,  y: onGround(14), w: 16, h: 14, art: 'bicycleWheel', kind: 'jump' },
    { x: 640,  y: onGround(10), w: 22, h: 10, art: 'phoBowl',      kind: 'jump' },
    { x: 920,  y: onGround(18), w: 22, h: 18, art: 'nonLaStack',   kind: 'jump' },
    // ── Middle third — taller obstacles + introduce timing tear-rain
    { x: 1180, y: onGround(30), w: 28, h: 30, art: 'cyclo',        kind: 'jump' },
    {
      x: 1380, y: 70, w: 10, h: 16, art: 'tearDrop',
      kind: 'projectile', periodMs: 1100, activeMs: 600, phaseMs: 0,
    },
    { x: 1560, y: onGround(12), w: 14, h: 12, art: 'vendorStool',  kind: 'jump' },
    { x: 1780, y: onGround(8),  w: 36, h: 8,  art: 'frosting',     kind: 'jump' },
    {
      x: 1960, y: 60, w: 10, h: 16, art: 'tearDrop',
      kind: 'projectile', periodMs: 1100, activeMs: 600, phaseMs: 500,
    },
    { x: 2160, y: onGround(18), w: 24, h: 18, art: 'hondaCub',     kind: 'jump' },
    // ── Final third — dense run-up + cake/tears story callback peak
    { x: 2360, y: onGround(18), w: 22, h: 18, art: 'nonLaStack',   kind: 'jump' },
    { x: 2540, y: onGround(20), w: 18, h: 20, art: 'cakeSlice',    kind: 'jump' },
    {
      x: 2720, y: 80, w: 10, h: 16, art: 'tearDrop',
      kind: 'projectile', periodMs: 950, activeMs: 600, phaseMs: 0,
    },
    { x: 2900, y: onGround(24), w: 28, h: 24, art: 'fruitCart',    kind: 'jump' },
    { x: 3120, y: onGround(30), w: 28, h: 30, art: 'cyclo',        kind: 'jump' },
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
/**
 * 2008–2009 LA / Hollywood reskin. ~25s clean run, ~13 hazards.
 *
 * Story-anchor framing (chapter 4 — "Glamour zone, exits unmarked,
 * Korea exit at the end"): glittery surface props the chibi must hop
 * over, with two timing hazards that telegraph then fire — paparazzi
 * flashbulbs and a klieg-light sweep — and a → KOREA jetway as the
 * boss zone (pays off the post-win "Exit found: → Korea." flavor).
 *
 * Static-jump props (low):
 *   - 1 red-carpet velvet rope stanchion
 *   - 2 director's chairs ("DIR" pixel letters)
 *   - 1 movie clapboard
 *   - 2 audition-headshot stacks
 *   - 1 dropped stiletto heel
 *
 * Tall-jump props:
 *   - 1 klieg-light tripod (cream housing, gold trim)
 *   - 1 parking meter with red EXPIRED flag
 *   - 1 star-on-pedestal (gold star on marble base)
 *
 * Timing hazards:
 *   - 3 paparazzi flashbulbs (250 ms windup → 160 ms fire,
 *     drives a brief screen-flash overlay — dimmed by reduce-motion)
 *   - 1 klieg-light sweep mid-late (1 s windup outline → 360 ms fire)
 *
 * Decorative-only:
 *   - sidewalk Walk-of-Fame stars in the foreground
 *   - 1 limo whoosh (foreground silhouette parallaxing across)
 *
 * Boss zone: → KOREA jetway with departures sign (ICN). The chibi
 * visually steps INTO the corridor on win.
 */
const LA_2008: RunConfig = {
  levelId: 'la-2008',
  mode: 'autoRunner',
  length: AUTO.length,
  speed: AUTO.speed,
  biome: 'los-angeles',
  bossZone: { x: AUTO.length - 96, y: GROUND_Y - 72, w: 72, h: 72 },
  bossArt: 'koreaJetway',
  bossLabel: '→ KOREA',
  preRunFlavor: 'Glamour zone. Exits unmarked. Smile for the camera anyway.',
  bossPreview: 'Final boss: the jetway to ICN. Step in to board.',
  postWinFlavor: 'Boarding pass: ICN. Exit found: → Korea.',
  decorations: [
    // Walk-of-Fame star inlays at ground level — pure foreground decoration.
    { x: 280,  y: GROUND_Y - 6, art: 'sidewalkStar', parallax: 1 },
    { x: 1240, y: GROUND_Y - 6, art: 'sidewalkStar', parallax: 1 },
    { x: 2240, y: GROUND_Y - 6, art: 'sidewalkStar', parallax: 1 },
    { x: 3060, y: GROUND_Y - 6, art: 'sidewalkStar', parallax: 1 },
    // Mid-stretch limo whoosh foreground silhouette (NOT a hazard).
    { x: 1500, y: GROUND_Y - 22, art: 'limoWhoosh', parallax: 1 },
  ],
  obstacles: [
    // ── Intro third (~5s in) — easy reads, low jumps
    { x: 340,  y: onGround(18), w: 26, h: 18, art: 'velvetRope',    kind: 'jump' },
    { x: 600,  y: onGround(20), w: 18, h: 20, art: 'directorChair', kind: 'jump' },
    { x: 860,  y: onGround(14), w: 22, h: 14, art: 'clapboard',     kind: 'jump' },
    // ── Middle third — taller props + introduce paparazzi flash timing
    {
      // Flashbulb is anchored mid-air at chibi-head level so the camera
      // is visually "aimed" at the runner. windupMs telegraphs a 250 ms
      // charging halo before the bright fire phase.
      x: 1100, y: onGround(48), w: 22, h: 26, art: 'flashbulb',
      kind: 'projectile',
      periodMs: 1100, windupMs: 250, activeMs: 160, phaseMs: 0,
    },
    { x: 1320, y: onGround(20), w: 18, h: 20, art: 'directorChair',  kind: 'jump' },
    { x: 1560, y: onGround(22), w: 18, h: 22, art: 'headshotStack',  kind: 'jump' },
    { x: 1760, y: onGround(40), w: 14, h: 40, art: 'parkingMeter',   kind: 'jump' },
    {
      x: 1960, y: onGround(48), w: 22, h: 26, art: 'flashbulb',
      kind: 'projectile',
      periodMs: 1100, windupMs: 250, activeMs: 160, phaseMs: 350,
    },
    { x: 2160, y: onGround(10), w: 14, h: 10, art: 'stilettoHeel',   kind: 'jump' },
    // ── Final third — dense run-up + mid-late klieg sweep
    { x: 2360, y: onGround(22), w: 18, h: 22, art: 'headshotStack',  kind: 'jump' },
    {
      // Klieg sweep — vertical hazard cone. Drawn floor-to-ceiling, so
      // y=0 / h=GROUND_Y. Long windup (1s outline) → short fire (360 ms).
      x: 2540, y: 0, w: 28, h: GROUND_Y,
      art: 'kliegSweep',
      kind: 'projectile',
      periodMs: 4000, windupMs: 1000, activeMs: 360, phaseMs: 200,
    },
    { x: 2740, y: onGround(36), w: 16, h: 36, art: 'kliegTripod',    kind: 'jump' },
    {
      x: 2960, y: onGround(48), w: 22, h: 26, art: 'flashbulb',
      kind: 'projectile',
      periodMs: 950, windupMs: 250, activeMs: 160, phaseMs: 100,
    },
    { x: 3180, y: onGround(40), w: 22, h: 40, art: 'starPedestal',   kind: 'jump' },
  ],
}

/* ───────────────────────── WORLD 5: SEOUL ─────────────────────────── */
/** ~25s clean run. ~13 hazards. Seoul-at-11pm vibes: soju bottles,
 *  tteokbokki cart, plastic stools, rolling kimchi jar, subway
 *  turnstile, karaoke disco ball, textbook stack, streetlight + paper
 *  lantern, jjigae-bowl steam projectiles. Boss zone is a 편의점
 *  storefront — pays off the post-win "Save & exit. Snacks +50." */
const SEOUL_2010: RunConfig = {
  levelId: 'seoul-2010',
  mode: 'autoRunner',
  length: AUTO.length,
  speed: AUTO.speed,
  biome: 'seoul',
  bossZone: { x: AUTO.length - 80, y: GROUND_Y - 76, w: 70, h: 76 },
  bossArt: 'cuStorefront',
  bossLabel: '편의점',
  preRunFlavor: 'Way too fun. Try not to over-rotate.',
  bossPreview:
    'Final boss: the 편의점 sliding door. Step in for snacks.',
  postWinFlavor: 'Save & exit. Snacks +50.',
  decorations: [
    // Decorative paper lantern that survives from the original mood.
    { x: 1200, y: GROUND_Y - 28, art: 'lantern', parallax: 0.8 },
    // Falling autumn leaves drifting across the screen (parallax: 0 →
    // screen-anchored, drift handled inside the art fn).
    { x: 60,   y: 40,  art: 'autumnLeaf', parallax: 0 },
    { x: 220,  y: 90,  art: 'autumnLeaf', parallax: 0 },
    { x: 360,  y: 30,  art: 'autumnLeaf', parallax: 0 },
    { x: 480,  y: 110, art: 'autumnLeaf', parallax: 0 },
    { x: 100,  y: 150, art: 'autumnLeaf', parallax: 0 },
    { x: 540,  y: 60,  art: 'autumnLeaf', parallax: 0 },
    { x: 320,  y: 170, art: 'autumnLeaf', parallax: 0 },
    { x: 200,  y: 200, art: 'autumnLeaf', parallax: 0 },
    // Decorative subway whoosh — Seoul Metro car blurs across the
    // foreground every ~6s. Pure parallax, no collision.
    { x: 0,    y: GROUND_Y - 38, art: 'subwayWhoosh', parallax: 0 },
  ],
  obstacles: [
    // ── Intro third (~5s) — static jumps, easy reads.
    { x: 360,  y: onGround(22), w: 12, h: 22, art: 'sojuBottle',     kind: 'jump' },
    { x: 600,  y: onGround(18), w: 26, h: 18, art: 'plasticStool',   kind: 'jump' },
    { x: 840,  y: onGround(24), w: 28, h: 24, art: 'tteokbokkiCart', kind: 'jump' },
    // ── Middle third — introduce timing hazards (jjigae steam) +
    //                    rolling kimchi jar.
    {
      x: 1080, y: onGround(46), w: 14, h: 22, art: 'steamPuff',
      kind: 'projectile', periodMs: 1100, activeMs: 550, phaseMs: 0,
    },
    { x: 1300, y: onGround(20), w: 22, h: 20, art: 'kimchiJar',      kind: 'jump' },
    { x: 1520, y: onGround(22), w: 12, h: 22, art: 'sojuBottle',     kind: 'jump' },
    {
      x: 1740, y: onGround(46), w: 14, h: 22, art: 'steamPuff',
      kind: 'projectile', periodMs: 1100, activeMs: 550, phaseMs: 400,
    },
    { x: 1960, y: onGround(24), w: 22, h: 24, art: 'subwayTurnstile', kind: 'jump' },
    // ── Final third — denser run-up to the convenience store.
    { x: 2200, y: onGround(18), w: 26, h: 18, art: 'plasticStool',    kind: 'jump' },
    { x: 2400, y: onGround(20), w: 20, h: 20, art: 'discoBall',       kind: 'jump' },
    { x: 2620, y: onGround(22), w: 24, h: 22, art: 'textbookStack',   kind: 'jump' },
    {
      x: 2840, y: onGround(46), w: 14, h: 22, art: 'steamPuff',
      kind: 'projectile', periodMs: 950, activeMs: 550, phaseMs: 200,
    },
    // Streetlight pole — the bbox is the pole shaft (collidable). The
    // paper lantern hangs from the top decoratively (drawn outside the
    // bbox in the art fn).
    { x: 3080, y: onGround(60), w: 4,  h: 60, art: 'streetlightLantern', kind: 'jump' },
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
