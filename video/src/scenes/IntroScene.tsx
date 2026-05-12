import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig, Sequence } from "remotion";
import { MapBackground, MAP_VIEWBOX, MAP_VIEWBOX_X, MAP_VIEWBOX_Y, MAP_VIEWBOX_W, MAP_VIEWBOX_H } from "./MapBackground";
import { LevelCoin, SparkleBurst } from "./LevelCoin";
import { Chibi, ChibiShadow } from "./Chibi";
import { LEVELS } from "../levels";
import { PIXEL_FONT_STACK } from "../font";

/**
 * Timeline (30 fps, total 450 frames = 15s):
 *   0–18    CRT power-on flash → parchment fade-in
 *   18–60   "PRESS START" pre-title under small wordmark
 *   60–105  Title reveal (spring) + tagline
 *   105–180 Camera zooms from wordmark into the world map
 *   180–330 Chibi walks all 7 levels, sparkles + floating world labels
 *   330–390 Final node + Capitol glow, "FINAL CASTLE: PROBABLY"
 *   390–450 Camera zooms back out, URL CTA
 */

const PARCHMENT = "#fdf6dd";
const INK = "#2a1a0c";

// ─── Sub-scene timing (frames) ─────────────────────────────────────────
const CRT_END = 18;
const PRESS_START_END = 60;
const TITLE_END = 105;
const ZOOM_IN_END = 180;
const WALK_END = 330;
const CAPITOL_END = 390;
// rest is outro to 450

export function IntroScene() {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#1a1208",
        fontFamily: PIXEL_FONT_STACK,
        color: INK,
        overflow: "hidden",
      }}
    >
      {/* Persistent parchment + map layers — camera transforms control them */}
      <MapStage frame={frame} />

      {/* Title text layer — also subject to the camera transform */}
      <TitleStage frame={frame} />

      {/* CRT power-on flash on top */}
      {frame < CRT_END + 6 && <CrtFlash frame={frame} />}

      {/* Final outro CTA on top */}
      {frame >= CAPITOL_END - 10 && <OutroCta frame={frame} />}

      {/* Subtle scanlines on top of everything */}
      <Scanlines />
    </AbsoluteFill>
  );
}

/* ──────────────────────────  CRT power-on  ─────────────────────────── */
function CrtFlash({ frame }: { frame: number }) {
  if (frame >= CRT_END) return null;
  const phase = frame / CRT_END;
  const flash = phase < 0.45
    ? interpolate(phase, [0, 0.3, 0.45], [0, 1, 0.6])
    : interpolate(phase, [0.45, 1], [0.6, 0]);
  const blackBars = phase < 0.5
    ? interpolate(phase, [0, 0.5], [50, 0])
    : 0;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: `${blackBars}%`,
          background: "#000",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: `${blackBars}%`,
          background: "#000",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "#fff",
          opacity: flash * 0.95,
        }}
      />
    </AbsoluteFill>
  );
}

/* ──────────────────────────  Map stage  ─────────────────────────── */
function MapStage({ frame }: { frame: number }) {
  // Camera math: at zoom=1 the parchment fills the screen and the map is
  // tucked behind a centred wordmark. At zoom=mapZoom the world map fills
  // the frame at full map view. We interpolate the transform in screen
  // coords so the same DOM moves cleanly.
  const cam = cameraTransform(frame);

  return (
    <AbsoluteFill
      style={{
        background: PARCHMENT,
        opacity: interpolate(frame, [CRT_END - 6, CRT_END + 4], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      }}
    >
      {/* Parchment grain overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(rgba(122, 83, 38, 0.08) 1.5px, transparent 1.5px)",
          backgroundSize: "8px 8px",
          opacity: 0.6,
        }}
      />

      {/* Map sized to fill 1920x1080 at zoom=1, then transformed */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${cam.scale}) translate(${cam.tx}px, ${cam.ty}px)`,
          transformOrigin: "50% 50%",
          opacity: cam.mapOpacity,
        }}
      >
        <MapWithOverlays frame={frame} />
      </div>
    </AbsoluteFill>
  );
}

/** Returns transform values (scale, translate, mapOpacity) per frame. */
function cameraTransform(frame: number) {
  // Phases:
  //   < ZOOM_IN_START: small/dim map, parchment dominant
  //   ZOOM_IN_START → ZOOM_IN_END: zoom + fade to full map
  //   WALK + CAPITOL: hold at full map
  //   CAPITOL_END → end: zoom out for outro
  const ZOOM_IN_START = TITLE_END;
  const ZOOM_OUT_START = CAPITOL_END;

  if (frame < ZOOM_IN_START) {
    return { scale: 0.55, tx: 0, ty: 60, mapOpacity: 0.18 };
  }
  if (frame < ZOOM_IN_END) {
    const t = (frame - ZOOM_IN_START) / (ZOOM_IN_END - ZOOM_IN_START);
    const eased = easeInOut(t);
    return {
      scale: interpolate(eased, [0, 1], [0.55, 1]),
      tx: interpolate(eased, [0, 1], [0, 0]),
      ty: interpolate(eased, [0, 1], [60, 0]),
      mapOpacity: interpolate(eased, [0, 1], [0.18, 1]),
    };
  }
  if (frame < ZOOM_OUT_START) {
    return { scale: 1, tx: 0, ty: 0, mapOpacity: 1 };
  }
  const t = Math.min(1, (frame - ZOOM_OUT_START) / 35);
  const eased = easeInOut(t);
  return {
    scale: interpolate(eased, [0, 1], [1, 0.7]),
    tx: 0,
    ty: interpolate(eased, [0, 1], [0, 30]),
    mapOpacity: interpolate(eased, [0, 1], [1, 0.55]),
  };
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/* ───────  The map + level coins + chibi walking, all sized 16:9  ──────── */
function MapWithOverlays({ frame }: { frame: number }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        imageRendering: "pixelated",
      }}
    >
      <div style={{ position: "absolute", inset: 0 }}>
        <MapBackground />
      </div>

      {/* Coins + chibi share the same SVG coordinate space as the map */}
      <svg
        viewBox={MAP_VIEWBOX}
        preserveAspectRatio="xMidYMid meet"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
        shapeRendering="crispEdges"
      >
        <CoinsLayer frame={frame} />
        <ChibiLayer frame={frame} />
        <CapitolGlow frame={frame} />
      </svg>

      {/* Floating world-name labels are rendered as DOM, mapped to SVG coords */}
      <FloatingLabels frame={frame} />
    </div>
  );
}

/* ─── Coins: pop in at zoom-in, then pop again when chibi visits ─── */
function CoinsLayer({ frame }: { frame: number }) {
  return (
    <g>
      {LEVELS.map((lv, i) => {
        const visit = visitFrame(i);
        const popIn = Math.max(
          0,
          Math.min(1, (frame - (ZOOM_IN_END_F - 30 + i * 4)) / 18),
        );
        const cleared = frame >= visit + 6;
        const popPhase = Math.max(0, Math.min(1, (frame - visit) / 14));
        const popScale = popPhase > 0 ? 1 + Math.sin(popPhase * Math.PI) * 0.35 : 1;
        const sparkProgress = Math.max(0, Math.min(1, (frame - visit) / 22));

        return (
          <g key={lv.id}>
            <LevelCoin
              level={lv}
              appearance={popIn}
              cleared={cleared}
              popScale={popScale}
            />
            <SparkleBurst x={lv.x} y={lv.y} progress={sparkProgress} />
          </g>
        );
      })}
    </g>
  );
}

const ZOOM_IN_END_F = ZOOM_IN_END;
const WALK_START = ZOOM_IN_END;
// Allocate the chibi walk over WALK_END - WALK_START frames across 6 segments.
const WALK_FRAMES = WALK_END - WALK_START;
const SEG_FRAMES = WALK_FRAMES / 6;

function visitFrame(i: number): number {
  // Frame at which the chibi is *at* level i.
  return Math.round(WALK_START + i * SEG_FRAMES);
}

// Chibi feet land on the coin. Adjusted for 1.6× scale (sprite is ~5.2 tall
// from origin to feet after scaling).
const CHIBI_FOOT_OFFSET = -6.4;

function chibiPosition(frame: number): { x: number; y: number; facing: 1 | -1 } {
  if (frame <= WALK_START) {
    const lv = LEVELS[0];
    return { x: lv.x, y: lv.y + CHIBI_FOOT_OFFSET, facing: 1 };
  }
  if (frame >= WALK_END) {
    const lv = LEVELS[LEVELS.length - 1];
    return { x: lv.x, y: lv.y + CHIBI_FOOT_OFFSET, facing: 1 };
  }
  const segT = (frame - WALK_START) / SEG_FRAMES;
  const segIdx = Math.floor(segT);
  const t = segT - segIdx;
  const eased = easeInOut(t);
  const a = LEVELS[segIdx];
  const b = LEVELS[Math.min(segIdx + 1, LEVELS.length - 1)];
  const x = a.x + (b.x - a.x) * eased;
  const ay = a.y + CHIBI_FOOT_OFFSET;
  const by = b.y + CHIBI_FOOT_OFFSET;
  const y = ay + (by - ay) * eased;
  const facing: 1 | -1 = b.x >= a.x ? 1 : -1;
  return { x, y, facing };
}

function ChibiLayer({ frame }: { frame: number }) {
  const { x, y, facing } = chibiPosition(frame);
  const bobFrame = (Math.floor(frame / 6) % 2) as 0 | 1;
  // Hide before the map zoom-in is far enough along to read.
  if (frame < TITLE_END - 5) return null;
  // 1.6x bigger than native sprite so she reads at 1080p.
  return (
    <g transform={`translate(${x} ${y}) scale(1.6)`}>
      <ChibiShadow />
      <Chibi facing={facing} bobFrame={bobFrame} />
    </g>
  );
}

function CapitolGlow({ frame }: { frame: number }) {
  const visit6 = visitFrame(6);
  const t = Math.max(0, Math.min(1, (frame - visit6) / 30));
  if (t <= 0) return null;
  const pulse = 0.5 + 0.5 * Math.sin(((frame - visit6) / 8) * Math.PI);
  const opacity = (0.35 + pulse * 0.25) * (1 - Math.max(0, (frame - CAPITOL_END) / 30));
  if (opacity <= 0) return null;
  return (
    <g>
      <circle
        cx={129}
        cy={26}
        r={9 + t * 3}
        fill="#fff7c2"
        opacity={opacity * 0.6}
      />
      <circle
        cx={129}
        cy={20}
        r={7 + t * 2}
        fill="#ffe17a"
        opacity={opacity * 0.5}
      />
    </g>
  );
}

/* ─── Floating world labels above the chibi at each visit ─── */
function FloatingLabels({ frame }: { frame: number }) {
  return (
    <>
      {LEVELS.map((lv, i) => {
        const visit = visitFrame(i);
        const lifeStart = visit - 3;
        const lifeEnd = visit + Math.min(SEG_FRAMES * 0.9, 28);
        if (frame < lifeStart || frame > lifeEnd) return null;
        const t = (frame - lifeStart) / (lifeEnd - lifeStart);
        const opacity = t < 0.15
          ? interpolate(t, [0, 0.15], [0, 1])
          : t > 0.7
          ? interpolate(t, [0.7, 1], [1, 0])
          : 1;
        const lift = interpolate(t, [0, 1], [0, -32]);
        // Convert SVG viewBox coordinates → screen percent. Anchor well
        // above the coin/chibi so the label hovers like a SMW world title.
        const left = ((lv.x - MAP_VIEWBOX_X) / MAP_VIEWBOX_W) * 100;
        const top = ((lv.y - 16 - MAP_VIEWBOX_Y) / MAP_VIEWBOX_H) * 100;
        return (
          <div
            key={lv.id}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: `${top}%`,
              transform: `translate(-50%, calc(-100% + ${lift}px))`,
              opacity,
              pointerEvents: "none",
              padding: "8px 14px",
              background: PARCHMENT,
              border: `4px solid ${INK}`,
              boxShadow: `5px 5px 0 rgba(0,0,0,0.35)`,
              fontSize: 18,
              letterSpacing: 1,
              whiteSpace: "nowrap",
              fontFamily: PIXEL_FONT_STACK,
              color: INK,
              imageRendering: "pixelated",
            }}
          >
            {lv.short}
          </div>
        );
      })}
      {/* "FINAL CASTLE: PROBABLY" banner for the closing beat */}
      <FinalCastleBanner frame={frame} />
    </>
  );
}

function FinalCastleBanner({ frame }: { frame: number }) {
  const start = visitFrame(6) + 16;
  const end = CAPITOL_END;
  if (frame < start || frame > end + 12) return null;
  const t = Math.max(0, Math.min(1, (frame - start) / (end - start)));
  const opacity = t < 0.15
    ? interpolate(t, [0, 0.15], [0, 1])
    : t > 0.85
    ? interpolate(t, [0.85, 1], [1, 0])
    : 1;
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "8%",
        transform: "translate(-50%, 0)",
        background: INK,
        color: "#fff7c2",
        padding: "16px 28px",
        border: "5px solid #fff7c2",
        boxShadow: "8px 8px 0 rgba(0,0,0,0.35)",
        fontSize: 28,
        letterSpacing: 2,
        opacity,
        fontFamily: PIXEL_FONT_STACK,
      }}
    >
      FINAL CASTLE : PROBABLY
    </div>
  );
}

/* ─────────────────────────  Title stage  ─────────────────────────── */
function TitleStage({ frame }: { frame: number }) {
  return (
    <>
      {/* Tiny pre-title wordmark + PRESS START blink (centred, parchment-tone) */}
      <Sequence from={CRT_END} durationInFrames={TITLE_END - CRT_END}>
        <PreTitle frame={frame} />
      </Sequence>

      {/* Hero title bouncing in */}
      <Sequence from={CRT_END + 30} durationInFrames={TITLE_END + 60 - (CRT_END + 30)}>
        <HeroTitle frame={frame} />
      </Sequence>
    </>
  );
}

function PreTitle({ frame }: { frame: number }) {
  // Visible from CRT_END..PRESS_START_END, then fades.
  const showStart = CRT_END;
  const showEnd = PRESS_START_END + 6;
  if (frame > showEnd + 12) return null;
  const opacity = frame < showStart
    ? 0
    : frame > showEnd
    ? Math.max(0, 1 - (frame - showEnd) / 12)
    : 1;
  // PRESS START blink: 16-frame cycle.
  const blink = Math.floor(frame / 8) % 2 === 0;
  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 36,
        opacity,
      }}
    >
      <div
        style={{
          fontSize: 36,
          letterSpacing: 4,
          color: INK,
          textShadow: "3px 3px 0 rgba(122,83,38,0.4)",
        }}
      >
        XEO'S CAPSULE
      </div>
      <div
        style={{
          fontSize: 24,
          letterSpacing: 4,
          color: INK,
          opacity: blink ? 1 : 0.05,
          padding: "10px 20px",
          border: `3px solid ${INK}`,
          background: "rgba(255,247,194,0.45)",
        }}
      >
        ▶ PRESS START
      </div>
    </AbsoluteFill>
  );
}

function HeroTitle({ frame }: { frame: number }) {
  const { fps } = useVideoConfig();
  // Spring-driven scale + drop-in for the wordmark.
  const heroStart = CRT_END + 30; // ~frame 48
  const heroLocal = frame - heroStart;
  if (heroLocal < 0) return null;
  const arrival = spring({
    frame: heroLocal,
    fps,
    config: { damping: 11, mass: 0.8 },
  });

  // Once we're zooming into the map (frame >= TITLE_END), shrink and fade the title up.
  const exitT = Math.max(0, Math.min(1, (frame - TITLE_END) / 35));
  const exitScale = interpolate(exitT, [0, 1], [1, 0.5]);
  const exitOpacity = interpolate(exitT, [0, 0.6, 1], [1, 0.3, 0]);
  const exitTy = interpolate(exitT, [0, 1], [0, -180]);

  const scale = (0.4 + 0.65 * arrival) * exitScale;
  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        opacity: exitOpacity,
        transform: `translateY(${exitTy}px)`,
      }}
    >
      <div
        style={{
          fontSize: 128 * 0.85,
          fontWeight: "bold",
          letterSpacing: 6,
          color: INK,
          padding: "30px 56px",
          background: PARCHMENT,
          border: `8px solid ${INK}`,
          boxShadow: "14px 14px 0 rgba(0,0,0,0.35)",
          transform: `scale(${scale})`,
          textShadow: "4px 4px 0 rgba(122,83,38,0.5)",
          imageRendering: "pixelated",
        }}
      >
        XEO'S CAPSULE
      </div>
      <div
        style={{
          fontSize: 28,
          letterSpacing: 3,
          color: INK,
          opacity: arrival * exitOpacity,
          background: "rgba(255,247,194,0.7)",
          padding: "10px 20px",
          border: `4px solid ${INK}`,
        }}
      >
        SEVEN WORLDS · ONE SAVE FILE
      </div>
    </AbsoluteFill>
  );
}

/* ─────────────────────────  Outro CTA  ─────────────────────────── */
function OutroCta({ frame }: { frame: number }) {
  const start = CAPITOL_END - 6;
  const t = Math.max(0, Math.min(1, (frame - start) / 30));
  const opacity = interpolate(t, [0, 0.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        paddingBottom: 80,
        gap: 24,
        opacity,
      }}
    >
      <div
        style={{
          fontSize: 68,
          fontWeight: "bold",
          letterSpacing: 5,
          color: INK,
          padding: "22px 40px",
          background: PARCHMENT,
          border: `6px solid ${INK}`,
          boxShadow: "10px 10px 0 rgba(0,0,0,0.35)",
        }}
      >
        XEO'S CAPSULE
      </div>
      <div
        style={{
          fontSize: 22,
          letterSpacing: 2,
          color: INK,
          background: "rgba(255,247,194,0.85)",
          padding: "10px 18px",
          border: `4px solid ${INK}`,
        }}
      >
        ▶ PRESS START · xeos-capsule.onrender.com
      </div>
    </AbsoluteFill>
  );
}

/* ─────────────────────────  Scanlines  ─────────────────────────── */
function Scanlines() {
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "multiply" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(0,0,0,0.08) 0px, rgba(0,0,0,0.08) 1px, transparent 1px, transparent 3px)",
          opacity: 0.55,
        }}
      />
    </AbsoluteFill>
  );
}
