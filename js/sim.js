// Race simulation core. Pure logic (no rendering) so the network host can run it.
import { CARDS } from "./cards.js";

// Per-team liveries: distinct palette, deck style, sponsors and a unique race number.
// Team 1 (crimson NORDFAHR, #7) is the user-approved B7 design - do not change it.
// Sponsor names of teams 2-6 are working names, collision check pending.
export const TEAMS = [
  { name: "Nordfahr", main: 0xb3122e, accent: 0xf4f4f4, hud: "#b3122e", num: 7,
    liv: { title: "NORDFAHR", wing: "STRATANE OIL", engine: "AZYRTH", rw: "FALKEEN", deck: "chevron", shoulder: "MERIONYX" } },
  { name: "Volktra",  main: 0x1f4e9e, accent: 0xff7d1f, hud: "#1f4e9e", num: 22,
    liv: { title: "VOLKTRA", wing: "HELVARN OIL", engine: "QARVEX", deck: "stripes", noseSwap: true } },
  { name: "Verqan",   main: 0xf2c018, accent: 0x16161c, hud: "#f2c018", num: 44,
    liv: { title: "VERQAN", wing: "RAQVEX OIL", engine: "MOLQAR", deck: "solid" } },
  { name: "Talvarn",  main: 0x18a0a8, accent: 0xf4f4f4, hud: "#18a0a8", num: 63,
    liv: { title: "TALVARN", wing: "FENQAR OIL", engine: "ZORVAQ", deck: "stripes" } },
  { name: "Vilvarn",  main: 0x7a3fd0, accent: 0xd8d8e0, hud: "#7a3fd0", num: 85,
    liv: { title: "VILVARN", wing: "VYRQAN OIL", engine: "ULQAR", deck: "chevron" } },
  { name: "Jarvok",   main: 0x2e9e4f, accent: 0xd8f21f, hud: "#2e9e4f", num: 9,
    liv: { title: "JARVOK", wing: "VORNAQ OIL", engine: "KOVARQ", deck: "solid" } },
];

const VMAX = 78;             // m/s ~ 280 km/h
const ACCEL = 22;
const BRAKE = 46;
const OFFROAD_DRAG = 26;


export class Car {
  constructor(teamIdx, gridIdx, track) {
    this.team = TEAMS[teamIdx];
    this.teamIdx = teamIdx;
    this.s = -(gridIdx * 9) - 10;          // grid positions behind start line
    this.d = (gridIdx % 2 === 0 ? -1 : 1) * 3.2;
    this.speed = 0;
    this.lap = 1;
    this.lapStart = 0;
    this.bestLap = Infinity;
    this.finished = false;
    this.finishTime = 0;
    // status effects
    this.nitroT = 0; this.aeroT = 0; this.wheelT = 0; this.scaredT = 0;
    this.spinT = 0; this.mirrorT = 0; this.slowT = 0; this.engineDead = false;
    this.tire = 100;
    this.inPit = false; this.pitT = 0; this.wantsPit = false;
    this.wobblePhase = Math.random() * 10;
    this.yawExtra = 0;
    this.ai = true;
    this.aiSkill = 0.92 + Math.random() * 0.07;
  }
  progress(track) { return (this.lap - 1) * track.length + this.s; }
}

export class Race {
  constructor(track, opts = {}) {
    this.track = track;
    this.laps = opts.laps || 6;
    this.mode = opts.mode || "coop";
    this.time = 0;
    this.state = "countdown";        // countdown | racing | finished
    this.countdown = 3.8;
    this.cars = [];
    for (let i = 0; i < 6; i++) this.cars.push(new Car(i, i, track));
    this.player = this.cars[0];
    this.player.ai = false;
    // co-driver resources, PER CREW (one team per car).
    // energy/hand/drawT stay as aliases of crew 0 so single-player and
    // host code keep working unchanged.
    this.crews = this.cars.map(() => ({ energy: 60, hand: [], drawT: 0 }));
    Object.defineProperty(this, "energy", { get() { return this.crews[0].energy; }, set(v) { this.crews[0].energy = v; } });
    Object.defineProperty(this, "hand", { get() { return this.crews[0].hand; }, set(v) { this.crews[0].hand = v; } });
    Object.defineProperty(this, "drawT", { get() { return this.crews[0].drawT; }, set(v) { this.crews[0].drawT = v; } });
    // world hazards
    this.slicks = [];   // {s, d, life}
    this.smokes = [];   // {s, life}
    // weather
    this.weather = "sun";            // sun | cloud | rain
    this.weatherT = 25 + Math.random() * 30;
    this.temp = 24;
    this.events = [];                // consumed by renderer/net: {type, ...}
    this.overtakeCount = 0;
    this.prevPos = 1;
    this.raceFinished = false;
  }
  reset() {
    // full rematch: rebuild cars and crew resources, keep AI flags and options
    const aiFlags = this.cars.map(c => c.ai);
    this.time = 0; this.state = "countdown"; this.countdown = 3.8;
    this.cars = [];
    for (let i = 0; i < 6; i++) this.cars.push(new Car(i, i, this.track));
    this.cars.forEach((c, i) => { c.ai = !!aiFlags[i]; });
    this.player = this.cars[0];
    this.crews = this.cars.map(() => ({ energy: 60, hand: [], drawT: 0 }));
    this.slicks = []; this.smokes = [];
    this.weather = "sun"; this.weatherT = 25 + Math.random() * 30; this.temp = 24;
    this.events = []; this.overtakeCount = 0; this.prevPos = 1; this.raceFinished = false;
  }
  emit(e) { this.events.push(e); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  gripFactor() { return this.weather === "rain" ? 0.62 : this.weather === "cloud" ? 0.88 : 1; }

  cornerSpeed(s) {
    const curv = Math.max(0.0004, Math.abs(this.track.at(s).curv));
    const g = 26 * this.gripFactor();
    return Math.min(VMAX, Math.sqrt(g / curv));
  }

  playCard(cardId, carIdx = 0) {
    const card = CARDS[cardId];
    if (!card || ["minus_wheel", "monkey", "oil", "smoke", "mirror"].includes(card.id)) return { ok: false, reason: "disabled" };
    const crew = this.crews[carIdx] || this.crews[0];
    if (crew.energy < card.cost) { this.emit({ type: "deny" }); return { ok: false, reason: "energy" }; }
    crew.energy -= card.cost;
    const p = this.cars[carIdx] || this.player;
    const rivals = this.cars.filter(c => c !== p && !c.finished);
    const ahead = rivals.filter(c => c.progress(this.track) > p.progress(this.track))
                        .sort((a, b) => a.progress(this.track) - b.progress(this.track));
    const behind = rivals.filter(c => c.progress(this.track) <= p.progress(this.track));
    const leader = [...rivals].sort((a, b) => b.progress(this.track) - a.progress(this.track))[0];
    switch (cardId) {
      case "nitro": p.nitroT = 4; this.emit({ type: "nitro", car: carIdx }); break;
      case "minus_wheel": {
        const t = this.mode === "hostile" && leader ? leader : p;
        t.wheelT = 12; this.emit({ type: "wheel_off", car: this.cars.indexOf(t) }); break;
      }
      case "monkey": {
        const t = this.mode === "hostile" && ahead[0] ? ahead[0] : p;
        t.scaredT = 2.6; this.emit({ type: "monkey", car: this.cars.indexOf(t) }); break;
      }
      case "oil": {
        this.slicks.push({ s: p.s - 6, d: p.d, life: 30 });
        this.emit({ type: "oil", s: p.s - 6, d: p.d }); break;
      }
      case "repair": {
        p.wheelT = 0; p.tire = Math.max(p.tire, 55); p.engineDead = false;
        this.emit({ type: "repair", car: carIdx }); break;
      }
      case "aero": p.aeroT = 10; this.emit({ type: "aero", car: carIdx }); break;
      case "smoke": {
        this.smokes.push({ s: p.s - 8, life: 5 });
        behind.forEach(c => { if (p.progress(this.track) - c.progress(this.track) < 60) c.slowT = Math.max(c.slowT, 5); });
        this.emit({ type: "smoke", s: p.s - 8 }); break;
      }
      case "turborisk": {
        if (Math.random() < 0.22) { p.engineDead = true; this.emit({ type: "engine_boom", car: carIdx }); }
        else { p.nitroT = 6.5; this.emit({ type: "nitro", car: carIdx }); }
        break;
      }
      case "mirror": {
        if (leader) { leader.mirrorT = 3; this.emit({ type: "mirror", car: this.cars.indexOf(leader) }); }
        break;
      }
    }
    this.emit({ type: "card", id: cardId });
    return { ok: true };
  }

  pitWindow() { // s-range of pit lane on start straight
    const L = this.track.length;
    return [L - 130, L - 10];
  }

  update(dt, input) {
    if (this.state === "countdown") {
      this.countdown -= dt;
      if (this.countdown <= 0) { this.state = "racing"; this.emit({ type: "go" }); }
      return;
    }
    if (this.state === "finished") { this.time += dt; return; }
    this.time += dt;

    // weather transitions
    this.weatherT -= dt;
    if (this.weatherT <= 0) {
      const order = ["sun", "cloud", "rain"];
      let next = order[Math.floor(Math.random() * 3)];
      if (next === this.weather) next = this.weather === "rain" ? "cloud" : "rain";
      this.weather = next;
      this.temp = next === "rain" ? 14 : next === "cloud" ? 19 : 26;
      this.weatherT = 30 + Math.random() * 40;
      this.emit({ type: "weather", weather: next });
    }

    // energy per crew
    for (const cr of this.crews) { cr.energy = Math.min(100, cr.energy + 3.2 * dt); cr.drawT -= dt; }

    // human input: local player, or a remote guest driver (recent input wins over AI)
    for (const c of this.cars) {
      c.remoteT = Math.max(0, (c.remoteT || 0) - dt);
      let inp = null, ai = c.ai;
      if (c === this.player && !c.ai) inp = input;
      else if (c.remoteT > 0 && c.remoteInput) { inp = c.remoteInput; ai = false; }
      this.updateCar(c, dt, inp, ai);
    }

    // hazards
    for (const slick of this.slicks) {
      slick.life -= dt;
      for (const c of this.cars) {
        if (c.spinT > 0 || c.inPit || c.finished) continue;
        const ds = Math.abs(this.wrapS(c.s - slick.s));
        if (ds < 3.5 && Math.abs(c.d - slick.d) < 2.4 && c.speed > 12) {
          c.spinT = 1.7; c.speed *= 0.45;
          this.emit({ type: "spin", car: this.cars.indexOf(c) });
        }
      }
    }
    this.slicks = this.slicks.filter(s => s.life > 0);
    for (const sm of this.smokes) sm.life -= dt;
    this.smokes = this.smokes.filter(s => s.life > 0);

    // pit-zone ghost (user-approved mechanic 2026-10-27): cars entering/in the pit zone are translucent and skip car-car collision response; walls stay solid; ghost persists at exit until no overlap
    const Lz2 = this.track.length, ZONE0 = Lz2 - 160;
    for (const c of this.cars) { const sw2 = ((c.s % Lz2) + Lz2) % Lz2; const base = c.inPit || c.pitLane || (c.wantsPit && sw2 >= ZONE0); let g = base; if (!g && c._ghost) { c._ghostHoldT = (c._ghostHoldT || 0) + dt; this._ghostMaxT = Math.max(this._ghostMaxT || 0, c._ghostHoldT); g = !c._meshClear; if (g) { if (c._ghostHoldT > 0.5) c.speed = Math.min(c.speed, 6); if (c._ghostHoldT > 4 && !c._ghFlagged) { c._ghFlagged = true; this._ghostLong = (this._ghostLong || 0) + 1; this.pl(c, "ghold"); } } else this._ghostRestores = (this._ghostRestores || 0) + 1; } else if (base) { c._ghostHoldT = 0; c._ghFlagged = false; } c._ghost = g; } // exit-hold: restore ONLY on actual-corner clearance (never forced); watchdog flags >4s holds via pl("ghold") + counter; >0.5s holds slow the car to slot into a gap
    // car-to-car collisions
    for (let i = 0; i < this.cars.length; i++) for (let j = i + 1; j < this.cars.length; j++) {
      const a = this.cars[i], b = this.cars[j];
      if (a.inPit || b.inPit) continue;
      if (a._ghost || b._ghost) continue; // ghost pass-through (no push/slow/bump)
      const ds = this.wrapS(a.s - b.s) * Math.max(0.4, 1 + (-1) * this.track.at(((a.s % this.track.length) + this.track.length) % this.track.length).curv * (a.d + b.d) / 2); // world distance along the lanes
      if (Math.abs(ds) < 5.3 && Math.abs(a.d - b.d) < 1.98) {
        const push = (a.d - b.d) >= 0 ? 1 : -1;
        { const na = a.d + push * 3.2 * dt * 4, nb = b.d - push * 3.2 * dt * 4; if (Math.abs(na) <= 5.7 || Math.abs(na) < Math.abs(a.d)) a.d = na; if (Math.abs(nb) <= 5.7 || Math.abs(nb) < Math.abs(b.d)) b.d = nb; } // symmetric push, kept on asphalt (half width 7.5, car 0.97)
        const vslow = Math.min(a.speed, b.speed) * 0.82;
        a.speed = Math.min(a.speed, vslow + 3); b.speed = Math.min(b.speed, vslow + 3);
        this.emit({ type: "bump", car: i });
      }
    }

    // positions & overtakes
    const order = this.standings();
    const pos = order.indexOf(this.player) + 1;
    if (pos < this.prevPos) { this.energy = Math.min(100, this.energy + 8); this.overtakeCount++; this.emit({ type: "overtake", pos }); }
    this.prevPos = pos;

    // race end
    if (!this.raceFinished && this.player.finished) {
      this.raceFinished = true;
      this.state = "finished";
      this.emit({ type: "finish", pos });
    }
  }

  pl(c, e) { const P = (this.pitStats = this.pitStats || { hf: 0, forced: 0, rel: 0, maxHold: 0 }); (P.log = P.log || []).push(this.cars.indexOf(c) + e + "@" + this.time.toFixed(0) + "s" + Math.round(c.s % this.track.length)); }
  wrapS(ds) { const L = this.track.length; while (ds > L / 2) ds -= L; while (ds < -L / 2) ds += L; return ds; }

  standings() {
    return [...this.cars].sort((a, b) => {
      const pa = a.finished ? 1e9 - a.finishTime : a.progress(this.track);
      const pb = b.finished ? 1e9 - b.finishTime : b.progress(this.track);
      return pb - pa;
    });
  }

  updateCar(c, dt, input, ai = c.ai) {
    const track = this.track;
    if (c.finished) { // victory lap crawl
      c.speed = Math.max(18, c.speed - 10 * dt);
      this.advance(c, dt, 0);
      return;
    }
    // timers
    c.nitroT = Math.max(0, c.nitroT - dt); c.aeroT = Math.max(0, c.aeroT - dt);
    c.wheelT = Math.max(0, c.wheelT - dt); c.scaredT = Math.max(0, c.scaredT - dt);
    c.spinT = Math.max(0, c.spinT - dt); c.mirrorT = Math.max(0, c.mirrorT - dt);
    c.slowT = Math.max(0, c.slowT - dt);

    // pit logic (v32: own stall per car, deepest-free-first behind occupied stalls, ordered release, lane kept to the exit gap, exit gate waits for a gap)
    const [pitA, pitB] = this.pitWindow();
    const L_ = track.length, S0_ = L_ - 128, STALL = (k) => L_ - 100 + 7.4 * k, LANE_D = 10.5, EXIT_S = L_ - 34;
    if (!c.inPit && c.wantsPit && !c.pitLane) {
      const sNorm = ((c.s % L_) + L_) % L_;
      const DEAD_S = L_ - 84, tCross = Math.max(0, LANE_D - c.d) / 5 + 0.25; // v45w apron gate (internal test): commit only when the eased lateral crossing can finish before the wall band at L-80
      const canCross = sNorm + c.speed * tCross < L_ - 80;
      const canStop = sNorm + c.speed * c.speed / 32 + 1.5 < L_ - 80; // or at least stop short of the wall: band rule then completes the sweep while parked in open area
      if (sNorm > pitA && sNorm < L_ - 80 && (canCross || canStop)) {
        let lim = 8, lo = -1, busy = false, ahead = false; for (const o of this.cars) if (o !== c && (o.inPit || o.pitLane)) { if (o.inPit && o.stall !== undefined) { if (this.wrapS(o.s - c.s) > 0) lim = Math.min(lim, o.stall); else lo = Math.max(lo, o.stall); } { const ws = this.wrapS(o.s - c.s); if (ws > -7.6 && ws < 7.6) { const P = (this.pitStats = this.pitStats || {}); const bl = (P.bl = P.bl || []); if (bl.length < 14 && this.cars.indexOf(c) === 2 && (bl.length === 0 || this.time - bl[bl.length-1][0] > 0.4)) bl.push([+this.time.toFixed(1), this.cars.indexOf(o), +ws.toFixed(1), +o.d.toFixed(1), +o.speed.toFixed(0), o.inPit ? 1 : 0, o.pitLane ? 1 : 0, +(o.s % L_).toFixed(0), +(c.s % L_).toFixed(0)]); busy = true; if (ws > -0.5) ahead = true; } } }
        c.padBrake = busy && ahead; if (busy) lim = 0; // keep racing until the lane entry is 9 m clear of any car already in the pit lane
        const need = c.speed * c.speed / (2 * 9) + 4; let pick = -1;
        for (let k = lim - 1; k > lo; k--) { if (STALL(k) - sNorm > need) { pick = k; break; } }
        if (pick < 0) { const P = (this.pitStats = this.pitStats || { hf: 0, forced: 0, rel: 0, maxHold: 0 }); const mk = (P.miss = P.miss || {}); const key = this.cars.indexOf(c) + (busy ? "B" : "S") + lim; mk[key] = (mk[key] || 0) + 1; }
        if (pick >= 0) { c.inPit = true; c.stall = pick; this.pl(c, "in" + pick); c.pitT = 2.8; this.emit({ type: "pit_in", car: this.cars.indexOf(c) }); }
      } else if (sNorm > L_ - 160 && sNorm < L_ - 80) {
        // apron hold: brake to a FULL STOP ahead of the commit deadline; wantsPit cars are ghosts in-zone so the queue is collision-free. Profile starts at the ghost-zone edge (L-160): a 40 m/s arrival needs ~50m to stop, the old pitA start gave only 38m and fast cars blew past the wall every lap (iter5 lost-entry root cause)
        let vHold = Math.max(0, DEAD_S - sNorm) > 1 ? Math.sqrt(2 * 9 * Math.max(0, DEAD_S - sNorm - 1)) : 0;
        for (const o of this.cars) { if (o === c) continue; const g = this.wrapS(o.s - c.s); if (g > 0 && g < 30 && (o.inPit || o.pitLane || o.wantsPit)) vHold = Math.min(vHold, Math.sqrt(2 * 9 * Math.max(0, g - 8.5)) + (o.speed > 1 ? o.speed * 0.5 : 0)); } // spaced queue: 8.5m gaps, no ghost stacking
        if (c.speed > vHold) c.speed = Math.max(vHold, c.speed - 16 * dt);
        const P = (this.pitStats = this.pitStats || {}); P.gate = (P.gate || 0) + dt; // seconds spent apron-held
      } else if (sNorm >= L_ - 80 && sNorm < pitB) {
        const P = (this.pitStats = this.pitStats || {}); if (!c._lostLap) { c._lostLap = c.lap; P.lost = (P.lost || 0) + 1; } // passed the wall band uncommitted: entry lost this lap
      }
      if (sNorm < pitA) c._lostLap = undefined;
    }
    if (c.inPit) {
      if (c.stall === undefined) c.stall = 0; const sNorm = ((c.s % L_) + L_) % L_, dist = Math.max(0, STALL(c.stall) - sNorm);
      let vCap = dist < 0.15 ? 0 : Math.min(22, Math.sqrt(2 * 9 * Math.max(0, dist - 0.1)) + 0.5);
            for (const o of this.cars) { if (o === c || !(o.inPit || o.pitLane)) continue; const g = this.wrapS(o.s - c.s); if (g > 0 && g < 40 && (Math.abs(o.d - c.d) < 4.5 || o.d > 7.5)) vCap = Math.min(vCap, Math.sqrt(2 * 9 * Math.max(0, g - 7.2)) + (o.speed > 1 ? o.speed * 0.5 : 0)); }
      c._bandHold = sNorm > L_ - 86 && sNorm < L_ - 30 && c.d < 7.6; if (c._bandHold) vCap = 0; // v45w: no unswept car (corners may reach the wall band) advances past L-86; the sweep finishes while stopped in open area
      if (c.speed > vCap) c.speed = Math.max(vCap, c.speed - 16 * dt);
      if (dist < 0.4 && c.speed < 2) { c.speed = 0; c.s += Math.min(dist, 6 * dt); }
      if (c._bandHold) { /* service clock paused during the safety hold */ } else if (c.speed < 1 && dist < 0.6) c.pitT -= dt; else c.pitT -= dt * 0.25; // service clock mostly runs while stopped
      // v45w: _nb sweep-hold removed - pit-zone cars are ghosts (user-granted mechanic), so the eased sweep cannot collide with racing traffic; holding it delayed crossings into the wall band
      c.d += Math.max(-6 * dt, Math.min(6 * dt, (LANE_D - c.d) * 1.6 * dt)); // eased, <=6 m/s sideways
      let _hold = false;
      if (c.pitT <= 0) { // ordered release: nobody deeper (ahead in the lane) may still be in its stall
        for (const o of this.cars) if (o !== c && o.inPit && o.stall > c.stall) { _hold = true; break; }
        const _ps = (this.pitStats = this.pitStats || { hf: 0, forced: 0, rel: 0, maxHold: 0 }); if (_hold) { _ps.hf++; c.holdT = (c.holdT || 0) + dt; _ps.maxHold = Math.max(_ps.maxHold, c.holdT); }
      }
      if (c.pitT <= 0 && !_hold) {
        if (this.pitStats) { this.pitStats.rel++; } this.pl(c, "rel"); c.holdT = 0; c.inPit = false; c.pitLane = !!ai; c.wantsPit = false; // lane-keeping to the exit gate only for AI cars; a manually driven car is released to the player as in the baseline c.stall = undefined;
        c._bandHold = false; c.tire = 100; c.wheelT = 0; c.engineDead = false;
        this.emit({ type: "pit_out", car: this.cars.indexOf(c) });
      }
      this.advance(c, dt, 0);
      return;
    }
    if (c.pitLane) { // driving the pit lane to the exit gate: follows the car ahead, waits at the gate for a gap, then merges
      const sNorm = ((c.s % L_) + L_) % L_;
      if (sNorm < L_ / 2) { c.pitLane = false; } else {
        let vCap = 22;
        for (const o of this.cars) { if (o === c || !(o.inPit || o.pitLane) || o.d < 8) continue; const g = this.wrapS(o.s - c.s); if (g > 0 && g < 40) vCap = Math.min(vCap, Math.sqrt(2 * 9 * Math.max(0, g - 7.2)) + (o.speed > 1 ? o.speed * 0.5 : 0)); }
        const toGate = EXIT_S - sNorm;
        if (toGate < 60) { // gate: stop at the line unless a gap exists behind/ahead in the racing lane
          let safe = true;
          for (const o of this.cars) { if (o === c || o.inPit || o.pitLane || Math.abs(o.d) < 3.5) continue; const ods = this.wrapS(o.s - c.s - Math.max(0, toGate)); if (ods > -30 && ods < 8) { safe = false; break; } }
          if (!safe && toGate < 0.5) { vCap = 0; c.holdT = (c.holdT || 0) + dt; } else if (!safe) vCap = Math.min(vCap, Math.sqrt(2 * 9 * Math.max(0, toGate - 0.2)));
        }
        if (c.speed > vCap) c.speed = Math.max(vCap, c.speed - 16 * dt); else c.speed = Math.min(vCap, c.speed + 9 * dt);
        c.d += Math.max(-6 * dt, Math.min(6 * dt, (LANE_D - c.d) * 1.6 * dt));
        if (sNorm >= EXIT_S - 0.01 && vCap > 0) { this.pl(c, "out"); c.pitLane = false; c.holdT = 0; }
        if (sNorm >= EXIT_S && c.pitLane && vCap === 0) c.s = c.s;
        this.advance(c, dt, 0);
        return;
      }
    }

    let steer = 0, throttle = 0, brake = 0;
    if (ai) {
      const aheadCurv = Math.abs(track.at(c.s + Math.max(30, c.speed * 1.4)).curv);
      const vTarget = Math.min(VMAX * c.aiSkill * (c.slowT > 0 ? 0.55 : 1), this.cornerSpeed(c.s + c.speed * 1.2) * c.aiSkill);
      throttle = Math.max(0, Math.min(1, (vTarget - c.speed) / 3)); // proportional: full gas until 3 m/s under target, no on/off surging
      brake = Math.max(0, Math.min(0.9, (c.speed - vTarget - 2) / 8 * 0.9)); // progressive pressure over an 8 m/s overspeed band (decel is now scaled by brake)
      const curv = (track.at(c.s + 30).curv + track.at(c.s + 40).curv + track.at(c.s + 50).curv) / 3; // averaged lookahead: single-sample spikes made the car weave on straights
      let dTarget = -Math.sign(curv) * Math.max(0, Math.abs(curv) - 0.0008) * 160; // cut apex
      // avoid slower car ahead
      for (const o of this.cars) {
        if (o === c || o.finished) continue;
        const ds = this.wrapS(o.s - c.s);
        if (ds > -6.2 && ds < 16 && Math.abs(o.d - c.d) < 2.6) { if (c._passCar !== o || !(c._passUntil > this.time)) { c._passCar = o; c._passSide = o.d > c.d ? -1 : 1; c._passUntil = this.time + 1.5; } dTarget = c._passSide < 0 ? Math.min(dTarget, o.d - 2.6) : Math.max(dTarget, o.d + 2.6); } // also cars alongside (ds<0), keep >=2.6 m between centres
      }
      dTarget = Math.max(-5.4, Math.min(5.4, dTarget));
      for (const o of this.cars) { // follow: do not close on a car that is ahead in our lane before the dodge has opened a gap
        if (o === c || o.finished || o.inPit) continue; const ds = this.wrapS(o.s - c.s);
        if (ds > 0 && ds < 8.5 && Math.abs(o.d - c.d) < 2.3 && c.speed > o.speed) { throttle = 0; brake = Math.max(brake, c.speed > o.speed + 1 ? 1 : 0); } // full pressure as before (was boolean-consumed)
      }
      // Smooth the path target, not the car's physics position: no hidden mesh lag.
      c._lineTarget = c._lineTarget === undefined ? c.d : c._lineTarget;
      c._lineTarget += (dTarget - c._lineTarget) * (1 - Math.exp(-dt * 3));
      steer = Math.max(-1, Math.min(1, (c._lineTarget - c.d) * 0.5));
      { const _pv = c._st || 0; c._st = Math.max(_pv - 5 * dt, Math.min(_pv + 5 * dt, steer)); steer = c._st; } // slew 5/s: smooth wheel, full lock still in 0.2s
      if (c.scaredT > 0) steer = Math.sin(this.time * 9 + c.wobblePhase) * 1.2;
      if (c.mirrorT > 0) steer = -steer;
      // AI occasionally pits when tires die
      if (c.tire < 12 && Math.random() < 0.3 * dt) c.wantsPit = true;
    } else if (input) {
      if (c.scaredT > 0) { steer = 0; throttle = 0; brake = 1; } // full pressure as before (was boolean-consumed)
      else {
        steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        if (c.mirrorT > 0) steer = -steer;
        throttle = input.gas ? 1 : 0;
        brake = input.brake ? 1 : 0;
      }
    }
    if (c.padBrake && c.wantsPit && !c.inPit && !c.pitLane && c.speed > 9) { throttle = 0; brake = Math.max(brake, 1); } // full pressure as before (was boolean-consumed) // open a gap so the car ahead can take its stall

    // speed model
    const nitroMul = c.nitroT > 0 ? 1.4 : 1;
    const wheelMul = c.wheelT > 0 ? 0.62 : 1;
    const engineMul = c.engineDead ? 0.35 : 1;
    const tireMul = 0.75 + 0.25 * (c.tire / 100);
    const vmax = VMAX * nitroMul * wheelMul * engineMul * tireMul * (c.slowT > 0 ? 0.6 : 1);
    if (c.spinT > 0) {
      c.speed = Math.max(0, c.speed - 30 * dt);
      c.yawExtra += dt * 12;
    } else {
      c.yawExtra *= Math.exp(-9.75 * dt);
      if (c._bandHold && c.inPit) { throttle = 0; brake = 1; } // v45w band-hold must override AI throttle, else the car crawls into the wall
      if (throttle) c.speed += ACCEL * throttle * nitroMul * engineMul * (1 - c.speed / (vmax + 1)) * dt; // scaled by analog throttle
      if (brake) c.speed = Math.max(0, c.speed - BRAKE * brake * dt); // braking must never reverse the car
      c.speed -= c.speed * 0.018 * dt; // drag
      c.speed = Math.min(c.speed, vmax);
    }

    // cornering: centrifugal slide + corner speed limit
    const curv = track.at(c.s).curv;
    const grip = this.gripFactor() * (c.aeroT > 0 ? 1.45 : 1) * (c.tire < 25 ? 0.8 : 1);
    const cSpeed = this.cornerSpeed(c.s) * (c.aeroT > 0 ? 1.25 : 1) * tireMulOf(c);
    if (c.speed > cSpeed) {
      c.speed = Math.max(cSpeed * 0.94, c.speed - (18 + (c.speed - cSpeed) * 2.2) * dt);
      c.d += Math.sign(curv) * (c.speed - cSpeed) * 0.06 * dt * 60 * 0.16;
    }
    c.d += Math.sign(curv) * curv * c.speed * c.speed * 0.00045 * dt * 60 / Math.max(0.4, grip);

    // steering lateral move
    const steerRate = (3.4 + c.speed * 0.085) * grip;
    c.d += steer * steerRate * dt;
    if (c.wheelT > 0) { c.wobblePhase += dt * 13; c.d += Math.sin(c.wobblePhase) * 1.7 * dt; }

    // off-track
    const off = track.isOffRoad(c.s, c.d); // drawn road edge (7.5 m, narrower on the inside of very tight corners)
    if (off) {
      c.speed = Math.max(0, c.speed - OFFROAD_DRAG * dt);
      c.d = Math.max(-13.5, Math.min(13.5, c.d));
    }

    // tire wear
    if (c.speed > 5) {
      c.tire = Math.max(0, c.tire - dt * (0.55 + (c.speed / VMAX) * 1.5 + Math.abs(curv) * c.speed * 0.05));
      if (c.tire <= 0 && !c.engineDead) { c.engineDead = true; this.emit({ type: "puncture", car: this.cars.indexOf(c) }); }
    }

    this.advance(c, dt, steer);
  }

  advance(c, dt, steer) {
    c.s += c.speed * dt;
    const L = this.track.length;
    if (c.s >= L) {
      c.s -= L; c.lap++;
      const lapTime = this.time - c.lapStart;
      c.lapStart = this.time;
      if (lapTime > 8 && lapTime < c.bestLap) c.bestLap = lapTime;
      this.emit({ type: "lap", car: this.cars.indexOf(c), lap: c.lap, lapTime });
      if (c.lap > this.laps && !c.finished) { c.finished = true; c.finishTime = this.time; }
    }
    if (c.s < -L) c.s += L;
  }
}
function tireMulOf(c) { return 0.8 + 0.2 * (c.tire / 100); }
