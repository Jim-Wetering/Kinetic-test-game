// ---------------------------------------------------------------- audio
let AC = null, noiseBuf = null, stepSide = 1;
// browsers only allow audio after a user gesture, so this runs when a run starts
export function initAudio() {
  if (!AC) {
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { AC = null; }
  }
  if (AC && AC.state === 'suspended') AC.resume();
}
// one footfall: a low thump plus a filtered noise scuff. faster = brighter, punchier, louder;
// crouching = soft and muffled; wallrun steps ring a little higher off the wall
export function footstep(speed, crouch, wall) {
  if (!AC) return;
  const t = AC.currentTime, k = Math.min(speed / 25, 1), rnd = () => 0.9 + Math.random() * 0.2;
  const vol = crouch ? 0.4 : 0.55 + k * 0.6;
  let out = AC.destination;
  if (AC.createStereoPanner) {
    const p = AC.createStereoPanner(); p.pan.value = (stepSide = -stepSide) * 0.15; p.connect(out); out = p;
  }
  const thumpF = (crouch ? 65 : 85 + k * 55) * (wall ? 1.4 : 1) * rnd(), thumpDur = crouch ? 0.12 : 0.1 - k * 0.04;
  const o = AC.createOscillator(), og = AC.createGain();
  o.frequency.setValueAtTime(thumpF * 1.8, t); o.frequency.exponentialRampToValueAtTime(thumpF, t + 0.04);
  og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.12 * vol, t + 0.004);
  og.gain.exponentialRampToValueAtTime(0.0001, t + thumpDur);
  o.connect(og).connect(out); o.start(t); o.stop(t + thumpDur + 0.02);
  const scuffDur = crouch ? 0.14 : 0.09 - k * 0.03;
  const n = AC.createBufferSource(), f = AC.createBiquadFilter(), ng = AC.createGain();
  n.buffer = noiseBuf;
  f.type = crouch ? 'lowpass' : 'bandpass';
  f.frequency.value = (crouch ? 900 : 1100 + k * 3000) * (wall ? 1.5 : 1) * rnd(); f.Q.value = 0.7 + k * 1.3;
  ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(0.06 * vol * (0.6 + k), t + 0.003);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + scuffDur);
  n.connect(f).connect(ng).connect(out); n.start(t, Math.random() * 1.5, scuffDur + 0.02);
}
export function sfx(f1, f2, dur, type = 'sine', vol = 0.15) {
  if (!AC) return;
  const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(Math.max(f2, 1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(AC.destination); o.start(t); o.stop(t + dur + 0.02);
}
