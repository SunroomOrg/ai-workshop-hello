import { useEffect, useRef } from 'react'

/**
 * 16-bit SNES-style soundtrack: an ear-trained encoding of the iconic
 * Legend of Zelda Overworld / Hyrule Field theme. Synthesis voicing is
 * intentionally beefier than a single NES square wave:
 *
 *   - Lead = two square-wave oscillators per note, the second detuned by
 *     +6 cents for chorus/fatness.
 *   - Bass = single triangle-wave oscillator (Bb / F ostinato).
 *   - Master bus = lowpass biquad filter (≈5kHz, Q≈0.6) for warmth, with
 *     a short slap-delay (≈80ms, feedback ≈0.15) for a touch of space.
 *   - All notes use a small ADSR envelope (a:5ms, d:50ms, s:0.55, r:80ms).
 *
 * Tempo is ~132 BPM (the original theme's tempo). The melody is encoded
 * in Bb so the famous "F5 ostinato → Eb-D-C descent → climbing answer"
 * shape is preserved. Tiny ear-test variations from the original are
 * possible — this is hand-encoded, not a sample.
 *
 * Exposes:
 *   - playClick():  short menu/select beep
 *   - playSecret(): triumphant ascending arpeggio for "stage cleared"
 *   - playJingle(): brief level-open twinkle
 *   - playJump():   tiny rising blip for the boss-run jump
 *   - playFail():   short low-pitched buzz when the boss-run resets
 * and reacts to the `muted` flag.
 */
export function useChiptune(muted: boolean) {
  const ctxRef = useRef<AudioContext | null>(null)
  const masterRef = useRef<GainNode | null>(null)
  const loopStopRef = useRef<(() => void) | null>(null)
  const mutedRef = useRef(muted)

  // Keep the ref in sync so the playClick/secret callbacks always read fresh.
  // Ref writes happen in an effect (not during render) to satisfy
  // `react-hooks/refs`; the playback callbacks read `mutedRef.current`
  // lazily so a one-frame lag here is inaudible in practice.
  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  /** Lazily build the AudioContext + signal chain on first user gesture. */
  const ensureContext = () => {
    if (ctxRef.current) return ctxRef.current
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    const ctx = new Ctx()

    // Signal chain:  voices → master gain → lowpass → destination
    //                                              ↘ slap-delay (feedback)
    //                                                          → destination
    const master = ctx.createGain()
    master.gain.value = mutedRef.current ? 0 : 0.07

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 5000
    filter.Q.value = 0.6

    const delay = ctx.createDelay(0.5)
    delay.delayTime.value = 0.08

    const feedback = ctx.createGain()
    feedback.gain.value = 0.15

    const wet = ctx.createGain()
    wet.gain.value = 0.22

    master.connect(filter)
    filter.connect(ctx.destination)
    filter.connect(delay)
    delay.connect(feedback)
    feedback.connect(delay)
    delay.connect(wet)
    wet.connect(ctx.destination)

    ctxRef.current = ctx
    masterRef.current = master
    return ctx
  }

  /** Convert e.g. "F#5", "Bb3" or "A4" to Hz (A4 = 440). */
  const noteHz = (note: string): number => {
    const m = note.match(/^([A-G])([#b]?)(\d+)$/)
    if (!m) return 440
    const [, letter, accidental, octStr] = m
    const baseSemitone: Record<string, number> = {
      C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
    }
    let semi = baseSemitone[letter]
    if (accidental === '#') semi++
    if (accidental === 'b') semi--
    const oct = parseInt(octStr, 10)
    const midi = (oct + 1) * 12 + semi
    return 440 * Math.pow(2, (midi - 69) / 12)
  }

  /**
   * Schedule a layered note (one or more parallel oscillators at the same
   * pitch, optionally detuned) with a shared ADSR envelope. Used by both
   * the looping melody and the SFX so everything has consistent voicing.
   */
  const playVoice = (
    note: string,
    when: number,
    dur: number,
    opts: {
      waves: OscillatorType[]
      /** Per-oscillator detune in cents. Defaults to 0 for each wave. */
      detunes?: number[]
      /** Peak gain (0–1ish) at the top of the attack. */
      peak: number
      attack?: number
      decay?: number
      /** 0–1 fraction of peak that the note holds at. */
      sustain?: number
      release?: number
    }
  ) => {
    const ctx = ctxRef.current
    const master = masterRef.current
    if (!ctx || !master) return

    const {
      waves,
      detunes = waves.map(() => 0),
      peak,
      attack = 0.005,
      decay = 0.05,
      sustain = 0.55,
      release = 0.08,
    } = opts

    // For very short notes, squeeze attack+decay into the first 80% of dur.
    const a = Math.min(attack, dur * 0.4)
    const d = Math.min(decay, Math.max(0.001, dur * 0.4))
    const sustainV = peak * sustain
    const sustainEnd = when + dur
    const releaseEnd = sustainEnd + release

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, when)
    gain.gain.linearRampToValueAtTime(peak, when + a)
    gain.gain.linearRampToValueAtTime(sustainV, when + a + d)
    if (sustainEnd > when + a + d) {
      gain.gain.setValueAtTime(sustainV, sustainEnd)
    }
    gain.gain.linearRampToValueAtTime(0.0001, releaseEnd)
    gain.connect(master)

    const freq = noteHz(note)
    for (let i = 0; i < waves.length; i++) {
      const osc = ctx.createOscillator()
      osc.type = waves[i]
      osc.frequency.value = freq
      osc.detune.value = detunes[i] ?? 0
      osc.connect(gain)
      osc.start(when)
      osc.stop(releaseEnd + 0.02)
    }
  }

  const startLoop = () => {
    const ctx = ensureContext()
    if (!ctx || !masterRef.current) return
    if (loopStopRef.current) return // already running

    // ── Tempo: 132 BPM (original Zelda Overworld is ~132) ──
    const BPM = 132
    const beat = 60 / BPM
    const e = beat / 2 // eighth note
    const q = beat // quarter
    const h = beat * 2 // half
    const w = beat * 4 // whole

    type Note = [string | null, number]

    /**
     * Lead — Hyrule Overworld melody, encoded by ear in Bb major.
     * 16 bars total (~29s at 132 BPM), then loops cleanly.
     *   Phrase A: heroic opening fanfare (F5 ostinato → descent → climb).
     *   Phrase B: climbing answer to the high Bb5 / Ab5 peak, then resolve.
     */
    const lead: Note[] = [
      // Phrase A — the iconic opening
      // Bar 1:  F5(q.) F5(e) F5(q) F5(q)
      ['F5', q + e], ['F5', e], ['F5', q], ['F5', q],
      // Bar 2:  F5(h)         · rest(h)
      ['F5', h], [null, h],
      // Bar 3:  Eb5 D5 C5 Bb4   — descent
      ['Eb5', q], ['D5', q], ['C5', q], ['Bb4', q],
      // Bar 4:  Bb4(h)        · rest(h)
      ['Bb4', h], [null, h],
      // Bar 5:  C5 D5 Eb5 F5    — climb
      ['C5', q], ['D5', q], ['Eb5', q], ['F5', q],
      // Bar 6:  G5(h)  F5(h)
      ['G5', h], ['F5', h],
      // Bar 7:  Eb5 D5 Eb5 F5   — turning figure
      ['Eb5', q], ['D5', q], ['Eb5', q], ['F5', q],
      // Bar 8:  Eb5(w)          — held resolution → into Phrase B
      ['Eb5', w],

      // Phrase B — the climbing answer
      // Bar 9:  Bb4 C5 D5 Eb5
      ['Bb4', q], ['C5', q], ['D5', q], ['Eb5', q],
      // Bar 10: F5(h)  G5(h)
      ['F5', h], ['G5', h],
      // Bar 11: Ab5 G5 F5 Eb5   — descent from peak
      ['Ab5', q], ['G5', q], ['F5', q], ['Eb5', q],
      // Bar 12: D5(w)           — held breath
      ['D5', w],
      // Bar 13: C5 D5 Eb5 F5    — climb again
      ['C5', q], ['D5', q], ['Eb5', q], ['F5', q],
      // Bar 14: Bb5(h) Ab5(h)   — climb to top
      ['Bb5', h], ['Ab5', h],
      // Bar 15: G5 F5 Eb5 D5    — descend
      ['G5', q], ['F5', q], ['Eb5', q], ['D5', q],
      // Bar 16: C5 Bb4 F4 Bb4   — resolve home
      ['C5', q], ['Bb4', q], ['F4', q], ['Bb4', q],
    ]

    /**
     * Triangle bass — the famous Bb / F ostinato in eighth notes.
     * 8 eighths per bar × 16 bars = 128 notes, exactly matching the lead.
     */
    const ostinato = ['Bb2', 'F3', 'Bb2', 'F3', 'Bb2', 'F3', 'Bb2', 'F3']
    const bass: Note[] = []
    for (let bar = 0; bar < 16; bar++) {
      for (const n of ostinato) bass.push([n, e])
    }

    let cancelled = false
    let nextLeadTime = ctx.currentTime + 0.2
    let nextBassTime = ctx.currentTime + 0.2

    const HORIZON = 2.0 // seconds ahead to schedule

    const schedule = () => {
      if (cancelled || !ctxRef.current) return
      const now = ctxRef.current.currentTime

      while (nextLeadTime < now + HORIZON) {
        for (const [note, dur] of lead) {
          if (note) {
            playVoice(note, nextLeadTime, dur, {
              waves: ['square', 'square'],
              detunes: [0, 6],
              peak: 0.22,
              attack: 0.005,
              decay: 0.05,
              sustain: 0.55,
              release: 0.08,
            })
          }
          nextLeadTime += dur
        }
      }

      while (nextBassTime < now + HORIZON) {
        for (const [note, dur] of bass) {
          if (note) {
            playVoice(note, nextBassTime, dur, {
              waves: ['triangle'],
              peak: 0.42,
              attack: 0.004,
              decay: 0.04,
              sustain: 0.6,
              release: 0.05,
            })
          }
          nextBassTime += dur
        }
      }
    }

    const id = window.setInterval(schedule, 200)
    schedule()
    loopStopRef.current = () => {
      cancelled = true
      window.clearInterval(id)
      loopStopRef.current = null
    }
  }

  // Keep the master gain in sync with the muted prop.
  useEffect(() => {
    if (masterRef.current) {
      masterRef.current.gain.value = muted ? 0 : 0.07
    }
  }, [muted])

  // Start music after the first user gesture (browsers block autoplay).
  useEffect(() => {
    const onFirstInteract = () => {
      ensureContext()
      if (ctxRef.current?.state === 'suspended') ctxRef.current.resume()
      startLoop()
      window.removeEventListener('pointerdown', onFirstInteract)
      window.removeEventListener('keydown', onFirstInteract)
    }
    window.addEventListener('pointerdown', onFirstInteract)
    window.addEventListener('keydown', onFirstInteract)
    return () => {
      window.removeEventListener('pointerdown', onFirstInteract)
      window.removeEventListener('keydown', onFirstInteract)
      loopStopRef.current?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Quick descending blip — like grabbing a rupee or selecting a menu item. */
  const playClick = () => {
    const ctx = ensureContext()
    if (!ctx || !masterRef.current || mutedRef.current) return
    const t0 = ctx.currentTime + 0.005
    const dur = 0.1

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, t0)
    gain.gain.linearRampToValueAtTime(0.32, t0 + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
    gain.connect(masterRef.current)

    // 2-square layered voicing for SNES-style chunkiness on click SFX too.
    for (const detune of [0, 6]) {
      const osc = ctx.createOscillator()
      osc.type = 'square'
      osc.detune.value = detune
      osc.frequency.setValueAtTime(990, t0)
      osc.frequency.exponentialRampToValueAtTime(440, t0 + 0.08)
      osc.connect(gain)
      osc.start(t0)
      osc.stop(t0 + dur + 0.02)
    }
  }

  /**
   * Triumphant ascending arpeggio — plays after the player clears a level
   * quiz. Fanfare in A major: A → C# → E → A (octave up), with triangle
   * bass under each note.
   */
  const playSecret = () => {
    const ctx = ensureContext()
    if (!ctx || !masterRef.current || mutedRef.current) return
    const t0 = ctx.currentTime + 0.02
    const sequence: [string, string, number][] = [
      // [lead, bass, duration]
      ['A5',  'A3',  0.16],
      ['C#6', 'A3',  0.16],
      ['E6',  'A3',  0.16],
      ['A6',  'A3',  0.55],
    ]
    let when = t0
    for (const [hi, lo, dur] of sequence) {
      playVoice(hi, when, dur, {
        waves: ['square', 'square'],
        detunes: [0, 6],
        peak: 0.32,
        sustain: 0.6,
        release: 0.1,
      })
      playVoice(lo, when, dur, {
        waves: ['triangle'],
        peak: 0.4,
        sustain: 0.65,
        release: 0.08,
      })
      when += dur
    }
  }

  /** Tiny ascending three-note "level open" twinkle when a node is entered. */
  const playJingle = () => {
    const ctx = ensureContext()
    if (!ctx || !masterRef.current || mutedRef.current) return
    const t0 = ctx.currentTime + 0.02
    const seq: [string, number][] = [
      ['E5', 0.08],
      ['A5', 0.08],
      ['C#6', 0.18],
    ]
    let when = t0
    for (const [n, dur] of seq) {
      playVoice(n, when, dur, {
        waves: ['square', 'square'],
        detunes: [0, 6],
        peak: 0.3,
        sustain: 0.55,
        release: 0.08,
      })
      when += dur
    }
  }

  /** Quick rising blip — used for boss-run jumps. Quieter than playClick. */
  const playJump = () => {
    const ctx = ensureContext()
    if (!ctx || !masterRef.current || mutedRef.current) return
    const t0 = ctx.currentTime + 0.005
    const dur = 0.09

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, t0)
    gain.gain.linearRampToValueAtTime(0.18, t0 + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
    gain.connect(masterRef.current)

    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.setValueAtTime(520, t0)
    osc.frequency.exponentialRampToValueAtTime(880, t0 + 0.07)
    osc.connect(gain)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }

  /**
   * Short low-pitched buzz / "ouch" — used when the boss-run resets after a
   * collision. ~150ms, square wave sliding down to suggest a goofy stumble.
   */
  const playFail = () => {
    const ctx = ensureContext()
    if (!ctx || !masterRef.current || mutedRef.current) return
    const t0 = ctx.currentTime + 0.005
    const dur = 0.18

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, t0)
    gain.gain.linearRampToValueAtTime(0.32, t0 + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
    gain.connect(masterRef.current)

    for (const detune of [0, 8]) {
      const osc = ctx.createOscillator()
      osc.type = 'square'
      osc.detune.value = detune
      osc.frequency.setValueAtTime(220, t0)
      osc.frequency.exponentialRampToValueAtTime(80, t0 + dur)
      osc.connect(gain)
      osc.start(t0)
      osc.stop(t0 + dur + 0.02)
    }
  }

  return { playClick, playSecret, playJingle, playJump, playFail }
}
