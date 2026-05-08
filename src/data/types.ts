export type Biome =
  | 'vietnam'
  | 'texas'
  | 'austin-ut'
  | 'los-angeles'
  | 'seoul'
  | 'houston'
  | 'austin-home'

export interface MediaPhoto {
  kind: 'photo'
  src: string
  alt: string
  caption?: string
}

export interface MediaVideo {
  kind: 'video'
  /**
   * Embed URL for an iframe (e.g. YouTube embed URL)
   * or a direct .mp4 path under /public.
   */
  src: string
  title: string
  embed?: boolean
}

export interface MediaAudio {
  kind: 'audio'
  src: string
  title: string
}

export type Media = MediaPhoto | MediaVideo | MediaAudio

export interface Chapter {
  /** Short heading inside the level panel (e.g. "First steps") */
  heading: string
  /** Markdown-ish plain text. Newlines become paragraphs. */
  body: string
  year?: number
}

export interface QuizQuestion {
  question: string
  /** 2–5 multiple-choice options. Order is preserved in UI. */
  options: string[]
  /** Index into `options` for the correct answer. */
  correctIndex: number
  /** Shown after a wrong answer. */
  hint?: string
  /** Flavor message shown after the correct answer. */
  feedback?: string
}

export interface Level {
  id: string
  /** Map node label, like "1" in SMW */
  number: number
  /** Year/era range label, e.g. "1985 – 1992" */
  era: string
  /** Age range for this level */
  ageRange: string
  /** City + country tag shown above the title */
  location: string
  /** Big descriptive title for the panel */
  title: string
  /** One-line subtitle / tagline */
  subtitle: string
  /**
   * Position on the map. Coordinates use the map viewBox of 140 × 60.
   *  - x: 0 (far left) … 140 (far right)
   *  - y: 0 (top) … 60 (bottom)
   */
  x: number
  y: number
  biome: Biome
  /** Story chapters within the period. Empty array is fine for placeholders. */
  chapters: Chapter[]
  media: Media[]
  /**
   * Quiz the visitor must pass to "clear" this level. All questions must be
   * answered correctly (in order, with retries) before the level is marked
   * cleared. An empty array means there is no gate.
   */
  quizzes: QuizQuestion[]
  /** Optional palette overrides for the node */
  accent?: string
}

/* ──────────────────────── Boss-run mini-game ──────────────────────── */

/**
 * Two run modes:
 *   - `autoRunner`: avatar auto-runs left→right at constant speed; the only
 *     input is "jump". Used for worlds 1–6.
 *   - `platformer`: avatar can move L/R AND jump. Used for the final castle
 *     (world 7). Camera follows the avatar through a vertical climb.
 */
export type RunMode = 'autoRunner' | 'platformer'

/**
 * Hazards the player must avoid. Coordinates are in **world-space logical
 * pixels**:
 *   - For autoRunner: x grows left→right along the run; y is measured from
 *     the top of the canvas (y=0 is the sky, y=200 is the ground line).
 *   - For platformer: x and y are both world-space, with y growing
 *     downward. Most level art lives at high y values (down) and the climb
 *     goes toward smaller y (up).
 *
 * `kind` controls collision behaviour:
 *   - `jump`: a static hazard you must hop over. Always-active AABB.
 *   - `duck`: reserved for future content (low ceiling). Currently unused.
 *   - `projectile`: a hazard that periodically activates. Used for World 6
 *     rocket-exhaust waves — the player has to time the jump.
 */
export type ObstacleKind = 'jump' | 'duck' | 'projectile'

export interface Obstacle {
  /** World-space x of the obstacle's left edge. */
  x: number
  /** World-space y of the obstacle's top edge. */
  y: number
  w: number
  h: number
  /** Lookup key into the per-run art registry. */
  art: string
  kind: ObstacleKind
  /** Projectile cycle length in ms (only meaningful for kind:'projectile'). */
  periodMs?: number
  /** ms within `periodMs` when the projectile is "live" (collidable + drawn). */
  activeMs?: number
  /** Per-obstacle phase offset in ms, so multiple projectiles aren't synced. */
  phaseMs?: number
}

/** Static platforms used by the platformer (world 7). */
export interface Platform {
  x: number
  y: number
  w: number
  h: number
  /** Optional art tag (e.g. 'grass', 'capitol-step', 'dome'). */
  art?: string
}

/** Decorative biome scenery used by the renderer. */
export interface Decoration {
  x: number
  y: number
  art: string
  /** Parallax factor — 1 = scrolls with the world, 0.4 = slow background. */
  parallax?: number
}

export interface RunConfig {
  /** `Level.id` this run belongs to. */
  levelId: string
  mode: RunMode
  /**
   * Total horizontal world length in logical pixels (autoRunner) or world
   * width (platformer). The boss is at the right end (autoRunner) or in
   * `bossZone` (platformer).
   */
  length: number
  /** World height in logical pixels (platformer only). */
  height?: number
  /** Auto-run horizontal speed in px/s. Defaults to 140. */
  speed?: number
  /**
   * Boss zone — touching this AABB triggers WIN. For autoRunner we usually
   * just put it at `x = length - 64` near the right edge. For platformer it
   * marks the cupola at the top of the climb.
   */
  bossZone: { x: number; y: number; w: number; h: number }
  /** Big art tag for the boss (drawn at bossZone). */
  bossArt: string
  /** Big-letter label drawn on/near the boss (e.g. "12-HR CRY"). */
  bossLabel: string
  /** Pre-run flavor blurb shown above the Begin button. */
  preRunFlavor: string
  /** Boss preview line shown on the pre-run screen, below flavor. */
  bossPreview: string
  /** One-line "spoils" / post-clear flavor shown in the win overlay. */
  postWinFlavor: string
  /** Background biome key — re-used from Level.biome for theming. */
  biome: Biome
  /** Hazards along the run. */
  obstacles: Obstacle[]
  /** Decorative scenery (no collision). */
  decorations?: Decoration[]
  /** Platforms (platformer only). The ground itself is automatically added. */
  platforms?: Platform[]
  /**
   * Optional spawn position override (platformer). Defaults to
   * { x: 24, y: groundLine } for autoRunner and the bottom-left of the
   * world for platformer.
   */
  spawn?: { x: number; y: number }
}
