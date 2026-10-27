// Yas Marina environment (simplified, original low-poly forms; placement approximate, not survey-accurate).
// Pit building + grandstand near the start line; hotel shell + marina in a separate zone of the track.
// The pit-exit tunnel is NOT included.
import * as THREE from "../lib/three.module.js";

export function buildEnvironment(scene, T) {
  const group = new THREE.Group();
  const ts = []; for (let k = 0; k < T.length; k += 2) { const a = T.at(k); ts.push(a.p); }
  const roadDist = (x, z) => { let m = 1e9; for (const q of ts) { const d = Math.hypot(q.x - x, q.z - z); if (d < m) m = d; } return m; };
  const L = (c, o = {}) => new THREE.MeshLambertMaterial(Object.assign({ color: c, flatShading: true }, o));
  const box = (w, h, d, c, o) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), L(c, o));
  const place = (obj, s, nOff, y, yaw = 0) => {
    const a = T.at(s);
    obj.position.set(a.p.x + a.n.x * nOff, y, a.p.z + a.n.z * nOff);
    obj.rotation.y = Math.atan2(a.t.x, a.t.z) + yaw;
    group.add(obj); return obj;
  };

  // ---- hotel zone: low, long lattice shell over a podium (shape follows a studied photo reference), smaller twin
  // across the track, bridge over the track. Approximate placement near s=4560.
  const SH = 4560, hotel = new THREE.Group();
  const glassM = new THREE.MeshLambertMaterial({ color: 0x2e5068, emissive: 0x0c1820, flatShading: true, transparent: true, opacity: 0.93, side: THREE.DoubleSide }); // dark slate canopy: reads as a shaded solid volume against the sky, lit core shows through
  const lineM = new THREE.LineBasicMaterial({ color: 0x8fb2c8, transparent: true, opacity: 0.28 }); // faint ribs: form cue, never a white web
  const shellGeo = (hiEnd) => {
    const g = new THREE.SphereGeometry(1, 36, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { // sweeping wave: tall at one end, low at the other
      const z = p.getZ(i); const k = 0.38 + 0.72 * (hiEnd * z * 0.5 + 0.5);
      p.setY(i, p.getY(i) * k);
    }
    g.computeVertexNormals(); return g;
  };
  const mk = (x, w, h, l, hiEnd) => {
    const g = new THREE.Group(), geo = shellGeo(hiEnd);
    const sh = new THREE.Mesh(geo, glassM); sh.scale.set(w, h, l); g.add(sh);
    const ln = new THREE.LineSegments(new THREE.WireframeGeometry(geo), lineM); ln.scale.copy(sh.scale); g.add(ln);
    const core = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, h * 0.7, l * 0.5), L(0xdfe8ee)); core.position.set(0, h * 0.35, hiEnd * l * 0.15); g.add(core);
    const leds = [0x3fd6ff, 0xff5fb0, 0xffd23f, 0x8a6cff].map(c => new THREE.MeshBasicMaterial({ color: c }));
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i += 5) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), leds[i % 4]);
      m.position.set(pos.getX(i) * w, pos.getY(i) * h, pos.getZ(i) * l); g.add(m);
    }
    g.position.x = x; return g;
  };
  hotel.add(mk(-46, 17, 30, 120, 1));
  hotel.add(mk(52, 12, 16, 50, -1)); // A+ 100m full length (was 220m): track pierced both tips; approved by user 00:37 28.10
  const pod = box(34, 4, 140, 0xe8eaec); pod.position.set(-46, 2, 0); hotel.add(pod);
  const br = box(98, 4.5, 14, 0xe3e9ef); br.position.set(3, 17, 0); hotel.add(br);
  place(hotel, SH, 0, 0);
  // marina: water rectangle placed beside the hotel in the nearest spot that does not overlap the road; simple yachts on it
  const aH = T.at(SH), WW = 150, WD = 110, pad = 12;
  const inRect = (x, z, cx, cz, hw, hd) => { const dx = x - cx, dz = z - cz; const u = dx * aH.n.x + dz * aH.n.z, v = dx * aH.t.x + dz * aH.t.z; return Math.abs(u) < hw && Math.abs(v) < hd; };
  let best = null;
  for (let off = 110; off <= 420 && !best; off += 10) for (const sh of [0, 40, -40, 80, -80, 120, -120]) {
    const cx = aH.p.x - aH.n.x * (off + WW / 2) + aH.t.x * sh, cz = aH.p.z - aH.n.z * (off + WW / 2) + aH.t.z * sh;
    if (!ts.some(q => inRect(q.x, q.z, cx, cz, WW / 2 + pad, WD / 2 + pad))) { best = { cx, cz }; break; }
  }
  group.userData.marina = best;
  if (best) {
    const wa = new THREE.Mesh(new THREE.BoxGeometry(WW, 0.4, WD), L(0x2f86b8));
    wa.position.set(best.cx, 0.05, best.cz); wa.rotation.y = Math.atan2(aH.t.x, aH.t.z); group.add(wa);
    for (let i = 0; i < 9; i++) {
      const y = new THREE.Group();
      const h = box(8, 2.4, 26, 0xf6f6f6); h.position.y = 1.4; y.add(h);
      const c = box(5.6, 3, 11, 0xffffff); c.position.set(0, 3.8, -3); y.add(c);
      const u = ((i % 3) - 1) * 40, v = (Math.floor(i / 3) - 1) * 32;
      y.position.set(best.cx + aH.n.x * u + aH.t.x * v, 0.6, best.cz + aH.n.z * u + aH.t.z * v);
      y.rotation.y = Math.atan2(aH.t.x, aH.t.z) + (i % 2) * 0.15; group.add(y);
    }
  }

  // ---- pit building (right of the pit lane before the line), generic team door colours
  const pb = new THREE.Group();
  const cols = [0xc8362c, 0x2f6fd0, 0x20a39a, 0xe8b62a, 0xf0f0f0, 0x8a45c8, 0xd4682a, 0x3f9a46, 0x2a2a66, 0xd03a7a];
  const body = box(18, 7, 150, 0xe9e5dc); body.position.set(0, 3.5, 0); pb.add(body);
  const roof = box(20, 1, 152, 0x8e98a4); roof.position.set(0, 7.6, 0); pb.add(roof);
  const glass = box(0.6, 3.4, 148, 0x6fb5d8, { transparent: true, opacity: 0.8 }); glass.position.set(9.2, 5.6, 0); pb.add(glass);
  for (let i = 0; i < 10; i++) {
    const d = box(0.7, 4.2, 11, 0x1b1e25); d.position.set(9.2, 2.1, -66 + i * 14.5); pb.add(d);
    const st = box(0.8, 0.8, 12, cols[i]); st.position.set(9.3, 4.6, -66 + i * 14.5); pb.add(st);
  }
  place(pb, 50, 32, 0);
  // grandstand opposite
  const gs = new THREE.Group();
  for (let k = 0; k < 6; k++) { const r = box(16, 2, 140, k % 2 ? 0x2f6fd0 : 0xe6e6e6); r.position.set(-k * 3.6, 1 + k * 2, 0); gs.add(r); }
  const gr = box(22, 0.8, 142, 0xdddddd); gr.position.set(-9, 15, 0); gs.add(gr);
  place(gs, 50, -28, 0, Math.PI);

  // replace the temporary scenery in the new zones: drop conifers/round trees around the hotel+marina and the pit/grandstand
  // area, and the generic mountain ring (the real site is flat desert/sea). Track, road and physics are untouched.
  const centers = [];
  { const a = T.at(SH); centers.push({ x: a.p.x - a.n.x * 90, z: a.p.z - a.n.z * 90, r: 210 }); }
  { const a = T.at(50); centers.push({ x: a.p.x, z: a.p.z, r: 110 }); }
  const dead = [];
  scene.children.forEach(o => {
    if (o.isGroup && o !== group && o.children.length > 300) {
      o.children.forEach(t => { if (centers.some(c => Math.hypot(t.position.x - c.x, t.position.z - c.z) < c.r)) dead.push(t); });
      dead.forEach(t => o.remove(t));
    } else if (o.isMesh && o.geometry && o.geometry.type === "ConeGeometry" && o.geometry.parameters.radius >= 60 && Math.hypot(o.position.x, o.position.z) > 1000) {
      dead.push(o);
    }
  });
  dead.forEach(o => { if (o.parent) o.parent.remove(o); });
  scene.add(group);
  return group;
}
