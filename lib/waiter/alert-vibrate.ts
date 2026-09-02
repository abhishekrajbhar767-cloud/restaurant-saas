// lib/waiter/alert-vibrate.ts
// Continuous vibration loop for the waiter app — deliberately independent of
// alert-sound.ts so alerts still fire when the phone is on silent or the
// AudioContext failed to unlock.
//
// Pattern [1000, 500, 1000, 500] is 3s of vibration per fire; refiring every
// 3s makes it effectively continuous. navigator.vibrate is a no-op on
// browsers that don't support it (iOS Safari), where audio alone carries the
// alert.

const VIBRATE_PATTERN: number[] = [1000, 500, 1000, 500];
const FIRE_EVERY_MS = 3000;

let timer: number | null = null;

function fire() {
  navigator.vibrate?.(VIBRATE_PATTERN);
}

export function startVibrationLoop() {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  if (timer !== null) return;
  fire();
  timer = window.setInterval(fire, FIRE_EVERY_MS);
}

export function stopVibrationLoop() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  navigator.vibrate?.(0);
}
