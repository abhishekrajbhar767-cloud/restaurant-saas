// lib/waiter/alert-sound.ts
// Loud synthesized "double bell" for new service requests on the waiter app.
// Web Audio API is synthesized at runtime — no audio asset to load, works
// offline, and never 404s.
//
// Mobile autoplay policy: browsers create the AudioContext in a "suspended"
// state until a real user gesture happens. unlockAlertSound() must be called
// from inside a user event handler (we wire it to any first tap/key press and
// to the FREE/BUSY button). Until unlocked, playRequestAlert() stays silent
// rather than throwing.

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

/**
 * Two rising bell rings (E6 then a higher A6) — loud and clearly distinct
 * from message/notification sounds a phone might already be making.
 */
export function playRequestAlert(): boolean {
  const c = getContext();
  if (!c || c.state !== 'running') return false; // not gesture-unlocked yet

  const now = c.currentTime + 0.02;
  bell(c, 1318.5, now, 0.35, 0.8); // first ring
  bell(c, 1760.0, now + 0.22, 0.5, 0.85); // higher second ring
  return true;
}
