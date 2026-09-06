const fs = require('fs');
const path = require('path');

// 2s 16-bit PCM WAV, 44100 Hz, dual 440+480 Hz telephone ring with a 20 Hz tremolo.
const sampleRate = 44100;
const duration = 2;
const n = sampleRate * duration;
const data = Buffer.alloc(n * 2);
for (let i = 0; i < n; i++) {
  const t = i / sampleRate;
  const tremolo = 0.5 + 0.5 * Math.sin(2 * Math.PI * 20 * t);
  const sample = Math.sin(2 * Math.PI * 440 * t) * 0.45 + Math.sin(2 * Math.PI * 480 * t) * 0.45;
  const gated = t % 1 < 0.45 ? sample * tremolo : 0;
  data.writeInt16LE(Math.max(-1, Math.min(1, gated)) * 32767, i * 2);
}

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);

const outDir = path.join('public', 'sounds');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'ringtone.wav'), Buffer.concat([header, data]));
console.log('wrote', path.join(outDir, 'ringtone.wav'));
