/**
 * 16-bit world map of Lan's life, with one region per place she has lived.
 * All original art (no copyrighted game assets), styled to evoke the 90s
 * SNES overworld feel. ViewBox is 140 × 60 to fit seven regions left → right.
 *
 * Reading order, left to right:
 *   1. Vietnam (tropical island, palms, pagoda)
 *   2. Texas childhood (ranch, longhorn, big sky)
 *   3. Austin UT (campus + UT Tower in burnt orange)
 *   4. Los Angeles (palms, hills, sunset, Hollywood-ish sign)
 *   5. Seoul (mountains + hanok pagoda + a tall tower)
 *   6. Houston (urban skyline + a small space rocket)
 *   7. Austin home (Texas Capitol, current era — the "castle" of the map)
 */
export function MapBackground() {
  return (
    <svg
      viewBox="0 0 140 60"
      preserveAspectRatio="xMidYMid slice"
      className="map-bg"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <defs>
        <pattern id="water" width="4" height="2" patternUnits="userSpaceOnUse">
          <rect width="4" height="2" fill="#3a86c8" />
          <rect x="0" y="0" width="2" height="1" fill="#5aa6e0" />
          <rect x="2" y="1" width="2" height="1" fill="#5aa6e0" />
        </pattern>

        <pattern id="grass" width="2" height="2" patternUnits="userSpaceOnUse">
          <rect width="2" height="2" fill="#4fae3a" />
          <rect x="0" y="0" width="1" height="1" fill="#62c44b" />
          <rect x="1" y="1" width="1" height="1" fill="#3a8e2a" />
        </pattern>

        <pattern id="paddy" width="3" height="3" patternUnits="userSpaceOnUse">
          <rect width="3" height="3" fill="#6fb34a" />
          <rect x="0" y="0" width="1" height="1" fill="#a3d97a" />
          <rect x="1" y="1" width="1" height="1" fill="#54983a" />
          <rect x="2" y="2" width="1" height="1" fill="#a3d97a" />
        </pattern>

        <pattern id="dryGrass" width="2" height="2" patternUnits="userSpaceOnUse">
          <rect width="2" height="2" fill="#cfa654" />
          <rect x="0" y="0" width="1" height="1" fill="#e3c275" />
          <rect x="1" y="1" width="1" height="1" fill="#a78239" />
        </pattern>

        <pattern id="utLawn" width="2" height="2" patternUnits="userSpaceOnUse">
          <rect width="2" height="2" fill="#3f8a2a" />
          <rect x="0" y="0" width="1" height="1" fill="#56a93a" />
          <rect x="1" y="1" width="1" height="1" fill="#2c6a1d" />
        </pattern>

        <pattern id="sand" width="2" height="2" patternUnits="userSpaceOnUse">
          <rect width="2" height="2" fill="#e6cf8b" />
          <rect x="0" y="0" width="1" height="1" fill="#f4dfa0" />
          <rect x="1" y="1" width="1" height="1" fill="#c9b070" />
        </pattern>

        <pattern id="rock" width="3" height="3" patternUnits="userSpaceOnUse">
          <rect width="3" height="3" fill="#8a6a4a" />
          <rect x="0" y="0" width="1" height="1" fill="#a98060" />
          <rect x="2" y="2" width="1" height="1" fill="#6a4f36" />
        </pattern>

        <pattern id="cityFloor" width="2" height="2" patternUnits="userSpaceOnUse">
          <rect width="2" height="2" fill="#4a4a55" />
          <rect x="0" y="0" width="1" height="1" fill="#5e5e6a" />
          <rect x="1" y="1" width="1" height="1" fill="#373740" />
        </pattern>

        <linearGradient id="sunset" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffb96e" />
          <stop offset="60%" stopColor="#f29ac0" />
          <stop offset="100%" stopColor="#7e7ed6" />
        </linearGradient>
      </defs>

      <rect width="140" height="60" fill="url(#water)" />

      <Vietnam />
      <Texas />
      <AustinUT />
      <LosAngeles />
      <Seoul />
      <Houston />
      <AustinHome />

      <Bridge x1={20} x2={24} y={48} />
      <Bridge x1={42} x2={44} y={50} />
      <Bridge x1={60} x2={62} y={42} />
      <Bridge x1={78} x2={80} y={32} />
      <Bridge x1={96} x2={100} y={42} />
      <Bridge x1={116} x2={120} y={42} />

      <DottedPath />

      <g>
        <rect x="6" y="6" width="6" height="2.4" fill="#ffffff" opacity="0.85" />
        <rect x="38" y="3" width="8" height="2.4" fill="#ffffff" opacity="0.85" />
        <rect x="80" y="4" width="6" height="2.4" fill="#ffffff" opacity="0.85" />
        <rect x="116" y="6" width="7" height="2.4" fill="#ffffff" opacity="0.85" />
      </g>
    </svg>
  )
}

/* ─────────────────────────  Region 1: Vietnam  ───────────────────────── */
function Vietnam() {
  return (
    <g>
      <rect x="0" y="58" width="22" height="2" fill="#6a4f36" />
      <rect x="0" y="56" width="22" height="2" fill="url(#rock)" />
      <rect x="0" y="50" width="22" height="6" fill="url(#paddy)" />
      <polygon points="0,50 22,50 22,46 16,46 12,48 4,46 0,46" fill="url(#paddy)" />

      <PalmTree cx={4} baseY={50} h={5} />
      <PalmTree cx={18} baseY={50} h={4} />

      <Pagoda baseX={11} baseY={50} />

      <rect x="2" y="52" width="3" height="0.4" fill="#3a8e2a" opacity="0.6" />
      <rect x="14" y="53" width="4" height="0.4" fill="#3a8e2a" opacity="0.6" />
    </g>
  )
}

function PalmTree({ cx, baseY, h }: { cx: number; baseY: number; h: number }) {
  return (
    <g>
      <rect x={cx - 0.3} y={baseY - h} width={0.6} height={h} fill="#7a4f2a" />
      <rect x={cx - 0.3} y={baseY - h + 1} width={0.6} height={0.3} fill="#5a3a1c" />
      <rect x={cx - 0.3} y={baseY - h + 2} width={0.6} height={0.3} fill="#5a3a1c" />
      <rect x={cx - 2.2} y={baseY - h - 0.6} width={2} height={0.6} fill="#1f5a1d" />
      <rect x={cx + 0.4} y={baseY - h - 0.6} width={2} height={0.6} fill="#1f5a1d" />
      <rect x={cx - 1.8} y={baseY - h - 1.2} width={1.4} height={0.6} fill="#3a8e2a" />
      <rect x={cx + 0.6} y={baseY - h - 1.2} width={1.4} height={0.6} fill="#3a8e2a" />
      <rect x={cx - 0.4} y={baseY - h - 1.6} width={0.8} height={0.6} fill="#3a8e2a" />
    </g>
  )
}

function Pagoda({ baseX, baseY }: { baseX: number; baseY: number }) {
  return (
    <g>
      <rect x={baseX} y={baseY - 4} width={4} height={4} fill="#c44b3a" />
      <polygon
        points={`${baseX - 0.6},${baseY - 4} ${baseX + 4.6},${baseY - 4} ${baseX + 4.2},${baseY - 4.6} ${baseX - 0.2},${baseY - 4.6}`}
        fill="#7a2a1f"
      />
      <rect x={baseX + 0.6} y={baseY - 6.2} width={2.8} height={1.8} fill="#c44b3a" />
      <polygon
        points={`${baseX + 0.2},${baseY - 6.2} ${baseX + 3.8},${baseY - 6.2} ${baseX + 3.5},${baseY - 6.8} ${baseX + 0.5},${baseY - 6.8}`}
        fill="#7a2a1f"
      />
      <rect x={baseX + 1.8} y={baseY - 7.6} width={0.4} height={1} fill="#f4c800" />
      <rect x={baseX + 1.6} y={baseY - 2.4} width={0.8} height={2.4} fill="#3a2410" />
    </g>
  )
}

/* ──────────────────────  Region 2: Texas childhood  ──────────────────── */
function Texas() {
  return (
    <g>
      <rect x="22" y="58" width="22" height="2" fill="#7a5326" />
      <rect x="22" y="38" width="22" height="20" fill="url(#dryGrass)" />
      <rect x="22" y="36" width="22" height="2" fill="#a78239" />

      <BarnFence x1={24} x2={42} y={42} />

      <Longhorn x={32} y={44} />
      <Cactus cx={26} baseY={42} />
      <Cactus cx={40} baseY={42} />
      <Tumbleweed cx={36} y={45} />

      <rect x="22" y="40" width="22" height="0.4" fill="#a78239" opacity="0.4" />
    </g>
  )
}

function BarnFence({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  const posts = Math.floor((x2 - x1) / 2.2)
  return (
    <g>
      <rect x={x1} y={y - 0.4} width={x2 - x1} height={0.4} fill="#7a5326" />
      <rect x={x1} y={y - 1.6} width={x2 - x1} height={0.4} fill="#7a5326" />
      {Array.from({ length: posts + 1 }).map((_, i) => (
        <rect
          key={i}
          x={x1 + i * ((x2 - x1) / posts)}
          y={y - 2.4}
          width={0.4}
          height={2.4}
          fill="#5a3a1c"
        />
      ))}
    </g>
  )
}

function Longhorn({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width={3.4} height={2} fill="#a04020" />
      <rect x={x + 0.2} y={y - 0.4} width={3} height={0.6} fill="#7a2a10" />
      <rect x={x + 2.6} y={y - 1.4} width={1.2} height={1} fill="#a04020" />
      <rect x={x + 2.4} y={y - 1.6} width={2} height={0.4} fill="#fff7c2" />
      <rect x={x + 2.4} y={y - 1.2} width={0.4} height={0.4} fill="#3a2410" />
      <rect x={x + 0.2} y={y + 2} width={0.4} height={0.6} fill="#3a2410" />
      <rect x={x + 1} y={y + 2} width={0.4} height={0.6} fill="#3a2410" />
      <rect x={x + 2} y={y + 2} width={0.4} height={0.6} fill="#3a2410" />
      <rect x={x + 2.8} y={y + 2} width={0.4} height={0.6} fill="#3a2410" />
    </g>
  )
}

function Cactus({ cx, baseY }: { cx: number; baseY: number }) {
  return (
    <g>
      <rect x={cx - 0.5} y={baseY - 4} width={1} height={4} fill="#3a8e2a" />
      <rect x={cx - 1.4} y={baseY - 3} width={0.6} height={1.4} fill="#3a8e2a" />
      <rect x={cx + 0.8} y={baseY - 2.6} width={0.6} height={1.4} fill="#3a8e2a" />
      <rect x={cx - 0.3} y={baseY - 3.6} width={0.2} height={0.2} fill="#fff7c2" />
    </g>
  )
}

function Tumbleweed({ cx, y }: { cx: number; y: number }) {
  return (
    <g>
      <circle cx={cx} cy={y} r={0.7} fill="#a78239" />
      <circle cx={cx + 0.3} cy={y - 0.2} r={0.3} fill="#7a5326" />
    </g>
  )
}

/* ─────────────────────  Region 3: Austin UT campus  ───────────────────── */
function AustinUT() {
  return (
    <g>
      <rect x="44" y="58" width="18" height="2" fill="#6a4f36" />
      <rect x="44" y="56" width="18" height="2" fill="url(#rock)" />
      <rect x="44" y="48" width="18" height="8" fill="url(#utLawn)" />

      <UTTower baseX={50} baseY={48} />

      <rect x="46" y="48" width="0.6" height="0.6" fill="#cfa654" />
      <rect x="59" y="49" width="0.6" height="0.6" fill="#cfa654" />
    </g>
  )
}

function UTTower({ baseX, baseY }: { baseX: number; baseY: number }) {
  // baseY = top of platform. Tower sits on top of a wide academic base.
  const orange = '#bf5700'
  const orangeDk = '#7a3500'
  const white = '#fdf6dd'

  return (
    <g>
      <rect x={baseX - 2} y={baseY - 5} width={12} height={5} fill={white} />
      <rect x={baseX - 2} y={baseY - 5} width={12} height={0.6} fill="#c9b07a" />
      <rect x={baseX - 1.4} y={baseY - 4.6} width={0.4} height={4} fill="#c9b07a" />
      <rect x={baseX} y={baseY - 4.6} width={0.4} height={4} fill="#c9b07a" />
      <rect x={baseX + 1.4} y={baseY - 4.6} width={0.4} height={4} fill="#c9b07a" />
      <rect x={baseX + 2.8} y={baseY - 4.6} width={0.4} height={4} fill="#c9b07a" />
      <rect x={baseX + 4.2} y={baseY - 4.6} width={0.4} height={4} fill="#c9b07a" />
      <rect x={baseX + 5.6} y={baseY - 4.6} width={0.4} height={4} fill="#c9b07a" />
      <rect x={baseX + 7} y={baseY - 4.6} width={0.4} height={4} fill="#c9b07a" />
      <rect x={baseX + 8.4} y={baseY - 4.6} width={0.4} height={4} fill="#c9b07a" />
      <rect x={baseX + 3.4} y={baseY - 3.4} width={1.4} height={3.4} fill={orange} />

      <rect x={baseX + 2.4} y={baseY - 17} width={3.4} height={12} fill={orange} />
      <rect x={baseX + 2.4} y={baseY - 17} width={3.4} height={0.6} fill={orangeDk} />
      <rect x={baseX + 2.4} y={baseY - 5.2} width={3.4} height={0.4} fill={orangeDk} />
      {[15, 13, 11, 9, 7].map(y => (
        <g key={y}>
          <rect
            x={baseX + 2.7}
            y={baseY - y}
            width={0.4}
            height={0.8}
            fill={white}
          />
          <rect
            x={baseX + 3.5}
            y={baseY - y}
            width={0.4}
            height={0.8}
            fill={white}
          />
          <rect
            x={baseX + 4.3}
            y={baseY - y}
            width={0.4}
            height={0.8}
            fill={white}
          />
          <rect
            x={baseX + 5.1}
            y={baseY - y}
            width={0.4}
            height={0.8}
            fill={white}
          />
        </g>
      ))}

      <rect x={baseX + 2.2} y={baseY - 19} width={3.8} height={2} fill={white} />
      <rect x={baseX + 2.2} y={baseY - 19} width={3.8} height={0.4} fill="#c9b07a" />
      <circle
        cx={baseX + 4.1}
        cy={baseY - 18}
        r={0.7}
        fill={white}
        stroke="#3a2410"
        strokeWidth={0.2}
      />
      <rect x={baseX + 4.05} y={baseY - 18.4} width={0.1} height={0.5} fill="#3a2410" />
      <rect x={baseX + 4.1} y={baseY - 18} width={0.4} height={0.1} fill="#3a2410" />

      <rect x={baseX + 2.6} y={baseY - 19.6} width={0.3} height={0.6} fill={orangeDk} />
      <rect x={baseX + 3.4} y={baseY - 19.6} width={0.3} height={0.6} fill={orangeDk} />
      <rect x={baseX + 4.5} y={baseY - 19.6} width={0.3} height={0.6} fill={orangeDk} />
      <rect x={baseX + 5.3} y={baseY - 19.6} width={0.3} height={0.6} fill={orangeDk} />

      <rect x={baseX + 4} y={baseY - 21.2} width={0.2} height={1.6} fill="#3a2410" />
      <polygon
        points={`${baseX + 4.2},${baseY - 21.2} ${baseX + 5.4},${baseY - 20.6} ${baseX + 4.2},${baseY - 20}`}
        fill={orange}
      />
    </g>
  )
}

/* ─────────────────────  Region 4: Los Angeles  ───────────────────────── */
function LosAngeles() {
  return (
    <g>
      <rect x="62" y="58" width="16" height="2" fill="#c9b070" />
      <rect x="62" y="44" width="16" height="14" fill="url(#sand)" />

      <polygon
        points="62,44 78,44 78,36 76,33 73,30 70,29 67,31 64,33 62,36"
        fill="#3f7a3a"
      />
      <polygon
        points="62,44 78,44 78,40 76,37 73,34 70,33 67,35 64,37 62,40"
        fill="#56a93a"
      />

      <rect x="63.4" y="34" width="0.4" height="2.4" fill="#3a2410" opacity="0.5" />
      <rect x="65.6" y="33.4" width="0.4" height="2.4" fill="#3a2410" opacity="0.5" />
      <rect x="67.8" y="32.6" width="0.4" height="2.4" fill="#3a2410" opacity="0.5" />
      <rect x="70" y="32.4" width="0.4" height="2.4" fill="#3a2410" opacity="0.5" />
      <rect x="72.2" y="32.6" width="0.4" height="2.4" fill="#3a2410" opacity="0.5" />
      <rect x="74.4" y="33.4" width="0.4" height="2.4" fill="#3a2410" opacity="0.5" />
      <rect x="76.4" y="34" width="0.4" height="2.4" fill="#3a2410" opacity="0.5" />

      <HollywoodSign baseX={62.5} baseY={40} />

      <PalmTree cx={64} baseY={48} h={6} />
      <PalmTree cx={76} baseY={48} h={5} />

      <rect x="63" y="55" width="2" height="0.4" fill="#8a6a4a" opacity="0.6" />
      <rect x="74" y="56" width="2" height="0.4" fill="#8a6a4a" opacity="0.6" />
    </g>
  )
}

/**
 * Iconic LA Hollywood-style sign: tall white-block letters spelling
 * "HOLLYWOOD" planted across a green hilltop. Letters are drawn as filled
 * rectangles with shadow so they read clearly even at tiny sizes.
 */
function HollywoodSign({ baseX, baseY }: { baseX: number; baseY: number }) {
  const letters = 'HOLLYWOOD'.split('')
  const letterW = 1.5
  const letterH = 3.6
  const gap = 0.16
  return (
    <g>
      {letters.map((ch, i) => {
        const lx = baseX + i * (letterW + gap)
        return (
          <g key={i}>
            <rect
              x={lx + 0.15}
              y={baseY - letterH + 0.2}
              width={letterW}
              height={letterH}
              fill="#3a2410"
              opacity="0.45"
            />
            <rect
              x={lx}
              y={baseY - letterH}
              width={letterW}
              height={letterH}
              fill="#ffffff"
              stroke="#3a2410"
              strokeWidth={0.18}
            />
            <text
              x={lx + letterW / 2}
              y={baseY - letterH / 2 + 0.05}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={2.6}
              fontWeight="bold"
              fontFamily='"Press Start 2P", monospace'
              fill="#3a2410"
            >
              {ch}
            </text>
          </g>
        )
      })}
    </g>
  )
}

/* ─────────────────────────  Region 5: Seoul  ──────────────────────────── */
function Seoul() {
  return (
    <g>
      <rect x="80" y="40" width="16" height="20" fill="#6a4f36" />
      <rect x="80" y="38" width="16" height="2" fill="url(#rock)" />
      <SeoulMountain cx={84} baseY={38} h={18} />
      <SeoulMountain cx={92} baseY={38} h={26} />

      <rect x="80" y="32" width="16" height="6" fill="url(#grass)" />
      <Hanok baseX={82} baseY={32} />
      <NSeoulTower baseX={91} baseY={32} />
    </g>
  )
}

function SeoulMountain({ cx, baseY, h }: { cx: number; baseY: number; h: number }) {
  const w = h * 0.9
  const top = baseY - h
  return (
    <g>
      <polygon
        points={`${cx - w},${baseY} ${cx},${top} ${cx + w},${baseY}`}
        fill="url(#rock)"
      />
      <polygon
        points={`${cx - w * 0.45},${baseY - h * 0.55} ${cx},${top} ${cx + w * 0.45},${baseY - h * 0.55} ${cx},${baseY - h * 0.7}`}
        fill="#ffffff"
      />
    </g>
  )
}

function Hanok({ baseX, baseY }: { baseX: number; baseY: number }) {
  return (
    <g>
      <rect x={baseX} y={baseY - 2.6} width={4.5} height={2.6} fill="#e8c34a" />
      <rect x={baseX + 1.6} y={baseY - 2.4} width={1.2} height={2.4} fill="#7a3500" />
      <polygon
        points={`${baseX - 0.8},${baseY - 2.6} ${baseX + 5.3},${baseY - 2.6} ${baseX + 4.5},${baseY - 4} ${baseX},${baseY - 4}`}
        fill="#1f3a3a"
      />
      <polygon
        points={`${baseX - 1.2},${baseY - 2.6} ${baseX - 0.4},${baseY - 2.6} ${baseX - 0.2},${baseY - 3.4} ${baseX - 0.6},${baseY - 3.4}`}
        fill="#1f3a3a"
      />
      <polygon
        points={`${baseX + 4.9},${baseY - 2.6} ${baseX + 5.7},${baseY - 2.6} ${baseX + 5.1},${baseY - 3.4} ${baseX + 4.7},${baseY - 3.4}`}
        fill="#1f3a3a"
      />
    </g>
  )
}

function NSeoulTower({ baseX, baseY }: { baseX: number; baseY: number }) {
  return (
    <g>
      <rect x={baseX - 0.2} y={baseY - 6} width={0.4} height={6} fill="#bbbbbb" />
      <rect x={baseX - 0.6} y={baseY - 7.4} width={1.2} height={1.4} fill="#bbbbbb" />
      <rect x={baseX - 1} y={baseY - 8.2} width={2} height={0.8} fill="#3a78c4" />
      <rect x={baseX - 0.1} y={baseY - 9.4} width={0.2} height={1.2} fill="#bbbbbb" />
      <circle cx={baseX} cy={baseY - 9.6} r={0.3} fill="#d63b2c" />
    </g>
  )
}

/* ─────────────────  Region 6: Houston (NASA Space City)  ───────────────── */
function Houston() {
  // Concrete launch-pad / Mission Control plaza, big Saturn V rocket as
  // hero, NASA "meatball" logo on a Mission Control building, plus one
  // small Houston downtown skyscraper to keep the city anchor.
  return (
    <g>
      <rect x="100" y="58" width="16" height="2" fill="#3a3a40" />
      <rect x="100" y="42" width="16" height="16" fill="url(#cityFloor)" />

      <rect x="100" y="42" width="16" height="0.6" fill="#22222a" />

      <SaturnVRocket baseX={106.5} baseY={42} />
      <LaunchSmoke baseX={106} baseY={42} />

      <MissionControl baseX={101} baseY={42} />

      <Skyscraper
        baseX={113}
        baseY={42}
        h={11}
        color="#5e5e6a"
        highlight="#5fc6e6"
      />
    </g>
  )
}

/**
 * Stylised Saturn V — black-and-white banded fuselage, three stages,
 * USA + a small NASA flag, fins, and a payload nose cone.
 */
function SaturnVRocket({
  baseX,
  baseY,
}: {
  baseX: number
  baseY: number
}) {
  const W = 3.2
  const x = baseX

  return (
    <g>
      <rect x={x} y={baseY - 16} width={W} height={6} fill="#fdf6dd" />
      <rect x={x} y={baseY - 14.8} width={W} height={0.5} fill="#1d1d1d" />
      <rect x={x} y={baseY - 13.6} width={W} height={0.5} fill="#1d1d1d" />
      <rect x={x} y={baseY - 12.2} width={W} height={0.5} fill="#1d1d1d" />
      <rect x={x} y={baseY - 11} width={W} height={0.5} fill="#1d1d1d" />
      <rect x={x + 0.2} y={baseY - 13.2} width={W - 0.4} height={1} fill="#fdf6dd" />
      <text
        x={x + W / 2}
        y={baseY - 12.55}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={1}
        fontFamily='"Press Start 2P", monospace'
        fill="#cc1f1f"
      >
        USA
      </text>

      <polygon
        points={`${x - 0.6},${baseY - 10} ${x + W + 0.6},${baseY - 10} ${x + W + 0.2},${baseY - 18} ${x - 0.2},${baseY - 18}`}
        fill="#fdf6dd"
      />
      <rect x={x + W / 2 - 0.15} y={baseY - 18.5} width={0.3} height={0.6} fill="#1d1d1d" />
      <polygon
        points={`${x - 0.2},${baseY - 18} ${x + W + 0.2},${baseY - 18} ${x + W / 2},${baseY - 21}`}
        fill="#cc1f1f"
      />

      <polygon
        points={`${x - 0.6},${baseY - 10} ${x + W + 0.6},${baseY - 10} ${x + W + 0.2},${baseY - 6} ${x - 0.2},${baseY - 6}`}
        fill="#1d1d1d"
      />
      <rect x={x + 0.2} y={baseY - 7.6} width={0.5} height={0.8} fill="#ffd56b" />
      <rect x={x + 1.3} y={baseY - 7.6} width={0.5} height={0.8} fill="#ffd56b" />
      <rect x={x + 2.4} y={baseY - 7.6} width={0.5} height={0.8} fill="#ffd56b" />

      <polygon
        points={`${x - 0.2},${baseY - 6} ${x + W + 0.2},${baseY - 6} ${x + W + 1.4},${baseY - 1} ${x - 1.4},${baseY - 1}`}
        fill="#fdf6dd"
      />
      <polygon
        points={`${x - 0.2},${baseY - 6} ${x - 1.4},${baseY - 1} ${x - 0.2},${baseY - 1}`}
        fill="#cc1f1f"
      />
      <polygon
        points={`${x + W + 0.2},${baseY - 6} ${x + W + 1.4},${baseY - 1} ${x + W + 0.2},${baseY - 1}`}
        fill="#cc1f1f"
      />

      <rect x={x + W / 2 - 0.7} y={baseY - 1} width={1.4} height={1} fill="#3a78c4" />
    </g>
  )
}

/** Pixel-y exhaust cloud puffing out from the launch pad. */
function LaunchSmoke({ baseX, baseY }: { baseX: number; baseY: number }) {
  const puffs = [
    { x: baseX - 1.5, y: baseY - 0.8, r: 1.2 },
    { x: baseX + 0.5, y: baseY - 0.4, r: 1 },
    { x: baseX + 2.6, y: baseY - 0.6, r: 1.1 },
    { x: baseX + 4.6, y: baseY - 1.2, r: 1.3 },
    { x: baseX + 5.5, y: baseY - 0.4, r: 0.9 },
  ]
  return (
    <g>
      {puffs.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={p.r + 0.2} fill="#7a7a82" opacity="0.7" />
          <circle cx={p.x} cy={p.y - 0.2} r={p.r} fill="#cccccc" />
          <circle cx={p.x - 0.2} cy={p.y - 0.4} r={p.r * 0.6} fill="#fdf6dd" />
        </g>
      ))}
    </g>
  )
}

/** Mission Control building — flat-roofed, satellite dish, NASA "meatball". */
function MissionControl({
  baseX,
  baseY,
}: {
  baseX: number
  baseY: number
}) {
  return (
    <g>
      <rect x={baseX} y={baseY - 5} width={5} height={5} fill="#fdf6dd" />
      <rect x={baseX} y={baseY - 5} width={5} height={0.4} fill="#7a7a82" />
      <rect x={baseX + 0.4} y={baseY - 4.4} width={1} height={1} fill="#3a78c4" />
      <rect x={baseX + 1.6} y={baseY - 4.4} width={1} height={1} fill="#3a78c4" />
      <rect x={baseX + 2.8} y={baseY - 4.4} width={1} height={1} fill="#3a78c4" />
      <rect x={baseX + 0.4} y={baseY - 2.8} width={1} height={1} fill="#3a78c4" />
      <rect x={baseX + 1.6} y={baseY - 2.8} width={1} height={1} fill="#3a78c4" />
      <rect x={baseX + 2.8} y={baseY - 2.8} width={1} height={1} fill="#3a78c4" />
      <rect x={baseX + 4.2} y={baseY - 1.6} width={0.6} height={1.6} fill="#3a2410" />

      <NasaMeatball cx={baseX + 2.5} cy={baseY - 7} r={1.3} />

      <rect x={baseX - 0.1} y={baseY - 6.2} width={0.2} height={1.2} fill="#7a7a82" />
      <ellipse
        cx={baseX - 0.5}
        cy={baseY - 6.5}
        rx={0.7}
        ry={0.5}
        fill="#cccccc"
        stroke="#7a7a82"
        strokeWidth={0.15}
      />
      <circle cx={baseX - 0.5} cy={baseY - 6.5} r={0.15} fill="#3a2410" />
    </g>
  )
}

/** NASA "meatball" logo: blue circle, swoosh, stars. */
function NasaMeatball({
  cx,
  cy,
  r,
}: {
  cx: number
  cy: number
  r: number
}) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#0b3d91" />
      <text
        x={cx}
        y={cy + 0.15}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={r * 0.85}
        fontFamily='"Press Start 2P", monospace'
        fontWeight="bold"
        fill="#ffffff"
      >
        NASA
      </text>
      <path
        d={`M ${cx - r * 0.8} ${cy + r * 0.45} Q ${cx} ${cy + r * 0.05} ${cx + r * 0.8} ${cy + r * 0.45}`}
        stroke="#fc3d21"
        strokeWidth={r * 0.18}
        fill="none"
      />
      <circle cx={cx - r * 0.55} cy={cy - r * 0.45} r={r * 0.07} fill="#ffffff" />
      <circle cx={cx + r * 0.4} cy={cy - r * 0.6} r={r * 0.05} fill="#ffffff" />
      <circle cx={cx + r * 0.65} cy={cy - r * 0.2} r={r * 0.06} fill="#ffffff" />
    </g>
  )
}

function Skyscraper({
  baseX,
  baseY,
  h,
  color,
  highlight,
}: {
  baseX: number
  baseY: number
  h: number
  color: string
  highlight: string
}) {
  const w = 3
  const rows = Math.floor(h / 1.4)
  const cols = 2
  return (
    <g>
      <rect x={baseX} y={baseY - h} width={w} height={h} fill={color} />
      <rect x={baseX} y={baseY - h} width={w} height={0.6} fill="#22222a" />
      {Array.from({ length: rows }).flatMap((_, r) =>
        Array.from({ length: cols }).map((_, c) => (
          <rect
            key={`${r}-${c}`}
            x={baseX + 0.6 + c * 1.4}
            y={baseY - h + 1 + r * 1.4}
            width={0.6}
            height={0.7}
            fill={(r + c) % 3 === 0 ? highlight : '#fff7c2'}
            opacity={0.85}
          />
        ))
      )}
    </g>
  )
}

/* ──────────────────  Region 7: Austin (current home)  ─────────────────── */
function AustinHome() {
  // Endgame "castle" zone — wide platform, hill, then a scaled-up Capitol
  // dressed up with banners and a flag.
  return (
    <g>
      <rect x="118" y="58" width="22" height="2" fill="#6a4f36" />
      <rect x="118" y="56" width="22" height="2" fill="url(#rock)" />
      <rect x="118" y="42" width="22" height="14" fill="url(#grass)" />

      <polygon points="118,42 140,42 140,28 134,24 128,22 122,24 118,28" fill="url(#hill)" />
      <polygon points="118,42 140,42 140,32 134,28 128,26 122,28 118,32" fill="#5a8a4a" />

      {/* Approach steps leading up to the Capitol */}
      <rect x="125" y="40" width="10" height="0.6" fill="#c9b070" />
      <rect x="126" y="38.6" width="8" height="0.6" fill="#c9b070" />
      <rect x="127" y="37.2" width="6" height="0.6" fill="#c9b070" />

      <g transform="translate(129 22) scale(1.35) translate(-129 -22)">
        <Capitol baseX={123} baseY={22} />
      </g>

      <rect x="119" y="44" width="0.4" height="3" fill="#7a5326" />
      <polygon points="119.4,44 121,44.6 119.4,45.2" fill="#cc1f1f" />
      <rect x="139" y="44" width="0.4" height="3" fill="#7a5326" />
      <polygon points="139.4,44 137.8,44.6 139.4,45.2" fill="#cc1f1f" />

      <PalmTree cx={120} baseY={42} h={3.5} />
      <PalmTree cx={138.8} baseY={42} h={3.5} />
    </g>
  )
}

function Capitol({ baseX, baseY }: { baseX: number; baseY: number }) {
  // Texas Capitol — pink "sunset red" granite, central dome with cupola,
  // columned portico, two side wings. Read this top-down: side wings,
  // central rotunda, columned entrance, dome, drum, cupola, statue.
  const granite = '#d68a73'
  const graniteDk = '#a45c4a'
  const graniteLt = '#e8a797'
  const trim = '#f4dfa0'

  return (
    <g>
      <rect x={baseX - 2} y={baseY - 4} width={4} height={4} fill={granite} />
      <rect x={baseX - 2} y={baseY - 4} width={4} height={0.4} fill={graniteDk} />
      <rect x={baseX - 1.4} y={baseY - 3.2} width={0.6} height={1} fill={trim} />
      <rect x={baseX - 0.4} y={baseY - 3.2} width={0.6} height={1} fill={trim} />
      <rect x={baseX - 1.4} y={baseY - 1.8} width={0.6} height={1} fill={trim} />
      <rect x={baseX - 0.4} y={baseY - 1.8} width={0.6} height={1} fill={trim} />

      <rect x={baseX + 10} y={baseY - 4} width={4} height={4} fill={granite} />
      <rect x={baseX + 10} y={baseY - 4} width={4} height={0.4} fill={graniteDk} />
      <rect x={baseX + 10.8} y={baseY - 3.2} width={0.6} height={1} fill={trim} />
      <rect x={baseX + 11.8} y={baseY - 3.2} width={0.6} height={1} fill={trim} />
      <rect x={baseX + 10.8} y={baseY - 1.8} width={0.6} height={1} fill={trim} />
      <rect x={baseX + 11.8} y={baseY - 1.8} width={0.6} height={1} fill={trim} />

      <rect x={baseX + 2} y={baseY - 5.2} width={8} height={5.2} fill={granite} />
      <rect x={baseX + 2} y={baseY - 5.2} width={8} height={0.5} fill={graniteDk} />

      <rect x={baseX + 3.6} y={baseY - 4.6} width={1} height={4.6} fill={trim} />
      <rect x={baseX + 5.4} y={baseY - 4.6} width={1} height={4.6} fill={trim} />
      <rect x={baseX + 7.2} y={baseY - 4.6} width={1} height={4.6} fill={trim} />

      <rect x={baseX + 4} y={baseY - 1.6} width={4} height={1.6} fill="#3a2410" />

      <polygon
        points={`${baseX + 3},${baseY - 5.2} ${baseX + 9},${baseY - 5.2} ${baseX + 6},${baseY - 7}`}
        fill={trim}
      />
      <polygon
        points={`${baseX + 3.4},${baseY - 5.2} ${baseX + 8.6},${baseY - 5.2} ${baseX + 6},${baseY - 6.6}`}
        fill={graniteLt}
      />

      <rect x={baseX + 3.6} y={baseY - 9.4} width={4.8} height={2.2} fill={granite} />
      <rect x={baseX + 3.6} y={baseY - 9.4} width={4.8} height={0.4} fill={graniteDk} />
      <rect x={baseX + 3.6} y={baseY - 7.6} width={4.8} height={0.4} fill={graniteDk} />
      <rect x={baseX + 4} y={baseY - 9} width={0.4} height={1.4} fill="#3a2410" opacity="0.5" />
      <rect x={baseX + 5} y={baseY - 9} width={0.4} height={1.4} fill="#3a2410" opacity="0.5" />
      <rect x={baseX + 6.6} y={baseY - 9} width={0.4} height={1.4} fill="#3a2410" opacity="0.5" />
      <rect x={baseX + 7.6} y={baseY - 9} width={0.4} height={1.4} fill="#3a2410" opacity="0.5" />
      <text
        x={baseX + 6}
        y={baseY - 8.3}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={0.9}
        fontFamily='"Press Start 2P", monospace'
        fill={trim}
      >
        TEXAS
      </text>

      <path
        d={`M ${baseX + 3.4},${baseY - 9.4}
            A 2.6,2.6 0 0,1 ${baseX + 8.6},${baseY - 9.4}
            Z`}
        fill={granite}
      />
      <path
        d={`M ${baseX + 4.2},${baseY - 9.4}
            A 1.8,1.8 0 0,1 ${baseX + 7.8},${baseY - 9.4}
            Z`}
        fill={graniteLt}
        opacity={0.6}
      />
      {/* Vertical ribs on the dome to give it the Capitol grooved look */}
      {[0, 1, 2, 3, 4].map(i => {
        const angle = -Math.PI / 2 + (i - 2) * (Math.PI / 12)
        const r = 2.4
        const cx = baseX + 6
        const cy = baseY - 9.4
        const x1 = cx + r * Math.cos(angle)
        const y1 = cy + r * Math.sin(angle)
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={x1}
            y2={y1}
            stroke={graniteDk}
            strokeWidth={0.18}
            opacity={0.4}
          />
        )
      })}

      <rect
        x={baseX + 5.4}
        y={baseY - 12.4}
        width={1.2}
        height={0.4}
        fill={graniteDk}
      />
      <rect
        x={baseX + 5.5}
        y={baseY - 13.4}
        width={1}
        height={1}
        fill={trim}
        stroke={graniteDk}
        strokeWidth={0.15}
      />
      <path
        d={`M ${baseX + 5.4},${baseY - 13.4}
            A 0.6,0.6 0 0,1 ${baseX + 6.6},${baseY - 13.4}
            Z`}
        fill={graniteDk}
      />

      <rect x={baseX + 5.92} y={baseY - 15} width={0.16} height={1.6} fill="#3a2410" />
      <rect x={baseX + 5.7} y={baseY - 16} width={0.6} height={0.7} fill={trim} />
      <rect x={baseX + 5.85} y={baseY - 16.4} width={0.3} height={0.4} fill="#3a2410" />
    </g>
  )
}

/* ─────────────────────────  Connectors / path  ───────────────────────── */

function Bridge({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  const w = x2 - x1
  return (
    <g>
      <rect x={x1} y={y} width={w} height={1.2} fill="#a4763a" />
      <rect x={x1} y={y - 0.6} width={w} height={0.6} fill="#7a5326" />
      {Array.from({ length: Math.max(2, Math.round(w / 1.2)) }).map((_, i) => (
        <rect
          key={i}
          x={x1 + 0.3 + i * (w / Math.max(2, Math.round(w / 1.2)))}
          y={y - 1.6}
          width={0.4}
          height={1}
          fill="#7a5326"
        />
      ))}
    </g>
  )
}

/**
 * Visual dotted-trail between level nodes. Mirrors LEVELS positions in
 * src/data/levels.ts.
 */
function DottedPath() {
  const points: [number, number][] = [
    [10, 46],
    [30, 30],
    [48, 44],
    [70, 26],
    [84, 14],
    [114, 16],
    [122, 38],
  ]
  const dots: { x: number; y: number }[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i]
    const [bx, by] = points[i + 1]
    const steps = 14
    for (let s = 1; s < steps; s++) {
      const t = s / steps
      dots.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t })
    }
  }
  return (
    <g>
      {dots.map((d, i) => (
        <rect
          key={i}
          x={d.x - 0.5}
          y={d.y - 0.5}
          width={1}
          height={1}
          fill="#fff7c2"
          stroke="#7a5326"
          strokeWidth={0.15}
        />
      ))}
    </g>
  )
}
