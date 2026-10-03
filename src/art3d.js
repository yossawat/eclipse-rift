/* Eclipse Rift — 3D toon characters (Three.js).
   Builds each hero from simple shapes with cel shading, an ink outline and a
   coloured rim light, paints the anime face onto a decal, then:
   - renders portraits once at boot (used everywhere a portrait is shown)
   - drives one live, animated model for the big hero spots (blink, breathing,
     hair sway, follows the pointer).
   If Three.js cannot load, the game keeps the 2D SVG portraits. */
(function (root) {
  'use strict';
  const D = root.ERData;
  const A3 = { ready: false, images: {} };
  root.ERArt3D = A3;
  const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  const HEROES = ['kael', 'aria', 'lumi', 'noir', 'rin', 'malvoth'];
  let T = null;          // THREE
  let GM = null;         // toon gradient map
  const OUT = {};        // outline materials by colour

  function loadThree() {
    if (root.THREE) return Promise.resolve(root.THREE);
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = THREE_URL;
      s.onload = () => (root.THREE ? res(root.THREE) : rej(new Error('no THREE')));
      s.onerror = () => rej(new Error('three.js failed to load'));
      document.head.appendChild(s);
    });
  }

  // ---------- materials ----------
  function gradientMap() {
    const data = new Uint8Array([92, 92, 92, 255, 176, 176, 176, 255, 242, 242, 242, 255]);
    const tex = new T.DataTexture(data, 3, 1, T.RGBAFormat);
    tex.minFilter = tex.magFilter = T.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }
  const col = (hex) => new T.Color(hex).convertSRGBToLinear();
  const toon = (color, extra) => new T.MeshToonMaterial(Object.assign({ color: col(color), gradientMap: GM }, extra || {}));
  const glow = (color, opacity) => new T.MeshBasicMaterial({ color: col(color), transparent: opacity != null, opacity: opacity == null ? 1 : opacity });
  function outline(color) {
    if (!OUT[color]) {
      OUT[color] = new T.ShaderMaterial({
        uniforms: { c: { value: col(color) } },
        vertexShader: 'void main(){ vec3 p = position + normal * 0.022; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
        fragmentShader: 'uniform vec3 c; void main(){ gl_FragColor = vec4(c, 1.0); }',
        side: T.BackSide,
      });
    }
    return OUT[color];
  }

  // ---------- shape helpers ----------
  function put(parent, geo, mat, o) {
    o = o || {};
    const m = new T.Mesh(geo, mat);
    if (o.pos) m.position.set(o.pos[0], o.pos[1], o.pos[2]);
    if (o.rot) { m.rotation.order = 'YXZ'; m.rotation.set(o.rot[0], o.rot[1], o.rot[2]); }
    if (o.scale) m.scale.set(o.scale[0], o.scale[1], o.scale[2]);
    if (o.ink !== false) m.add(new T.Mesh(geo, outline(o.ink || '#140c18')));
    parent.add(m);
    return m;
  }
  /** A hair lock: rounded top, pointed tip hanging down from the origin. */
  function lockGeo(h, r) {
    const pts = [];
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const y = -h + t * h * 1.12;
      const rr = t < 0.8 ? r * Math.pow(t / 0.8, 0.75) : r * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.8) / 0.2, 2)));
      pts.push(new T.Vector2(Math.max(rr, 0.0005), y));
    }
    return new T.LatheGeometry(pts, 16);
  }
  /** Tapered tube along a curve (ponytails, horns). */
  function taperTube(points, r0, r1, seg) {
    const curve = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(p[0], p[1], p[2])));
    const geo = new T.TubeGeometry(curve, seg || 40, 1, 14, false);
    const pos = geo.attributes.position;
    const rings = (seg || 40) + 1, per = 15;
    for (let i = 0; i < rings; i++) {
      const t = i / (rings - 1);
      const c = curve.getPointAt(t);
      const r = r0 + (r1 - r0) * t;
      for (let j = 0; j < per; j++) {
        const k = i * per + j;
        pos.setXYZ(k, c.x + (pos.getX(k) - c.x) * r, c.y + (pos.getY(k) - c.y) * r, c.z + (pos.getZ(k) - c.z) * r);
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }
  const FRONT = Math.PI / 2;
  const sphere = (r, a) => new T.SphereGeometry(r, 48, 36, a && a[0], a && a[1], a && a[2], a && a[3]);

  // ---------- the face, painted on a canvas ----------
  const FW = 560, FH = 440, K = 400;           // decal covers 1.4 × 1.1 radians of the head
  const fx = (dphi) => (dphi + 0.7) * K;
  const fy = (dth) => (dth + 0.55) * K;
  function shade(hex, amt) { return root.ERArt.shade(hex, amt); }

  function paintFace(L, closed) {
    const cv = document.createElement('canvas');
    cv.width = FW; cv.height = FH;
    const g = cv.getContext('2d');
    const lash = shade(L.hair, -0.75);
    const sy = L.eyeScale || 1;
    const ew = 112, eh = 118 * sy;
    const eyes = [[fx(-0.33), fy(0.12)], [fx(0.33), fy(0.12)]];

    // blush first so the eyes sit on top
    for (const [x] of eyes) {
      const bx = x + (x < FW / 2 ? -8 : 8), by = fy(0.36);
      const rg = g.createRadialGradient(bx, by, 4, bx, by, 46);
      rg.addColorStop(0, 'rgba(255,110,140,0.45)');
      rg.addColorStop(1, 'rgba(255,110,140,0)');
      g.fillStyle = rg;
      g.beginPath(); g.ellipse(bx, by, 50, 22, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(230,80,110,0.5)'; g.lineWidth = 2.5;
      for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(bx + k * 12 - 4, by + 6); g.lineTo(bx + k * 12 + 4, by - 6); g.stroke(); }
    }

    eyes.forEach(([cx, cy], i) => {
      g.save();
      g.translate(cx, cy);
      if (i === 1) g.scale(-1, 1);
      if (closed) {
        g.strokeStyle = lash; g.lineCap = 'round'; g.lineWidth = 9;
        g.beginPath(); g.moveTo(-ew * 0.55, -eh * 0.02); g.quadraticCurveTo(0, eh * 0.22, ew * 0.52, -eh * 0.06); g.stroke();
        g.lineWidth = 6; g.beginPath(); g.moveTo(-ew * 0.55, -eh * 0.02); g.lineTo(-ew * 0.7, -eh * 0.12); g.stroke();
        g.restore();
        return;
      }
      const shape = new Path2D();
      shape.moveTo(-ew * 0.53, -eh * 0.04);
      shape.quadraticCurveTo(-ew * 0.36, -eh * 0.52, ew * 0.06, -eh * 0.5);
      shape.quadraticCurveTo(ew * 0.46, -eh * 0.47, ew * 0.53, -eh * 0.18);
      shape.quadraticCurveTo(ew * 0.47, eh * 0.4, ew * 0.02, eh * 0.46);
      shape.quadraticCurveTo(-ew * 0.42, eh * 0.43, -ew * 0.53, -eh * 0.04);
      g.fillStyle = L.sclera || '#fdfbff';
      g.fill(shape);
      g.save();
      g.clip(shape);
      const ig = g.createLinearGradient(0, -eh * 0.5, 0, eh * 0.5);
      ig.addColorStop(0, shade(L.eye, -0.72));
      ig.addColorStop(0.45, L.eye);
      ig.addColorStop(1, shade(L.eye, 0.62));
      g.fillStyle = ig;
      g.beginPath(); g.ellipse(ew * 0.05, eh * 0.03, ew * 0.37, eh * 0.48, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = shade(L.eye, -0.65); g.lineWidth = 3.5; g.stroke();
      g.fillStyle = shade(L.eye, -0.8);
      g.beginPath(); g.ellipse(ew * 0.05, eh * 0.07, ew * 0.15, eh * 0.24, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.beginPath(); g.ellipse(ew * 0.05, eh * 0.3, ew * 0.24, eh * 0.12, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(40,20,50,0.25)';
      g.fillRect(-ew, -eh * 0.62, ew * 2, eh * 0.24);
      g.restore();
      g.strokeStyle = lash; g.lineCap = 'round'; g.lineJoin = 'round';
      g.lineWidth = 11;
      g.beginPath(); g.moveTo(-ew * 0.57, -eh * 0.02); g.quadraticCurveTo(-ew * 0.38, -eh * 0.6, ew * 0.08, -eh * 0.57); g.quadraticCurveTo(ew * 0.48, -eh * 0.53, ew * 0.57, -eh * 0.17); g.stroke();
      g.lineWidth = 7;
      g.beginPath(); g.moveTo(-ew * 0.56, -eh * 0.03); g.lineTo(-ew * 0.74, -eh * 0.17); g.stroke();
      g.lineWidth = 3; g.globalAlpha = 0.55;
      g.beginPath(); g.moveTo(-ew * 0.3, eh * 0.44); g.quadraticCurveTo(0, eh * 0.53, ew * 0.36, eh * 0.4); g.stroke();
      g.globalAlpha = 1;
      g.restore();
      // highlights keep the same light direction on both eyes
      g.fillStyle = '#fff';
      g.beginPath(); g.ellipse(cx - ew * 0.1, cy - eh * 0.2, ew * 0.11, eh * 0.1, -0.3, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 0.85;
      g.beginPath(); g.arc(cx + ew * 0.17, cy + eh * 0.2, ew * 0.05, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    });

    // brows
    g.strokeStyle = shade(L.hair, -0.5); g.lineWidth = 5; g.lineCap = 'round';
    const by = fy(-0.12);
    for (const s of [-1, 1]) {
      g.beginPath();
      const x0 = fx(s * 0.18), x1 = fx(s * 0.48);
      if (L.brow === 'serious') { g.moveTo(x0, by + 6); g.quadraticCurveTo((x0 + x1) / 2, by - 8, x1, by - 2); }
      else if (L.brow === 'soft') { g.moveTo(x0, by); g.quadraticCurveTo((x0 + x1) / 2, by - 16, x1, by - 4); }
      else { g.moveTo(x0, by); g.quadraticCurveTo((x0 + x1) / 2, by - 10, x1, by); }
      g.stroke();
    }
    // nose and mouth
    g.strokeStyle = 'rgba(200,120,110,0.8)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(fx(0.01), fy(0.33)); g.lineTo(fx(-0.015), fy(0.36)); g.stroke();
    const mx = fx(0), my = fy(0.47);
    g.strokeStyle = '#8a3442'; g.lineWidth = 4.5; g.lineCap = 'round';
    if (L.mouth === 'grin') {
      g.fillStyle = '#7a2434';
      g.beginPath(); g.moveTo(mx - 26, my - 6); g.quadraticCurveTo(mx, my + 34, mx + 26, my - 6); g.quadraticCurveTo(mx, my + 2, mx - 26, my - 6); g.fill();
      g.fillStyle = '#ff9aa8'; g.beginPath(); g.ellipse(mx, my + 13, 10, 6, 0, 0, Math.PI * 2); g.fill();
    } else if (L.mouth === 'smile') {
      g.beginPath(); g.moveTo(mx - 22, my - 4); g.quadraticCurveTo(mx, my + 18, mx + 22, my - 4); g.stroke();
    } else if (L.mouth === 'smirk' || L.mouth === 'fang') {
      g.beginPath(); g.moveTo(mx - 20, my); g.quadraticCurveTo(mx + 4, my + 10, mx + 24, my - 8); g.stroke();
      if (L.mouth === 'fang') { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(mx + 4, my + 4); g.lineTo(mx + 9, my + 18); g.lineTo(mx + 14, my + 2); g.fill(); }
    } else {
      g.beginPath(); g.moveTo(mx - 14, my); g.quadraticCurveTo(mx, my + 4, mx + 14, my); g.stroke();
    }
    if (L.acc === 'demon') {
      g.strokeStyle = L.trim; g.lineWidth = 4;
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(fx(s * 0.24), fy(0.3)); g.lineTo(fx(s * 0.4), fy(0.27)); g.stroke(); }
    }
    const tex = new T.CanvasTexture(cv);
    tex.anisotropy = 4;
    tex.encoding = T.sRGBEncoding;
    return tex;
  }

  // ---------- hair ----------
  function bangs(head, mat, L) {
    const style = L.style;
    const add = (a, h, r, tilt, lean, y) => put(head, lockGeo(h, r), mat, {
      pos: [Math.sin(a) * 0.93, y == null ? 0.74 : y, Math.cos(a) * 0.93], rot: [-(tilt == null ? 0.42 : tilt), a, lean || 0], scale: [1, 1, 0.42],
    });
    if (style === 'hime') {
      // blunt fringe: a curved band cut straight above the eyes
      const geo = new T.CylinderGeometry(1.07, 1.07, 0.5, 48, 1, true, -1.15, 2.3);
      put(head, geo, mat, { pos: [0, 0.42, 0], rot: [0, 0, 0], scale: [1, 1, 1.0] });
      for (const s of [-1, 1]) put(head, lockGeo(1.45, 0.22), mat, { pos: [s * 0.95, 0.42, 0.38], rot: [-0.05, s * 1.05, 0], scale: [1, 1, 0.45] });
      return;
    }
    const sets = {
      spiky:    [[-0.75, 0.62, 0.2, 0.3, 0.25], [-0.42, 0.72, 0.22, 0.38, 0.12], [-0.12, 0.66, 0.22, 0.4, 0.05], [0.18, 0.74, 0.22, 0.4, -0.08], [0.48, 0.66, 0.22, 0.36, -0.2], [0.8, 0.58, 0.2, 0.3, -0.3]],
      ponytail: [[-0.8, 0.7, 0.22, 0.3, 0.1], [-0.48, 0.74, 0.24, 0.4, 0.14], [-0.16, 0.66, 0.24, 0.42, 0.16], [0.14, 0.78, 0.24, 0.42, 0.2], [0.45, 0.72, 0.24, 0.4, 0.22], [0.78, 0.66, 0.22, 0.32, 0.2]],
      long:     [[-0.78, 0.66, 0.22, 0.3, 0.05], [-0.46, 0.72, 0.24, 0.4, 0.1], [-0.15, 0.62, 0.24, 0.42, 0.18], [0.15, 0.62, 0.24, 0.42, -0.18], [0.46, 0.72, 0.24, 0.4, -0.1], [0.78, 0.66, 0.22, 0.3, -0.05]],
      messy:    [[-0.8, 0.6, 0.2, 0.25, 0.3], [-0.5, 0.7, 0.2, 0.4, -0.1], [-0.22, 0.62, 0.22, 0.45, 0.25], [0.04, 0.86, 0.18, 0.5, -0.05], [0.3, 0.66, 0.22, 0.42, -0.25], [0.56, 0.7, 0.2, 0.38, 0.15], [0.84, 0.58, 0.2, 0.25, -0.3]],
    };
    for (const [a, h, r, tilt, lean] of sets[style] || sets.long) add(a, h, r, tilt, lean);
    // side locks frame the face
    const side = { spiky: 0.75, ponytail: 1.35, long: 1.9, messy: 0.9 }[style] || 1.2;
    for (const s of [-1, 1]) add(s * 1.18, side, 0.24, 0.12, s * -0.08, 0.5);
  }

  function hairShell(head, mat, L) {
    // top of the head
    put(head, sphere(1.07, [0, Math.PI * 2, 0, 1.18]), mat, { ink: false });
    // sides and back, leaving the face open
    const backLen = { long: 2.0, hime: 2.0, ponytail: 1.6, spiky: 1.45, messy: 1.6 }[L.style] || 1.6;
    put(head, sphere(1.07, [FRONT + 0.95, Math.PI * 2 - 1.9, 0.9, backLen]), mat);
    if (L.style === 'long' || L.style === 'hime') {
      // hair falling down the back
      // CylinderGeometry angles start at +z (the face), so centre the sheet on the back
      const geo = new T.CylinderGeometry(0.95, 1.18, 2.6, 40, 1, true, Math.PI - 1.85, 3.7);
      put(head, geo, mat, { pos: [0, -1.25, -0.08], scale: [1, 1, 0.82] });
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + (i - 3) * 0.32;
        put(head, lockGeo(0.55, 0.22), mat, { pos: [Math.sin(a) * 1.05, -2.45, Math.cos(a) * 0.86 - 0.08], rot: [0.05, a, 0], scale: [1, 1, 0.45] });
      }
    }
    if (L.style === 'spiky') {
      const spikes = [[0.4, 2.3], [0.9, 2.6], [1.35, 2.9], [0.6, 3.4], [1.1, 3.8], [0.5, -2.4], [0.95, -2.75], [1.4, 3.3], [1.5, 2.5], [1.5, -2.6]];
      for (const [th, ph] of spikes) {
        const dir = new T.Vector3(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph));
        const m = put(head, lockGeo(0.75, 0.24), mat, { pos: [dir.x * 0.9, dir.y * 0.9, dir.z * 0.9], scale: [1, 1, 0.55] });
        m.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), dir);
      }
    }
    if (L.style === 'messy') {
      const tuft = taperTube([[0.05, 1.0, 0.25], [0.1, 1.35, 0.3], [0.38, 1.5, 0.2]], 0.1, 0.01, 20);
      put(head, tuft, mat);
      for (let i = 0; i < 5; i++) {
        const a = Math.PI + (i - 2) * 0.45;
        put(head, lockGeo(0.55, 0.22), mat, { pos: [Math.sin(a) * 0.92, -0.55, Math.cos(a) * 0.85], rot: [0.25, a, 0], scale: [1, 1, 0.5] });
      }
    }
    if (L.style === 'ponytail') {
      const tail = taperTube([[0, 0.75, -0.8], [0.15, 0.95, -1.35], [0.25, 0.2, -1.65], [0.18, -1.1, -1.45], [0.05, -1.9, -1.15]], 0.32, 0.03, 48);
      const m = put(head, tail, mat);
      m.userData.sway = true;
    }
    // shine across the crown ("angel ring")
    const ring = new T.Mesh(new T.TorusGeometry(0.97, 0.03, 6, 40, 2.4), glow(L.hairHi, 0.75));
    ring.position.set(0, 0.5, 0);
    ring.rotation.set(Math.PI / 2 - 0.25, 0, Math.PI + 0.36);
    head.add(ring);
  }

  // ---------- accessories ----------
  function accessories(root3, head, body, L, c) {
    const trim = toon(L.trim);
    switch (L.acc) {
      case 'armor':
        for (const s of [-1, 1]) {
          put(body, sphere(0.48, [0, Math.PI * 2, 0, Math.PI / 2]), toon(shade(L.outfit, 0.25)), { pos: [s * 0.82, -1.25, 0], scale: [1, 0.75, 1] });
          put(body, new T.TorusGeometry(0.46, 0.035, 8, 32), trim, { pos: [s * 0.82, -1.27, 0], rot: [Math.PI / 2, 0, 0], ink: false });
        }
        put(body, new T.BoxGeometry(0.7, 0.55, 0.12), toon(shade(L.outfit, 0.2)), { pos: [0, -1.75, 0.5], rot: [-0.1, 0, Math.PI / 4] });
        break;
      case 'katana':
        for (const s of [-1, 1]) put(body, new T.BoxGeometry(0.09, 0.85, 0.06), trim, { pos: [s * 0.18, -1.55, 0.5], rot: [-0.25, 0, s * 0.42], ink: false });
        put(body, new T.CylinderGeometry(0.06, 0.06, 1.3, 10), toon('#2a1622'), { pos: [0.75, -0.6, -0.6], rot: [0.3, 0, -0.55] });
        put(body, new T.TorusGeometry(0.11, 0.035, 8, 20), toon('#d9a441'), { pos: [0.55, -0.95, -0.5], rot: [0.3, 0, -0.55 + Math.PI / 2] });
        for (const s of [-1, 1]) put(head, lockGeo(0.32, 0.17), toon('#1d1220'), { pos: [s * 0.2, 1.0, -0.72], rot: [-1.0, s * 1.1, 0], scale: [1, 1, 0.45] });
        break;
      case 'halo': {
        const halo = new T.Mesh(new T.TorusGeometry(0.62, 0.05, 10, 48), glow('#ffe7a3'));
        halo.position.set(0, 1.55, -0.1);
        halo.rotation.x = Math.PI / 2 - 0.25;
        halo.userData.float = true;
        root3.add(halo);
        const halo2 = new T.Mesh(new T.TorusGeometry(0.62, 0.13, 10, 48), glow('#ffd36b', 0.25));
        halo.add(halo2);
        put(body, new T.TorusGeometry(0.42, 0.05, 8, 32), trim, { pos: [0, -1.2, 0.05], rot: [Math.PI / 2 + 0.25, 0, 0], ink: false });
        put(body, sphere(0.1), toon(L.eye), { pos: [0, -1.6, 0.62] });
        break;
      }
      case 'horns':
        for (const s of [-1, 1]) put(head, taperTube([[s * 0.45, 0.85, 0.1], [s * 0.6, 1.25, 0.05], [s * 0.85, 1.55, -0.1]], 0.12, 0.01, 20), toon('#3a2a5e'), {});
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          put(body, lockGeo(0.32, 0.12), toon(shade(L.outfit, 0.3)), { pos: [Math.sin(a) * 0.36, -1.0, Math.cos(a) * 0.3], rot: [Math.PI - 0.6, a, 0], scale: [1, 1, 0.4] });
        }
        put(body, new T.TorusGeometry(0.24, 0.04, 8, 24), toon('#120c1a'), { pos: [0, -0.98, 0], rot: [Math.PI / 2, 0, 0], ink: false });
        break;
      case 'headphones':
        put(head, new T.TorusGeometry(1.12, 0.06, 10, 40, Math.PI), toon('#18211f'), { pos: [0, 0, 0], rot: [0, 0, 0] });
        for (const s of [-1, 1]) {
          put(head, new T.CylinderGeometry(0.3, 0.3, 0.2, 24), toon('#18211f'), { pos: [s * 1.08, -0.05, 0], rot: [0, 0, Math.PI / 2] });
          put(head, new T.TorusGeometry(0.28, 0.04, 8, 24), glow(L.trim), { pos: [s * 1.19, -0.05, 0], rot: [0, Math.PI / 2, 0], ink: false });
        }
        put(body, new T.TorusGeometry(0.42, 0.16, 12, 32), toon(L.trim), { pos: [0, -1.08, 0], rot: [Math.PI / 2 + 0.15, 0, 0] });
        put(body, new T.BoxGeometry(0.22, 0.75, 0.08), toon(shade(L.trim, -0.2)), { pos: [0.28, -1.5, 0.48], rot: [-0.15, 0, -0.15] });
        break;
      case 'demon':
        for (const s of [-1, 1]) put(head, taperTube([[s * 0.55, 0.75, 0.1], [s * 1.05, 1.05, -0.05], [s * 1.25, 1.65, -0.2], [s * 1.05, 2.15, -0.35]], 0.2, 0.015, 30), toon('#e9dccf'), {});
        put(head, new T.TorusGeometry(1.0, 0.035, 8, 48, 2.4), toon('#d9a441'), { pos: [0, 0.28, 0], rot: [Math.PI / 2 - 0.2, 0, Math.PI + 0.38], ink: false });
        put(head, new T.OctahedronGeometry(0.12), glow(L.trim), { pos: [0, 0.45, 1.02], ink: false });
        for (const s of [-1, 1]) put(body, lockGeo(0.7, 0.2), toon(shade(L.outfit, 0.15)), { pos: [s * 0.62, -0.95, -0.1], rot: [Math.PI, 0, s * 0.55], scale: [1, 1, 0.5] });
        put(body, new T.CylinderGeometry(1.0, 1.45, 2.2, 32, 1, true, Math.PI - 1.5, 3.0), toon('#2a0a14', { side: T.DoubleSide }), { pos: [0, -1.95, -0.05] });
        break;
    }
  }

  // ---------- a whole character ----------
  function build(id) {
    const c = D.CHARACTERS[id];
    const L = c.look;
    const skinCol = L.skin || '#f8d6c2';
    const skin = toon(skinCol);
    const hair = toon(L.hair);
    const g = new T.Group();
    const body = new T.Group();
    const head = new T.Group();
    g.add(body);
    g.add(head);

    // head + face decal
    const skull = put(head, sphere(1), skin, { scale: [1, 0.96, 0.95] });
    const faceOpen = new T.MeshBasicMaterial({ map: paintFace(L, false), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const faceShut = new T.MeshBasicMaterial({ map: paintFace(L, true), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const face = new T.Mesh(sphere(1.003, [FRONT - 0.7, 1.4, FRONT - 0.55, 1.1]), faceOpen);
    skull.add(face);
    for (const s of [-1, 1]) put(head, sphere(0.17), skin, { pos: [s * 0.97, -0.08, 0.02], scale: [0.5, 1, 0.75] });
    hairShell(head, hair, L);
    bangs(head, hair, L);

    // neck, torso, arms
    put(body, new T.CylinderGeometry(0.2, 0.24, 0.55, 20), toon(shade(skinCol, -0.08)), { pos: [0, -1.05, 0] });
    // lathe profiles run bottom → top so the normals face outward
    const torsoPts = [[0.001, -2.95], [0.66, -2.9], [0.6, -2.55], [0.56, -2.3], [0.68, -1.8], [0.72, -1.42], [0.58, -1.2], [0.24, -1.1], [0.001, -1.08]].map(([x, y]) => new T.Vector2(x, y));
    const cloth = toon(L.outfit);
    put(body, new T.LatheGeometry(torsoPts, 40), cloth, { scale: [1, 1, 0.68] });
    const wide = L.acc === 'katana' || L.acc === 'halo' || L.acc === 'demon';
    for (const s of [-1, 1]) {
      put(body, sphere(0.21), cloth, { pos: [s * 0.7, -1.38, 0] });
      const arm = new T.Group();
      arm.position.set(s * 0.72, -1.38, 0);
      arm.rotation.z = s * 0.2;
      body.add(arm);
      put(arm, new T.CylinderGeometry(0.15, wide ? 0.3 : 0.13, 0.98, 16, 1, wide), wide ? toon(L.outfit, { side: T.DoubleSide }) : cloth, { pos: [0, -0.49, 0] });
      put(arm, sphere(0.14), skin, { pos: [0, -1.02, 0.03] });
    }
    put(body, sphere(0.26, [0, Math.PI * 2, 0, 1.2]), toon(shade(skinCol, -0.25), { transparent: true, opacity: 0.35 }), { pos: [0, -0.92, 0.04], rot: [Math.PI, 0, 0], scale: [1.6, 0.6, 1], ink: false });
    accessories(g, head, body, L, c);

    head.userData = { faceOpen, faceShut, face };
    g.userData = { head, body, id };
    return g;
  }

  // ---------- scene, lights, snapshots ----------
  function makeScene(color) {
    const scene = new T.Scene();
    scene.add(new T.HemisphereLight(0xfff0ea, 0x3a3060, 0.46));
    const key = new T.DirectionalLight(0xfff6f0, 0.58);
    key.position.set(-3, 4, 6);
    scene.add(key);
    const rim = new T.DirectionalLight(col(color), 1.0);
    rim.position.set(4, 3, -5);
    scene.add(rim);
    const rim2 = new T.DirectionalLight(0xffffff, 0.35);
    rim2.position.set(-5, 1, -4);
    scene.add(rim2);
    return scene;
  }
  const FRAMES = {
    face: { w: 512, h: 512, target: [0, -0.02, 0], height: 2.75 },
    bust: { w: 400, h: 480, target: [0, -0.65, 0], height: 4.75 },
    clear: { w: 400, h: 480, target: [0, -0.65, 0], height: 4.75 },
    wide: { w: 480, h: 360, target: [0, 0.15, 0], height: 3.0 },
  };
  function frame(camera, f, yaw) {
    const fov = 22;
    const dist = f.height / 2 / Math.tan((fov / 2) * Math.PI / 180);
    camera.fov = fov;
    camera.aspect = f.w / f.h;
    camera.position.set(Math.sin(yaw) * dist, f.target[1] + dist * 0.1, Math.cos(yaw) * dist);
    camera.lookAt(f.target[0], f.target[1], f.target[2]);
    camera.updateProjectionMatrix();
  }
  function background(g2, w, h, c) {
    const S = root.ERArt.shade;
    const rg = g2.createRadialGradient(w / 2, h * 0.36, 0, w / 2, h * 0.36, Math.max(w, h) * 0.78);
    rg.addColorStop(0, S(c.color, -0.05));
    rg.addColorStop(0.5, S(c.color, -0.62));
    rg.addColorStop(1, '#0a0c1d');
    g2.fillStyle = rg;
    g2.fillRect(0, 0, w, h);
    g2.strokeStyle = c.color; g2.globalAlpha = 0.35; g2.lineWidth = 2;
    g2.beginPath(); g2.arc(w / 2, h * 0.42, Math.min(w, h) * 0.42, 0, Math.PI * 2); g2.stroke();
    g2.globalAlpha = 0.06; g2.fillStyle = '#fff';
    g2.beginPath(); g2.moveTo(-w * 0.1, h * 0.7); g2.lineTo(w * 0.6, -h * 0.1); g2.lineTo(w * 0.7, -h * 0.1); g2.lineTo(0, h * 0.7); g2.fill();
    g2.globalAlpha = 1;
  }

  let snapRenderer = null;
  function snapshot(id, crop) {
    const c = D.CHARACTERS[id];
    const f = FRAMES[crop];
    if (!snapRenderer) {
      snapRenderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      snapRenderer.setPixelRatio(1);
      snapRenderer.outputEncoding = T.sRGBEncoding;
    }
    snapRenderer.setSize(f.w, f.h, false);
    const scene = makeScene(c.color);
    const model = build(id);
    model.rotation.y = -0.32;
    scene.add(model);
    const cam = new T.PerspectiveCamera();
    frame(cam, f, 0);
    snapRenderer.setClearColor(0x000000, 0);
    snapRenderer.render(scene, cam);
    const out = document.createElement('canvas');
    out.width = f.w; out.height = f.h;
    const g2 = out.getContext('2d');
    if (crop !== 'clear') background(g2, f.w, f.h, c);
    g2.drawImage(snapRenderer.domElement, 0, 0);
    dispose(model);
    return out.toDataURL('image/png');
  }
  function dispose(obj) {
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.map) o.material.map.dispose();
    });
  }

  // ---------- live model ----------
  const live = { renderer: null, scene: null, cam: null, model: null, id: null, el: null, raf: 0, px: 0, py: 0, blinkAt: 0, crop: 'clear' };
  function stopLive() {
    cancelAnimationFrame(live.raf);
    live.raf = 0;
  }
  function tick(t) {
    if (!live.el || !live.el.isConnected) { stopLive(); return; }
    const w = live.el.clientWidth, h = live.el.clientHeight;
    if (w && h && (live.w !== w || live.h !== h)) {
      live.w = w; live.h = h;
      live.renderer.setSize(w, h, false);
      const f = Object.assign({}, FRAMES[live.crop], { w, h });
      frame(live.cam, f, 0);
    }
    const s = t / 1000;
    const m = live.model;
    const head = m.userData.head;
    m.rotation.y += ((-0.32 + live.px * 0.35) - m.rotation.y) * 0.06;
    head.rotation.x += ((live.py * 0.12 + Math.sin(s * 1.1) * 0.02) - head.rotation.x) * 0.08;
    head.rotation.z = Math.sin(s * 0.9) * 0.03;
    head.position.y = Math.sin(s * 1.8) * 0.025;
    m.userData.body.scale.y = 1 + Math.sin(s * 1.8) * 0.008;
    m.traverse((o) => {
      if (o.userData.sway) o.rotation.z = Math.sin(s * 1.6) * 0.05;
      if (o.userData.float) o.position.y = 1.55 + Math.sin(s * 2) * 0.05;
    });
    const hd = head.userData;
    if (s > live.blinkAt) { hd.face.material = hd.faceShut; if (s > live.blinkAt + 0.13) { hd.face.material = hd.faceOpen; live.blinkAt = s + 2.2 + Math.random() * 2.5; } }
    live.renderer.render(live.scene, live.cam);
    live.raf = requestAnimationFrame(tick);
  }
  window.addEventListener('pointermove', (e) => {
    live.px = (e.clientX / innerWidth - 0.5) * 2;
    live.py = (e.clientY / innerHeight - 0.5) * 2;
  });

  /** Puts an animated 3D character into `el` (replacing what is there). */
  A3.mount = function (el, id, crop) {
    if (!A3.ready || A3.enabled === false || !el || HEROES.indexOf(id) < 0) return false;
    if (!live.renderer) {
      live.renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
      live.renderer.setPixelRatio(Math.min(2, root.devicePixelRatio || 1));
      live.renderer.outputEncoding = T.sRGBEncoding;
      live.renderer.setClearColor(0x000000, 0);
      live.cam = new T.PerspectiveCamera();
    }
    if (live.id !== id) {
      if (live.model) dispose(live.model);
      live.scene = makeScene(D.CHARACTERS[id].color);
      live.model = build(id);
      live.model.rotation.y = -0.32;
      live.scene.add(live.model);
      live.id = id;
    }
    live.crop = crop || 'clear';
    live.el = el;
    live.w = live.h = 0;
    const cv = live.renderer.domElement;
    cv.className = 'live3d';
    el.classList.add('has-live');
    el.appendChild(cv);
    if (!live.raf) live.raf = requestAnimationFrame(tick);
    return true;
  };

  /** Loads Three.js and renders every hero portrait. Resolves true when 3D is in use. */
  A3.init = async function () {
    try {
      T = await loadThree();
      GM = gradientMap();
      for (const id of HEROES) {
        for (const crop of ['face', 'bust', 'clear', 'wide']) A3.images[id + ':' + crop] = snapshot(id, crop);
      }
      A3.ready = true;
    } catch (e) {
      A3.ready = false;
      A3.error = String(e && e.message || e);
    }
    return A3.ready;
  };
})(typeof self !== 'undefined' ? self : this);
