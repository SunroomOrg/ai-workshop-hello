import type { VideoLevel } from "../levels";
import { PIXEL_FONT_STACK } from "../font";

interface LevelCoinProps {
  level: VideoLevel;
  /** 0 → hidden, 1 → at full size. Drives a pop-in. */
  appearance?: number;
  /** True once the chibi has touched it; show a yellow star + glow. */
  cleared?: boolean;
  /** Extra additive scale for the touch-pop animation. */
  popScale?: number;
}

/**
 * Coin-stamped circle level node, ported from src/components/LevelNode.tsx.
 * Stripped of click/keyboard handlers; pure visual. Coordinate space matches
 * the world map SVG (140 × 60). Renders inside an <svg> alongside the map.
 */
export function LevelCoin({
  level,
  appearance = 1,
  cleared = false,
  popScale = 1,
}: LevelCoinProps) {
  const half = 3.6;
  const labelText = level.era;
  const labelW = labelText.length * 1.55 + 2;
  const labelH = 3.4;

  const a = Math.max(0, Math.min(1, appearance));
  const scale = a * popScale;

  return (
    <g transform={`translate(${level.x} ${level.y}) scale(${scale})`}>
      <circle r={half + 0.6} fill="#000" opacity={0.25} cy={0.6} />

      <circle
        r={half}
        fill={level.accent ?? "#e8c34a"}
        stroke="#7a5326"
        strokeWidth={0.5}
      />
      <circle r={half - 1} fill="#fff7c2" opacity={0.5} />

      {cleared ? (
        <StarGlyph />
      ) : (
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={4}
          fontWeight="bold"
          fontFamily={PIXEL_FONT_STACK}
          fill="#3a2410"
        >
          {level.number}
        </text>
      )}

      {cleared && (
        <circle
          r={half + 1.4}
          fill="none"
          stroke="#fff7c2"
          strokeWidth={0.5}
          opacity={0.7}
        />
      )}

      <g>
        <rect
          x={-labelW / 2}
          y={half + 0.8}
          width={labelW}
          height={labelH}
          fill="#fdf6dd"
          stroke="#2a1a0c"
          strokeWidth={0.3}
        />
        <text
          x={0}
          y={half + 0.8 + labelH / 2 + 0.1}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={1.6}
          fontFamily={PIXEL_FONT_STACK}
          fill="#2a1a0c"
        >
          {labelText}
        </text>
      </g>
    </g>
  );
}

function StarGlyph() {
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
    .map((p) => p.join(","))
    .join(" ");
  return (
    <polygon
      points={points}
      fill="#fff7c2"
      stroke="#3a2410"
      strokeWidth={0.4}
    />
  );
}

/** Sparkle burst that plays when the chibi touches a coin. */
export function SparkleBurst({
  x,
  y,
  progress,
}: {
  x: number;
  y: number;
  progress: number; // 0 → 1
}) {
  if (progress <= 0 || progress >= 1) return null;
  const opacity = 1 - progress;
  const r = 1.2 + progress * 4;
  const innerR = 0.6 + progress * 1.8;
  return (
    <g transform={`translate(${x} ${y})`} opacity={opacity}>
      <circle r={r} fill="none" stroke="#fff7c2" strokeWidth={0.6} />
      <circle r={innerR} fill="#fff" opacity={0.7} />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const angle = (i / 6) * Math.PI * 2;
        const dist = 2 + progress * 4;
        return (
          <rect
            key={i}
            x={Math.cos(angle) * dist - 0.3}
            y={Math.sin(angle) * dist - 0.3}
            width={0.6}
            height={0.6}
            fill="#fff7c2"
            stroke="#3a2410"
            strokeWidth={0.15}
          />
        );
      })}
    </g>
  );
}
