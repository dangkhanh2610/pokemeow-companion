export function playCooldownChime(type: 'wild' | 'fish'): void {
  if (typeof window === 'undefined') return;

  const AudioCtx = window.AudioContext;
  if (!AudioCtx) return;

  try {
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const firstFreq = type === 'wild' ? 659.25 : 587.33; // E5 or D5
    const secondFreq = type === 'wild' ? 880.0 : 783.99; // A5 or G5

    const playTone = (freq: number, startOffset: number, duration: number): void => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + startOffset);

      gain.gain.setValueAtTime(0.001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.08, now + startOffset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.02);
    };

    playTone(firstFreq, 0, 0.11);
    playTone(secondFreq, 0.09, 0.16);

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 500);
  } catch {
    // Ignore audio errors if browser blocks autoplay
  }
}
