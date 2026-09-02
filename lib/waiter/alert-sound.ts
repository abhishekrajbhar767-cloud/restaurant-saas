// lib/waiter/alert-sound.ts
// Continuous "incoming call" style ring for the waiter app, synthesized with
// the Web Audio API — no audio asset to load, works offline, never 404s.
//
// Mobile autoplay policy: browsers create the AudioContext in a "suspended"
// state until a real user gesture happens. unlockAlertSound() must be called
// from inside a user event handler (wired to any first tap/key press and to
// the FREE/BUSY button). Until then the ring loop keeps ticking silently and
// starts ringing as soon as the context is unlocked.

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/**
 * Call from any real user gesture (tap/click/keypress). Resumes a suspended
 * context and plays a silent one-sample buffer — older iOS Safari only fully
 * unlocks the context after a buffer has started inside a gesture.
 */
export function unlockAlertSound() {
  const c = getContext();
  if (!c) return;
  if (c.state === 'suspended') void c.resume().catch(() => {});

  const state = c as AudioContext & { __unlocked?: boolean };
  if (!state.__unlocked) {
    const silent = c.createBuffer(1, 1, 22050);
    const source = c.createBufferSource();
    source.buffer = silent;
    source.connect(c.destination);
    source.start(0);
    state.__unlocked = true;
  }
}

function bell(c: AudioContext, freq: number, at: number, duration: number, peak: number) {
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, at);

  // Quiet octave-up overtone gives the sine a metallic, bell-like ring.
  const harmonic = c.createOscillator();
  harmonic.type = 'triangle';
  harmonic.frequency.setValueAtTime(freq * 2, at);

  const gain = c.createGain();
  const harmonicGain = c.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.012); // fast attack = sharp, attention-grabbing hit
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  harmonicGain.gain.setValueAtTime(0.0001, at);
  harmonicGain.gain.exponentialRampToValueAtTime(peak * 0.25, at + 0.012);
  harmonicGain.gain.exponentialRampToValueAtTime(0.0001, at + duration * 0.6);

  osc.connect(gain).connect(c.destination);
  harmonic.connect(harmonicGain).connect(c.destination);
  osc.start(at);
  osc.stop(at + duration);
  harmonic.start(at);
  harmonic.stop(at + duration * 0.6);
}

// One ring cycle: two quick bell hits ("brr-brr"), like a phone ringer.
function ringBurst(c: AudioContext) {
  const now = c.currentTime + 0.02;
  bell(c, 1567.98, now, 0.4, 0.85);
  bell(c, 1567.98, now + 0.45, 0.4, 0.85);
}

const RING_PERIOD_MS = 2400;

let ringActive = false;
let ringTimer: number | null = null;

/**
 * Ring continuously until stopRingLoop() is called. Each cycle re-checks the
 * AudioContext state, so if the context is still gesture-locked the loop
 * ticks silently and starts sounding the moment it unlocks.
 */
export function startRingLoop() {
  if (ringActive) return;
  ringActive = true;

  const cycle = () => {
    if (!ringActive) return;
    const c = getContext();
    if (c && c.state === 'running') ringBurst(c);
    ringTimer = window.setTimeout(cycle, RING_PERIOD_MS);
  };
  cycle();
}

/** Stops the loop immediately; any burst already scheduled plays out (<0.9s). */
export function stopRingLoop() {
  ringActive = false;
  if (ringTimer !== null) {
    clearTimeout(ringTimer);
    ringTimer = null;
  }
}
