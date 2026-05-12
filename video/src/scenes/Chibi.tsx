/**
 * Pixel-art chibi sprite, ported from src/components/Avatar.tsx.
 * Frame-driven (no DOM state) so it renders deterministically inside Remotion.
 *
 * The sprite is centred on (0,0) in SVG coordinates and ~3.6 units tall.
 */
interface ChibiProps {
  facing?: 1 | -1;
  bobFrame?: 0 | 1;
}

export function Chibi({ facing = 1, bobFrame = 0 }: ChibiProps) {
  return (
    <g transform={`scale(${facing}, 1) translate(0, ${bobFrame === 0 ? 0 : -0.2})`}>
      <ChibiPixels />
    </g>
  );
}

function ChibiPixels() {
  const px = 0.36;
  const grid = [
    "...hhhhhh...",
    "..hhhhhhhh..",
    ".hhhhhhhhhh.",
    ".hhsssssshh.",
    ".hssssssssh.",
    ".hsswesswesh",
    ".hsseesseesh",
    ".hssssssssh.",
    ".hsspsmsspsh",
    ".hhsssssshh.",
    "..hhssssshh.",
    "...ssssss...",
    "..ddaadddd..",
    ".dddddddddd.",
    ".daddddddad.",
    ".dddddddddd.",
    "dddddddddddd",
    "....kkkk....",
  ];
  const colors: Record<string, string> = {
    h: "#1d1d1d",
    s: "#f4c89a",
    e: "#1d1d1d",
    w: "#ffffff",
    p: "#f29ac0",
    m: "#d63b2c",
    d: "#fdf6dd",
    a: "#f29ac0",
    k: "#3a2410",
    ".": "transparent",
  };
  const cols = 12;
  const rows = grid.length;
  const rects: { x: number; y: number; fill: string }[] = [];
  for (let j = 0; j < rows; j++) {
    const row = grid[j].padEnd(cols, ".").slice(0, cols);
    for (let i = 0; i < cols; i++) {
      const ch = row[i];
      if (ch === "." || !colors[ch]) continue;
      rects.push({
        x: i * px - (cols * px) / 2,
        y: j * px - (rows * px) / 2,
        fill: colors[ch],
      });
    }
  }
  return (
    <g>
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={px} height={px} fill={r.fill} />
      ))}
    </g>
  );
}

/** Small drop shadow you can place behind the chibi in SVG-space. */
export function ChibiShadow() {
  return <ellipse cx={0} cy={3.4} rx={1.6} ry={0.4} fill="#000" opacity={0.25} />;
}
