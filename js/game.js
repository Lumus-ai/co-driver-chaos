// Renderer + glue between Race sim, 3D world, HUD, sound and input.
import * as THREE from "../lib/three.module.js";
import { Track, buildWorld, buildCar, buildLooseWheel, buildOilSlick, buildSmoke, buildRain, ROAD_HALF } from "./world3d.js";
import { Race } from "./sim.js";
import { buildEnvironment } from "./environment.js";
import { Sound } from "./audio.js";
import { HUD } from "./hud.js";

const CP = [1.0, 0.3];
export class Game {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.opts = opts;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05; this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.1, 3000);
    this.track = new Track();
    this.world = buildWorld(this.scene, this.track);
    this.world.environment = buildEnvironment(this.scene, this.track);
    this.rain = buildRain(this.scene);
    this.race = new Race(this.track, { laps: opts.laps || 6, mode: opts.mode || "coop" });
    this.hud = new HUD(this);
    this.followIdx = opts.followIdx || 0;
    this.carMeshes = this.race.cars.map(c => {
      const m = buildCar(c.team.main, c.team.accent, c.team.num != null ? c.team.num : this.race.cars.indexOf(c) + 1, c.team.liv);
      this.scene.add(m);
      return m;
    });
    this.looseWheels = new Map();
    this.scene.traverse(o => { if (o.isMesh && !o.userData.noShadow) o.receiveShadow = true; });
    // yellow marker above the player's car so it is unmistakable in traffic
    this.playerMark = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.7, 4), new THREE.MeshBasicMaterial({ color: 0xffd21f }));
    this.playerMark.rotation.x = Math.PI;
    this.scene.add(this.playerMark);
    // team-coloured markers above rivals, shown only while a rival is faded
    this.rivalMarks = this.race.cars.map((c, i) => {
      if (i === 0) return null;
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.38, 4), new THREE.MeshBasicMaterial({ color: c.team.accent, transparent: true, opacity: 0.85 }));
      m.rotation.x = Math.PI; m.visible = false;
      this.scene.add(m);
      return m;
    });
    this.slickMeshes = [];
    this.smokeMeshes = [];
    this.sparks = [];
    this.nitroFlames = new Map();
    this.shake = 0; this._headQ = null;
    this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3();
    this.firstFrame = true;
    this.skyStates = {
      sun: { top: "#2f7fd6", mid: "#6fb0e8", low: "#d8eefb", fog: 0x9fc7e8, sun: 1.7, hemi: 1.05 },
      cloud: { top: "#5a7ca6", mid: "#8aa5c4", low: "#c4d2e0", fog: 0x9fb2c4, sun: 0.9, hemi: 0.95 },
      rain: { top: "#3c4a5c", mid: "#5d7186", low: "#8fa1b3", fog: 0x66798c, sun: 0.45, hemi: 0.8 },
    };
    this.skyMix = { sun: 1, cloud: 0, rain: 0 };
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---- event-driven visuals/sounds ----
  handleEvents(events) {
    for (const e of events) {
      switch (e.type) {
        case "go": Sound.engineOn(true); HUD.centerMsg("ПОЕХАЛИ!", 900); break;
        case "nitro": Sound.nitro(); this.spawnFlame(e.car); break;
        case "wheel_off": Sound.thud(); this.detachWheel(e.car); HUD.centerMsg("МИНУС КОЛЕСО!", 1200); this.shake = Math.max(this.shake, 0.5); break;
        case "monkey": Sound.monkey(); this.hud.monkeyScream(e.car === 0); if (e.car === 0) this.shake = 1.2; break;
        case "oil": Sound.splash(); this.spawnSlick(e.s, e.d); break;
        case "smoke": this.spawnSmoke(e.s); break;
        case "spin": Sound.spin(); if (e.car === 0) this.shake = Math.max(this.shake, 1); break;
        case "bump": { const bc = this.race.cars[e.car]; if (bc && !(bc._bumpCd > 0)) { bc._bumpCd = 0.6; bc._kick = 0.05; if (e.car === 0) { Sound.crash(); this.shake = Math.max(this.shake, 0.6); } } } break;
        case "repair": Sound.cardPlay(); break;
        case "aero": Sound.cardPlay(); break;
        case "mirror": Sound.spin(); break;
        case "engine_boom": Sound.crash(); HUD.centerMsg("ДВИГАТЕЛЬ ВЗОРВАЛСЯ! НУЖЕН ПИТ", 2000); this.shake = 1.4; this.spawnBoom(); break;
        case "puncture": Sound.thud(); if (e.car === 0) HUD.centerMsg("ПРОКОЛ! РЕЗИНА НА НУЛЕ", 1600); break;
        case "weather": HUD.centerMsg(e.weather === "rain" ? "ДОЖДЬ!" : e.weather === "cloud" ? "ОБЛАЧНО" : "СОЛНЦЕ", 1100); Sound.rain(e.weather === "rain"); break;
        case "pit_in": if (e.car === 0) HUD.centerMsg("ПИТ-СТОП", 1000); break;
        case "pit_out": Sound.cardPlay(); break;
        case "overtake": Sound.beep(980, 0.12, "square", 0.2); break;
        case "lap": if (e.car === 0 && e.lap <= this.race.laps) { Sound.beep(700, 0.15, "square", 0.25); HUD.centerMsg(`КРУГ ${e.lap}/${this.race.laps}`, 1000); } break;
        case "deny": Sound.cardDeny(); break;
        case "card": Sound.cardPlay(); break;
        case "finish": Sound.finish(); Sound.engineOn(false); break;
      }
    }
  }

  detachWheel(carIdx) {
    const car = this.race.cars[carIdx];
    const mesh = this.carMeshes[carIdx];
    const w = mesh.userData.parts.wheels[0]; // front-left
    w.visible = false;
    const loose = buildLooseWheel(car.team.accent);
    const pos = new THREE.Vector3(); w.getWorldPosition(pos);
    loose.position.copy(pos);
    loose.userData.vel = new THREE.Vector3(-6 - Math.random() * 3, 4 + Math.random() * 3, -car.speed * 0.35);
    loose.userData.spin = Math.random() * 8 + 4;
    this.scene.add(loose);
    this.looseWheels.set(carIdx, loose);
  }
  reattachWheel(carIdx) {
    const mesh = this.carMeshes[carIdx];
    mesh.userData.parts.wheels[0].visible = true;
    const loose = this.looseWheels.get(carIdx);
    if (loose) { this.scene.remove(loose); this.looseWheels.delete(carIdx); }
  }
  spawnSlick(s, d) {
    const m = buildOilSlick();
    const { p, n } = this.track.at(s);
    m.position.copy(p).addScaledVector(n, d); m.position.y = p.y + 0.06;
    this.scene.add(m);
    this.slickMeshes.push(m);
  }
  spawnSmoke(s) {
    const m = buildSmoke();
    const { p } = this.track.at(s);
    m.position.copy(p); m.position.y = p.y;
    this.scene.add(m);
    this.smokeMeshes.push({ m, life: 5.5 });
  }
  spawnFlame(carIdx) {
    const car = this.carMeshes[carIdx];
    const flame = new THREE.Group();
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff7d1f, transparent: true, opacity: 0.9 }));
    outer.rotation.x = Math.PI / 2; outer.position.z = -0.9;
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.1, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd21f, transparent: true, opacity: 0.95 }));
    inner.rotation.x = Math.PI / 2; inner.position.z = -0.55;
    flame.add(outer); flame.add(inner);
    flame.position.set(0, 0.55, -2.4);
    car.add(flame);
    this.nitroFlames.set(carIdx, flame);
  }
  spawnBoom() {
    const p = this.carMeshes[0];
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 + Math.random() * 0.7, 0),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff8822 : 0x333333, transparent: true, opacity: 0.95 }));
      s.position.copy(p.position).add(new THREE.Vector3((Math.random() - .5) * 2, 1 + Math.random() * 2, (Math.random() - .5) * 2));
      s.userData.vel = new THREE.Vector3((Math.random() - .5) * 8, 5 + Math.random() * 6, (Math.random() - .5) * 8);
      s.userData.life = 1.4;
      this.scene.add(s); this.sparks.push(s);
    }
  }
  spawnDust(pos, n = 2) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 + Math.random() * 0.16, 0),
        new THREE.MeshBasicMaterial({ color: 0x9a8f80, transparent: true, opacity: 0.4 }));
      s.position.copy(pos).add(new THREE.Vector3((Math.random() - .5) * 1.6, 0.3, (Math.random() - .5) * 1.6));
      s.userData.vel = new THREE.Vector3((Math.random() - .5) * 2.5, 1.2 + Math.random() * 1.5, (Math.random() - .5) * 2.5);
      s.userData.life = 0.55;
      s.userData.grow = 0.6;
      this.scene.add(s); this.sparks.push(s);
    }
  }
  spawnSparkBurst(pos) {
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08),
        new THREE.MeshBasicMaterial({ color: 0xffcc33 }));
      s.position.copy(pos);
      s.userData.vel = new THREE.Vector3((Math.random() - .5) * 5, 1 + Math.random() * 3, (Math.random() - .5) * 5);
      s.userData.life = 0.6;
      this.scene.add(s); this.sparks.push(s);
    }
  }

  resetRace() {
    // rematch: fresh sim state + clear every visual leftover from the last race
    this.race.reset();
    for (const [, w] of this.looseWheels) this.scene.remove(w);
    this.looseWheels.clear();
    this.slickMeshes.forEach(m => this.scene.remove(m)); this.slickMeshes = [];
    this.smokeMeshes.forEach(sm => this.scene.remove(sm.m)); this.smokeMeshes = [];
    this.sparks.forEach(s => this.scene.remove(s)); this.sparks = [];
    for (const [, f] of this.nitroFlames) f.visible = false;
    this.pendingGuestEvents = [];
    this.shake = 0; this._headQ = null;
    if (this.hud) this.hud.resetResults();
  }

  update(dt, input) {
    const race = this.race;
    let events;
    if (this.isGuestView) {
      events = this.pendingGuestEvents || [];
      this.pendingGuestEvents = [];
    } else {
      // Bounded substeps keep steering/braking stable across 30/60/120Hz rendering.
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      for (let step = 0; step < steps; step++) race.update(dt / steps, input);
      events = race.drainEvents();
      if (this.netForward) this.netForward.push(...events);
    }
    this.handleEvents(events);

    // sync car meshes
    race.cars.forEach((c, i) => {
      const mesh = this.carMeshes[i];
      const { p, t, n } = this.track.at(c.s);
      mesh.position.copy(p).addScaledVector(n, c.d);
      const baseYaw = Math.atan2(t.x, t.z);
      let yaw = baseYaw + (c.spinT > 0 ? c.yawExtra : c.yawExtra * 0.2);
      if (c.wheelT > 0) yaw += Math.sin(c.wobblePhase) * 0.06;
      // motion polish (visual only): body heads into its lateral motion, leans in corners, pitches on brake/accel
      const vis = c._vis || (c._vis = { d: c.d, sp: c.speed, base: baseYaw, lat: 0, acc: 0, yr: 0 });
      if (dt > 0) {
        const k = 1 - Math.exp(-dt * 8);
        let dB = baseYaw - vis.base; if (dB > Math.PI) dB -= 2 * Math.PI; if (dB < -Math.PI) dB += 2 * Math.PI;
        vis.lat += (Math.max(-12, Math.min(12, (c.d - vis.d) / dt)) - vis.lat) * k;
        vis.acc += (Math.max(-60, Math.min(60, (c.speed - vis.sp) / dt)) - vis.acc) * k;
        vis.yr += (Math.max(-1.5, Math.min(1.5, dB / dt)) - vis.yr) * k;
        vis.d = c.d; vis.sp = c.speed; vis.base = baseYaw;
      }
      const head = c.spinT > 0 ? 0 : Math.max(-0.3, Math.min(0.3, Math.atan2(-vis.lat, Math.max(10, c.speed))));
      yaw += head;
      const pitch = c.spinT > 0 ? 0 : Math.max(-0.035, Math.min(0.05, -vis.acc * 0.0025));
      const roll = c.spinT > 0 ? 0 : Math.max(-0.07, Math.min(0.07, vis.yr * c.speed * 0.0016));
      mesh.rotation.order = "YXZ";
      if (c._bumpCd > 0) c._bumpCd -= dt;
      const kick = c._kick > 0.002 ? c._kick * Math.sin(performance.now() * 0.038) : 0; c._kick = (c._kick || 0) * Math.max(0, 1 - 7 * dt);
      mesh.rotation.set(pitch, yaw, roll + kick);
      // ghost exit clearance from ACTUAL mesh corners (not yawless rectangle): car restores collisions only when its real OBB is clear of others by 0.3m
      if (!c._ghost) c._meshClear = true;
      const Lz3 = this.track.length, sw3 = ((c.s % Lz3) + Lz3) % Lz3, baseG = c.inPit || c.pitLane || (c.wantsPit && sw3 >= Lz3 - 160);
      if (c._ghost && baseG) c._meshClear = false; // in-zone ghost: mark not-clear so the exit handoff always waits for one real computation
      c._baseG = baseG; // cached for the post-sync clearance pass (meshes of later-index cars are not yet placed inside this loop)
      // pit-zone ghost rendering (user-approved mechanic 2026-10-27): translucent while c._ghost
      if (mesh.userData.ghostOn !== !!c._ghost) { mesh.userData.ghostOn = !!c._ghost; mesh.traverse((o) => { if (o.isMesh && o.name !== "blob") { if (!o.userData._m0) o.userData._m0 = { t: o.material.transparent, o: o.material.opacity, d: o.material.depthWrite }; if (mesh.userData.ghostOn) { o.material.transparent = true; o.material.opacity = 0.4; o.material.depthWrite = false; } else { o.material.transparent = o.userData._m0.t; o.material.opacity = o.userData._m0.o; o.material.depthWrite = o.userData._m0.d; } o.material.needsUpdate = true; } }); }
      mesh.userData._steer = c.spinT > 0 ? 0 : Math.max(-0.35, Math.min(0.35, head * 1.3 + vis.yr * 0.15));
      if (c.spinT > 0 && Math.random() < 0.35) {
        const rear = mesh.position.clone().addScaledVector(t, -1.8);
        this.spawnDust(rear, 1);
      }
      mesh.position.y = p.y + (this.track.isOffRoad(c.s, c.d) ? Math.abs(Math.sin(this.race.time * 30 + i)) * 0.06 : 0);
      // wheel spin
      const wr = c.speed * dt / 0.36;
      mesh.userData.parts.wheels.forEach(w => {
        w.rotation.order = "YXZ"; w.rotation.x += wr;
        w.rotation.y = w.position.z > 0 ? (mesh.userData._steer || 0) : 0; // front wheels steer
      });
      if (mesh.userData.parts.steer) mesh.userData.parts.steer.rotation.z = -(mesh.userData._steer || 0) * 2.2; // steering wheel follows the front wheels (sign pending capture verification)
      if (c.wheelT <= 0 && this.looseWheels.has(i)) this.reattachWheel(i);
      // nitro flame flicker
      const flame = this.nitroFlames.get(i);
      if (flame) {
        if (c.nitroT > 0) { flame.visible = true; flame.scale.setScalar(0.8 + Math.random() * 0.5); }
        else { flame.visible = false; }
      }
      // rivals crowding the chase camera fade out smoothly instead of popping
      // (only those clearly closer to the camera than the player's car). Visual only.
      if (mesh !== this.carMeshes[this.followIdx]) {
        const camP2 = this.camera.position;
        const dRival = mesh.position.distanceTo(camP2);
        const dPlayer = this.carMeshes[this.followIdx].position.distanceTo(camP2);
        const fade = Math.min(1, Math.max(0, (dRival - (dPlayer - 1.5)) / 3.5));
        // floor at 0.22 + livery-coloured emissive glow + team marker:
        // a rival in collision range always reads as a glowing silhouette,
        // never as dark debris. Collision physics in the sim is untouched.
        const op = 0.9 + 0.1 * fade;
        mesh.userData._fadeOp = op;
        if (op < 0.999 || mesh.userData._faded) {
          mesh.traverse(o => {
            if (!o.isMesh) return;
            // own material per rival mesh: faded rivals must never fade the player's car through shared materials
            if (!o.userData._ownMat) { o.material = o.material.clone(); o.userData._ownMat = true; }
            if (o.userData.baseOpacity === undefined) o.userData.baseOpacity = o.material.opacity;
            o.material.transparent = true;
            o.material.opacity = o.userData.baseOpacity * op;
            if (o.material.emissive) o.material.emissive.copy(o.material.color).multiplyScalar(0.0);
          });
        }
        const rm = this.rivalMarks[i];
        if (rm) {
          rm.visible = op < 0.75 && (race.state === "racing" || race.state === "countdown");
          if (rm.visible) {
            rm.position.set(mesh.position.x, mesh.position.y + 2.0 + Math.sin(race.time * 5 + i) * 0.12, mesh.position.z);
            rm.rotation.y = race.time * 2;
          }
        }
        mesh.userData._faded = op < 0.999;
      }
      // sparks while wheelless
      if (c.wheelT > 0 && c.speed > 10 && Math.random() < 0.35) this.spawnSparkBurst(mesh.position.clone().add(new THREE.Vector3(-0.9, 0.15, 1.3)));
    });

    // ghost exit clearance from ACTUAL mesh corners: runs AFTER all meshes are placed this step, so every
    // comparison uses current-step transforms (inside the sync loop above, later-index car meshes are still stale).
    // restore only when the real OBB is clear of every other car by 0.3m; otherwise the sim holds the ghost.
    for (let i = 0; i < race.cars.length; i++) {
      const c = race.cars[i]; if (!c._ghost || c._baseG || c._meshClear) continue;
      const mesh = this.carMeshes[i];
      const me = []; mesh.updateMatrixWorld(true); const e0 = mesh.matrixWorld.elements;
      for (const [lx, lz] of [[-1.15, -2.7], [1.15, -2.7], [1.15, 2.9], [-1.15, 2.9]]) me.push([e0[12] + e0[0] * lx + e0[8] * lz, e0[14] + e0[2] * lx + e0[10] * lz]); // margin: hx 1.12+0.03, hz 2.634+0.27 nose
      let clear = true;
      for (let oi = 0; oi < race.cars.length; oi++) {
        if (oi === i || !clear) continue; const om = this.carMeshes[oi]; if (!om) continue;
        om.updateMatrixWorld(true); const e1 = om.matrixWorld.elements;
        const ot = []; for (const [lx, lz] of [[-1.15, -2.7], [1.15, -2.7], [1.15, 2.9], [-1.15, 2.9]]) ot.push([e1[12] + e1[0] * lx + e1[8] * lz, e1[14] + e1[2] * lx + e1[10] * lz]);
        const axes = []; for (const Q of [me, ot]) for (let k = 0; k < 4; k++) { const a = Q[k], b = Q[(k + 1) % 4]; const ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez) || 1; axes.push([-ez / l, ex / l]); }
        let sep = false;
        for (const ax of axes) { let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9; for (const q2 of me) { const pr = q2[0] * ax[0] + q2[1] * ax[1]; if (pr < a0) a0 = pr; if (pr > a1) a1 = pr; } for (const q2 of ot) { const pr = q2[0] * ax[0] + q2[1] * ax[1]; if (pr < b0) b0 = pr; if (pr > b1) b1 = pr; } if (Math.min(a1, b1) - Math.max(a0, b0) <= -0.3) { sep = true; break; } } // separated by >=0.3m on some axis
        if (!sep) clear = false;
      }
      c._meshClear = clear;
    }

    // loose wheels physics
    for (const [, w] of this.looseWheels) {
      w.userData.vel.y -= 14 * dt;
      w.position.addScaledVector(w.userData.vel, dt);
      if (w.position.y < 0.38) { w.position.y = 0.38; w.userData.vel.y *= -0.45; w.userData.vel.x *= 0.9; w.userData.vel.z *= 0.94; }
      w.rotation.x += w.userData.spin * dt; w.rotation.z += w.userData.spin * 0.4 * dt;
    }
    // smoke fade
    this.smokeMeshes.forEach(sm => {
      sm.life -= dt;
      sm.m.children.forEach(c => { c.material.opacity = Math.max(0, sm.life / 5.5) * 0.75; c.scale.multiplyScalar(1 + dt * 0.25); });
      if (sm.life <= 0) this.scene.remove(sm.m);
    });
    this.smokeMeshes = this.smokeMeshes.filter(sm => sm.life > 0);
    // sparks
    this.sparks.forEach(s => {
      s.userData.life -= dt;
      if (s.userData.grow) { // dust puff: rises, expands, fades - no gravity
        s.userData.vel.y = Math.max(0.2, s.userData.vel.y - 1.5 * dt);
        s.scale.multiplyScalar(1 + s.userData.grow * dt);
        s.material.opacity = Math.max(0, Math.min(0.4, s.userData.life * 0.5));
      } else {
        s.userData.vel.y -= 12 * dt;
      }
      s.position.addScaledVector(s.userData.vel, dt);
      if (s.userData.life <= 0) this.scene.remove(s);
    });
    this.sparks = this.sparks.filter(s => s.userData.life > 0);

    // weather blend
    const target = { sun: 0, cloud: 0, rain: 0 }; target[race.weather] = 1;
    for (const k of ["sun", "cloud", "rain"]) this.skyMix[k] += (target[k] - this.skyMix[k]) * dt * 0.5;
    const mixCol = (key) => {
      const c = new THREE.Color(0, 0, 0);
      for (const k of ["sun", "cloud", "rain"]) c.add(new THREE.Color(this.skyStates[k][key]).multiplyScalar(this.skyMix[k]));
      return c;
    };
    this.scene.fog.color = mixCol("fog");
    const tint = { sun: 1.0, cloud: 0.78, rain: 0.5 };
    const tv = ["sun", "cloud", "rain"].reduce((a, k) => a + tint[k] * this.skyMix[k], 0);
    if (this.world.sky) this.world.sky.material.color.setScalar(tv);
    { const pp0 = this.carMeshes[0].position, sn = this.world.sun; sn.target.position.copy(pp0); sn.target.updateMatrixWorld(); sn.position.set(pp0.x - 140, pp0.y + 220, pp0.z - 80); }
    this.world.sun.intensity = ["sun", "cloud", "rain"].reduce((a, k) => a + this.skyStates[k].sun * this.skyMix[k], 0);
    this.world.hemi.intensity = ["sun", "cloud", "rain"].reduce((a, k) => a + this.skyStates[k].hemi * this.skyMix[k], 0);
    this.rain.visible = race.weather === "rain";
    if (this.rain.visible) {
      const posAttr = this.rain.geometry.attributes.position;
      const pp = this.carMeshes[0].position;
      for (let i = 0; i < posAttr.count; i++) {
        let y = posAttr.getY(i) - 55 * dt;
        if (y < 0) y = 60;
        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;
      this.rain.position.set(pp.x, pp.y, pp.z);
    }

    // player marker follows the player's car
    if (this.playerMark) {
      const pmk = this.carMeshes[this.followIdx];
      this.playerMark.position.set(pmk.position.x, pmk.position.y + 1.75 + Math.sin(race.time * 5) * 0.12, pmk.position.z);
      this.playerMark.rotation.y = race.time * 2;
      this.playerMark.visible = race.state === "racing" || race.state === "countdown";
    }
    // camera chase
    this.carMeshes.forEach((m, ci) => {
      const rl = m.userData.parts && m.userData.parts.rainLight;
      if (rl) rl.material.emissiveIntensity = this.race.weather === "rain" ? (Math.sin(this.race.time * 9 + ci) > 0 ? 2.2 : 0.4) : 0.5;
    });
    // crowd bobbing (tagged meshes, subtle vertical sway)
    if (this.world.crowd) {
      const tt = this.race.time;
      for (const o of this.world.crowd) o.position.y = o.userData.y0 + Math.sin(tt * 2.6 + o.userData.ph) * 0.05;
    }
    const pm = this.carMeshes[this.followIdx], pc = this.race.cars[this.followIdx];
    if (this.camMode === undefined) { this.camMode = "cockpit"; this.camera.near = 0.05; this.camera.updateProjectionMatrix();
      const bt = document.createElement("button"); bt.textContent = "CAM"; bt.id = "camBtn";
      bt.style.cssText = "position:fixed;top:10px;left:calc(50% + 28px);z-index:50;padding:6px 12px;font:bold 13px Arial;border-radius:8px;border:1px solid #fff8;background:#0008;color:#fff;pointer-events:auto;touch-action:manipulation";
      const tg = () => { this.camMode = this.camMode === "cockpit" ? "chase" : "cockpit"; this.camera.near = this.camMode === "cockpit" ? 0.05 : 0.1; this.camera.updateProjectionMatrix(); this.firstFrame = true; };
      bt.addEventListener("click", tg); window.addEventListener("keydown", e => { if (e.key === "c" || e.key === "C") tg(); });
      document.body.appendChild(bt); }
    const drvG = pm.userData.parts && pm.userData.parts.driver; if (drvG) drvG.visible = this.camMode !== "cockpit"; if (pm.userData.parts.engG) pm.userData.parts.engG.visible = this.camMode !== "cockpit"; if (pm.userData.parts.cpk) pm.userData.parts.cpk.visible = this.camMode !== "cockpit"; if (this.playerMark) this.playerMark.scale.setScalar(this.camMode === "cockpit" ? 0.0001 : 1);
    if (!this._tg) this._tg = this.scene.getObjectByProperty("type", "Group") && this.scene.children.find(o => o.userData && o.userData.cull);
    if (this._tg && (this._tc = (this._tc || 0) + 1) % 20 === 1) this._tg.userData.cull(pm.position);
    if ((this._lc = (this._lc || 0) + 1) % 20 === 2) this.carMeshes.forEach(m => { // far AI cars: swap the 117k-face STL for a box proxy (perf)
      if (m === pm || !m.userData.parts) return;
      const root = m.children[0]; if (!root) return;
      if (!m.userData.proxy) { let col = 0xcc2222; root.traverse(o => { if (o.isMesh && o.material && o.material.clearcoat !== undefined && o.material.color) col = o.material.color.getHex(); });
        const px = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 4.6), new THREE.MeshLambertMaterial({ color: col })); px.position.y = 0.45; px.visible = false; m.add(px); m.userData.proxy = px; }
      const far = false; // LOD proxy experiment removed; baseline always renders the full mesh
      root.visible = !far; m.userData.proxy.visible = far;
    });
    if (this.camMode === "cockpit") {
      pm.updateMatrixWorld(true);
      const speedK0 = pc.speed / 78;
      // Stabilized head: retain the car position, but reject suspension pitch/roll
      // and smooth heading corrections instead of copying every body twitch.
      const heading = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pm.rotation.y);
      if (!this._headQ || this.firstFrame) { this._headQ = heading.clone(); this.firstFrame = false; }
      this._headQ.slerp(heading, 1 - Math.exp(-dt * 10));
      this.camera.position.copy(new THREE.Vector3(0, CP[0], CP[1]).applyQuaternion(this._headQ).add(pm.position));
      this.camera.lookAt(new THREE.Vector3(0, CP[0] - 0.4, 18).applyQuaternion(this._headQ).add(pm.position));
      const tf = 80 + speedK0 * 10 + (pc.nitroT > 0 ? 8 : 0);
      this.camera.fov += (tf - this.camera.fov) * dt * 3; this.camera.updateProjectionMatrix();
      Sound.setEngine(pc.speed * 3.6, this.track.isOffRoad(pc.s, pc.d)); this.hud.update(dt); this.renderer.render(this.scene, this.camera); return;
    }
    const { t } = this.track.at(pc.s);
    const back = new THREE.Vector3(-t.x, 0, -t.z);
    const speedK = pc.speed / 78;
    const dist = 5.3 + speedK * 1.7, height = 1.75 + speedK * 0.45;
    const targetPos = pm.position.clone().addScaledVector(back, dist).add(new THREE.Vector3(0, height, 0));
    if (this.firstFrame) { this.camPos.copy(targetPos); this.firstFrame = false; }
    this.camPos.lerp(targetPos, Math.min(1, dt * 9.0));
    { // keep the follow lag bounded so the own car stays whole in frame at ordinary distance
      const off = this.camPos.clone().sub(pm.position); const maxD = dist + 2.5;
      if (off.length() > maxD) this.camPos.copy(pm.position).addScaledVector(off.normalize(), maxD);
    }
    const look = pm.position.clone().addScaledVector(t, 8).add(new THREE.Vector3(0, 0.85, 0));
    this.camLook.lerp(look, Math.min(1, dt * 11));
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const shakeVec = new THREE.Vector3((Math.random() - .5), (Math.random() - .5), (Math.random() - .5)).multiplyScalar(this.shake * 0.5);
    if (this.track.isOffRoad(pc.s, pc.d)) shakeVec.y += Math.abs(Math.sin(race.time * 40)) * 0.12;
    this.camera.position.copy(this.camPos).add(shakeVec);
    this.camera.lookAt(this.camLook);
    const targetFov = 62 + speedK * 10 + (pc.nitroT > 0 ? 8 : 0);
    this.camera.fov += (targetFov - this.camera.fov) * dt * 3;
    this.camera.updateProjectionMatrix();

    Sound.setEngine(pc.speed * 3.6, this.track.isOffRoad(pc.s, pc.d));
    this.hud.update(dt);
    this.renderer.render(this.scene, this.camera);
  }
                                                                         }
