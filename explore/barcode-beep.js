/**
 * Short checkout-style tones. No audio files — Web Audio keeps the intake self-contained.
 */

let ctx = null;

function audio() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(context, freq, start, duration, gain = 0.08) {
  const osc = context.createOscillator();
  const vol = context.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  vol.gain.setValueAtTime(0.0001, context.currentTime + start);
  vol.gain.exponentialRampToValueAtTime(gain, context.currentTime + start + 0.01);
  vol.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + start + duration);
  osc.connect(vol);
  vol.connect(context.destination);
  osc.start(context.currentTime + start);
  osc.stop(context.currentTime + start + duration + 0.02);
}

export function unlockBeep() {
  audio();
}

/** Immediate checkout confirmation. */
export function playSuccessBeep() {
  const c = audio();
  if (!c) return;
  tone(c, 1568, 0, 0.07, 0.09);
  tone(c, 2093, 0.08, 0.1, 0.09);
}

/** Distinct from a successful new-book scan. */
export function playDuplicateBeep() {
  const c = audio();
  if (!c) return;
  tone(c, 392, 0, 0.11, 0.07);
  tone(c, 311, 0.12, 0.14, 0.07);
}
