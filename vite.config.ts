import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path is environment-aware so the same build can target either
// GitHub Pages (served at /<repo>/) or a root-served host like Render.
//
// - Default: '/' — works for Render static sites and any custom domain.
// - VITE_DEPLOY_TARGET=github-pages -> '/ai-workshop-hello/' to match
//   the GitHub Pages project URL.
// - VITE_BASE=<value> still wins as an explicit override for one-off builds.
const deployTarget = process.env.VITE_DEPLOY_TARGET
const inferredBase = deployTarget === 'github-pages' ? '/ai-workshop-hello/' : '/'
const base = process.env.VITE_BASE ?? inferredBase

export default defineConfig({
  base,
  plugins: [react()],
})
