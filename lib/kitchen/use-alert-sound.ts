'use client';

import { useCallback, useRef } from 'react';

// Section 21/22: KDS needs a loud, looping "new order" alert that (a) never
// stacks into multiple overlapping loops no matter how many new orders
// arrive, and (b) never assumes audio can play without a user gesture.
// Built on Web Audio (an oscillator beep) instead of an <audio src> file so
// there's no external asset to ship or go missing — unlock() must be called
// synchronously inside a click handler (Start Shift) or the AudioContext
// stays suspended per browser autoplay policy.
export function useAlertSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<number | null>(null);

  const unlock = useCallback(() => {
    if (!ctxRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctxRef.current = new Ctx();
    }
    if (ctxRef.current.state === 'suspended') {
      void ctxRef.current.resume();
    }
  }, []);

  const beep = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.state !== 'running') return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);

    // second, slightly higher chime right after, so it reads as an "alert"
    // rather than a single blip
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = 1108;
    gain2.gain.setValueAtTime(0.0001, ctx.currentTime + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.2);
    gain2.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.18);
    osc2.stop(ctx.currentTime + 0.6);
  }, []);

  const start = useCallback(() => {
    if (intervalRef.current !== null) return; // already looping — never stack a second interval
    beep();
    intervalRef.current = window.setInterval(beep, 2200);
  }, [beep]);

  const stop = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  return { unlock, start, stop };
}
