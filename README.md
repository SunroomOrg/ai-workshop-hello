# Xeo's Capsule

A 16-bit Super Mario World–style overworld map that lets visitors click through
the decades of Lan's life. Built as a static React + Vite app, deployable to
either GitHub Pages or Render.

## Stack

- Vite + React + TypeScript
- Inline-SVG world map (original pixel-art, no copyrighted assets)
- Web Audio API procedural chiptune (no sample files)
- GitHub Pages deploy via GitHub Actions
- Render.com static site deploy via `render.yaml`

## Develop

```bash
npm install
npm run dev      # http://localhost:5173/
```

## Build

```bash
npm run build    # outputs to ./dist (base '/')
npm run preview  # serve the production build
```

The `base` path in `vite.config.ts` is environment-aware:

- Default: `/` — correct for Render and any root-served host.
- `VITE_DEPLOY_TARGET=github-pages npm run build` → `/ai-workshop-hello/` to
  match the GitHub Pages project URL.
- `VITE_BASE=<value> npm run build` is still respected as an explicit
  per-build override.

## Add / edit content

Each "level" on the map is one decade of Lan's life. Edit
`src/data/levels.ts` to add chapters and media to a level:

```ts
{
  id: 'decade-2',
  number: 2,
  era: '1995 – 2004',
  // ...
  chapters: [
    {
      year: 1998,
      heading: 'First school play',
      body: 'Long-form story text. Newlines\n\ncreate paragraphs.',
    },
  ],
  media: [
    { kind: 'photo', src: '/levels/decade-2/play.jpg', alt: 'On stage', caption: '5th grade play' },
    { kind: 'video', src: 'https://www.youtube.com/embed/...', title: 'Birthday clip', embed: true },
    { kind: 'audio', src: '/levels/decade-2/song.mp3', title: 'Mixtape track' },
  ],
}
```

Drop photos and videos into `public/levels/<level-id>/` and reference them by
absolute path (the `base` is applied automatically by Vite).

## Layout primer

- `src/components/MapBackground.tsx` — the SVG overworld (sky, water, biomes,
  castle, cabin, dotted path)
- `src/components/LevelNode.tsx` — clickable level circles with era labels
- `src/components/Avatar.tsx` — pixel sprite that walks between levels
- `src/components/LevelModal.tsx` — per-level story panel with prev/next
- `src/hooks/useChiptune.ts` — Web Audio chiptune + click SFX
- `src/data/levels.ts` — the timeline data (one level per decade)

## Deploy

Two deploy targets coexist; pick one (or run both — they don't conflict).

### GitHub Pages

Push to `main`. The `Deploy to GitHub Pages` workflow
(`.github/workflows/deploy.yml`) builds with `VITE_DEPLOY_TARGET=github-pages`
(so assets resolve under `/ai-workshop-hello/`) and publishes to the
`github-pages` environment. First run requires the repo's **Settings → Pages →
Build and deployment → Source** to be set to **GitHub Actions**.

### Render

One-time setup:

1. Sign in at <https://dashboard.render.com/>.
2. **+ Add New → Static Site**.
3. Connect GitHub and pick `SunroomOrg/ai-workshop-hello`.
4. Choose the branch to deploy (e.g. `main` or a feature branch for a preview).
5. Render auto-detects `render.yaml` at the repo root and pre-fills the
   service config. If for some reason it doesn't, set:
   - **Build command:** `npm ci && npm run build`
   - **Publish directory:** `dist`
6. Click **Create Static Site**.

Render builds with the default base (`/`), so no env vars need to be set.
Subsequent pushes to the connected branch auto-deploy. Pull requests get
preview URLs via `pullRequestPreviewsEnabled: true`. The default URL will be
`https://xeos-capsule.onrender.com/` (or whatever Render assigns if the name
is taken).
