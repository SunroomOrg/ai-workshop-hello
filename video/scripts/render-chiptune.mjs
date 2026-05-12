#!/usr/bin/env node
/**
 * render-chiptune.mjs — Bake the Zelda Overworld 16-bit chiptune used in the
 * live site into a 16-bit PCM WAV so the Remotion intro video can play music.
 *
 * The note sequence + voicing parameters mirror src/hooks/useChiptune.ts:
 *   - lead: two square-wave oscillators per note, second detuned by +6 cents
 *   - bass: single triangle wave, Bb/F ostinato in eighth notes
 *   - per-voice ADSR (a:5ms d:50ms s:0.55 r:80ms for the lead;
 *                     a:4ms d:40ms s:0.6  r:50ms for the bass)
 *   - master ~5 kHz lowpass for warmth (here a one-pole IIR approximation
 *     of the biquad in the hook — close enough for the chiptune aesthetic)
 *   - slap delay ≈ 80ms, feedback 0.15, wet 0.22
 *
 * Output: ../public/chiptune.wav, 44.1 kHz mono, ~15.5 s.
 * Re-runnable: just `node scripts/render-chiptune.mjs` (or `npm run build-audio`).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.resolve(__dirname, "..", "public", "chiptune.wav");

const SR = 44100;
const TOTAL_SECONDS = 15.5;
const TOTAL_SAMPLES = Math.ceil(SR * TOTAL_SECONDS);

// ── Tempo / note durations (132 BPM, same as the live hook) ────────────
const BPM = 132;
const beat = 60 / BPM;
const e = beat / 2; // eighth
const q = beat; // quarter
const h = beat * 2; // half
const w = beat * 4; // whole

/**
 * Lead — Hyrule Overworld melody in Bb major, copied from
 * src/hooks/useChiptune.ts (16 bars, ~29s loop). The full sequence is
 * scheduled and any notes past TOTAL_SECONDS are truncated; for a 15.5s
 * bake that's Phrase A (the iconic opening) plus the first beats of
 * Phrase B's climb.
 */
const lead = [
  ["F5", q + e], ["F5", e], ["F5", q], ["F5", q],
  ["F5", h], [null, h],
  ["Eb5", q], ["D5", q], ["C5", q], ["Bb4", q],
  ["Bb4", h], [null, h],
  ["C5", q], ["D5", q], ["Eb5", q], ["F5", q],
  ["G5", h], ["F5", h],
  ["Eb5", q], ["D5", q], ["Eb5", q], ["F5", q],
  ["Eb5", w],
  ["Bb4", q], ["C5", q], ["D5", q], ["Eb5", q],
  ["F5", h], ["G5", h],
  ["Ab5", q], ["G5", q], ["F5", q], ["Eb5", q],
  ["D5", w],
  ["C5", q], ["D5", q], ["Eb5", q], ["F5", q],
  ["Bb5", h], ["Ab5", h],
  ["G5", q], ["F5", q], ["Eb5", q], ["D5", q],
  ["C5", q], ["Bb4", q], ["F4", q], ["Bb4", q],
];

const ostinato = ["Bb2", "F3", "Bb2", "F3", "Bb2", "F3", "Bb2", "F3"];
const bass = [];
for (let bar = 0; bar < 16; bar++) {
  for (const n of ostinato) bass.push([n, e]);
}

/** "Bb3" / "F#5" / "A4" → Hz (A4 = 440). */
function noteHz(note) {
  const m = note.match(/^([A-G])([#b]?)(\d+)$/);
  if (!m) return 440;
  const [, letter, accidental, octStr] = m;
  const baseSemi = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let semi = baseSemi[letter];
  if (accidental === "#") semi++;
  if (accidental === "b") semi--;
  const oct = parseInt(octStr, 10);
  const midi = (oct + 1) * 12 + semi;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const mix = new Float32Array(TOTAL_SAMPLES);

/**
 * Render a layered voice into the mix buffer at `when` seconds. One or more
 * oscillators (each with its own waveform and cents-detune) share a single
 * ADSR envelope. Matches the hook's `playVoice` semantics.
 */
function playVoice(note, when, dur, opts) {
  const {
    waves,
    detunes = waves.map(() => 0),
    peak,
    attack = 0.005,
    decay = 0.05,
    sustain = 0.55,
    release = 0.08,
  } = opts;

  // Same dur-aware clamp the hook does so very short notes still get a
  // meaningful attack+decay shape.
  const a = Math.min(attack, dur * 0.4);
  const d = Math.min(decay, Math.max(0.001, dur * 0.4));
  const sustainV = peak * sustain;
  const releaseEnd = when + dur + release;
  const startS = Math.max(0, Math.floor(when * SR));
  const endS = Math.min(TOTAL_SAMPLES, Math.ceil(releaseEnd * SR));
  if (endS <= startS) return;

  const freq = noteHz(note);
  const omegas = detunes.map(
    (c) => (2 * Math.PI * freq * Math.pow(2, c / 1200)) / SR,
  );
  const phases = waves.map(() => 0);

  for (let s = startS; s < endS; s++) {
    const t = s / SR - when;
    let env;
    if (t < a) env = (t / a) * peak;
    else if (t < a + d) env = peak + (sustainV - peak) * ((t - a) / d);
    else if (t < dur) env = sustainV;
    else {
      const rt = (t - dur) / release;
      env = sustainV * Math.max(0, 1 - rt);
    }
    let sum = 0;
    for (let i = 0; i < waves.length; i++) {
      phases[i] += omegas[i];
      const p = phases[i];
      let v;
      switch (waves[i]) {
        case "square":
          v = Math.sin(p) >= 0 ? 1 : -1;
          break;
        case "triangle":
          v = (2 / Math.PI) * Math.asin(Math.sin(p));
          break;
        default:
          v = Math.sin(p);
      }
      sum += v;
    }
    mix[s] += env * sum;
  }
}

// Tiny pre-roll so the song lines up with the visual after the CRT flash
// (frames 0–18 ≈ 0.6s) and the first lead notes don't smear into the
// black-bar reveal. 0.05s is barely audible but breathes nicely.
const PRE_ROLL = 0.05;

let when = PRE_ROLL;
for (const [note, dur] of lead) {
  if (when >= TOTAL_SECONDS) break;
  if (note) {
    playVoice(note, when, dur, {
      waves: ["square", "square"],
      detunes: [0, 6],
      peak: 0.22,
      attack: 0.005,
      decay: 0.05,
      sustain: 0.55,
      release: 0.08,
    });
  }
  when += dur;
}

when = PRE_ROLL;
for (const [note, dur] of bass) {
  if (when >= TOTAL_SECONDS) break;
  if (note) {
    playVoice(note, when, dur, {
      waves: ["triangle"],
      peak: 0.42,
      attack: 0.004,
      decay: 0.04,
      sustain: 0.6,
      release: 0.05,
    });
  }
  when += dur;
}

// ── Master lowpass (one-pole IIR @ ~5 kHz) ────────────────────────────
// Not a true biquad, but at fc≈5 kHz on chiptune content the audible
// difference is "warm enough" — and it's a single multiply-add per sample.
const FC = 5000;
const alpha = 1 - Math.exp((-2 * Math.PI * FC) / SR);
{
  let y = 0;
  for (let s = 0; s < mix.length; s++) {
    y += alpha * (mix[s] - y);
    mix[s] = y;
  }
}

// ── Slap delay: 80 ms, feedback 0.15, wet 0.22 ────────────────────────
{
  const delaySamples = Math.round(0.08 * SR);
  const feedback = 0.15;
  const wet = 0.22;
  const line = new Float32Array(mix.length);
  for (let s = 0; s < mix.length; s++) {
    const tap = s - delaySamples >= 0 ? line[s - delaySamples] : 0;
    line[s] = mix[s] + feedback * tap;
    mix[s] = mix[s] + wet * tap;
  }
}

// ── 5 ms hard-edge guard fade at the very start/end so the WAV body
// itself never clicks even if Remotion's frame-based volume envelope is
// bypassed. Remotion still does the 0–10 / 440–450 fade on top.
const guardFadeSamples = Math.round(0.005 * SR);
for (let s = 0; s < guardFadeSamples && s < mix.length; s++) {
  const k = s / guardFadeSamples;
  mix[s] *= k;
  mix[mix.length - 1 - s] *= k;
}

// ── Normalize peak to ~0.9 to make full use of 16-bit headroom ────────
let peakAbs = 0;
for (let s = 0; s < mix.length; s++) {
  const a2 = Math.abs(mix[s]);
  if (a2 > peakAbs) peakAbs = a2;
}
const normGain = peakAbs > 0 ? 0.9 / peakAbs : 1;
for (let s = 0; s < mix.length; s++) mix[s] *= normGain;

// ── Hand-rolled 16-bit PCM WAV writer (mono) ──────────────────────────
function writeWav(filePath, samples, sampleRate) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataLen = samples.length * 2;
  const buf = Buffer.alloc(44 + dataLen);
  let off = 0;
  buf.write("RIFF", off); off += 4;
  buf.writeUInt32LE(36 + dataLen, off); off += 4;
  buf.write("WAVE", off); off += 4;
  buf.write("fmt ", off); off += 4;
  buf.writeUInt32LE(16, off); off += 4; // PCM fmt chunk size
  buf.writeUInt16LE(1, off); off += 2; // PCM format
  buf.writeUInt16LE(numChannels, off); off += 2;
  buf.writeUInt32LE(sampleRate, off); off += 4;
  buf.writeUInt32LE(byteRate, off); off += 4;
  buf.writeUInt16LE(blockAlign, off); off += 2;
  buf.writeUInt16LE(bitsPerSample, off); off += 2;
  buf.write("data", off); off += 4;
  buf.writeUInt32LE(dataLen, off); off += 4;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), off);
    off += 2;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buf);
}

writeWav(OUT_PATH, mix, SR);
const sizeKb = (fs.statSync(OUT_PATH).size / 1024).toFixed(1);
console.log(
  `wrote ${OUT_PATH}  (${sizeKb} KB, ${(mix.length / SR).toFixed(2)}s mono @ ${SR}Hz)`,
);
