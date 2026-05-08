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
        fill={isLocked ? '#7a7a7a' : level.accent ?? '#e8c34a'}
        stroke="#7a5326"
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
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={-1.4} y={-0.6} width={2.8} height={2.6} fill="#3a2410" />
      <path
        d="M -0.9 -0.6 V -1.6 a 0.9 0.9 0 0 1 1.8 0 V -0.6"
        fill="none"
        stroke="#3a2410"
        strokeWidth={0.5}
      />
      <rect x={-0.2} y={0.4} width={0.4} height={1} fill="#fff7c2" />
    </g>
  )
}
