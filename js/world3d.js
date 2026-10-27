// 3D world: track spline, scenery, procedural F1 cars. All geometry procedural.
import * as THREE from "../lib/three.module.js";
import * as BufferGeometryUtils from "../lib/BufferGeometryUtils.js";

export const TRACK_SAMPLES = 4000;

// ---------- Track definition ----------
// Yas Marina control points live in js/tracks/yas-marina.js (OSM data, ODbL, see header there).
import { CONTROL, ELEV } from "./tracks/yas-marina.js";
import { addScenery2, addEnv2, addTrackDetail, addPitComplex } from "./scenery2.js";

export const ROAD_HALF = 7.5;     // half width of drivable asphalt
export const RUNOFF = 6;          // grass strip still "ok-ish"

export class Track {
  constructor() {
    const pts = CONTROL.map(([x, z], i) => new THREE.Vector3(x, ELEV[i % ELEV.length], z));
    this.curve = new THREE.CatmullRomCurve3(pts, true, "centripetal", 0.5);
    this.curve.arcLengthDivisions = 20000; this.curve.updateArcLengths(); // default 200 divisions under-measured the lap by ~0.4%
    this.length = this.curve.getLength();
    const n = TRACK_SAMPLES;
    this.points = this.curve.getSpacedPoints(n);
    this.tangents = [];
    this.normals = [];
    this.curvatures = new Float32Array(n + 1);
    for (let i = 0; i <= n; i++) {
      const t = this.curve.getTangentAt(i / n);
      this.tangents.push(t);
      this.normals.push(new THREE.Vector3(-t.z, 0, t.x).normalize());
    }
    for (let i = 0; i <= n; i++) {
      const a = this.tangents[(i + n) % n], b = this.tangents[(i + 6) % (n + 1) === 0 ? n : (i + 6) % (n + 1)];
      const ang = Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z);
      const ds = this.length / n * 6;
      this.curvatures[i] = ang / Math.max(1, ds);
    }
    // Local usable half-width. Where the corner radius (per side, toward the corner centre) gets smaller than ROAD_HALF
    // the DRAWN inner edge is narrowed so the ribbon cannot fold; the sim uses the same value for the off-track test.
    // The axis is not changed. rMin[k] = smoothed minimum radius toward side (k=1: +normal/right, k=0: left).
    const dsS = this.length / n;
    this.rMin = [new Float32Array(n), new Float32Array(n)];
    this.halfW = [new Float32Array(n), new Float32Array(n)];
    for (const k of [0, 1]) {
      const sd = k ? 1 : -1, raw = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const a = this.tangents[i], b = this.tangents[(i + 1) % n];
        const ang = sd * Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z);
        raw[i] = ang > 1e-6 ? dsS / ang : 1e6;
      }
      const ero = new Float32Array(n);
      for (let i = 0; i < n; i++) { let m = 1e6; for (let j = -12; j <= 12; j++) m = Math.min(m, raw[(i + j + n) % n]); ero[i] = m; }
      for (let i = 0; i < n; i++) { let acc = 0; for (let j = -6; j <= 6; j++) acc += Math.min(ero[(i + j + n) % n], 400); this.rMin[k][i] = acc / 13; }
      for (let i = 0; i < n; i++) this.halfW[k][i] = Math.max(2.5, Math.min(ROAD_HALF, 0.7 * this.rMin[k][i]));
    }
  }
  isOffRoad(s, d) { // true when (s, d) is outside the drawn asphalt; the pit lane strip (d 7..14 on the right, s in [L-130, L+50)) counts as asphalt
    if (Math.abs(d) <= this.halfWidth(s, d)) return false;
    const sn = ((s % this.length) + this.length) % this.length;
    if (d > 0 && d <= 14 && (sn >= this.length - 130 || sn < 50)) return false;
    return true;
  }
  halfWidth(s, side) { // usable half-width at s on the given side (side > 0: right of travel)
    let u = (s / this.length) % 1; if (u < 0) u += 1;
    const n = TRACK_SAMPLES, f = u * n, i = Math.floor(f) % n, fr = f - Math.floor(f), h = this.halfW[side > 0 ? 1 : 0];
    return h[i] * (1 - fr) + h[(i + 1) % n] * fr;
  }
  at(s) { // s = distance along track
    const n = TRACK_SAMPLES;
    let u = (s / this.length) % 1; if (u < 0) u += 1;
    const f = u * n, i = Math.floor(f) % n, fr = f - Math.floor(f);
    const p = this.points[i].clone().lerp(this.points[(i + 1) % n], fr);
    const t = this.tangents[i].clone().lerp(this.tangents[(i + 1) % n], fr).normalize();
    const nrm = new THREE.Vector3(-t.z, 0, t.x);
    const curv = this.curvatures[i] * (1 - fr) + this.curvatures[(i + 1) % n] * fr;
    return { p, t, n: nrm, curv };
  }
  curvatureAhead(s, dist) {
    let m = 0;
    for (let k = 10; k < dist; k += 20) m = Math.max(m, Math.abs(this.at(s + k).curv));
    return m;
  }
  startS() { return 0; }
}

// ---------- Materials ----------
// CC0 photo textures (Poly Haven: asphalt_track, grass_ground by their authors; kloofendal_43d_clear_puresky HDRI by Greg Zaal, tone-mapped to JPEG)
const TL = new THREE.TextureLoader();
const PRE = {}; await Promise.all(["asphalt_track_Diffuse", "asphalt_track_nor_gl", "asphalt_track_Rough", "grass_ground_Diffuse", "sky_clear"].map(async (n) => { try { PRE[n] = await TL.loadAsync("assets/tex/" + n + ".jpg"); } catch (e) { console.warn("tex", n, e); } }));
function photoTex(url, srgb = true) { const n = url.replace(/^.*\//, "").replace(/\.jpg$/, ""); const t = PRE[n] ? PRE[n].clone() : TL.load(url); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }
const SKY_TEX = (() => { const t = PRE.sky_clear || TL.load("assets/tex/sky_clear.jpg"); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.offset.x = 0.3175; return t; })();
// procedural surface textures (own code): fine asphalt aggregate with patches and sealed cracks, and grass with blade noise
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function surfaceTex(kind) {
  const S = 512, c = document.createElement("canvas"); c.width = c.height = S; const x = c.getContext("2d"); const r = rng(kind === "asphalt" ? 11 : 29);
  if (kind === "asphalt") {
    x.fillStyle = "#d2d2d4"; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 26; i++) { const v = 190 + r() * 30; x.fillStyle = `rgba(${v},${v},${v + 3},0.22)`; x.beginPath(); x.ellipse(r() * S, r() * S, 30 + r() * 90, 20 + r() * 60, r() * 3, 0, 7); x.fill(); } // patches
    const img = x.getImageData(0, 0, S, S), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 70 + (r() < 0.04 ? 45 : 0) - (r() < 0.05 ? 55 : 0); d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    x.putImageData(img, 0, 0);
    x.strokeStyle = "rgba(40,40,44,0.55)"; x.lineWidth = 1.4;
    for (let k = 0; k < 3; k++) { x.beginPath(); let px = r() * S, py = r() * S; x.moveTo(px, py); for (let j = 0; j < 14; j++) { px += (r() - 0.5) * 50; py += 10 + r() * 24; x.lineTo(px, py); } x.stroke(); }
  } else {
    x.fillStyle = "#c9d4c0"; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 9000; i++) { const g = 150 + r() * 100; x.fillStyle = `rgba(${g * 0.8},${g},${g * 0.6},0.35)`; const w = 1 + r() * 2; x.fillRect(r() * S, r() * S, w, 3 + r() * 6); }
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(${r() < 0.5 ? "255,255,230" : "120,140,100"},0.1)`; x.beginPath(); x.ellipse(r() * S, r() * S, 20 + r() * 60, 20 + r() * 60, 0, 0, 7); x.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function lam(color, opts = {}) { return new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }); }
function lamS(color, opts = {}) { return new THREE.MeshPhongMaterial({ color, shininess: 60, specular: 0x2a2a30, ...opts }); } // smooth + subtle highlights (car bodywork)

// ---------- Procedural F1 car ----------
function buildCarProc(mainColor, accentColor, number, liv) {
  liv = liv || {}; // {title, wing, engine, deck} per-team livery spec
  const car = new THREE.Group();
  const main = lamS(mainColor), accent = lamS(accentColor), dark = lamS(0x16161c);
  const rimDark = lamS(0x2c2c34);
  const parts = {};
  const add = (mesh, x, y, z, parent = car) => { mesh.position.set(x, y, z); parent.add(mesh); return mesh; };

  // airfoil-profile wing extrusion: span along X, chord along Z (leading edge +Z)
  function wingGeo(chord, thick, width) {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.quadraticCurveTo(chord * 0.25, thick * 0.95, chord * 0.7, thick * 0.45);
    sh.quadraticCurveTo(chord * 0.95, thick * 0.15, chord, 0);
    sh.quadraticCurveTo(chord * 0.7, -thick * 0.35, chord * 0.3, -thick * 0.3);
    sh.quadraticCurveTo(chord * 0.08, -thick * 0.15, 0, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: true, bevelThickness: thick * 0.3, bevelSize: thick * 0.3, bevelSegments: 2, steps: 1 });
    g.translate(0, 0, -width / 2);
    g.rotateY(Math.PI / 2);
    return g;
  }
  // rounded-corner endplate: thin in X, lies in Y-Z plane
  function plateGeo(w, h, r, t) {
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2 + r, -h / 2);
    sh.lineTo(w / 2 - r, -h / 2); sh.absarc(w / 2 - r, -h / 2 + r, r, -Math.PI / 2, 0);
    sh.lineTo(w / 2, h / 2 - r); sh.absarc(w / 2 - r, h / 2 - r, r, 0, Math.PI / 2);
    sh.lineTo(-w / 2 + r, h / 2); sh.absarc(-w / 2 + r, h / 2 - r, r, Math.PI / 2, Math.PI);
    sh.lineTo(-w / 2, -h / 2 + r); sh.absarc(-w / 2 + r, -h / 2 + r, r, Math.PI, Math.PI * 1.5);
    const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false });
    g.translate(0, 0, -t / 2); g.rotateY(Math.PI / 2);
    return g;
  }
  // tapered loft along +Z: elliptical cross-section (w0/h0 rear -> w1/h1 front), droop bends the nose down
  // parametric loft along +Z: tapered superellipse cross-section, droop, and a rounded
  // closed tip (quarter-ellipsoid cap) so the nose is ONE continuous surface - no separate tip mesh.
  function loftGeo(len, w0, w1, h0, h1, droop, radial = 20, segs = 12, thStart = 0, thLen = Math.PI * 2, thGrow = 0, yPow = 1, proud = 0, colorFn = null) {
    const Nt = Math.max(3, radial), Ns = segs, Np = 6, uTip = 0.86;
    const prof = (u) => {
      const sm = u * u * (3 - 2 * u);
      return { w: (w0 + (w1 - w0) * sm) * (1 + proud), h: (h0 + (h1 - h0) * sm) * (1 + proud), yc: -droop * Math.pow(u, 1.7) };
    };
    const ring = (arr, u, sc, zOff) => {
      const p = prof(u);
      for (let j = 0; j <= Nt; j++) {
        const th = thStart + thLen * j / Nt;
        const x = Math.sin(th) * sc, y = -Math.cos(th) * sc;
        const yf = yPow === 1 ? y : Math.sign(y) * Math.pow(Math.abs(y), yPow);
        arr.push(x * p.w, yf * p.h + p.yc, -len / 2 + u * len + zOff);
        if (colorFn) { const c = colorFn(th, u); arr.colors.push(c[0], c[1], c[2]); }
      }
    };
    const positions = []; positions.colors = [];
    for (let i = 0; i <= Ns; i++) ring(positions, uTip * i / Ns, 1, 0);
    const pt = prof(uTip), tipD = Math.min(pt.w, pt.h) * 0.65; // shallow cap: chin reads as a band, not a ball
    for (let k = 1; k <= Np; k++) {
      const phi = k / Np * Math.PI / 2;
      ring(positions, uTip, Math.cos(phi), Math.sin(phi) * tipD);
    }
    const rows = Ns + 1 + Np, index = [];
    for (let r = 0; r < rows - 1; r++) for (let j = 0; j < Nt; j++) {
      const a = r * (Nt + 1) + j, b = a + 1, c = a + Nt + 1, d = c + 1;
      index.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    if (colorFn) g.setAttribute("color", new THREE.Float32BufferAttribute(positions.colors, 3));
    const uvs = [];
    for (let r = 0; r < rows; r++) {
      const vRow = r <= Ns ? (uTip * r / Ns) : (uTip + (1 - uTip) * (r - Ns) / Np);
      for (let j = 0; j <= Nt; j++) uvs.push((thStart + thLen * j / Nt) / (Math.PI * 2), vRow);
    }
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  }

  // front wing as ONE shaped planform surface (top view): broad chord, swept tapered tips
  function planformWing(width, lead, trail, thick, sweepTip) {
    const hw = width / 2;
    const sh = new THREE.Shape(); // shape y maps to world +Z (forward) after rotateX(PI/2)
    sh.moveTo(-hw, trail);
    sh.lineTo(-hw, lead - sweepTip);
    sh.quadraticCurveTo(-hw * 0.45, lead + 0.02, 0, lead);
    sh.quadraticCurveTo(hw * 0.45, lead + 0.02, hw, lead - sweepTip);
    sh.lineTo(hw, trail);
    sh.quadraticCurveTo(0, trail - 0.06, -hw, trail);
    const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1 });
    g.rotateX(Math.PI / 2);
    return g;
  }
  // swept endplate: tall at the rear, swooping low toward the front foot (ref silhouette)
  function sweptPlate(w, hRear, hFront, t) {
    const sh = new THREE.Shape(); // shape +x maps to world -Z (rear) after rotateY(PI/2)
    sh.moveTo(-w / 2, -0.02);
    sh.lineTo(w / 2, -0.02);
    sh.lineTo(w / 2, hRear);
    sh.quadraticCurveTo(w * 0.1, hRear * 0.75, -w / 2, hFront);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false });
    g.translate(0, 0, -t / 2); g.rotateY(Math.PI / 2);
    return g;
  }

  // floor (flat like the real thing), front tapered down+narrow so no dark slab shows behind the front wing
  const floorGeo = new THREE.BoxGeometry(1.55, 0.08, 4.2);
  {
    const pos = floorGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      if (z > 1.6) {
        const t = Math.min(1, (z - 1.6) / 0.7);
        pos.setX(i, pos.getX(i) * (1 - 0.55 * t));
        if (pos.getY(i) > 0) pos.setY(i, 0.07 - 0.12 * t);
      }
    }
    floorGeo.computeVertexNormals();
  }
  add(new THREE.Mesh(floorGeo, dark), 0, 0.28, 0);
  // monocoque: lofted tub (capsule-like), top painted dark like the mock's dark spine/shoulders
  const cMainV = new THREE.Color(mainColor), cDarkV = new THREE.Color(mainColor).multiplyScalar(0.5);
  const monoGeo = loftGeo(1.8, 0.50, 0.42, 0.28, 0.28, 0, 24, 10, 0, Math.PI * 2, 0, 1, 0,
    (th) => { const d = Math.abs(Math.PI - th); return d < 1.02 ? [cDarkV.r, cDarkV.g, cDarkV.b] : [cMainV.r, cMainV.g, cMainV.b]; });
  const monoMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60, specular: 0x2a2a30 });
  add(new THREE.Mesh(monoGeo, monoMat), 0, 0.52, 0.15);
  { const cap = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), dark); cap.scale.set(1.0, 0.56, 1); cap.rotation.y = Math.PI; add(cap, 0, 0.52, -0.749); }
  // cockpit opening
  const cpk = add(new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), dark), 0, 0.8, 0.3); cpk.scale.set(0.95, 0.32, 1.4); parts.cpk = cpk;
  // nose: wide rounded wedge, dark top deck over body-colour sides, drooping rounded tip
  // ONE surface: dark deck is a PAINTED PANEL on the top (vertex colors), green jaw below - no nested shells
  const cMain = new THREE.Color(mainColor), cDark = new THREE.Color(0x16161c);
  // nose livery as a crisp painted texture (UV = th around, v along): wide dark deck panel,
  // tall green sides, thin green piping on the deck edge, small crisp green V near the tip
  const deckHalf = (v) => 0.40 + 0.12 * v; // rad from top centerline; narrow dark spine (all mock noses)
  function noseTexture() {
    const W = 1024, H = 512;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const c2 = cv.getContext("2d");
    const mainCss = "#" + new THREE.Color(mainColor).getHexString();
    const accentCss = "#" + new THREE.Color(accentColor).getHexString();
    const deckStyle = liv.deck || "chevron";
    c2.fillStyle = mainCss; c2.fillRect(0, 0, W, H);
    c2.fillStyle = "#" + new THREE.Color(mainColor).multiplyScalar(0.8).getHexString(); // spine: darker team colour (all six mock noses)
    const panelBand = liv.noseSwap ? accentCss : null; // T2: orange panel on blue flanks (mock)
    for (let ix = 0; ix < W; ix++) {
      const th = ix / W * Math.PI * 2, d = Math.abs(Math.PI - th);
      for (let iy = 0; iy < H; iy += 2) {
        const v = 1 - iy / H;
        if (d < deckHalf(v)) c2.fillRect(ix, iy, 1, 2);
      }
    }
    if (panelBand) {
      c2.fillStyle = panelBand;
      for (let ix = 0; ix < W; ix++) {
        const th = ix / W * Math.PI * 2, d = Math.abs(Math.PI - th);
        for (let iy = 0; iy < H; iy += 2) {
          const v = 1 - iy / H;
          if (d >= deckHalf(v) && d < deckHalf(v) + 0.30) c2.fillRect(ix, iy, 1, 2);
        }
      }
    }
    // white diagonal edge lines at the panel's outer edge (all mock noses)
    c2.strokeStyle = "#f4f4f4"; c2.lineWidth = 9; c2.lineCap = "round";
    for (const sgn of [-1, 1]) {
      c2.beginPath();
      for (let iy = 0; iy <= H; iy += 4) {
        const v = 1 - iy / H, th = Math.PI + sgn * (deckHalf(v) + 0.30), ix = th / (Math.PI * 2) * W;
        iy === 0 ? c2.moveTo(ix, iy) : c2.lineTo(ix, iy);
      }
      c2.stroke();
    }
    if (deckStyle === "stripes") { // line inside the panel (T2: blue on orange; T4: white edge only)
      c2.strokeStyle = liv.noseSwap ? mainCss : accentCss; c2.lineWidth = 8;
      for (const sgn of [-1, 1]) {
        c2.beginPath();
        for (let iy = 0; iy <= H; iy += 4) {
          const v = 1 - iy / H, th = Math.PI + sgn * (deckHalf(v) + 0.15), ix = th / (Math.PI * 2) * W;
          iy === 0 ? c2.moveTo(ix, iy) : c2.lineTo(ix, iy);
        }
        c2.stroke();
      }
    }
    // small crisp V chevron on the deck near the tip, point toward the tip
    if (deckStyle === "stripes") {
      c2.strokeStyle = accentCss; c2.lineWidth = 16; c2.lineCap = "round";
      for (const off of [-0.18, 0.18]) {
        c2.beginPath();
        for (let iy = 0; iy <= H; iy += 4) {
          const v = 1 - iy / H, th = Math.PI + off * deckHalf(v), ix = th / (Math.PI * 2) * W;
          iy === 0 ? c2.moveTo(ix, iy) : c2.lineTo(ix, iy);
        }
        c2.stroke();
      }
    }
    const ax = W / 2, ayV = 0.90; // apex (tip side)
    const armV = 0.76, armTh = 0.24; // arms back and outward
    const pt = (th, v) => [th / (Math.PI * 2) * W, (1 - v) * H];
    const [axX, axY] = pt(Math.PI, ayV);
    if (deckStyle === "chevron") {
      c2.strokeStyle = "#f4f4f4"; c2.lineWidth = 12; c2.lineJoin = "round";
      c2.beginPath();
      let [lx, ly] = pt(Math.PI - armTh, armV); c2.moveTo(lx, ly); c2.lineTo(axX, axY);
      let [rx, ry] = pt(Math.PI + armTh, armV); c2.lineTo(rx, ry);
      c2.stroke();
    }
    // roundel painted INTO the deck texture (no floating decal): white disc + number at v~0.66
    if (number != null) {
      const cx = W / 2, cy = (1 - 0.80) * H; // roundel near the tip (B7: number at the tip)
      c2.fillStyle = "#f4f4f4"; c2.beginPath(); c2.arc(cx, cy, 56, 0, Math.PI * 2); c2.fill();
      c2.save(); c2.translate(cx, cy); c2.rotate(Math.PI); // readable from the front
      c2.fillStyle = "#14141a"; c2.font = "bold 66px Arial, sans-serif";
      c2.textAlign = "center"; c2.textBaseline = "middle";
      c2.fillText(String(number), 0, 4);
      c2.restore();
    }
    // title LAST so nothing draws over it: white bold with dark outline, tip -> cockpit
    if (liv.title) {
      c2.save();
      c2.translate(W / 2, H * 0.45); // behind the roundel, toward the cockpit (B7)
      c2.rotate(-Math.PI / 2);
      c2.font = "bold 84px Arial, sans-serif";
      c2.textAlign = "center"; c2.textBaseline = "middle";
      c2.lineWidth = 10; c2.strokeStyle = "#101016"; c2.lineJoin = "round";
      c2.strokeText(liv.title, 0, 0, H * 0.26);
      c2.fillStyle = "#f4f4f4";
      c2.fillText(liv.title, 0, 0, H * 0.26);
      c2.restore();
    }

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    tex.anisotropy = 4;
    return tex;
  }
  const noseGeo = loftGeo(2.2, 0.48, 0.24, 0.40, 0.14, 0.20, 48, 14, 0, Math.PI * 2, 0, 2.2, 0, null);
  add(new THREE.Mesh(noseGeo, new THREE.MeshPhongMaterial({ map: noseTexture(), shininess: 55, specular: 0x2a2a30 })), 0, 0.55, 1.30);
  // sidepods: sculpted tapered lofts; white swirl band + dark front-top inlet painted in (mock B7)
  const cWhiteV = new THREE.Color(accentColor); // pod crescent/swoosh = team accent (B7 white, T2 orange, per mock sheets)
  const podMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60, specular: 0x2a2a30 });
  [-1, 1].forEach(sx => {
    const podGeo = loftGeo(2.7, 0.12, 0.31, 0.18, 0.34, 0, 24, 12, 0, Math.PI * 2, 0, 1, 0,
      (th, u) => {
        const d = (Math.PI - th) * sx; // 0=top crest, +pi/2=outer flank, +pi=bottom, <0=inner side
        if (u > 0.88 && Math.abs(Math.PI - th) < 0.6) return [cDarkV.r, cDarkV.g, cDarkV.b]; // inlet
        const W = [cWhiteV.r, cWhiteV.g, cWhiteV.b];
        const slash = u > 0.16 && u < 0.34 && d > 0.9 && d < 1.35; // red streak inside the top crescent (mock)
        if (d > -0.55 && d < 1.35 && u < 0.52 - 0.10 * (Math.max(d, 0) / 1.35) && !slash) return W; // top-rear crescent
        const dc = u >= 0.42 ? 2.15 : 2.15 - 6.5 * (0.42 - u); // swoosh: low under the title, sharp upsweep behind it (mock)
        if (u > 0.12 && u < 0.85 && d > dc - 0.42 && d < dc + 0.42) return W; // diagonal flank swoosh
        if (u < 0.30 && d > -0.3 && d < 2.6 && !slash) return W; // rear wrap
        return [cMainV.r, cMainV.g, cMainV.b];
      });
    add(new THREE.Mesh(podGeo, podMat), sx * 0.66, 0.52, -0.55);
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.14, 14), dark); cap.scale.set(1, 1.4, 1); cap.rotation.y = Math.PI; add(cap, sx * 0.62, 0.52, -1.849);
  });
  // engine cover: smooth tapered spine rising to the airbox, then round intake + T-cam
  const _n1 = car.children.length;
  const engGeo = loftGeo(1.7, 0.22, 0.22, 0.10, 0.24, 0);
  add(new THREE.Mesh(engGeo, main), 0, 0.82, -1.15);
  const intake = add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.26, 16), dark), 0, 1.12, -0.33); intake.rotation.x = Math.PI / 2;
  add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.03), dark), 0, 1.19, -0.33); // T-cam post
  add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.045, 0.1), dark), 0, 1.245, -0.33); // T-cam bar
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 6), dark), 0, 1.18, -0.75); // antenna
  { const eg = new THREE.Group(); car.children.slice(_n1).forEach(c => eg.add(c)); car.add(eg); parts.engG = eg; }
  const _n0 = car.children.length;
  // driver: accent helmet + dark visor + rounded headrest (no halo, like the original)
  add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), lamS(0xf2f2f4)), 0, 0.98, 0.3); // helmet: white shell, team-colour crown stripe (all mockups)
  const visor = add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), dark), 0, 1.0, 0.38); visor.scale.set(0.9, 0.45, 0.6);
  const torso = add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10), main), 0, 0.78, 0.14); torso.scale.set(1.15, 0.8, 0.95); // driver shoulders (press-kit figure)
  add(new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.035, 0.05), dark), 0, 1.02, 0.44); // visor slit
  add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.18), main), 0, 1.115, 0.28); // helmet crown stripe (B7: crimson band)
  [-1, 1].forEach(sx => { const arm = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.3, 4, 8), main), sx * 0.24, 0.78, 0.42); arm.rotation.x = -1.1; arm.rotation.z = sx * 0.35; }); // arms to the wheel
  const hr = add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), dark), 0, 0.93, 0.02); hr.scale.set(1.0, 0.62, 0.5);
  { const drv = new THREE.Group(); car.children.slice(_n0).forEach(c => drv.add(c)); car.add(drv); parts.driver = drv; }
  // halo: swept tube over the cockpit with a front pillar (own geometry), body colour
  { const hm = main;
    const pts = [[-0.3,0.74,-0.18],[-0.33,1.0,0.12],[-0.24,1.2,0.5],[-0.1,1.22,0.76],[0,1.2,0.82],[0.1,1.22,0.76],[0.24,1.2,0.5],[0.33,1.0,0.12],[0.3,0.74,-0.18]].map(p => new THREE.Vector3(p[0],p[1],p[2]));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.02, 8, false), hm); car.add(tube);
    const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.5, 8), hm); pil.position.set(0, 0.97, 0.86); pil.rotation.x = -0.55; car.add(pil);
    // steering wheel + dash
    const sw = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.05), lamS(0x55555f)); sw.position.set(0, 1.0, 0.34); sw.rotation.x = 0.9; sw.scale.set(0.62, 0.5, 1); car.add(sw);
    const scr = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.01), new THREE.MeshBasicMaterial({ color: 0x1f8a52 })); scr.position.set(0, 1.026, 0.32); scr.rotation.x = 0.9; scr.scale.set(0.45, 0.5, 1); car.add(scr); }
  // mirrors
  const mirrorWhite = lamS(0xf2f2f4);
  [-1, 1].forEach(sx => {
    add(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 0.035), dark), sx * 0.56, 0.82, 0.55); // stalk
    add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.05), main), sx * 0.63, 0.92, 0.55); // mirror: white badge plate (B7 ref)
  });
  // diffuser + strakes + rain light
  add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.4), main), 0, 0.45, -2.2);
  [-0.3, 0, 0.3].forEach(dx => add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.5), dark), dx, 0.4, -2.25));
  const rainLight = add(new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.15, 0.05), new THREE.MeshLambertMaterial({ color: 0x550000, emissive: 0xff2020, emissiveIntensity: 0.22 })), 0, 0.60, -2.46);
  parts.rainLight = rainLight;
  // suspension arms at axle height
  [[-0.95, 1.45, 0.46], [0.95, 1.45, 0.46], [-0.98, -1.2, 0.54], [0.98, -1.2, 0.54]].forEach(([wx, wz, wy]) => {
    add(new THREE.Mesh(new THREE.BoxGeometry(Math.abs(wx) - 0.3, 0.05, 0.07), dark), wx / 2, wy + 0.1, wz);
    add(new THREE.Mesh(new THREE.BoxGeometry(Math.abs(wx) - 0.3, 0.05, 0.07), dark), wx / 2, wy - 0.1, wz);
  });
  // twin nose struts: raised tip -> visible gap + pylons down to the wing (press-kit layout)
  [-1, 1].forEach(sx => add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.20, 0.07), main), sx * 0.15, 0.24, 2.36));
  // front wing: wide BLACK planes + LOW endplates (press-kit layout)

  add(new THREE.Mesh(planformWing(1.66, 0.58, 0, 0.03, 0.17), main), 0, 0.14, 2.05); // ONE wide low flat plane (ref: flat dark shelf)
  add(new THREE.Mesh(planformWing(1.66, 0.60, 0.50, 0.06, 0.02), accent), 0, 0.128, 2.05); // accent leading-edge frame (B7: white-black wing)
  [-1, 1].forEach(sx => {
    add(new THREE.Mesh(sweptPlate(0.92, 0.24, 0.12, 0.05), accent), sx * 0.82, 0.05, 2.28); // LOW dark endplates (no tall facade)
    add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.55), accent), sx * 0.82, 0.30, 2.18); // thin accent stripe on endplate top edge
    add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 0.5), main), sx * 0.82, 0.26, 2.22); // main-colour stripe under it (B7 wing stripes)
  });
  // front suspension wishbones (thin dark rods, visible in the press-kit front view)
  const rod = (ax, ay, az, bx, by, bz) => {
    const dir = new THREE.Vector3(bx - ax, by - ay, bz - az);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, dir.length(), 6), dark);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    add(m, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  };
  for (const s of [-1, 1]) { // V-wishbones: paired rods converge at the wheel upright
    rod(s * 0.26, 0.55, 1.12, s * 0.78, 0.58, 1.45);
    rod(s * 0.26, 0.55, 1.68, s * 0.78, 0.58, 1.45);
    rod(s * 0.28, 0.36, 1.12, s * 0.80, 0.40, 1.45);
    rod(s * 0.28, 0.36, 1.68, s * 0.80, 0.40, 1.45);
    rod(s * 0.78, 0.58, 1.45, s * 0.80, 0.40, 1.45); // upright
  }
  // rear wing: LOW dark airfoil (top edge at helmet height) + slim rounded endplates, no number board
  add(new THREE.Mesh(wingGeo(0.38, 0.07, 1.35), accent), 0, 0.88, -2.28);
  const rFlap = add(new THREE.Mesh(wingGeo(0.26, 0.05, 1.31), accent), 0, 1.1, -2.3); rFlap.rotation.x = -0.3;
  add(new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.02, 0.22), accent), 0, 1.15, -2.36); // livery top edge
  [-1, 1].forEach(sx => add(new THREE.Mesh(plateGeo(0.55, 0.36, 0.1, 0.04), main), sx * 0.68, 0.95, -2.25));
  add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.4, 0.07), dark), -0.28, 0.66, -2.15);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.4, 0.07), dark), 0.28, 0.66, -2.15);

  // ---- team livery decals: number roundel + sponsor texts (transparent canvas planes) ----
  function textTexture(text, color, w, h, font) {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const c2 = cv.getContext("2d");
    c2.clearRect(0, 0, w, h);
    c2.fillStyle = color; c2.font = font || ("bold " + Math.floor(h * 0.62) + "px Arial, sans-serif");
    c2.textAlign = "center"; c2.textBaseline = "middle";
    c2.fillText(text, w / 2, h / 2);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.anisotropy = 4;
    return tex;
  }
  function decal(tex, w, h, x, y, z, ry, rx) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.rotation.order = "YXZ"; if (ry) m.rotation.y = ry; if (rx) m.rotation.x = rx;
    add(m, x, y, z); m.renderOrder = 2;
    return m;
  }
  if (liv.title) { // title sponsor on both sidepods, white text facing outward + B7 white swoosh panel below
    const tex = textTexture(liv.title, "#f4f4f4", 512, 96);
    decal(tex, 0.90, 0.19, 0.875, 0.52, -0.38, Math.PI / 2, 0);
    decal(tex, 0.90, 0.19, -0.875, 0.52, -0.38, -Math.PI / 2, 0);
    // white accent swoosh panel under the title (B7: white side panel)
    const sw = document.createElement("canvas"); sw.width = 512; sw.height = 128;
    const c3 = sw.getContext("2d");
    c3.clearRect(0, 0, 512, 128);
    c3.fillStyle = "#" + new THREE.Color(accentColor).getHexString();
    c3.beginPath();
    c3.moveTo(0, 96); c3.quadraticCurveTo(200, 30, 512, 10);
    c3.lineTo(512, 58); c3.quadraticCurveTo(220, 78, 0, 126);
    c3.closePath(); c3.fill();
    const swTex = new THREE.CanvasTexture(sw);
    swTex.colorSpace = THREE.SRGBColorSpace; swTex.minFilter = THREE.LinearFilter; swTex.generateMipmaps = false;
    decal(swTex, 1.00, 0.25, 0.868, 0.36, -0.42, Math.PI / 2, 0);
    decal(swTex, 1.00, 0.25, -0.868, 0.36, -0.42, -Math.PI / 2, 0);
  }
  if (liv.wing) { // front-wing sponsor on the black plane top, white text reading from the front
    const tex = textTexture(liv.wing, "#f4f4f4", 512, 80);
    [-1, 1].forEach(sx => decal(tex, 0.70, 0.13, sx * 0.44, 0.215, 2.33, 0, -Math.PI / 2));
    const rwTex = textTexture(liv.rw || liv.wing, "#" + new THREE.Color(accentColor).getHexString(), 512, 80);
    decal(rwTex, 1.35, 0.20, 0, 1.06, -2.44, Math.PI, 0); // rear wing flap rear face
  }
  if (liv.shoulder) { // shoulder sponsor on the cockpit shoulder band, both sides (B7: MERIONYX)
    const tex = textTexture(liv.shoulder, "#f4f4f4", 512, 80, "bold 46px Arial, sans-serif");
    decal(tex, 0.60, 0.10, 0.30, 0.80, -0.35, Math.PI / 2, -Math.PI / 4);
    decal(tex, 0.60, 0.10, -0.30, 0.80, -0.35, -Math.PI / 2, -Math.PI / 4);
  }
  if (liv.engine) { // engine-cover sponsor, small text both sides of the spine
    const tex = textTexture(liv.engine, "#" + new THREE.Color(accentColor).getHexString(), 384, 72, "bold 44px Arial, sans-serif");
    decal(tex, 0.72, 0.135, 0.175, 0.92, -1.15, Math.PI / 2, 0);
    decal(tex, 0.72, 0.135, -0.175, 0.92, -1.15, -Math.PI / 2, 0);
  }

  // wheels: wide slicks, DARK sidewalls, small dark rims, painted compound stripes on the tread only
  function tyreTexture() {
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 32;
    const c2 = cv.getContext("2d");
    c2.fillStyle = "#0d0d12"; c2.fillRect(0, 0, 256, 32);
    c2.fillStyle = "#" + new THREE.Color(accentColor).getHexString();
    
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = 2;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    return tex;
  }
  const tyreMat = new THREE.MeshLambertMaterial({ map: tyreTexture() });
  const sideTex = (() => { const cv = document.createElement("canvas"); cv.width = cv.height = 128; const c = cv.getContext("2d");
    c.fillStyle = "#0c0c11"; c.fillRect(0, 0, 128, 128); c.fillStyle = ["#e8302a", "#f5c518", "#2f6fe0"][(number | 0) % 3];
    c.beginPath(); c.arc(64, 64, 60, 0, 6.2832); c.arc(64, 64, 40, 0, 6.2832, true); c.fill();
    c.fillStyle = "#15151b"; c.beginPath(); c.arc(64, 64, 34, 0, 6.2832); c.fill(); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const sideMat = new THREE.MeshLambertMaterial({ map: sideTex, emissive: 0xffffff, emissiveMap: sideTex, emissiveIntensity: 0.55 });
  const wheelSpecs = [
    [-0.95, 1.5, 0.42, 0.34], [0.95, 1.5, 0.42, 0.34],
    [-0.98, -1.3, 0.5, 0.46], [0.98, -1.3, 0.5, 0.46],
  ];
  parts.wheels = [];
  wheelSpecs.forEach(([x, z, r, wdt]) => {
    const w = new THREE.Group();
    const tread = new THREE.Mesh(new THREE.CylinderGeometry(r, r, wdt, 28, 1, true), tyreMat); tread.rotation.z = Math.PI / 2; w.add(tread);
    [-1, 1].forEach(sx => {
      const sw = new THREE.Mesh(new THREE.CircleGeometry(r * 0.995, 24), sideMat);
      sw.position.x = sx * wdt / 2; sw.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2; w.add(sw);
    });
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.36, r * 0.36, wdt + 0.02, 18), rimDark); rim.rotation.z = Math.PI / 2; w.add(rim);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.36, 0.018, 8, 24), accent);
    ring.position.x = wdt / 2 + 0.012; ring.rotation.y = Math.PI / 2; w.add(ring);
    const ring2 = ring.clone(); ring2.position.x = -wdt / 2 - 0.012; w.add(ring2);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.1, r * 0.1, wdt + 0.04, 10), lamS(0x45454e)); hub.rotation.z = Math.PI / 2; w.add(hub);
    w.position.set(x, r, z);
    car.add(w); parts.wheels.push(w);
  });
  parts.blob = add(new THREE.Mesh(new THREE.CircleGeometry(2.4, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })), 0, 0.02, 0);
  parts.blob.rotation.x = -Math.PI / 2; parts.blob.scale.set(0.55, 1.05, 1);
  car.userData.parts = parts;
  return car;
}


// ---------- Licensed CC0 car model (Grab3D "Race Car", see assets/car-LICENSE.txt) ----------
// procedural equirect sky used only as reflection source for the car's glossy materials
const ENV_TEX = (() => {
  const c = document.createElement("canvas"); c.width = 256; c.height = 128; const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, "#3d7fd0"); g.addColorStop(0.42, "#bcdcf5"); g.addColorStop(0.5, "#f4f1e6"); g.addColorStop(0.52, "#6b7a5a"); g.addColorStop(1, "#2f3a2c");
  x.fillStyle = g; x.fillRect(0, 0, 256, 128);
  const sg = x.createRadialGradient(80, 34, 0, 80, 34, 22); sg.addColorStop(0, "rgba(255,250,230,1)"); sg.addColorStop(1, "rgba(255,250,230,0)"); x.fillStyle = sg; x.fillRect(0, 0, 256, 128);
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; return t;
})();
import { GLTFLoader } from "../lib/GLTFLoader.js";
let CAR_TPL = null;
try {
  const g = await new GLTFLoader().loadAsync("assets/car.glb");
  CAR_TPL = g.scene;
} catch (e) { console.warn("car.glb failed, procedural fallback", e); }
const _texCache = new Map();
function teamTexture(src, rgb) {
  const key = rgb.join(",");
  if (_texCache.has(key)) return _texCache.get(key);
  const img = src.image, w = img.width, h = img.height;
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const cx = cv.getContext("2d"); cx.drawImage(img, 0, 0);
  const d = cx.getImageData(0, 0, w, h), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], g = p[i + 1], b = p[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn > 40 && r >= g && g >= b && r > 120) { // the orange body paint
      const k = (0.3 * r + 0.59 * g + 0.11 * b) / 175;
      p[i] = Math.min(255, rgb[0] * k); p[i + 1] = Math.min(255, rgb[1] * k); p[i + 2] = Math.min(255, rgb[2] * k);
    }
  }
  cx.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.flipY = src.flipY; t.colorSpace = src.colorSpace; t.anisotropy = 4;
  _texCache.set(key, t); return t;
}
let TREE_TPL = null; try { TREE_TPL = (await new GLTFLoader().loadAsync("assets/tree_jacaranda_game.glb")).scene; } catch (e) { console.warn("tree glb", e); }
let TREE_FAR = null; try { TREE_FAR = (await new GLTFLoader().loadAsync("assets/tree_jacaranda_far.glb")).scene; } catch (e) { console.warn("tree far glb", e); }
let STL_TPL = null;
try {
  const g = await new GLTFLoader().loadAsync("assets/car_stl.glb");
  STL_TPL = g.scene;
  STL_TPL.traverse(o => { if (o.isMesh) { o.geometry = BufferGeometryUtils.toCreasedNormals(o.geometry, 0.7); } });
} catch (e) { console.warn("car_stl.glb failed", e); }
export function buildCar(mainColor, accentColor, number, liv) {
  if (!STL_TPL) return buildCarProc(mainColor, accentColor, number, liv);
  const car = new THREE.Group(), parts = {};
  const root = STL_TPL.clone(true);
  parts.wheels = [];
  const wmap = {};
  root.traverse(o => {
    if (o.isMesh) {
      const n = (o.material.name || "");
      let mat;
      if (n === "paint") mat = new THREE.MeshPhysicalMaterial({ color: mainColor, roughness: 0.32, metalness: 0.05, roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.2, envMap: ENV_TEX, envMapIntensity: 0.12 });
      else if (n === "rim") mat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.28, metalness: 0.9, envMap: ENV_TEX, envMapIntensity: 0.8 });
      else if (n === "tyre") mat = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.9 });
      else mat = new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.45, metalness: 0.5, envMap: ENV_TEX, envMapIntensity: 0.8 });
      mat.side = THREE.DoubleSide; o.material = mat; o.castShadow = true;
      const w = /^(wheel_(?:front|rear)_[lr])_(tyre|rim)$/.exec(o.name);
      if (w) (wmap[w[1]] = wmap[w[1]] || []).push(o);
    }
    if (/^steering_wheel/.test(o.name)) parts.steer = o;
  });
  // one pivot per wheel so tyre and rim spin and steer together
  for (const k in wmap) {
    const pv = new THREE.Group(); pv.name = k; pv.position.copy(wmap[k][0].position);
    wmap[k].forEach(m => { m.position.set(0, 0, 0); pv.add(m); });
    root.add(pv); parts.wheels.push(pv);
  }
  car.add(root);
  parts.driver = new THREE.Group(); car.add(parts.driver);
  parts.cpk = new THREE.Group(); car.add(parts.cpk);
  parts.engG = new THREE.Group(); car.add(parts.engG);
  parts.blob = new THREE.Mesh(new THREE.CircleGeometry(2.4, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
  parts.blob.name = "blob";
  parts.blob.position.y = 0.02; parts.blob.rotation.x = -Math.PI / 2; parts.blob.scale.set(0.45, 1.1, 1); car.add(parts.blob);
  car.userData.parts = parts;
  return car;
}
// loose wheel that flies off (minus-wheel card)
export function buildLooseWheel(accentColor) {
  const w = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.42, 16), lam(0x111114));
  tyre.rotation.z = Math.PI / 2; w.add(tyre);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.44, 12), lam(accentColor));
  rim.rotation.z = Math.PI / 2; w.add(rim);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 6, 18), lam(accentColor));
  ring.rotation.y = Math.PI / 2; w.add(ring);
  return w;
}

// oil slick decal
export function buildOilSlick() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CircleGeometry(2.2, 18), new THREE.MeshLambertMaterial({ color: 0x0a0a10, transparent: true, opacity: 0.92 }));
  m.rotation.x = -Math.PI / 2; m.scale.set(1.3, 1, 0.8);
  const shine = new THREE.Mesh(new THREE.CircleGeometry(1.1, 14), new THREE.MeshBasicMaterial({ color: 0x3a3a55, transparent: true, opacity: 0.5 }));
  shine.rotation.x = -Math.PI / 2; shine.position.set(0.4, 0.01, 0.3); shine.scale.set(1.2, 0.7, 1);
  g.add(m); g.add(shine);
  return g;
}

// smoke puff
export function buildSmoke() {
  const g = new THREE.Group();
  for (let i = 0; i < 11; i++) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2 + Math.random() * 1.2, 0),
      new THREE.MeshLambertMaterial({ color: 0xa8a8b4, transparent: true, opacity: 0.82, flatShading: true }));
    s.position.set((Math.random() - 0.5) * 7, 0.8 + Math.random() * 2.6, (Math.random() - 0.5) * 7);
    g.add(s);
  }
  return g;
}

// ---------- Scenery ----------
function roundTree(h = 5) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, h * 0.4, 5), lam(0x6b4a2f));
  trunk.position.y = h * 0.2; g.add(trunk);
  const greens = [0x3f8f3a, 0x4da344, 0x357a32];
  for (let i = 0; i < 3; i++) {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(h * (0.42 - i * 0.07), 1), lam(greens[i % 3]));
    blob.position.set((i - 1) * h * 0.22, h * (0.55 + i * 0.16), (i % 2 - 0.5) * h * 0.2);
    g.add(blob);
  }
  return g;
}
function tree(h = 6) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, h * 0.35, 5), lam(0x6b4a2f));
  trunk.position.y = h * 0.17; g.add(trunk);
  const greens = [0x3f8f3a, 0x4da843, 0x357a30, 0x5cb85a];
  let y = h * 0.3;
  const layers = UtilLayers(h);
  layers.forEach((k, i) => {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(h * 0.28 * (1 - i * 0.22), h * 0.34, 6), lam(greens[i % greens.length]));
    cone.position.y = y + h * 0.16; g.add(cone); y += h * 0.2;
  });
  return g;
}
function UtilLayers(h) { return h > 7 ? [1, 1, 1, 1] : [1, 1, 1]; }

function mountain(h, r, color) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), lam(color));
  m.position.y = h / 2 - 2;
  return m;
}

function tent(color) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 6), lam(0xf2f2f2));
  base.position.y = 1.3; g.add(base);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.2, 4), lam(color));
  roof.position.y = 3.7; roof.rotation.y = Math.PI / 4; g.add(roof);
  return g;
}

function crowdStand(w = 14) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, 3.4, 3), lam(0xb8bec8));
  base.position.y = 1.7; g.add(base);
  const colors = [0xd94f4f, 0x4f7ed9, 0xe0c04f, 0x55bb66, 0xdddddd, 0x333944, 0xd97fb0];
  for (let r = 0; r < 3; r++) for (let i = 0; i < Math.floor(w / 0.9); i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.4), lam(colors[(i * 7 + r * 3) % colors.length]));
    p.position.set(-w / 2 + 0.7 + i * 0.9, 2.3 + r * 0.8, -0.9 + r * 0.9);
    p.userData.bob = 1; p.userData.y0 = p.position.y; p.userData.ph = (i * 1.7 + r * 2.3) % 6.28;
    g.add(p);
  }
  const roofM = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.25, 3.6), lam(0x8f97a5));
  roofM.position.y = 3.75; g.add(roofM);
  return g;
}


function billboard(hue) {
  // generic colour-block advertising board, no real brands
  const g = new THREE.Group();
  for (const px of [-2.6, 2.6]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.6, 0.22), lam(0x555c68));
    post.position.set(px, 1.3, 0); g.add(post);
  }
  const cv = document.createElement("canvas"); cv.width = 128; cv.height = 48;
  const c = cv.getContext("2d");
  const pals = [["#d94f4f", "#f2f2f2", "#7a1f1f"], ["#2b5ea7", "#f2f2f2", "#e0c04f"], ["#22262e", "#e0c04f", "#d94f4f"], ["#f2f2f2", "#2b5ea7", "#d94f4f"]];
  const pal = pals[hue % pals.length];
  c.fillStyle = pal[0]; c.fillRect(0, 0, 128, 48);
  c.fillStyle = pal[1]; c.fillRect(0, 30, 128, 18);
  c.fillStyle = pal[2]; c.beginPath(); c.arc(24, 15, 11, 0, 7); c.fill();
  c.fillStyle = pal[1]; c.fillRect(48, 8, 66, 6); c.fillRect(48, 18, 44, 5);
  const tex = new THREE.CanvasTexture(cv);
  const backM = new THREE.MeshLambertMaterial({ color: pal[0] }); // plain brand-colour body, no mirrored texture
  const panel = new THREE.Mesh(new THREE.BoxGeometry(6.4, 2.4, 0.16), backM);
  panel.position.y = 3.4; g.add(panel);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2.4), new THREE.MeshLambertMaterial({ map: tex }));
  face.position.set(0, 3.4, 0.085); g.add(face);
  return g;
}


function chevronSign() {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 0.18), lam(0x444a55));
  post.position.y = 0.8; g.add(post);
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 0.12), lam(0xf7c90f));
  board.position.y = 2.0; g.add(board);
  // two ">>" chevrons pointing along the corner
  for (const cx of [-0.5, 0.4]) {
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.26, 0.14), lam(0x14161c));
    top.position.set(cx - 0.3, 2.28, 0); top.rotation.z = -0.6; g.add(top);
    const bot = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.26, 0.14), lam(0x14161c));
    bot.position.set(cx - 0.3, 1.72, 0); bot.rotation.z = 0.6; g.add(bot);
  }
  return g;
}


function brakeBoard(meters) {
  // F1-style braking marker: white board, red stripe, black distance number
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.5, 0.14), lam(0x444a55));
  post.position.y = 0.75; g.add(post);
  const cv = document.createElement("canvas"); cv.width = 64; cv.height = 80;
  const c = cv.getContext("2d");
  c.fillStyle = "#f4f4f4"; c.fillRect(0, 0, 64, 80);
  c.fillStyle = "#d92b2b"; c.fillRect(0, 0, 64, 14);
  c.fillStyle = "#14161c"; c.font = "bold 44px sans-serif";
  c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText(String(meters), 32, 48);
  const tex = new THREE.CanvasTexture(cv);
  const backB = new THREE.MeshLambertMaterial({ color: 0xf4f4f4 }); // plain white body
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.08), backB);
  panel.position.y = 1.9; g.add(panel);
  const faceB = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1), new THREE.MeshLambertMaterial({ map: tex }));
  faceB.position.set(0, 1.9, 0.045); g.add(faceB);
  return g;
}

function gantry() { // start/finish arch
  const g = new THREE.Group();
  const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), lam(0xd8dde5)); p1.position.set(-ROAD_HALF - 1.2, 3.5, 0);
  const p2 = p1.clone(); p2.position.x = ROAD_HALF + 1.2;
  const top = new THREE.Mesh(new THREE.BoxGeometry((ROAD_HALF + 1.2) * 2 + 0.6, 1.1, 0.7), lam(0x22262e));
  top.position.y = 7;
  g.add(p1, p2, top);
  for (let i = 0; i < 8; i++) {
    const sq = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffffff : 0x111111 }));
    sq.position.set(-(ROAD_HALF + 1.2) + 0.8 + i * ((ROAD_HALF + 1.2) * 2 - 1.6) / 7, 7, 0.36);
    g.add(sq);
  }
  return g;
}

// ---------- Build whole scene ----------
export function buildWorld(scene, track) {
  scene.fog = new THREE.Fog(0x9fc7e8, 185, 840);

  // sky dome
  const skyGeo = new THREE.SphereGeometry(2900, 16, 12);
  const skyCanvas = document.createElement("canvas"); skyCanvas.width = 1024; skyCanvas.height = 256;
  const c2 = skyCanvas.getContext("2d");
  const grd = c2.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "#1659c4"); grd.addColorStop(0.5, "#4a9ae6"); grd.addColorStop(0.8, "#c8e6fa"); grd.addColorStop(1, "#ffe9c0");
  c2.fillStyle = grd; c2.fillRect(0, 0, 1024, 256);
  { const rr = rng(77); // soft cumulus layer in the mid sky (wraps horizontally), haze toward the horizon
    const hz = c2.createLinearGradient(0, 160, 0, 256); hz.addColorStop(0, "rgba(220,235,245,0)"); hz.addColorStop(1, "rgba(235,238,235,0.55)"); c2.fillStyle = hz; c2.fillRect(0, 160, 1024, 96); }
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ map: SKY_TEX, side: THREE.BackSide, fog: false, toneMapped: false }));
  sky.frustumCulled = false; sky.onBeforeRender = (r, sc, cam) => { sky.position.copy(cam.position); sky.updateMatrixWorld(); };
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xd6ecff, 0x4a7d3a, 1.08);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffdf9e, 1.92);
  sun.position.set(-140, 220, -80);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); { const sc = sun.shadow.camera; sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 50; sc.far = 600; } sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05; scene.add(sun.target);
  scene.add(sun);

  // ground
  const grassTex = photoTex("assets/tex/grass_ground_Diffuse.jpg"); grassTex.repeat.set(725, 725);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(2900, 40), new THREE.MeshStandardMaterial({ color: new THREE.Color(0.62, 1.55, 0.5), map: grassTex, roughness: 1, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.5;
  scene.add(ground);

  const ASPH_D = photoTex("assets/tex/asphalt_track_Diffuse.jpg"), ASPH_N = photoTex("assets/tex/asphalt_track_nor_gl.jpg", false), ASPH_R = photoTex("assets/tex/asphalt_track_Rough.jpg", false);
  // road ribbon from spline
  const n = TRACK_SAMPLES;
  const roadPts = track.points;
  const visHalf = (i, side) => track.halfW[side > 0 ? 1 : 0][((i % n) + n) % n]; // see Track.halfW
  const positions = [], colors = [], indices = [], uvs = []; const dsR = track.length / n;
  const cAsphalt = new THREE.Color(1, 1, 1), cAsphalt2 = new THREE.Color(0.93, 0.93, 0.95);
  for (let i = 0; i <= n; i++) {
    const p = roadPts[i % n], nr = track.normals[i % n];
    const y = p.y + 0.02;
    const hL = visHalf(i, -1), hR = visHalf(i, 1);
    positions.push(p.x - nr.x * hL, y, p.z - nr.z * hL);
    positions.push(p.x + nr.x * hR, y, p.z + nr.z * hR);
    const tone = 0.92 + ((i * 2654435761 % 1000) / 1000) * 0.16;
    const cb = Math.floor(i / 8) % 2 ? cAsphalt : cAsphalt2;
    const c = { r: cb.r * tone, g: cb.g * tone, b: cb.b * tone };
    colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    uvs.push(0, i * dsR / 3, (hL + hR) / 3, i * dsR / 3);
    if (i < n) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  roadGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  roadGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  roadGeo.setIndex(indices);
  roadGeo.computeVertexNormals();
  scene.add(new THREE.Mesh(roadGeo, new THREE.MeshStandardMaterial({ vertexColors: true, color: new THREE.Color(1.0, 1.0, 1.02), map: ASPH_D, normalMap: ASPH_N, normalScale: new THREE.Vector2(0.8, 0.8), roughnessMap: ASPH_R, roughness: 1, metalness: 0 })));

  const grassTex2 = photoTex("assets/tex/grass_ground_Diffuse.jpg");
  // mowed grass ribbons hugging the track (light/dark stripes along the lap)
  const ribbon = (side) => {
    const pos = [], col = [], idx = [], uvr = [];
    const cA = new THREE.Color(0.8, 1.5, 0.62), cB = new THREE.Color(0.7, 1.35, 0.55);
    const w0 = ROAD_HALF + 1.6, w1 = ROAD_HALF + 20;
    for (let i = 0; i <= n; i++) {
      const p = roadPts[i % n], nr = track.normals[i % n];
      const y = p.y - 0.25;
      // inside of a tight corner: keep the grass ribbon shorter than the corner radius so it does not fold over itself
      let w1i = Math.min(w1, 0.7 * track.rMin[side > 0 ? 1 : 0][i % n]);
      const w0i = Math.min(visHalf(i, side) + 1.6, 0.7 * track.rMin[side > 0 ? 1 : 0][i % n]);
      pos.push(p.x + nr.x * side * w0i, y, p.z + nr.z * side * w0i);
      if (w1i < w0i) w1i = w0i; // collapse (no fold) where the corner is too tight for a grass strip
      pos.push(p.x + nr.x * side * w1i, y, p.z + nr.z * side * w1i);
      const cc = Math.floor(i / 10) % 2 ? cA : cB;
      col.push(cc.r, cc.g, cc.b, cc.r, cc.g, cc.b);
      uvr.push(0, i * track.length / n / 5, (w1i - w0i) / 5, i * track.length / n / 5);
      if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvr, 2));
    g.setIndex(idx); g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: grassTex2, roughness: 1, metalness: 0 })));
  };
  ribbon(1); ribbon(-1);

  // painted white road edge lines (mockup parity)
  const edgeLine = (side) => {
    const pos = [], col = [], idx = [];
    const cW = new THREE.Color(0xf4f4f2);
    const w0 = ROAD_HALF - 0.55, w1 = ROAD_HALF - 0.15;
    for (let i = 0; i <= n; i++) {
      const p = roadPts[i % n], nr = track.normals[i % n];
      const y = p.y + 0.035;
      const hh = visHalf(i, side), e0 = hh - 0.55 * (hh / ROAD_HALF), e1 = hh - 0.15 * (hh / ROAD_HALF);
      pos.push(p.x + nr.x * side * e0, y, p.z + nr.z * side * e0);
      pos.push(p.x + nr.x * side * e1, y, p.z + nr.z * side * e1);
      col.push(cW.r, cW.g, cW.b, cW.r, cW.g, cW.b);
      if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })));
  };
  edgeLine(1); edgeLine(-1);

  // kerbs (red-white at edges) + barriers
  const kerbGeo = new THREE.BoxGeometry(1.4, 0.08, 3.2);
  const red = new THREE.MeshStandardMaterial({ color: 0xc23428, roughness: 0.7 }), white = new THREE.MeshStandardMaterial({ color: 0xdcdcd8, roughness: 0.75 });
  const barrierGeo = new THREE.BoxGeometry(0.5, 0.7, 2.6);
  const kerbsR = new THREE.InstancedMesh(kerbGeo, red, 400), kerbsW = new THREE.InstancedMesh(kerbGeo, white, 400);
  const barR = new THREE.InstancedMesh(barrierGeo, red, 900), barW = new THREE.InstancedMesh(barrierGeo, white, 900);
  let kc = 0, bc = 0;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < n; i += 4) {
    const p = roadPts[i], nr = track.normals[i], curv = track.curvatures[i];
    const yaw = Math.atan2(track.tangents[i].x, track.tangents[i].z);
    if (Math.abs(curv) > 0.004 && kc < 780) {
      const side = curv > 0 ? 1 : -1;
      const kp = p.clone().addScaledVector(nr, side * (track.halfW[side > 0 ? 1 : 0][i] + 0.8));
      dummy.position.set(kp.x, p.y + 0.05, kp.z); dummy.rotation.set(0, yaw, 0); dummy.updateMatrix();
      (Math.floor(i / 4) % 2 ? kerbsR : kerbsW).setMatrixAt(Math.floor(kc / 2) % 400, dummy.matrix); kc++;
    }
    if (i % 8 === 0 && bc < 1700) {
      for (const side of [-1, 1]) {
        const bp = p.clone().addScaledVector(nr, side * (track.halfW[side > 0 ? 1 : 0][i] + 3.4));
        dummy.position.set(bp.x, p.y + 0.35, bp.z); dummy.rotation.set(0, yaw, 0); dummy.updateMatrix();
        (Math.floor(bc / 2) % 2 ? barR : barW).setMatrixAt(Math.floor(bc / 2) % 900, dummy.matrix); bc++;
      }
    }
  }
  kerbsR.count = kerbsW.count = Math.min(400, Math.ceil(kc / 2));
  barR.count = barW.count = Math.min(900, Math.ceil(bc / 2));
  scene.add(kerbsR, kerbsW);

  // continuous guard rail (corrugated steel profile) + posts replacing the box barriers
  { const cvR = document.createElement("canvas"); cvR.width = 64; cvR.height = 64; const xr = cvR.getContext("2d");
    const gr = xr.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, "#b8bcc2"); gr.addColorStop(0.25, "#e6e8ea"); gr.addColorStop(0.5, "#8d9197"); gr.addColorStop(0.75, "#dfe1e3"); gr.addColorStop(1, "#8a8e94"); xr.fillStyle = gr; xr.fillRect(0, 0, 64, 64);
    const tr = new THREE.CanvasTexture(cvR); tr.wrapS = tr.wrapT = THREE.RepeatWrapping; tr.colorSpace = THREE.SRGBColorSpace;
    const railMat = new THREE.MeshStandardMaterial({ map: tr, metalness: 0.55, roughness: 0.45, envMap: ENV_TEX, envMapIntensity: 0.6, side: THREE.DoubleSide });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.7, metalness: 0.3 });
    const postGeo = new THREE.BoxGeometry(0.12, 0.9, 0.12); const posts = new THREE.InstancedMesh(postGeo, postMat, 2 * Math.ceil(track.length / 4) + 10); let pc = 0;
    const dm = new THREE.Object3D();
    for (const side of [-1, 1]) {
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= n; i++) {
        const ii = i % n, p = roadPts[ii], nr = track.normals[ii], off = track.halfW[side > 0 ? 1 : 0][ii] + 3.4;
        const x = p.x + nr.x * side * off, z = p.z + nr.z * side * off;
        pos.push(x, p.y + 0.3, z, x, p.y + 0.82, z); uv.push(i * track.length / n / 3, 0, i * track.length / n / 3, 1);
        if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, railMat); m.castShadow = true; scene.add(m);
      for (let i = 0; i < n; i += Math.max(1, Math.round(4 / (track.length / n)))) {
        const ii = i % n, p = roadPts[ii], nr = track.normals[ii], off = track.halfW[side > 0 ? 1 : 0][ii] + 3.45;
        dm.position.set(p.x + nr.x * side * off, p.y + 0.45, p.z + nr.z * side * off); dm.rotation.set(0, Math.atan2(track.tangents[ii].x, track.tangents[ii].z), 0); dm.updateMatrix(); if (pc < posts.count) posts.setMatrixAt(pc++, dm.matrix);
      }
    }
    posts.count = pc; posts.castShadow = true; scene.add(posts); }

  // grass tone patches
  for (let i = 0; i < 26; i++) {
    const s = (i * 97) % track.length;
    const { p, n: nr } = track.at(s);
    const side = i % 2 ? 1 : -1;
    const pos = p.clone().addScaledVector(nr, side * (20 + (i * 13) % 40));
    const patch = new THREE.Mesh(new THREE.CircleGeometry(9 + (i * 7) % 14, 10), lam(i % 2 ? 0x54a048 : 0x448838));
    patch.rotation.x = -Math.PI / 2; patch.position.set(pos.x, p.y - 0.15, pos.z);
    scene.add(patch);
  }
  // start/finish checker line
  const s0 = track.at(0);
  const line = new THREE.Group();
  for (let x = -7; x < 7; x++) for (let z = 0; z < 3; z++) {
    const sq = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: (x + z) % 2 ? 0xffffff : 0x111111 }));
    sq.rotation.x = -Math.PI / 2; sq.position.set(x + 0.5, 0.06, z - 1.5);
    line.add(sq);
  }
  line.position.copy(s0.p).addScaledVector(s0.n, 0); line.position.y = s0.p.y + 0.05;
  line.rotation.y = Math.atan2(s0.t.x, s0.t.z) + Math.PI / 2;
  line.rotation.y = Math.atan2(s0.t.x, s0.t.z);
  scene.add(line);
  // F1-style grid slot marks (front bar ahead of each nose), all behind the line (match sim grid: s=-(i*9)-10, d=+-3.2)
  const slotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let gi = 0; gi < 6; gi++) {
    const gs = track.at((gi * 9 + 10 + track.length - track.length) === 0 ? 0 : track.length - (gi * 9 + 10));
    const g = new THREE.Group();
    const mk = (wdt, len, ox, oz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(wdt, 0.04, len), slotMat);
      m.position.set(ox, 0.05, oz); g.add(m);
    };
    mk(3.2, 0.35, 0, 3.1);         // front bar: ahead of the nose, so the slot reads as "stop here"
    mk(0.35, 1.2, -1.6, 2.5);      // left corner tick at the front
    mk(0.35, 1.2, 1.6, 2.5);       // right corner tick at the front
    g.position.copy(gs.p).addScaledVector(gs.n, (gi % 2 === 0 ? -1 : 1) * 3.2);
    g.position.y = gs.p.y + 0.04;
    g.rotation.y = Math.atan2(gs.t.x, gs.t.z);
    scene.add(g);
  }
  const gan = gantry();
  gan.position.copy(s0.p); gan.rotation.y = Math.atan2(s0.t.x, s0.t.z);
  scene.add(gan);

  // paved pit lane at d=+10.5 (right of travel, as on Yas Marina) across the pit window (s: length-130 .. 50)
  const pitZoneS = [track.length - 120, 40]; // pit window in s
  {
    const pitMat = lam(0x3c3f46), lineMat = new THREE.MeshBasicMaterial({ color: 0xf2f2f0 });
    for (let ps = track.length - 130; ps < track.length + 50; ps += 4) {
      const { p: pp, n: pn, t: pt } = track.at(ps % track.length);
      const pos = pp.clone().addScaledVector(pn, 10.5);
      const seg = new THREE.Mesh(new THREE.BoxGeometry(7, 0.07, 4.3), pitMat);
      seg.position.set(pos.x, pp.y + 0.02, pos.z);
      seg.rotation.y = Math.atan2(pt.x, pt.z);
      scene.add(seg);
      const wl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 4.3), lineMat);
      const wpos = pp.clone().addScaledVector(pn, 7.2);
      wl.position.set(wpos.x, pp.y + 0.03, wpos.z);
      wl.rotation.y = Math.atan2(pt.x, pt.z);
      scene.add(wl);
    }
  }

  // scenery: trees scattered, avoiding road. Instanced, merged-geometry trees with displaced, vertex-coloured crowns and leaf-noise texture.
  const treeGroup = new THREE.Group();
  const trng = rng(5);
  const leafTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d"); x.fillStyle = "#b9b9b9"; x.fillRect(0, 0, 128, 128); for (let i = 0; i < 900; i++) { const v = 90 + trng() * 150; x.fillStyle = `rgba(${v},${v},${v},0.5)`; x.beginPath(); x.arc(trng() * 128, trng() * 128, 1 + trng() * 4, 0, 7); x.fill(); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const paintGeo = (g, fn) => { const pa = g.attributes.position, col = new Float32Array(pa.count * 3); for (let i = 0; i < pa.count; i++) { const c = fn(pa.getX(i), pa.getY(i), pa.getZ(i)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; } g.setAttribute("color", new THREE.BufferAttribute(col, 3)); return g; };
  const clean = (g) => { const o = g.index ? g.toNonIndexed() : g; o.deleteAttribute("uv"); return o; };
  const brown = new THREE.Color(0x4a3524);
  const broadleaf = (seed) => {
    const r = rng(seed), parts = [], H = 6;
    const trunk = paintGeo(clean(new THREE.CylinderGeometry(0.18, 0.34, H * 0.5, 7)), () => brown); trunk.translate(0, H * 0.25, 0); parts.push(trunk);
    const hue = new THREE.Color().setHSL(0.27 + r() * 0.05, 0.42 + r() * 0.1, 0.24 + r() * 0.05);
    for (let k = 0; k < 6; k++) {
      let g = new THREE.IcosahedronGeometry(1, 2); g.deleteAttribute("uv"); g.deleteAttribute("normal"); g = BufferGeometryUtils.mergeVertices(g);
      const pa = g.attributes.position, rad = H * (0.2 + r() * 0.1);
      for (let i = 0; i < pa.count; i++) { const d = 1 + (Math.sin(pa.getX(i) * 7 + k) * Math.cos(pa.getY(i) * 6 + k * 2) + Math.sin(pa.getZ(i) * 9)) * 0.14 + (r() - 0.5) * 0.1; pa.setXYZ(i, pa.getX(i) * rad * d, pa.getY(i) * rad * 0.85 * d, pa.getZ(i) * rad * d); }
      g.translate((r() - 0.5) * H * 0.35, H * (0.6 + r() * 0.3), (r() - 0.5) * H * 0.35); g.computeVertexNormals();
      parts.push(paintGeo(g.toNonIndexed(), (x, y, z) => { const t = Math.min(1, Math.max(0, (y - H * 0.45) / (H * 0.55))); return hue.clone().multiplyScalar(0.55 + 0.7 * t).offsetHSL((r() - 0.5) * 0.01, 0, 0); }));
    }
    const m = BufferGeometryUtils.mergeGeometries(parts.map((g) => { if (!g.attributes.normal) g.computeVertexNormals(); return g; })); m.computeVertexNormals(); return m;
  };
  const conifer = (seed) => {
    const r = rng(seed), parts = [], H = 7;
    const trunk = paintGeo(clean(new THREE.CylinderGeometry(0.14, 0.26, H * 0.3, 6)), () => brown); trunk.translate(0, H * 0.15, 0); parts.push(trunk);
    const hue = new THREE.Color().setHSL(0.32 + r() * 0.03, 0.4, 0.17 + r() * 0.04);
    for (let k = 0; k < 6; k++) {
      const rad = H * 0.24 * (1 - k * 0.14), hh = H * 0.3; let g = clean(new THREE.ConeGeometry(rad, hh, 9, 1)); const pa = g.attributes.position;
      for (let i = 0; i < pa.count; i++) { const j = 1 + (r() - 0.5) * 0.18; pa.setXYZ(i, pa.getX(i) * j, pa.getY(i), pa.getZ(i) * j); }
      g.translate(0, H * (0.22 + k * 0.13) + hh / 2, 0);
      parts.push(paintGeo(g, (x, y) => hue.clone().multiplyScalar(0.6 + 0.6 * Math.min(1, Math.max(0, (y - H * 0.2) / (H * 0.8))))));
    }
    const m = BufferGeometryUtils.mergeGeometries(parts); m.computeVertexNormals(); return m;
  };
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const variants = [broadleaf(1), broadleaf(2), broadleaf(3), conifer(4), conifer(5), conifer(6)];
  const cnt = variants.map(() => 0), mats = variants.map(() => []);
  let placed = 0, seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const dmT = new THREE.Object3D();
  for (let i = 0; i < 1300 && placed < 650; i++) {
    const s = rnd() * track.length;
    const side = rnd() > 0.5 ? 1 : -1;
    const dist = ROAD_HALF + 10 + rnd() * 55;
    const { p, n: nr } = track.at(s);
    const pos = p.clone().addScaledVector(nr, side * dist);
    const v = rnd() < 0.45 ? 3 + Math.floor(rnd() * 3) : Math.floor(rnd() * 3), sc = 0.75 + rnd() * 0.7;
    dmT.position.set(pos.x, pos.y - 0.3, pos.z); dmT.rotation.set(0, rnd() * Math.PI * 2, 0); dmT.scale.set(sc, sc * (0.9 + rnd() * 0.25), sc); dmT.updateMatrix();
    mats[v].push(dmT.matrix.clone()); placed++;
  }
  // photoscan tree (Poly Haven jacaranda_tree, CC0, Rico Cilliers/Dimitrios Savva style scan) decimated by us: ~21k tris, 380 leaf cards, instanced
  const photoSets = [];
  if (TREE_TPL) {
    const mkParts = (tpl) => { const parts = []; tpl.updateMatrixWorld(true); tpl.traverse((o) => { if (o.isMesh) { const m = o.material; if (m.map) m.map.colorSpace = THREE.SRGBColorSpace; const isLeaf = /leaves/i.test(o.name); if (isLeaf) { const n = o.geometry.attributes.position.count, na = new Float32Array(n * 3); for (let i = 0; i < n; i++) { na[i * 3 + 1] = 1; } o.geometry.setAttribute("normal", new THREE.BufferAttribute(na, 3)); } else o.geometry.computeVertexNormals(); const mm = new THREE.MeshStandardMaterial({ map: m.map, color: isLeaf ? new THREE.Color(2.6, 3.2, 1.9) : new THREE.Color(2.2, 2.0, 1.8), alphaTest: isLeaf ? 0.5 : 0, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }); parts.push([o.geometry, mm, o.name]); } }); return parts; };
    const jm = []; for (let i = 0; i < 700; i++) { const s0 = rnd() * track.length, sd = rnd() > 0.5 ? 1 : -1, ds = ROAD_HALF + 12 + rnd() * 70; const { p, n: nr } = track.at(s0); const pp = p.clone().addScaledVector(nr, sd * ds); const sc = 0.4 + rnd() * 0.3; dmT.position.set(pp.x, pp.y - 0.3, pp.z); dmT.rotation.set(0, rnd() * 6.28, 0); dmT.scale.set(sc, sc, sc); dmT.updateMatrix(); jm.push(dmT.matrix.clone()); }
    const addSet = (tpl, cap, r0, r1) => { const ims = mkParts(tpl).map(([g, mt]) => { const im = new THREE.InstancedMesh(g, mt, cap); im.count = 0; im.castShadow = true; im.frustumCulled = false; treeGroup.add(im); return im; }); photoSets.push({ ims, cap, r0, r1 }); };
    addSet(TREE_TPL, 26, 0, 95); if (TREE_FAR) addSet(TREE_FAR, 110, 95, 320);
    treeGroup.userData.cull = (cam) => { const c = []; for (let i = 0; i < jm.length; i++) { const e = jm[i].elements, dx = e[12] - cam.x, dz = e[14] - cam.z; c.push([Math.sqrt(dx * dx + dz * dz), i]); } c.sort((a, b) => a[0] - b[0]); photoSets.forEach(S => { let k = 0; for (let j = 0; j < c.length && k < S.cap; j++) { if (c[j][0] >= S.r0 && c[j][0] < S.r1) { S.ims.forEach(im => im.setMatrixAt(k, jm[c[j][1]])); k++; } } S.ims.forEach(im => { im.count = k; im.instanceMatrix.needsUpdate = true; }); }); };
    treeGroup.userData.cull(new THREE.Vector3(0, 0, 0));
  }
  const _oldTrees = false;
  if (_oldTrees) variants.forEach((g, v) => { const im = new THREE.InstancedMesh(g, treeMat, Math.max(1, mats[v].length)); mats[v].forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = true; im.frustumCulled = false; treeGroup.add(im); });
  scene.add(treeGroup);

  // mountains ring
  const mcolors = [0x5f7fa6, 0x6d8db3, 0x54749c, 0x7c99bd];
  for (let i = 0; i < 22; i++) {
    const ang = i / 22 * Math.PI * 2;
    const m = mountain(60 + (i * 37 % 90), 70 + (i * 53 % 80), mcolors[i % mcolors.length]);
    m.position.set(Math.cos(ang) * (1500 + (i * 29 % 250)), m.position.y, Math.sin(ang) * (1500 + (i * 41 % 250)));
    scene.add(m);
  }
  // low-poly clouds: removed (photographic sky carries its own clouds)
  for (let i = 0; i < 0; i++) {
    const cl = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(6 + (k * 7 % 9), 1),
        new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true }));
      b.scale.y = 0.55;
      b.position.set(k * 9 - 13, (k % 2) * 2, (k * 5 % 6) - 3);
      cl.add(b);
    }
    cl.position.set(((i * 173) % 2400) - 1200, 90 + (i * 31 % 50), ((i * 299) % 2400) - 1200);
    scene.add(cl);
  }
  // tents + stands near start straight
  const tentColors = [0xd94f4f, 0x4f7ed9, 0x55bb66, 0xe0a04f];
  for (let i = 0; i < 4; i++) {
    const s = track.length - 90 + i * 26;
    const { p, n: nr, t } = track.at(s);
    const tn = tent(tentColors[i % 4]);
    const pos = p.clone().addScaledVector(nr, -(ROAD_HALF + 12));
    tn.position.set(pos.x, p.y, pos.z);
    tn.rotation.y = Math.atan2(t.x, t.z);
    scene.add(tn);
  }
  for (let i = 0; i < 3; i++) {
    const s = track.length - 150 + i * 45;
    const { p, n: nr, t } = track.at(s);
    const st = crowdStand(16);
    const pos = p.clone().addScaledVector(nr, (ROAD_HALF + 30)); // behind the pit lane (pit is on the right)
    st.position.set(pos.x, p.y, pos.z);
    st.rotation.y = Math.atan2(t.x, t.z) + Math.PI;
    scene.add(st);
  }
  // fence crowds along the start straight
  const crowdColors = [0xd94f4f, 0x4f7ed9, 0xe0c04f, 0x55bb66, 0xdddddd, 0x333944, 0xd97fb0, 0xf07f2f];
  for (let i = 0; i < 128; i++) {
    const s = track.length - 195 + (i % 64) * 3.0;
    const side = i < 64 ? 1 : -1;
    if (side === 1 && s > track.length - 140) continue; // pit lane occupies the right side here
    const { p, n: nr } = track.at(Math.floor(s));
    const row = i % 2;
    const pos = p.clone().addScaledVector(nr, side * (ROAD_HALF + 5.4 + row * 1.1));
    const base = p.y + 0.35 + row * 0.4; // low bank so bodies clear the barriers
    const h = 1.05 + ((i * 37) % 45) / 100;
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.3), lam(0x2c3140));
    legs.position.set(pos.x, base + 0.25, pos.z);
    scene.add(legs);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, h - 0.5, 0.36), lam(crowdColors[i % crowdColors.length]));
    body.position.set(pos.x, base + 0.5 + (h - 0.5) / 2, pos.z);
    body.userData.bob = 1; body.userData.y0 = body.position.y; body.userData.ph = (i * 0.83) % 6.28;
    scene.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 5), lam(0xffcf9e));
    head.position.set(pos.x, base + h + 0.15, pos.z);
    head.userData.bob = 1; head.userData.y0 = head.position.y; head.userData.ph = (i * 0.83) % 6.28;
    scene.add(head);
  }
  // rubbered-in racing line: one continuous dark ribbon through each corner group
  {
    const inCorner = [];
    for (let i = 0; i < n; i++) inCorner.push(Math.abs(track.curvatures[i]) > 0.009);
    // merge samples into corner groups (with small gaps bridged)
    const groups = [];
    let cur = null;
    for (let i = 0; i < n + 20; i++) {
      const k = i % n;
      if (inCorner[k]) { if (!cur) cur = [k, k]; else cur[1] = k; }
      else if (cur) {
        // bridge gaps shorter than 12 samples (curv noise), else close the group
        let gap = 0, j = k;
        while (gap < 12 && !inCorner[j % n]) { gap++; j++; }
        if (gap < 12 && inCorner[j % n]) { cur[1] = j % n; i = j; }
        else { groups.push(cur); cur = null; }
      }
    }
    const mat = new THREE.MeshBasicMaterial({ color: 0x0a0a0c, transparent: true, opacity: 0.16, depthWrite: false });
    for (const [a, b] of groups) {
      const len = (b - a + n) % n;
      if (len < 6) continue;
      const pos = [], idx = [];
      const HW = 1.3; // half width of the rubber band
      for (let k = 0; k <= len; k += 2) {
        const i = (a + k) % n;
        const p = roadPts[i], nr = track.normals[i];
        const cv = Math.abs(track.curvatures[i] || track.curvatures[a]);
        // gentle bends: line stays near centre, no mysterious offset streaks
        const apex = Math.sign(track.curvatures[i] || track.curvatures[a]) * -Math.min(2.2, Math.max(0.4, (cv - 0.009) * 220));
        const cx = p.x + nr.x * apex, cz = p.z + nr.z * apex, y = p.y + 0.03;
        pos.push(cx - nr.x * HW, y, cz - nr.z * HW, cx + nr.x * HW, y, cz + nr.z * HW);
        if (k > 0) { const q = (k / 2 - 1) * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx); g.computeVertexNormals();
      scene.add(new THREE.Mesh(g, mat));
      // braking marker boards 100m / 50m before the corner, on its outside
      const mps = track.length / n; // metres per sample
      const side = (track.curvatures[a] || 1) > 0 ? 1 : -1;
      for (const [m, back] of [[100, Math.round(100 / mps)], [50, Math.round(50 / mps)]]) {
        const bi = ((a - back) % n + n) % n;
        const bp = roadPts[bi], bn = track.normals[bi];
        const bpos = bp.clone().addScaledVector(bn, side * (ROAD_HALF + 4.2));
        const bd = brakeBoard(m);
        bd.position.set(bpos.x, bp.y, bpos.z);
        bd.rotation.y = Math.atan2(track.tangents[bi].x, track.tangents[bi].z) + (side > 0 ? Math.PI : 0);
        scene.add(bd);
      }
    }
  }

  // coloured flag banners along the lap
  const flagColors = [0xd94f4f, 0x4f7ed9, 0xe0c04f, 0x55bb66, 0xe04fa0];
  for (let i = 0; i < n; i += 55) {
    const p = roadPts[i], nr = track.normals[i];
    const side = (i / 55) % 2 ? 1 : -1;
    const pos = p.clone().addScaledVector(nr, side * (ROAD_HALF + 5.5));
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 4.6, 6), lam(0x8f97a5));
    post.position.set(pos.x, p.y + 2.3, pos.z); scene.add(post);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.0), new THREE.MeshBasicMaterial({ color: flagColors[(i / 55) % 5], side: THREE.DoubleSide })); // unlit: no black backfaces
    flag.position.set(pos.x, p.y + 4.1, pos.z);
    flag.rotation.y = Math.atan2(track.tangents[i].x, track.tangents[i].z) + Math.PI / 2;
    scene.add(flag);
  }
  // extra tents and stands at two more spots around the lap
  [[0.33, -1], [0.66, 1]].forEach(([frac, side]) => {
    for (let k = 0; k < 3; k++) {
      const { p, n: nr, t } = track.at(Math.floor(frac * track.length) + k * 24);
      const tn = tent(tentColors[(k + (frac > 0.5 ? 1 : 0)) % 4]);
      const pos = p.clone().addScaledVector(nr, side * (ROAD_HALF + 13));
      tn.position.set(pos.x, p.y, pos.z);
      tn.rotation.y = Math.atan2(t.x, t.z);
      scene.add(tn);
    }
    const { p, n: nr, t } = track.at(Math.floor(frac * track.length) + 84);
    const st = crowdStand(18);
    const pos = p.clone().addScaledVector(nr, side * (ROAD_HALF + 15));
    st.position.set(pos.x, p.y, pos.z);
    st.rotation.y = Math.atan2(t.x, t.z) + (side > 0 ? Math.PI : 0);
    scene.add(st);
  });

  // chevron signs at sharp corners
  for (let i = 0; i < n; i += 30) {
    const curv = track.curvatures[i];
    if (Math.abs(curv) > 0.009) {
      const p = roadPts[i], nr = track.normals[i];
      const sign = chevronSign();
      const side = curv > 0 ? 1 : -1;
      const pos = p.clone().addScaledVector(nr, side * (ROAD_HALF + 4.5));
      sign.position.set(pos.x, p.y, pos.z);
      sign.rotation.y = Math.atan2(track.tangents[i].x, track.tangents[i].z);
      sign.rotation.y += side > 0 ? Math.PI : 0;
      scene.add(sign);
    }
  }

  // billboards along the lap (generic designs)
  for (let i = 27; i < n; i += 130) {
    const p = roadPts[i], nr = track.normals[i];
    const side = (i / 130) % 2 ? 1 : -1;
    const pos = p.clone().addScaledVector(nr, side * (ROAD_HALF + 7.5));
    const bb = billboard(Math.floor(i / 130));
    bb.position.set(pos.x, p.y, pos.z);
    bb.rotation.y = Math.atan2(track.tangents[i].x, track.tangents[i].z) + (side > 0 ? Math.PI : 0);
    scene.add(bb);
  }
  // grass tone patches (cheap ground variation)
  const patchGeo = new THREE.CircleGeometry(14, 10);
  const patchMats = [lam(0x3d9630), lam(0x50b842), lam(0x388c2c)];
  for (let i = 0; i < 36; i++) {
    const p = roadPts[(i * 37) % n], nr = track.normals[(i * 37) % n];
    const side = i % 2 ? 1 : -1;
    const pos = p.clone().addScaledVector(nr, side * (ROAD_HALF + 9 + (i * 53) % 26));
    const pm = new THREE.Mesh(patchGeo, patchMats[i % 3]);
    pm.rotation.x = -Math.PI / 2;
    pm.position.set(pos.x, -0.44, pos.z);
    pm.scale.setScalar(0.7 + ((i * 101) % 100) / 90);
    scene.add(pm);
  }

  addScenery2(scene, track, ROAD_HALF); addEnv2(scene, track, ROAD_HALF); addTrackDetail(scene, track, ROAD_HALF); addPitComplex(scene, track);
  const crowd = [];
  scene.traverse((o) => { if (o.userData && o.userData.bob) crowd.push(o); });
  mergeStatic(scene);
  return { sun, hemi, sky, pitZoneS, crowd };
}

// Merge static scenery by material and 150 m grid cell to cut draw calls (skips instanced, animated, crowd, special userData).
function mergeStatic(scene) {
  const BAD = ["bob", "cull", "update", "anim", "spin", "tick", "dynamic"];
  const bad = (o) => Object.keys(o.userData || {}).some(k => BAD.includes(k));
  const stat = { meshesIn: 0, meshesOut: 0 };
  const cand = []; // meshes to merge
  const walk = (o, top) => {
    if (o.isInstancedMesh || o.isSkinnedMesh || o.isLight || o.isPoints || o.isLine || o.isSprite || o.isCamera || bad(o) || o.visible === false) return;
    if (o.isMesh) { if (!Array.isArray(o.material) && o.material && o.geometry && o.geometry.attributes.position && !o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); if (!Array.isArray(o.material) && o.material && o.geometry.boundingSphere && o.geometry.boundingSphere.radius * Math.max(o.scale.x, o.scale.y, o.scale.z) < 25) cand.push(o); return; }
    if (o.type === "Group" || o.type === "Object3D" || o === scene) { if (o !== scene && o.children.some(ch => ch.isInstancedMesh || bad(ch))) { /* mixed group: only plain meshes below */ } o.children.slice().forEach(ch => walk(ch, false)); }
  };
  scene.children.slice().forEach(ch => walk(ch, true));
  scene.updateMatrixWorld(true);
  const buckets = new Map(); const v = new THREE.Vector3();
  for (const m of cand) { m.getWorldPosition(v); const mt = m.material; const mk = [mt.type, mt.color && mt.color.getHex(), mt.emissive && mt.emissive.getHex(), mt.emissiveIntensity, mt.map && mt.map.uuid, mt.emissiveMap && mt.emissiveMap.uuid, mt.roughness, mt.metalness, mt.transparent, mt.opacity, mt.side, mt.depthWrite, mt.flatShading, mt.vertexColors, mt.fog, mt.depthTest, mt.alphaTest, mt.blending, mt.polygonOffset, mt.polygonOffsetFactor, mt.polygonOffsetUnits, mt.alphaMap && mt.alphaMap.uuid, mt.envMap && mt.envMap.uuid, mt.envMapIntensity, mt.bumpMap && mt.bumpMap.uuid, mt.normalMap && mt.normalMap.uuid, mt.roughnessMap && mt.roughnessMap.uuid, m.renderOrder, mt.map && mt.map.repeat && (mt.map.repeat.x + "," + mt.map.repeat.y), mt.map && mt.map.offset && (mt.map.offset.x + "," + mt.map.offset.y)].join("~"); const key = mk + "|" + (m.castShadow ? 1 : 0) + (m.receiveShadow ? 1 : 0) + "|" + Math.floor(v.x / 150) + "," + Math.floor(v.z / 150); if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(m); }
  const out = new THREE.Group();
  for (const arr of buckets.values()) {
    if (arr.length < 2) continue;
    const geos = arr.map(m => { let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv" && k !== "color") g.deleteAttribute(k); if (!g.attributes.normal) g.computeVertexNormals(); if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); g.applyMatrix4(m.matrixWorld); return g; });
    const mg = BufferGeometryUtils.mergeGeometries(geos, false); if (!mg) continue;
    const mm = new THREE.Mesh(mg, arr[0].material); mm.castShadow = arr[0].castShadow; mm.receiveShadow = arr[0].receiveShadow; mm.renderOrder = arr[0].renderOrder; out.add(mm);
    arr.forEach(m => { if (m.parent) m.parent.remove(m); });
    stat.meshesIn += arr.length; stat.meshesOut++;
  }
  scene.add(out); window._mergeStat = stat;
}

// rain particles
export function buildRain(scene) {
  const COUNT = 900;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 160;
    pos[i * 3 + 1] = Math.random() * 60;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 160;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const rcv = document.createElement("canvas"); rcv.width = rcv.height = 64; const rc = rcv.getContext("2d");
  const rg = rc.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, "rgba(255,255,255,0.9)"); rg.addColorStop(0.35, "rgba(225,238,252,0.45)"); rg.addColorStop(1, "rgba(225,238,252,0)");
  rc.fillStyle = rg; rc.fillRect(0, 0, 64, 64);
  const rtex = new THREE.CanvasTexture(rcv);
  const mat = new THREE.PointsMaterial({ color: 0xcfe0f0, size: 0.16, map: rtex, transparent: true, opacity: 0.55, depthWrite: false }); // soft round drops, no square quads near camera
  const pts = new THREE.Points(geo, mat);
  pts.visible = false;
  scene.add(pts);
  return pts;
                                             }
