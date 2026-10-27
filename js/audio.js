// Procedural WebAudio: engine, effects. No external assets.
export class SoundBank {
  constructor() { this.ctx = null; this.engine = null; this.started = false; }
  ensure() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = 0.35; this.master.connect(c.destination);
      // engine: own additive V6-style voice (harmonic stack at firing frequency, formant-shaped) + intake whine
      this.engineGain = c.createGain(); this.engineGain.gain.value = 0.0;
      this.shiftGain = c.createGain(); this.shiftGain.gain.value = 1;
      this.engineFilter = c.createBiquadFilter(); this.engineFilter.type = "lowpass"; this.engineFilter.frequency.value = 3000; this.engineFilter.Q.value = 0.7;
      // harmonic levels (dB, k-th multiple of HALF the firing frequency) measured from the spectrum of a real F1 V8 recording
      // (Ears68, CC0, freesound 181187): only the measured levels are used, no audio from that file
      const HDB = [0, 11.4, -9.4, 2.9, -11, -6.9, -14.8, -8.8, -16, -11.1, -18.4, -16.2, -20.3, -16.5, -21.2, -20, -21.7, -18.8, -23.3, -20.5, -25.6, -22, -26, -24.8, -25.2, -23.6, -26.3, -26.2, -26.1, -27.2];
      const N = HDB.length, re = new Float32Array(N + 1), im = new Float32Array(N + 1);
      for (let k = 1; k <= N; k++) im[k] = Math.pow(10, (HDB[k - 1] + 0.9 * Math.max(0, k - 6)) / 20); // +0.9 dB/harmonic above the 6th: brighter, closer to the user's reference clip
      const wave = c.createPeriodicWave(re, im);
      this.osc1 = c.createOscillator(); this.osc1.setPeriodicWave(wave);
      this.osc2 = c.createOscillator(); this.osc2.type = "sine"; this.osc2.detune.value = 0;
      const g2 = c.createGain(); g2.gain.value = 0;
      this.whine = c.createOscillator(); this.whine.type = "sine"; this.whineG = c.createGain(); this.whineG.gain.value = 0.02;
      this.osc1.connect(this.engineFilter); this.osc2.connect(g2); g2.connect(this.engineFilter);
      this.whine.connect(this.whineG); this.whineG.connect(this.engineFilter);
      this.engineFilter.connect(this.shiftGain); this.shiftGain.connect(this.engineGain); this.engineGain.connect(this.master);
      this.osc1.start(); this.osc2.start(); this.whine.start();
      { // broadband engine texture (rasp/intake/valvetrain), levels tuned toward the band balance of the user's reference clip
        const eb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), ed = eb.getChannelData(0); for (let i = 0; i < ed.length; i++) ed[i] = Math.random() * 2 - 1;
        const mk = (f, q) => { const src = c.createBufferSource(); src.buffer = eb; src.loop = true; const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = q; const g = c.createGain(); g.gain.value = 0; src.connect(bp); bp.connect(g); g.connect(this.shiftGain); src.start(); return g; };
        this.engNz1 = mk(2300, 0.55); this.engNz2 = mk(1400, 1.4);
      }
      this.gear = 0; this.shiftT = 0;
      // wind noise
      const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseSrc = c.createBufferSource(); this.noiseSrc.buffer = buf; this.noiseSrc.loop = true;
      this.noiseFilter = c.createBiquadFilter(); this.noiseFilter.type = "bandpass"; this.noiseFilter.frequency.value = 700; this.noiseFilter.Q.value = 0.6;
      this.noiseGain = c.createGain(); this.noiseGain.gain.value = 0;
      this.noiseSrc.connect(this.noiseFilter); this.noiseFilter.connect(this.noiseGain); this.noiseGain.connect(this.master);
      this.noiseSrc.start();
      this.started = true;
      // engine: user-approved Gemini clip, cut into 3 pitch-normalised loops (low 147 Hz, mid 495 Hz, high 677 Hz fundamental), pitch-shifted by playbackRate and crossfaded by rpm
      this.eng = { layers: [], ref: [147.4, 495.3, 677.1], ready: false };
      this.engS = c.createGain(); this.engS.gain.value = 0; this.engS.connect(this.master);
      ["low", "mid", "high"].forEach((n, i) => fetch("assets/audio/" + n + ".wav").then(r => r.arrayBuffer()).then(b => c.decodeAudioData(b)).then(buf => {
        const src = c.createBufferSource(); src.buffer = buf; src.loop = true; const g = c.createGain(); g.gain.value = 0; src.connect(g); g.connect(this.engS); src.start();
        this.eng.layers[i] = { src, g }; if (this.eng.layers.filter(Boolean).length === 3) this.eng.ready = true;
      }).catch(e => console.warn("engine sample", n, e)));
    } catch (e) { console.warn("audio unavailable", e); }
  }
  resume() { this.ensure(); if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); }
  engineOn(on) { if (this.started) { this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2); this.engS.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.25); } } // generated engine stays silent; the engine is the user-approved sample layers (engS)
  setEngine(speedKmh, offroad) {
    if (!this.started) return;
    const t = this.ctx.currentTime, tops = [55, 90, 125, 160, 200, 245, 300];
    let g = 0; while (g < 6 && speedKmh >= tops[g] * 0.97) g++;
    if (g > this.gear) { this.shiftGain.gain.setValueAtTime(0.15, t); this.shiftGain.gain.setTargetAtTime(1, t + 0.09, 0.03); }
    this.gear = g;
    const rpm = Math.max(4200, Math.min(12200, speedKmh / tops[g] * 12200)) + (offroad ? -400 : 0);
    const f0 = rpm / 60 * 3; // V6: three firings per revolution
    if (this.eng && this.eng.ready) {
      const f = 150 + Math.max(0, Math.min(1, (rpm - 4200) / 8000)) * 550; let ws = [], sum = 0;
      for (let i = 0; i < 3; i++) { const w = Math.exp(-Math.pow(Math.log(f / this.eng.ref[i]) / 0.6, 2)); ws.push(w); sum += w; }
      for (let i = 0; i < 3; i++) { const L = this.eng.layers[i]; L.src.playbackRate.setTargetAtTime(f / this.eng.ref[i], t, 0.04); L.g.gain.setTargetAtTime(ws[i] / sum, t, 0.06); }
    }
    this.osc1.frequency.setTargetAtTime(f0 / 2, t, 0.04); // wave table is in multiples of half the firing frequency
    this.osc2.frequency.setTargetAtTime(f0, t, 0.04);
    this.whine.frequency.setTargetAtTime(rpm / 60 * 9, t, 0.04);
    this.engineFilter.frequency.setTargetAtTime(3000 + rpm * 0.5, t, 0.08);
    this.engNz1.gain.setTargetAtTime(0.1 * (rpm / 12000), t, 0.05); this.engNz2.gain.setTargetAtTime(0.11 * (rpm / 12000), t, 0.05);
    this.noiseGain.gain.setTargetAtTime(Math.min(0.25, (speedKmh / 300) ** 2 * 0.25) + (offroad ? 0.15 : 0), t, 0.1);
  }
  beep(freq, dur, type = "square", vol = 0.25, when = 0) {
    if (!this.started) return;
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  cardPlay() { this.beep(520, 0.09, "square", 0.2); this.beep(780, 0.12, "square", 0.18, 0.07); }
  cardDeny() { this.beep(160, 0.18, "sawtooth", 0.2); }
  nitro() { if (!this.started) return; const c=this.ctx,t=c.currentTime,o=c.createOscillator(),g=c.createGain(); o.type="sawtooth"; o.frequency.setValueAtTime(200,t); o.frequency.exponentialRampToValueAtTime(1400,t+0.6); g.gain.setValueAtTime(0.25,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.8); o.connect(g);g.connect(this.master);o.start(t);o.stop(t+0.85); }
  thud() { this.beep(70, 0.3, "sine", 0.5); this.beep(45, 0.4, "sine", 0.4, 0.05); }
  splash() { if (!this.started) return; const c=this.ctx,t=c.currentTime,s=c.createBufferSource(); const buf=c.createBuffer(1,c.sampleRate*0.4,c.sampleRate); const d=buf.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length); s.buffer=buf; const f=c.createBiquadFilter(); f.type="lowpass"; f.frequency.value=500; const g=c.createGain(); g.gain.value=0.5; s.connect(f);f.connect(g);g.connect(this.master); s.start(t); }
  monkey() { // cheap screech: fast pitch sweeps
    if (!this.started) return;
    const c = this.ctx, t0 = c.currentTime;
    for (let i = 0; i < 5; i++) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = "sawtooth";
      const t = t0 + i * 0.14;
      o.frequency.setValueAtTime(900 + Math.random() * 500, t);
      o.frequency.exponentialRampToValueAtTime(2200 + Math.random() * 800, t + 0.1);
      g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.16);
    }
  }
  spin() { this.beep(300, 0.5, "sawtooth", 0.3); this.beep(180, 0.6, "sawtooth", 0.25, 0.15); }
  crash() { this.thud(); this.beep(1200, 0.05, "square", 0.3); }
  countBeep(final) { this.beep(final ? 880 : 440, final ? 0.5 : 0.2, "square", 0.3); }
  finish() { [523, 659, 784, 1046].forEach((f, i) => this.beep(f, 0.25, "square", 0.25, i * 0.16)); }
  rain(on) { if (this.started) this.noiseGain.gain.setTargetAtTime(on ? 0.3 : 0, this.ctx.currentTime, 0.8); }
}
export const Sound = new SoundBank();
