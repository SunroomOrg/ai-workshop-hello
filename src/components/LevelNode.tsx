import type { Level } from '../data/types'

interface LevelNodeProps {
  level: Level
  isCurrent: boolean
  isCleared: boolean
  isLocked: boolean
  onSelect: (level: Level) => void
}

/**
 * SMW-style coin-stamped circle, plus a small label flag with the era.
 *  - Cleared levels show a star ★.
 *  - Locked levels show a padlock and dim out.
 *  - The current level pulses.
 */
export function LevelNode({
  level,
  isCurrent,
  isCleared,
  isLocked,
  onSelect,
}: LevelNodeProps) {
  const half = 3.6 // radius in viewBox units
  const labelText = level.era
  const labelW = labelText.length * 1.55 + 2
  const labelH = 3.4

  return (
    <g
      className={`level-node ${isCurrent ? 'is-current' : ''} ${
        isCleared ? 'is-cleared' : ''
      } ${isLocked ? 'is-locked' : ''}`}
      transform={`translate(${level.x}, ${level.y})`}
      onClick={() => onSelect(level)}
      role="button"
      tabIndex={0}
      aria-disabled={isLocked}
      aria-label={
        isLocked
          ? `Locked — clear earlier levels first. Level ${level.number}: ${level.title}, ${level.era}`
          : `${
              isCleared ? 'Replay' : 'Open'
            } level ${level.number}: ${level.title}, ${level.era}`
      }
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(level)
        }
      }}
    >
      <circle r={half + 0.6} fill="#000" opacity="0.25" cy={0.6} />

      <circle
        r={half}
        fill={isLocked ? '#c4c8d0' : level.accent ?? '#e8c34a'}
        stroke={isLocked ? '#5b606b' : '#7a5326'}
        strokeWidth={0.5}
      />
      <circle r={half - 1} fill="#fff7c2" opacity={isLocked ? 0.15 : 0.5} />

      {/* Symbol inside the coin: number / star / lock */}
      {isLocked ? (
        <PadlockGlyph />
      ) : isCleared ? (
        <StarGlyph />
      ) : (
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={4}
          fontWeight="bold"
          fontFamily='"Press Start 2P", system-ui, sans-serif'
          fill="#3a2410"
          style={{ pointerEvents: 'none' }}
        >
          {level.number}
        </text>
      )}

      {isCurrent && !isLocked && (
        <circle
          r={half + 1.4}
          fill="none"
          stroke="#fff"
          strokeWidth={0.6}
          className="level-node__pulse"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Era label flag */}
      <g style={{ pointerEvents: 'none' }}>
        <rect
          x={-labelW / 2}
          y={half + 0.8}
          width={labelW}
          height={labelH}
          fill={isLocked ? '#cfcfcf' : '#fdf6dd'}
          stroke="#2a1a0c"
          strokeWidth={0.3}
        />
        <text
          x={0}
          y={half + 0.8 + labelH / 2 + 0.1}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={1.6}
          fontFamily='"Press Start 2P", system-ui, sans-serif'
          fill="#2a1a0c"
        >
          {labelText}
        </text>
      </g>
    </g>
  )
}

function StarGlyph() {
  // Simple 5-point star using polygon, sized to fit a radius-3.6 coin.
  const points = [
    [0, -2.2],
    [0.6, -0.7],
    [2.1, -0.7],
    [0.9, 0.3],
    [1.4, 1.8],
    [0, 0.9],
    [-1.4, 1.8],
    [-0.9, 0.3],
    [-2.1, -0.7],
    [-0.6, -0.7],
  ]
    .map(p => p.join(','))
    .join(' ')
  return (
    <polygon
      points={points}
      fill="#fff7c2"
      stroke="#3a2410"
      strokeWidth={0.4}
      style={{ pointerEvents: 'none' }}
    />
  )
}

function PadlockGlyph() {
  // Cool gunmetal palette — chibi shape, tighter footprint than before so the
  // lock reads as one snug symbol inside the coin. Colors inlined to match the
  // way StarGlyph/coin colors live directly in the SVG.
  const body = '#a3a8b3'
  const stroke = '#4a4f5a'
  const shine = '#d8dce3'
  const keyhole = '#2a1a0c'
  return (
    <g style={{ pointerEvents: 'none' }}>
      <path
        d="M -0.7 -0.4 V -1.3 a 0.7 0.7 0 0 1 1.4 0 V -0.4"
        fill="none"
        stroke={stroke}
        strokeWidth={0.45}
        strokeLinecap="square"
      />
      <rect
        x={-1.2}
        y={-0.4}
        width={2.4}
        height={2.2}
        rx={0.3}
        ry={0.3}
        fill={body}
        stroke={stroke}
        strokeWidth={0.4}
      />
      <rect x={-0.95} y={-0.15} width={0.4} height={0.4} fill={shine} />
      <circle cx={0} cy={0.45} r={0.3} fill={keyhole} />
      <rect x={-0.13} y={0.45} width={0.26} height={0.85} fill={keyhole} />
    </g>
  )
}
