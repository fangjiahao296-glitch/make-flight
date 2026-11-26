// Sunset Red Canyon — synthesised sound.
//
// No audio files: every sound is built with WebAudio oscillators and
// filtered noise, so the game loads nothing over the network. The engine
// hum follows the throttle, and rings, crashes and landings get their
// own short cues. Sound starts only after the first user gesture, and
// M toggles mute.

export function createSound() {
  const sound = {
    ctx: null,
    master: null,
    engineOsc: null,
    engineOsc2: null,
    engineGain: null,
    muted: false,
    started: false,
  };

  function ensure() {
    if (sound.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      sound.ctx = new AC();
      sound.master = sound.ctx.createGain();
      sound.master.gain.value = 0.5;
      sound.master.connect(sound.ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  // Start the engine drone after a gesture.
  sound.start = function start() {
    if (sound.started || !ensure()) return;
    sound.started = true;
    const ctx = sound.ctx;
    sound.engineGain = ctx.createGain();
    sound.engineGain.gain.value = 0.0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    sound.engineOsc = ctx.createOscillator();
    sound.engineOsc.type = 'sawtooth';
    sound.engineOsc.frequency.value = 68;
    sound.engineOsc2 = ctx.createOscillator();
    sound.engineOsc2.type = 'sawtooth';
    sound.engineOsc2.frequency.value = 102;
    sound.engineOsc.connect(filter);
    sound.engineOsc2.connect(filter);
    filter.connect(sound.engineGain);
    sound.engineGain.connect(sound.master);
    sound.engineOsc.start();
    sound.engineOsc2.start();
  };

  // Engine pitch and volume follow the throttle.
  sound.engine = function engine(throttle, flying) {
    if (!sound.started || !sound.ctx) return;
    const t = sound.ctx.currentTime;
    const level = sound.muted ? 0 : flying ? 0.05 + throttle * 0.09 : 0.02;
    sound.engineGain.gain.setTargetAtTime(level, t, 0.1);
    sound.engineOsc.frequency.setTargetAtTime(58 + throttle * 66, t, 0.1);
    sound.engineOsc2.frequency.setTargetAtTime(87 + throttle * 99, t, 0.1);
  };

  function blip(freq, dur, type, gain, when = 0) {
    if (!sound.started || !sound.ctx || sound.muted) return;
    const ctx = sound.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t0 = ctx.currentTime + when;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(sound.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // Ring cleared: a bright two-note chime.
  sound.ring = function ring() {
    blip(880, 0.22, 'sine', 0.28);
    blip(1318, 0.3, 'sine', 0.22, 0.09);
  };

  // Missed ring: a dull low thud.
  sound.miss = function miss() {
    blip(160, 0.25, 'triangle', 0.2);
  };

  // Crash: a noise burst and a low boom.
  sound.crash = function crash() {
    if (!sound.started || !sound.ctx || sound.muted) return;
    const ctx = sound.ctx;
    const len = ctx.sampleRate * 0.4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    src.connect(filter);
    filter.connect(g);
    g.connect(sound.master);
    src.start();
    blip(70, 0.5, 'sine', 0.4);
  };

  // Landing: a short rising chord.
  sound.land = function land() {
    blip(523, 0.3, 'sine', 0.22);
    blip(659, 0.3, 'sine', 0.22, 0.12);
    blip(784, 0.45, 'sine', 0.24, 0.24);
  };

  sound.toggleMute = function toggleMute() {
    sound.muted = !sound.muted;
    if (sound.master) sound.master.gain.value = sound.muted ? 0 : 0.5;
    return sound.muted;
  };

  return sound;
}
