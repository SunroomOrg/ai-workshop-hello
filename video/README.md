# video — Xeo's Capsule intro

A self-contained Remotion subproject that renders the 15-second intro
video for [Xeo's Capsule](https://xeos-capsule.onrender.com). It is
**not** wired into the main Vite build — install and render from inside
this directory.

## Format

| | |
|--|--|
| Resolution | 1920 × 1080 |
| Frame rate | 30 fps |
| Duration | 15.0 s (450 frames) |
| Codec | H.264 (default Remotion preset) |
| Output | `video/out/xeos-capsule-intro.mp4` |

## Scene breakdown

| Beat | Time | What happens |
|------|------|--------------|
| 1 | 0.0–0.6 s | CRT power-on flash → parchment fade-in |
| 2 | 0.6–2.0 s | "XEO'S CAPSULE" pre-title with blinking ▶ PRESS START |
| 3 | 2.0–3.5 s | Hero wordmark spring-bounces in, tagline "SEVEN WORLDS · ONE SAVE FILE" |
| 4 | 3.5–6.0 s | Camera zooms from wordmark into the SVG world map |
| 5 | 6.0–11.0 s | Chibi walks all 7 levels, sparkle bursts + floating world labels |
| 6 | 11.0–13.0 s | Capitol glow + "FINAL CASTLE : PROBABLY" banner |
| 7 | 13.0–15.0 s | Camera zooms back out, hero wordmark + URL CTA |

## Develop

```bash
cd video
npm install
npm run dev          # → opens Remotion Studio for previewing
```

## Render

```bash
cd video
npx remotion render XeosCapsuleIntro out/xeos-capsule-intro.mp4
```

Render takes ~30 s on an Apple Silicon Mac.

## Source layout

```
src/
  Root.tsx                  Composition registration (1920×1080 @30fps, 450 frames)
  Composition.tsx           Loads the Press Start 2P font, mounts IntroScene
  font.ts                   @remotion/google-fonts/PressStart2P loader
  levels.ts                 7-level data subset (id, era, x, y, accent…)
  scenes/
    IntroScene.tsx          Master timeline, camera, title cards, CTA
    MapBackground.tsx       Pure-SVG 16-bit world map (ported from src/components/MapBackground.tsx)
    LevelCoin.tsx           SMW-style level coin (ported from src/components/LevelNode.tsx)
    Chibi.tsx               Pixel-art sprite (ported from src/components/Avatar.tsx)
```

The map / coin / chibi components are **copies** of the corresponding
files under the main app's `src/components/`, with DOM state stripped
out so they render deterministically frame-to-frame in Remotion.

## TODO — audio

V1 ships with no audio track. To add the in-site Zelda Overworld synth
later, plumb something like:

```tsx
import { Audio } from 'remotion';
import overworld from '../public/overworld-bake.wav';
// inside IntroScene:
<Audio src={overworld} />
```

The current site generates audio in real time from
`src/audio/useChiptune.ts`; for the video we'd need to either pre-bake a
WAV/MP3 of the same melody (run the synth offline → record → drop into
`video/public/`) or port the Web-Audio synth into Remotion's
`<Audio />` pipeline. Either way is a separate workstream from the
visuals.
