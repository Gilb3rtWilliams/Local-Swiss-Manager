// Plays a short celebratory fanfare using the Web Audio API — no audio files needed.
export function playFanfare() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = new AudioCtx();

  // Simple ascending triumphant motif.
  const notes = [
    { freq: 523.25, time: 0.0, dur: 0.16 },  // C5
    { freq: 659.25, time: 0.16, dur: 0.16 }, // E5
    { freq: 783.99, time: 0.32, dur: 0.16 }, // G5
    { freq: 1046.5, time: 0.48, dur: 0.45 }, // C6 (held)
    { freq: 783.99, time: 0.95, dur: 0.14 }, // G5
    { freq: 1046.5, time: 1.10, dur: 0.55 }, // C6 (final)
  ];

  const now = ctx.currentTime;
  notes.forEach(n => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = n.freq;
    gain.gain.setValueAtTime(0, now + n.time);
    gain.gain.linearRampToValueAtTime(0.25, now + n.time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + n.time + n.dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + n.time);
    osc.stop(now + n.time + n.dur + 0.05);
  });

  setTimeout(() => ctx.close(), 2200);
}
