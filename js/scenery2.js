// Scenery pass v2 (own code, procedural): tall grandstands with crowd, catch fences, tyre walls, cones.
import * as THREE from "../lib/three.module.js";

function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

function crowdTex() {
  const cv = document.createElement("canvas"); cv.width = 512; cv.height = 128;
  const c = cv.getContext("2d"), r = rng(7);
  c.fillStyle = "#3a3f4c"; c.fillRect(0, 0, 512, 128);
  const cols = ["#d94f4f", "#4f7ed9", "#e0c04f", "#55bb66", "#eeeeee", "#2d3340", "#d97fb0", "#f07f2f", "#ffffff", "#c0392b"];
  for (let y = 4; y < 128; y += 9) for (let x = 2; x < 512; x += 7) {
    const ox = x + (r() * 3 - 1.5);
    c.fillStyle = cols[Math.floor(r() * cols.length)]; c.fillRect(ox, y + 2, 5, 6);
    c.fillStyle = "#f1c8a0"; c.fillRect(ox + 1, y - 2, 3, 3);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function fenceTex() {
  const cv = document.createElement("canvas"); cv.width = 128; cv.height = 128;
  const c = cv.getContext("2d"); c.clearRect(0, 0, 128, 128);
  c.strokeStyle = "rgba(200,206,218,0.55)"; c.lineWidth = 2;
  for (let i = -128; i < 256; i += 16) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 128, 128); c.stroke(); c.beginPath(); c.moveTo(i + 128, 0); c.lineTo(i, 128); c.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

let _conc = null;
function concTex() {
  if (_conc) return _conc;
  _conc = new THREE.TextureLoader().load("assets/tex/concrete_floor_worn_001_Diffuse.jpg"); _conc.colorSpace = THREE.SRGBColorSpace; _conc.wrapS = _conc.wrapT = THREE.RepeatWrapping; _conc.anisotropy = 4; return _conc;
}
function grandstand(w, tiers, tex, roofCol) {
  const g = new THREE.Group();
  const rowH = 0.9, rowD = 1.5;
  const ct = concTex().clone(); ct.needsUpdate = true; ct.repeat.set(w / 3, 1);
  const concrete = new THREE.MeshStandardMaterial({ map: ct, color: 0xd8d8d8, roughness: 0.95, metalness: 0, emissive: 0x4a4e56 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x7d8594, roughness: 0.5, metalness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.8 });
  const depth = tiers * rowD;
  for (let i = 0; i < tiers; i++) {
    // each tier is a full-height block down to the ground so there are no gaps under the seats
    const hh = rowH * (i + 1);
    const step = new THREE.Mesh(new THREE.BoxGeometry(w, hh, rowD), concrete);
    step.position.set(0, hh / 2, -i * rowD); step.castShadow = true; step.receiveShadow = true; g.add(step);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.12), new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.7 }));
    nose.position.set(0, hh + 0.02, -i * rowD + rowD / 2 - 0.06); g.add(nose);
    const t2 = tex.clone(); t2.needsUpdate = true; t2.repeat.set(w / 14, 0.22); t2.offset.set(0, (i * 0.31) % 1);
    const crowd = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.4, rowH * 1.25), new THREE.MeshLambertMaterial({ map: t2 }));
    crowd.position.set(0, hh + rowH * 0.62, -i * rowD + rowD * 0.18); crowd.rotation.x = -0.12; g.add(crowd);
  }
  // back wall (cladding) and side walls
  const topH = tiers * rowH, backZ = -(tiers - 1) * rowD - rowD / 2;
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, topH + 5, 0.4), new THREE.MeshStandardMaterial({ color: 0xaab0ba, roughness: 0.6, metalness: 0, emissive: 0x3a3e46 }));
  back.position.set(0, (topH + 5) / 2, backZ - 0.2); back.castShadow = true; g.add(back);
  for (const sx of [-1, 1]) {
    const shp = new THREE.Shape(); shp.moveTo(0, 0); shp.lineTo(depth + 0.2, 0); shp.lineTo(depth + 0.2, topH + 5); shp.lineTo(depth * 0.35, topH + 3.4); shp.lineTo(0, rowH + 0.5); shp.lineTo(0, 0);
    const wallG = new THREE.ExtrudeGeometry(shp, { depth: 0.35, bevelEnabled: false });
    const wall = new THREE.Mesh(wallG, new THREE.MeshStandardMaterial({ map: ct, color: 0xd0d0d0, roughness: 0.95, emissive: 0x4a4e56, side: THREE.DoubleSide })); wall.rotation.y = -Math.PI / 2; wall.position.set(sx * (w / 2 + 0.17) + (sx > 0 ? 0.17 : -0.17), 0, rowD / 2 + 0.1 - 0); wall.rotation.y = Math.PI / 2; wall.position.z = backZ - 0.4; wall.position.x = sx * (w / 2) + (sx > 0 ? 0 : -0.35);
    wall.scale.set(1, 1, 1); g.add(wall);
  }
  // roof: sloped deck with thick edge, dark underside, steel trusses and front columns
  const roofY = tiers * rowH + 3.6, roofD = depth + 3.2, roofZ = -(tiers - 1) * rowD / 2 - 0.4 + 0.3;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1.6, 0.35, roofD), new THREE.MeshStandardMaterial({ color: roofCol, roughness: 0.55, metalness: 0.25 }));
  roof.position.set(0, roofY, roofZ); roof.rotation.x = 0.07; roof.castShadow = true; g.add(roof);
  const under = new THREE.Mesh(new THREE.BoxGeometry(w + 1.4, 0.1, roofD - 0.2), dark); under.position.set(0, roofY - 0.22, roofZ); under.rotation.x = 0.07; g.add(under);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(w + 1.7, 0.5, 0.2), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }));
  edge.position.set(0, roofY + 0.12, roofZ + roofD / 2); edge.rotation.x = 0.07; g.add(edge);
  const nCol = Math.max(3, Math.round(w / 7));
  for (let k = 0; k <= nCol; k++) {
    const x = -w / 2 + (w * k) / nCol;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, roofY, 10), steel); col.position.set(x, roofY / 2, rowD / 2 + 2.4); col.castShadow = true; g.add(col);
    const dz = (rowD / 2 + 2.4) - (backZ - 0.2), len = Math.hypot(dz, 1.6);
    const tr = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, len), steel); tr.position.set(x, roofY - 0.9, (rowD / 2 + 2.4 + backZ - 0.2) / 2); tr.rotation.x = Math.atan2(1.6, dz) * -1 + 0.0; g.add(tr);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.1), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }));
  rail.position.set(0, 1.2, rowD / 2 + 0.5); g.add(rail);
  for (let x = -w / 2; x <= w / 2 + 0.01; x += 2.5) { const pst = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), steel); pst.position.set(x, 0.6, rowD / 2 + 0.5); g.add(pst); }
  return g;
}

export function addScenery2(scene, track, ROAD_HALF) {
  const L = track.length, tex = crowdTex(), ftex = fenceTex();
  const pitS = (s) => { const sn = ((s % L) + L) % L; return sn >= L - 140 || sn < 60; };
  const turnSide = (s) => { // +1: track turns right here (outside = left)
    const a = track.at(s).t, b = track.at(s + 18).t, n = track.at(s).n;
    return (b.x - a.x) * n.x + (b.z - a.z) * n.z;
  };
  // grandstands: start straight (non-pit side) + outside of corners
  const roofs = [0xd94f4f, 0x4f7ed9, 0xe8e8ee, 0xe0a030];
  const spots = [];
  for (let k = 0; k < 4; k++) spots.push({ s: L - 160 + k * 38, side: -1, w: 30, tiers: 7 });
  for (let s = 180; s < L - 260; s += 330) {
    const ts = turnSide(s); if (Math.abs(ts) > 0.5) spots.push({ s, side: ts > 0 ? -1 : 1, w: 26, tiers: 6 });
  }
  spots.forEach((sp, i) => {
    const { p, n: nr, t } = track.at(sp.s);
    if (sp.side > 0 && pitS(sp.s)) return;
    const gs = grandstand(sp.w, sp.tiers, tex, roofs[i % roofs.length]);
    const pos = p.clone().addScaledVector(nr, sp.side * (ROAD_HALF + 20));
    gs.position.set(pos.x, p.y, pos.z);
    // local +z faces the track
    const toTrack = new THREE.Vector3(-nr.x * sp.side, 0, -nr.z * sp.side);
    gs.rotation.y = Math.atan2(toTrack.x, toTrack.z);
    scene.add(gs);
  });
  // catch fence ribbons both sides
  const FH = 3.2, OFF = ROAD_HALF + 8.5;
  for (const side of [-1, 1]) {
    const pos = [], uv = [], idx = []; let u = 0, vi = 0, prev = null;
    for (let s = 0; s < L; s += 6) {
      if (side > 0 && pitS(s)) { prev = null; continue; }
      const { p, n } = track.at(s);
      const x = p.x + n.x * side * OFF, z = p.z + n.z * side * OFF;
      if (prev) u += Math.hypot(x - prev[0], z - prev[1]) / 6;
      pos.push(x, p.y, z, x, p.y + FH, z); uv.push(u, 0, u, 1);
      if (prev) {
        // skip quads whose chord cuts the corner and lands on the asphalt: at corners
        // tighter than the fence offset the offset polyline folds over the road and the
        // stretched hatch renders as a giant white web across the track
        const mx = (x + prev[0]) / 2, mz = (z + prev[1]) / 2;
        let onRoad = false;
        for (let ti = 0; ti < track.points.length && !onRoad; ti += 5) {
          const q = track.points[ti], dx = mx - q.x, dz = mz - q.z;
          if (dx * dx + dz * dz < (ROAD_HALF + 4) * (ROAD_HALF + 4)) onRoad = true;
        }
        if (!onRoad) idx.push(vi - 2, vi - 1, vi, vi, vi - 1, vi + 1);
      }
      prev = [x, z]; vi += 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    const ft = ftex.clone(); ft.needsUpdate = true; ft.repeat.set(1, 1);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: ft, transparent: true, side: THREE.DoubleSide, alphaTest: 0.3 }));
    scene.add(mesh);
    // posts
    const pc = Math.floor(L / 24), posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, FH + 0.4, 0.15), new THREE.MeshLambertMaterial({ color: 0x9aa3b2 }), pc);
    const m4 = new THREE.Matrix4(); let k = 0;
    for (let s = 0; s < L && k < pc; s += 24) { if (side > 0 && pitS(s)) continue; const { p, n } = track.at(s); m4.setPosition(p.x + n.x * side * OFF, p.y + FH / 2, p.z + n.z * side * OFF); posts.setMatrixAt(k++, m4); }
    posts.count = k; scene.add(posts);
  }
  // tyre walls on corner outsides + cones near kerb
  const tyreGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.5, 14), tyreCols = [0xd23a3a, 0xf2f2f2, 0x2c58c8, 0x1a1a1f];
  const walls = [];
  for (let s = 0; s < L; s += 4) {
    const ts = turnSide(s); if (Math.abs(ts) < 0.9) continue;
    const side = ts > 0 ? -1 : 1; if (side > 0 && pitS(s)) continue;
    walls.push([s, side]);
  }
  const wallMesh = new THREE.InstancedMesh(tyreGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), walls.length * 3 + 1);
  let wk = 0; const m4 = new THREE.Matrix4(), col = new THREE.Color(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
  walls.forEach(([s, side], i) => {
    const { p, n } = track.at(s);
    for (let h = 0; h < 3; h++) {
      m4.compose(new THREE.Vector3(p.x + n.x * side * (ROAD_HALF + 5.2), p.y + 0.27 + h * 0.5, p.z + n.z * side * (ROAD_HALF + 5.2)), q, new THREE.Vector3(1, 1, 1));
      wallMesh.setMatrixAt(wk, m4); wallMesh.setColorAt(wk, col.setHex(tyreCols[(Math.floor(i / 2) + h) % 4])); wk++;
    }
  });
  wallMesh.count = wk; wallMesh.instanceColor && (wallMesh.instanceColor.needsUpdate = true); scene.add(wallMesh);
  const coneGeo = new THREE.ConeGeometry(0.28, 0.75, 8), cones = new THREE.InstancedMesh(coneGeo, new THREE.MeshLambertMaterial({ color: 0xff6a1a }), 120);
  let ck = 0;
  for (let s = 40; s < L && ck < 120; s += 75) { const side = (ck % 2) ? 1 : -1; if (side > 0 && pitS(s)) continue; const { p, n } = track.at(s); m4.setPosition(p.x + n.x * side * (ROAD_HALF + 2.6), p.y + 0.37, p.z + n.z * side * (ROAD_HALF + 2.6)); cones.setMatrixAt(ck++, m4); }
  cones.count = ck; scene.add(cones);
}

// Environment pass: distant hills, big clouds, sponsor-style ad boards along the barrier (own procedural art)
export function addEnv2(scene, track, ROAD_HALF) {
  const r = rng(99);
  // hill ring
  const hillMat = [0x5f9a56, 0x6aa85f, 0x4d8a55].map(c => new THREE.MeshLambertMaterial({ color: c, flatShading: true, fog: true }));
  for (let i = 0; i < 0; i++) { // hill ring disabled: rendered as black cones
    const a = (i / 46) * Math.PI * 2 + r() * 0.1, d = 1100 + r() * 500, h = 60 + r() * 120;
    const m = new THREE.Mesh(new THREE.ConeGeometry(160 + r() * 200, h, 7, 1), hillMat[i % 3]);
    m.position.set(Math.cos(a) * d, h / 2 - 8, Math.sin(a) * d); scene.add(m);
  }
  // bigger layered clouds
  const cm = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  for (let i = 0; i < 0; i++) {
    const g = new THREE.Group();
    for (let k = 0; k < 6; k++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(14 + r() * 14, 1), cm); b.scale.y = 0.5; b.position.set(k * 17 - 40, r() * 6, r() * 14 - 7); g.add(b); }
    const a = r() * 6.283, d = 500 + r() * 1500; g.position.set(Math.cos(a) * d, 150 + r() * 120, Math.sin(a) * d); scene.add(g);
  }
  // ad boards along both sides, just behind the barrier
  const names = ["APEX", "VOLTRA", "STRATANE", "NORDFAHR", "TURBO", "GRIPX"], cols = ["#e8302a", "#1f4e9e", "#f5c518", "#18a0a8", "#ffffff", "#2e9e4f"];
  const mats = names.map((n, i) => {
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 96; const c = cv.getContext("2d");
    c.fillStyle = cols[i]; c.fillRect(0, 0, 512, 96); c.fillStyle = i == 2 || i == 4 ? "#111" : "#fff"; c.font = "bold 64px Arial"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(n, 256, 52);
    c.fillStyle = "rgba(255,255,255,.5)"; c.fillRect(0, 0, 512, 6); c.fillRect(0, 90, 512, 6);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshLambertMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.4 });
  });
  const geo = new THREE.PlaneGeometry(9, 1.7);
  let k = 0;
  for (let s = 20; s < track.length; s += 12) for (const side of [-1, 1]) {
    const { p, n, t } = track.at(s); const off = ROAD_HALF + 5.2;
    const m = new THREE.Mesh(geo, mats[(k++) % mats.length]);
    m.position.set(p.x + n.x * side * off, p.y + 1.0, p.z + n.z * side * off);
    m.rotation.y = Math.atan2(-n.x * side, -n.z * side); scene.add(m);
    if (m.position.y > 1e9) break;
  }
}

// Track surface detail v3 (own code): continuous striped corner kerbs on the inside of bends, a darker rubbered racing line.
export function addTrackDetail(scene, track, ROAD_HALF) {
  const n = 4000, ds = track.length / n;
  const per = Math.max(1, Math.round(2.4 / ds));
  const cR = new THREE.Color(0xd8362a), cW = new THREE.Color(0xf4f4f0);
  for (const side of [-1, 1]) {
    const k = side > 0 ? 1 : 0;
    const pos = [], col = [], idx = [];
    let v = 0, have = false, prevOn = false;
    for (let i = 0; i <= n; i++) {
      const ii = i % n, p = track.points[ii], nr = track.normals[ii];
      const on = track.curvatures[ii] * side > 0.0035;
      const h = track.halfW[k][ii] - 0.05, w = h + 1.5;
      const y = p.y + 0.045;
      pos.push(p.x + nr.x * side * h, y, p.z + nr.z * side * h, p.x + nr.x * side * w, y, p.z + nr.z * side * w);
      const c = Math.floor(i / per) % 2 ? cR : cW;
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      if (i > 0 && on && prevOn) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3, a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      prevOn = on;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, side: THREE.DoubleSide })));
  }
  // Braking references are generated from this game's spline, not claimed surveyed signage.
  // One shared pole material + instanced verge reflectors keep the scene light.
  const board = (label, s, side) => {
    const cv = document.createElement("canvas"); cv.width = 128; cv.height = 128;
    const cx = cv.getContext("2d"); cx.fillStyle = "#f4f5f3"; cx.fillRect(0,0,128,128);
    cx.fillStyle = "#18232c"; cx.fillRect(4,4,120,120); cx.fillStyle = "#fff";
    cx.font = "bold 54px Arial"; cx.textAlign = "center"; cx.fillText(label,64,82);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const {p,t,n} = track.at(s), group = new THREE.Group(); group.name = "braking_board_" + label;
    const face = new THREE.Mesh(new THREE.BoxGeometry(1.5,1.5,.1),new THREE.MeshBasicMaterial({map:tex})); face.position.y=1.6;group.add(face);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(.09,.9,.09),new THREE.MeshLambertMaterial({color:0xbfc6ca}));pole.position.y=.5;group.add(pole);
    group.position.copy(p).addScaledVector(n,side*(ROAD_HALF+2.5));group.rotation.y=Math.atan2(-t.x,-t.z);scene.add(group);
  };
  const corners=[];
  for(let s=160;s<track.length-180;s+=8){const c=Math.abs(track.at(s).curv);if(c<.014)continue;
    if(c>=Math.abs(track.at(s-16).curv)&&c>=Math.abs(track.at(s+16).curv)&&corners.every(q=>Math.abs(q-s)>180))corners.push(s);
  }
  for(const s of corners){const side=track.at(s).curv>0?-1:1;for(const d of [150,100,50])board(String(d),s-d,side);}
  const reflectors=new THREE.InstancedMesh(new THREE.BoxGeometry(.12,.75,.12),new THREE.MeshLambertMaterial({color:0xdde9e6}),Math.floor(track.length/35)*2);
  let ri=0; const dummy=new THREE.Object3D();
  for(let s=0;s<track.length-35;s+=35)for(const side of [-1,1]){const {p,n}=track.at(s);dummy.position.copy(p).addScaledVector(n,side*(ROAD_HALF+1.9));dummy.position.y+=.4;dummy.updateMatrix();reflectors.setMatrixAt(ri++,dummy.matrix);}
  reflectors.count=ri;reflectors.name="verge_reflectors";scene.add(reflectors);
  // rubbered racing line (darker band, slightly offset to follow the usual line)
  const pos = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const ii = i % n, p = track.points[ii], nr = track.normals[ii];
    let cs = 0; for (let j = -40; j <= 40; j += 8) cs += track.curvatures[(ii + j + n) % n]; cs /= 11;
    const off = -Math.max(-2.2, Math.min(2.2, cs * 500));
    const y = p.y + 0.028;
    pos.push(p.x + nr.x * (off - 1.7), y, p.z + nr.z * (off - 1.7), p.x + nr.x * (off + 1.7), y, p.z + nr.z * (off + 1.7));
    if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide })));
}

// Pit complex: pit wall with signal gantry, two-storey garage block with doors, overhanging canopy and pit-lane lights (own geometry)
export function addPitComplex(scene, track) {
  const L = track.length, ct = concTex();
  const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(0.35), ...o });
  const pc = document.createElement("canvas"); pc.width = pc.height = 256; { const x = pc.getContext("2d"); x.fillStyle = "#b9bbbd"; x.fillRect(0, 0, 256, 256); const r = rng(77); for (let i = 0; i < 2500; i++) { const v = 150 + Math.floor(r() * 70); x.fillStyle = `rgba(${v},${v},${v + 2},0.35)`; x.fillRect(r() * 256, r() * 256, 1 + r() * 5, 1 + r() * 3); } x.strokeStyle = "rgba(60,62,66,0.45)"; x.lineWidth = 2; x.strokeRect(0, 0, 256, 256); }
  const pt = new THREE.CanvasTexture(pc); pt.colorSpace = THREE.SRGBColorSpace; pt.wrapS = pt.wrapT = THREE.RepeatWrapping;
  const conc = new THREE.MeshLambertMaterial({ map: pt, color: 0xd5d5d5, emissive: 0xffffff, emissiveMap: pt, emissiveIntensity: 0.55 });
  const dark = lam(0x14171c, { emissive: 0x08090b }), glass = new THREE.MeshLambertMaterial({ color: 0x2a4358, emissive: 0x16222e });
  const white = lam(0xf2f2f2, { emissive: 0x777777 }), steel = lam(0x8d949c, { emissive: 0x444444 });
  const teamCols = [0xd32f2f, 0x1f4e9e, 0x18a0a8, 0xf5c518, 0x2e9e4f, 0x7a45c8, 0xf07f2f, 0xdddddd, 0x2b2f3a, 0xd32f2f];
  const g = new THREE.Group();
  const add = (geo, mat, p, ry, par = g) => { const m = new THREE.Mesh(geo, mat); m.position.copy(p); m.rotation.y = ry; par.add(m); return m; };
  const at = (s, d, y) => { const q = track.at(((s % L) + L) % L); return { v: new THREE.Vector3(q.p.x + q.n.x * d, q.p.y + y, q.p.z + q.n.z * d), ry: Math.atan2(q.t.x, q.t.z) }; };
  const BAY = 12, N = 10, s0 = L - 128;
  for (let i = 0; i < N; i++) {
    const sc = s0 + i * BAY + BAY / 2;
    const col = teamCols[i % teamCols.length];
    // garage back/upper block
    let a = at(sc, 21.5, 3.2); add(new THREE.BoxGeometry(11, 6.4, BAY - 0.4), conc, a.v, a.ry);
    // upper floor glass band + team colour band
    a = at(sc, 15.92, 5.0); add(new THREE.BoxGeometry(0.15, 1.2, BAY - 1.6), glass, a.v, a.ry);
    a = at(sc, 15.95, 6.1); add(new THREE.BoxGeometry(0.2, 0.5, BAY - 0.4), lam(col), a.v, a.ry);
    // garage door opening (dark recess) and frame
    a = at(sc, 15.94, 1.5); add(new THREE.BoxGeometry(0.1, 3.0, BAY - 3), dark, a.v, a.ry);
    a = at(sc, 15.9, 3.1); add(new THREE.BoxGeometry(0.3, 0.25, BAY - 2.6), white, a.v, a.ry);
    // pit-box floor marking
    a = at(sc, 12.2, 0.06); add(new THREE.BoxGeometry(3.0, 0.03, 1.1), lam(col), a.v, a.ry);
    // pit wall segment (low, white cap) separating pit lane from fast lane; first 3 bays are the open entry/service apron where the sim's pit entry, stop queue and exit merge happen (no wall to cross)
    if (i >= 4 && i <= 7) {
    a = at(sc, 6.2, 0.55); add(new THREE.BoxGeometry(0.6, 1.1, BAY - 0.2), conc, a.v, a.ry);
    a = at(sc, 6.2, 1.12); add(new THREE.BoxGeometry(0.8, 0.08, BAY - 0.2), white, a.v, a.ry);
    // pit gantry post + light head every bay
    a = at(sc, 6.2, 2.4); add(new THREE.BoxGeometry(0.12, 2.6, 0.12), steel, a.v, a.ry);
    a = at(sc, 6.2, 3.8); add(new THREE.BoxGeometry(0.5, 0.3, 0.8), lam(col), a.v, a.ry);
    }
    // canopy support columns at each bay boundary
    a = at(sc - BAY / 2, 14.3, 2.6); add(new THREE.BoxGeometry(0.3, 5.2, 0.3), steel, a.v, a.ry);
  }
  // continuous canopy over the pit apron (slab + white edge)
  const cs = s0 + (N * BAY) / 2;
  let a = at(cs, 13.8, 5.4); const _cn1 = add(new THREE.BoxGeometry(5.2, 0.3, N * BAY), conc, a.v, a.ry);
  a = at(cs, 11.2, 5.32); const _cn2 = add(new THREE.BoxGeometry(0.2, 0.5, N * BAY), white, a.v, a.ry);
  // end walls
  for (const e of [0, N]) { a = at(s0 + e * BAY, 21.5, 3.2); add(new THREE.BoxGeometry(11.4, 6.6, 0.4), conc, a.v, a.ry); }
  // roof deck on top of garage block with parapet
  a = at(cs, 21.5, 6.5); add(new THREE.BoxGeometry(11.6, 0.3, N * BAY + 0.4), lam(0x9aa0a8), a.v, a.ry);
  a = at(cs, 26.9, 7.0); add(new THREE.BoxGeometry(0.3, 0.8, N * BAY + 0.4), white, a.v, a.ry);
  scene.add(g);
}
