// Procedural sound: every effect is synthesized with WebAudio, no audio files,
// no network. Created lazily on the first user gesture; every call is a no-op
// when there is no audio context (headless screenshots, muted tabs).
export function createAudio() {
  let ctx = null;
  let master = null;
  let wind = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst({ duration, type = 'lowpass', frequency = 1200, gain = 0.5, decay = 0.08 }) {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(duration + 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + decay);
    source.connect(filter).connect(amp).connect(master);
    source.start(t);
    source.stop(t + duration + 0.05);
  }

  function tone({ frequency, end = null, duration = 0.12, type = 'sine', gain = 0.25, when = 0 }) {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t);
    if (end !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, end), t + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(amp).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  return {
    unlock() { ensure(); },
    shot(kind) {
      if (kind === 'smg') burst({ duration: 0.09, frequency: 2600, gain: 0.4, decay: 0.07 });
      else if (kind === 'dmr') { burst({ duration: 0.22, frequency: 900, gain: 0.65, decay: 0.16 }); tone({ frequency: 160, end: 55, duration: 0.18, type: 'sine', gain: 0.35 }); }
      else if (kind === 'pistol') burst({ duration: 0.08, frequency: 3200, gain: 0.32, decay: 0.06 });
      else { burst({ duration: 0.11, frequency: 1800, gain: 0.5, decay: 0.09 }); tone({ frequency: 130, end: 60, duration: 0.1, type: 'sine', gain: 0.22 }); }
    },
    distantShot() { burst({ duration: 0.12, frequency: 700, gain: 0.14, decay: 0.1 }); },
    hit() { tone({ frequency: 1900, duration: 0.05, type: 'square', gain: 0.12 }); },
    kill() { tone({ frequency: 660, duration: 0.09, type: 'triangle', gain: 0.22 }); tone({ frequency: 990, duration: 0.12, type: 'triangle', gain: 0.2, when: 0.08 }); },
    hurt() { tone({ frequency: 220, end: 110, duration: 0.16, type: 'sawtooth', gain: 0.18 }); },
    reload() { tone({ frequency: 1400, duration: 0.04, type: 'square', gain: 0.1 }); tone({ frequency: 900, duration: 0.04, type: 'square', gain: 0.1, when: 0.18 }); },
    dryClick() { tone({ frequency: 2400, duration: 0.03, type: 'square', gain: 0.08 }); },
    plantBeep() { tone({ frequency: 1200, duration: 0.07, type: 'square', gain: 0.16 }); },
    plantDone() { tone({ frequency: 880, duration: 0.1, type: 'triangle', gain: 0.22 }); tone({ frequency: 1320, duration: 0.14, type: 'triangle', gain: 0.2, when: 0.1 }); },
    explosion() {
      burst({ duration: 0.9, frequency: 420, gain: 0.9, decay: 0.85 });
      tone({ frequency: 90, end: 28, duration: 0.9, type: 'sine', gain: 0.6 });
    },
    roundWin() { [523, 659, 784].forEach((f, i) => tone({ frequency: f, duration: 0.16, type: 'triangle', gain: 0.2, when: i * 0.11 })); },
    roundLose() { [392, 330, 262].forEach((f, i) => tone({ frequency: f, duration: 0.18, type: 'triangle', gain: 0.18, when: i * 0.12 })); },
    step() { burst({ duration: 0.04, frequency: 500, gain: 0.05, decay: 0.035 }); },
    buy() { tone({ frequency: 1046, duration: 0.06, type: 'triangle', gain: 0.14 }); tone({ frequency: 1568, duration: 0.08, type: 'triangle', gain: 0.12, when: 0.06 }); },
    wind(on) {
      if (!ensure()) return;
      if (on && !wind) {
        const source = ctx.createBufferSource();
        source.buffer = noiseBuffer(2);
        source.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 320;
        const amp = ctx.createGain();
        amp.gain.value = 0.045;
        source.connect(filter).connect(amp).connect(master);
        source.start();
        wind = { source, amp };
      } else if (!on && wind) {
        try { wind.source.stop(); } catch { /* already stopped */ }
        wind = null;
      }
    },
  };
}
