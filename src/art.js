/* Eclipse Rift — procedural anime portraits and UI icons (SVG).
   These are stand-ins until real illustrations exist: set ERData.ART[id] to an
   image path and every screen switches to that image instead. */
(function (root) {
  'use strict';
  const D = root.ERData;

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const t = amt < 0 ? 0 : 255;
    const p = Math.abs(amt);
    const ch = (v) => Math.round((t - v) * p + v);
    const r = ch(n >> 16), g = ch((n >> 8) & 255), b = ch(n & 255);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // Curved hair strands: zig-zag through points, bowing each segment sideways.
  function zig(points, bend) {
    let d = '';
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = points[i - 1];
      const [bx, by] = points[i];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const cx = (ax + bx) / 2 + (-(by - ay) / len) * bend;
      const cy = (ay + by) / 2 + ((bx - ax) / len) * bend;
      d += ` Q${cx.toFixed(1)} ${cy.toFixed(1)} ${bx} ${by}`;
    }
    return d;
  }
  const DOME = 'M57 114 C48 52 76 23 101 23 C128 23 154 52 143 114';
  const mirrorX = (pts) => pts.map(([x, y]) => [200 - x, y]);

  const FACE = 'M66 92 C66 58 134 58 134 92 C134 114 127 130 116 141 Q106 151 100 152 Q94 151 84 141 C73 130 66 114 66 92Z';
  const EYE = 'M72 106 Q75 97.5 85 97.5 Q94.5 97.5 97 104.5 Q96 115.5 85.5 117 Q75.5 116 72 106Z';
  const SHOULDERS = 'M14 240 C20 204 48 188 84 179 L100 191 L116 179 C152 188 180 204 186 240Z';

  const STYLES = {
    spiky: {
      back: 'M58 106 L44 94 L54 82 L40 66 L60 60 L54 40 L76 44 L78 22 L98 34 L110 14 L122 32 L142 24 L142 46 L162 44 L150 64 L164 76 L148 86 L152 106Z'
        + ' M60 100 L56 134 L70 124 L72 140 L84 128 L116 128 L128 140 L130 124 L144 134 L140 100Z',
      front: DOME + ' L136 88 L131 101 L126 74 L120 93 L113 72 L104 101 L99 70 L92 92 L85 72 L77 95 L72 80 L66 105 L63 90 Z',
      locks: '',
    },
    ponytail: {
      back: 'M54 122 C44 52 76 21 101 21 C128 21 156 52 146 122Z'
        + ' M132 36 C172 22 190 72 178 122 C170 160 180 198 194 236 C160 216 148 178 150 140 C152 104 148 72 128 54Z',
      front: DOME + zig([[143, 114], [136, 88], [131, 104], [117, 75], [111, 94], [101, 72], [99, 103], [87, 74], [80, 94], [72, 78], [64, 108], [60, 92]], 3) + ' Z',
      locks: 'M64 92 C56 118 60 142 52 170 Q64 154 70 130 Q73 112 71 96Z M136 92 C144 118 140 142 148 170 Q136 154 130 130 Q127 112 129 96Z',
    },
    long: {
      back: 'M100 23 C50 23 40 78 45 130 C50 178 38 208 24 240 L176 240 C162 208 150 178 155 130 C160 78 150 23 100 23Z',
      front: DOME + zig([[143, 114], [134, 90], [128, 104], [117, 80], [110, 96]], 3) + zig([[110, 96], [100, 74]], 2)
        + zig(mirrorX([[100, 74], [110, 96]]), -2) + zig(mirrorX([[110, 96], [117, 80], [128, 104], [134, 90], [143, 114]]), -3) + ' Z',
      locks: 'M63 90 C52 124 58 160 48 198 Q62 184 66 152 Q70 122 71 96Z M137 90 C148 124 142 160 152 198 Q138 184 134 152 Q130 122 129 96Z',
    },
    hime: {
      back: 'M100 23 C52 23 45 70 49 112 L47 234 L153 234 L151 112 C155 70 148 23 100 23Z',
      front: DOME + ' L143 93 L132 94 L122 92.5 L110 94 L100 92.5 L90 94 L78 92.5 L68 94 L57 93 Z',
      locks: 'M57 92 L59 172 L76 172 L73 98Z M143 92 L141 172 L124 172 L127 98Z',
    },
    messy: {
      back: 'M100 23 C52 23 45 76 51 122 L58 142 L66 124 L72 140 L80 126 L120 126 L128 140 L134 124 L142 142 L149 122 C155 76 148 23 100 23Z',
      front: DOME + zig([[143, 114], [138, 92], [134, 104], [128, 80], [122, 96], [117, 82], [110, 93], [106, 74], [101, 106], [96, 76], [88, 93], [84, 80], [76, 96], [70, 84], [64, 107], [60, 92]], 2.5)
        + ' Z M103 25 Q112 6 126 9 Q112 13 108 26Z',
      locks: '',
    },
  };

  const BROWS = {
    serious: 'M73 89.5 Q84 87.5 96 92.5',
    calm: 'M74 91 Q84 88.5 95 90.5',
    soft: 'M74 91.5 Q84 85.5 95 89',
  };
  const MOUTHS = {
    flat: '<path d="M95.5 135.5 Q100 136.5 104.5 135.5" fill="none" stroke="#9c4a52" stroke-width="1.5" stroke-linecap="round"/>',
    smirk: '<path d="M94.5 135.5 Q100.5 137.5 106 132.8" fill="none" stroke="#9c4a52" stroke-width="1.6" stroke-linecap="round"/>',
    smile: '<path d="M94 133.5 Q100 139.5 106 133.5" fill="none" stroke="#9c4a52" stroke-width="1.6" stroke-linecap="round"/>',
    grin: '<path d="M93.5 132.5 Q100 142 106.5 132.5 Q100 134.5 93.5 132.5Z" fill="#8e2f3c"/><path d="M95.5 133.3 Q100 134.6 104.5 133.3 L104 134.6 Q100 135.6 96 134.6Z" fill="#fff"/>',
    fang: '<path d="M93.5 134.2 Q100.5 137.6 107 132.4" fill="none" stroke="#7a1f2e" stroke-width="1.7" stroke-linecap="round"/><path d="M101.6 135.9 L103.1 139.6 L104.7 135.3Z" fill="#fff"/>',
  };

  function accessoryBack(L) {
    if (L.acc === 'katana') {
      return '<path d="M144 178 L171 112 L180 116 L153 182Z" fill="#241622"/>'
        + '<path d="M150 166 L156 152 M154 156 L160 142 M158 146 L164 132 M162 136 L168 122" stroke="#d9a441" stroke-width="2"/>'
        + '<ellipse cx="150" cy="172" rx="11" ry="4" transform="rotate(-66 150 172)" fill="#d9a441"/>';
    }
    if (L.acc === 'demon') {
      return `<path d="M22 240 L34 150 Q100 112 166 150 L178 240Z" fill="${shade(L.outfit, 0.06)}"/>`
        + `<path d="M34 150 Q100 112 166 150" fill="none" stroke="${L.trim}" stroke-width="1.6" opacity=".7"/>`;
    }
    if (L.acc === 'headphones') {
      return `<path d="M42 150 C30 74 62 16 100 16 C138 16 170 74 158 150 L150 200 L50 200Z" fill="${shade(L.outfit, -0.25)}"/>`
        + `<path d="M48 146 C38 80 66 24 100 24 C134 24 162 80 152 146" fill="none" stroke="${L.trim}" stroke-width="1.5" opacity=".6"/>`;
    }
    return '';
  }

  function outfit(L) {
    const o = L.outfit, t = L.trim, od = shade(o, -0.25);
    let s = `<path d="${SHOULDERS}" fill="${o}"/>`;
    switch (L.acc) {
      case 'armor':
        s += `<path d="M78 176 L100 199 L122 176 L127 191 L100 216 L73 191Z" fill="${shade(o, 0.15)}" stroke="${t}" stroke-width="1.6"/>`
          + `<path d="M12 240 C8 212 26 192 56 188 C74 194 78 216 72 240Z" fill="${shade(o, 0.12)}" stroke="${t}" stroke-width="2"/>`
          + `<path d="M188 240 C192 212 174 192 144 188 C126 194 122 216 128 240Z" fill="${shade(o, 0.12)}" stroke="${t}" stroke-width="2"/>`
          + `<path d="M100 222 L106 230 L100 238 L94 230Z" fill="${t}"/>`;
        break;
      case 'katana':
        s += `<path d="M84 179 L100 226 L116 179 L110 177 L100 206 L90 177Z" fill="${t}"/>`
          + `<path d="M60 240 L86 186 M140 240 L114 186" stroke="${od}" stroke-width="1.4" fill="none"/>`;
        break;
      case 'halo':
        s += `<path d="M30 214 Q100 244 170 214 L176 240 L24 240Z" fill="${shade(o, -0.06)}"/>`
          + `<path d="M84 180 Q100 198 116 180" fill="none" stroke="${t}" stroke-width="3"/>`
          + `<path d="M30 214 Q100 244 170 214" fill="none" stroke="${t}" stroke-width="2"/>`
          + `<circle cx="100" cy="205" r="5.5" fill="${L.eye}" stroke="${t}" stroke-width="2"/>`;
        break;
      case 'horns':
        s += `<path d="M76 166 Q84 184 72 194 Q90 188 100 199 Q110 188 128 194 Q116 184 124 166 Q100 180 76 166Z" fill="${shade(o, 0.12)}" stroke="${t}" stroke-width="1.4"/>`
          + `<path d="M100 214 L104 222 L100 232 L96 222Z" fill="${t}"/>`;
        break;
      case 'demon':
        s += `<path d="M66 190 L52 146 L82 176Z M134 190 L148 146 L118 176Z" fill="${shade(o, 0.1)}" stroke="${t}" stroke-width="1.4"/>`
          + `<path d="M84 178 L100 212 L116 178" fill="none" stroke="${t}" stroke-width="3"/>`
          + `<circle cx="100" cy="222" r="6" fill="${t}"/><circle cx="100" cy="222" r="2.4" fill="#ffd0d6"/>`;
        break;
      case 'headphones':
        s += `<path d="M76 158 Q100 176 124 158 L128 180 Q100 198 72 180Z" fill="${t}"/>`
          + `<path d="M112 182 L122 238 L136 232 L122 180Z" fill="${shade(t, -0.25)}"/>`
          + `<path d="M50 240 L74 196 M150 240 L128 198" stroke="${shade(o, 0.2)}" stroke-width="2" fill="none"/>`;
        break;
    }
    return s;
  }

  function accessoryFront(L, hairD) {
    switch (L.acc) {
      case 'halo':
        return `<ellipse cx="100" cy="15" rx="31" ry="7" fill="none" stroke="${L.trim}" stroke-width="7" opacity=".25"/>`
          + `<ellipse cx="100" cy="15" rx="31" ry="7" fill="none" stroke="#ffe7a3" stroke-width="3"/>`;
      case 'horns':
        return `<path d="M81 42 Q66 28 63 8 Q78 20 91 35Z" fill="url(#horn)"/><path d="M119 42 Q134 28 137 8 Q122 20 109 35Z" fill="url(#horn)"/>`
          + `<path d="M126 58 Q136 50 134 40 Q142 52 130 62Z" fill="${L.trim}"/>`;
      case 'headphones':
        return `<path d="M61 104 C55 36 145 36 139 104" fill="none" stroke="#18211f" stroke-width="6"/>`
          + `<path d="M61 104 C55 36 145 36 139 104" fill="none" stroke="${L.trim}" stroke-width="1.6"/>`
          + `<rect x="50" y="94" width="15" height="28" rx="6" fill="#18211f" stroke="${L.trim}" stroke-width="2"/>`
          + `<rect x="135" y="94" width="15" height="28" rx="6" fill="#18211f" stroke="${L.trim}" stroke-width="2"/>`;
      case 'katana':
        return `<path d="M128 36 L114 24 L116 46Z M132 38 L146 22 L148 44Z" fill="#1d1220" stroke="${L.trim}" stroke-width="1.2"/><circle cx="130" cy="37" r="3.5" fill="${L.trim}"/>`;
      case 'armor':
        return `<path d="M92 121 L109 115" stroke="${hairD}" stroke-width="1" opacity=".35"/>`;
      case 'demon': {
        const horn = 'M74 62 C52 50 36 30 40 0 C48 20 62 32 84 46Z';
        return `<path d="${horn}" fill="url(#bone)"/><path d="${horn}" transform="translate(200 0) scale(-1 1)" fill="url(#bone)"/>`
          + `<path d="M62 82 Q100 68 138 82" fill="none" stroke="#d9a441" stroke-width="2.2"/>`
          + `<path d="M100 66 L106 75 L100 84 L94 75Z" fill="${L.trim}" stroke="#d9a441" stroke-width="1.2"/>`
          + `<path d="M73 120 L83 122.5 M127 120 L117 122.5" stroke="${L.trim}" stroke-width="1.6" stroke-linecap="round"/>`;
      }
    }
    return '';
  }


  // ---------- Rift horrors (monsters) ----------
  function monsterBody(L) {
    const m = L.main, g = L.glow, md = shade(m, -0.45), ml = shade(m, 0.25);
    const eye = (x, y, r, slit) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.8}" fill="#fff" filter="url(#glow)" opacity=".9"/>`
      + `<ellipse cx="${x}" cy="${y}" rx="${r * 0.62}" ry="${r * 0.62}" fill="${g}"/>`
      + (slit ? `<ellipse cx="${x}" cy="${y}" rx="${r * 0.14}" ry="${r * 0.55}" fill="#120814"/>` : `<circle cx="${x}" cy="${y}" r="${r * 0.28}" fill="#120814"/>`)
      + `<circle cx="${x - r * 0.25}" cy="${y - r * 0.25}" r="${r * 0.16}" fill="#fff"/>`;
    const join = (arr) => arr.join(String());
    switch (L.shape) {
      case 'wisp':
        return `<path d="M100 150 C70 160 64 196 86 214 C76 190 96 182 104 196 C108 176 132 182 124 206 C146 186 136 154 100 150Z" fill="url(#body)" opacity=".85"/>`
          + `<circle cx="100" cy="104" r="46" fill="${g}" opacity=".22" filter="url(#glow)"/>`
          + `<circle cx="100" cy="106" r="40" fill="url(#orb)"/>`
          + `<path d="M64 96 Q100 60 136 96" fill="none" stroke="${g}" stroke-width="2" opacity=".6"/>`
          + eye(100, 108, 20, true)
          + `<circle cx="58" cy="70" r="3" fill="${g}" filter="url(#glow)"/><circle cx="146" cy="84" r="2.4" fill="${g}" filter="url(#glow)"/><circle cx="140" cy="148" r="2" fill="${g}" filter="url(#glow)"/>`;
      case 'husk':
        return `<path d="M100 34 C62 36 48 78 50 122 C40 160 22 206 14 240 L186 240 C178 206 160 160 150 122 C152 78 138 36 100 34Z" fill="url(#body)"/>`
          + `<path d="M14 240 L28 214 L40 236 L56 208 L70 240Z M186 240 L172 214 L160 236 L144 208 L130 240Z" fill="${md}"/>`
          + `<path d="M100 52 C74 54 66 82 68 110 C70 136 84 150 100 152 C116 150 130 136 132 110 C134 82 126 54 100 52Z" fill="#06050c"/>`
          + `<path d="M74 96 Q100 82 126 96" fill="none" stroke="${ml}" stroke-width="1.5" opacity=".5"/>`
          + `<ellipse cx="86" cy="108" rx="7" ry="4" fill="${g}" filter="url(#glow)"/><ellipse cx="114" cy="108" rx="7" ry="4" fill="${g}" filter="url(#glow)"/>`
          + `<path d="M86 112 L84 132 M114 112 L117 128" stroke="${g}" stroke-width="1.6" opacity=".55"/>`;
      case 'gnasher':
        return `<path d="M40 110 L28 84 L52 96 L52 66 L72 86 L84 58 L96 84 L112 58 L120 86 L142 64 L144 94 L170 84 L160 112Z" fill="${md}"/>`
          + `<ellipse cx="100" cy="128" rx="68" ry="60" fill="url(#body)"/>`
          + `<path d="M48 130 Q100 196 152 130 Q100 150 48 130Z" fill="#14040a"/>`
          + `<path d="M54 134 L62 150 L70 138 L78 156 L86 141 L94 160 L102 142 L110 160 L118 141 L126 156 L134 138 L142 150 L148 134 Q100 148 54 134Z" fill="#f4e6d6"/>`
          + `<path d="M70 168 L76 156 L82 170 L90 158 L98 174 L106 158 L114 172 L120 158 L128 166 Q100 186 70 168Z" fill="#e4d2c0"/>`
          + eye(82, 104, 7) + eye(100, 96, 8) + eye(118, 104, 7);
      case 'leech':
        return `<path d="M58 228 C30 196 62 170 92 178 C124 186 150 160 132 132" fill="none" stroke="url(#body)" stroke-width="34" stroke-linecap="round"/>`
          + join(Array.from({ length: 6 }, (_, i) => `<circle cx="${70 + i * 12}" cy="${206 - i * 12}" r="2.6" fill="${g}" opacity=".7"/>`))
          + `<ellipse cx="116" cy="100" rx="38" ry="34" fill="url(#body)"/>`
          + `<ellipse cx="116" cy="40" rx="30" ry="7" fill="none" stroke="${g}" stroke-width="3.5" filter="url(#glow)"/>`
          + `<circle cx="116" cy="104" r="20" fill="#120610"/>`
          + join(Array.from({ length: 10 }, (_, i) => {
            const a = (i / 10) * Math.PI * 2;
            const x = 116 + Math.cos(a) * 19, y = 104 + Math.sin(a) * 19, x2 = 116 + Math.cos(a) * 11, y2 = 104 + Math.sin(a) * 11;
            return `<path d="M${x.toFixed(1)} ${y.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="#efe6d0" stroke-width="3" stroke-linecap="round"/>`;
          }))
          + eye(96, 78, 5) + eye(136, 78, 5);
      case 'crawler':
        return join([-1, 1].map((sx) => join([0, 1, 2].map((k) => {
            const y = 120 + k * 22, x = 100 + sx * 40;
            return `<path d="M${x} ${y} Q${100 + sx * 86} ${y - 40 + k * 6} ${100 + sx * (92 + k * 6)} ${y + 46}" fill="none" stroke="${md}" stroke-width="6" stroke-linecap="round"/>`;
          }))))
          + `<ellipse cx="100" cy="140" rx="50" ry="42" fill="url(#body)"/>`
          + `<path d="M58 124 L64 96 L76 116 L86 86 L96 112 L106 82 L114 110 L126 88 L132 116 L144 98 L142 126Z" fill="${md}"/>`
          + `<ellipse cx="100" cy="150" rx="30" ry="18" fill="${shade(m, -0.25)}"/>`
          + eye(88, 140, 6) + eye(112, 140, 6) + eye(80, 156, 4) + eye(120, 156, 4)
          + `<path d="M92 166 L96 178 L100 168 L104 178 L108 166" fill="none" stroke="#f4e6d6" stroke-width="2"/>`;
      case 'warden':
        return `<path d="M14 240 C18 196 40 176 66 170 L134 170 C160 176 182 196 186 240Z" fill="${md}"/>`
          + `<path d="M10 200 C8 170 30 150 60 152 C70 172 66 200 56 220Z M190 200 C192 170 170 150 140 152 C130 172 134 200 144 220Z" fill="url(#body)" stroke="${g}" stroke-width="1.5"/>`
          + `<path d="M100 36 C64 38 56 72 58 108 C60 140 76 162 100 166 C124 162 140 140 142 108 C144 72 136 38 100 36Z" fill="url(#body)" stroke="${shade(g, -0.3)}" stroke-width="2"/>`
          + `<path d="M100 24 L106 40 L100 50 L94 40Z" fill="${g}"/>`
          + `<path d="M70 98 L130 98 L126 108 L106 108 L106 140 L94 140 L94 108 L74 108Z" fill="#05060c"/>`
          + `<path d="M74 101 L126 101" stroke="${g}" stroke-width="3" filter="url(#glow)"/><path d="M100 110 L100 136" stroke="${g}" stroke-width="2.4" filter="url(#glow)" opacity=".8"/>`;
      case 'harbinger':
        return `<ellipse cx="100" cy="112" rx="78" ry="22" fill="none" stroke="${g}" stroke-width="1.5" opacity=".55" transform="rotate(-14 100 112)"/>`
          + `<ellipse cx="100" cy="112" rx="66" ry="16" fill="none" stroke="${g}" stroke-width="1" opacity=".35" transform="rotate(18 100 112)"/>`
          + `<path d="M100 30 L144 108 L100 194 L56 108Z" fill="url(#body)" stroke="${g}" stroke-width="2"/>`
          + `<path d="M100 30 L118 108 L100 194 L82 108Z" fill="${ml}" opacity=".35"/>`
          + `<path d="M56 108 L144 108" stroke="${g}" stroke-width="1" opacity=".5"/>`
          + `<circle cx="100" cy="108" r="16" fill="${g}" opacity=".35" filter="url(#glow)"/>` + eye(100, 108, 11, true)
          + `<path d="M40 60 L52 76 L46 78 L60 98" fill="none" stroke="${g}" stroke-width="2.4" filter="url(#glow)"/><path d="M160 150 L150 134 L156 132 L142 114" fill="none" stroke="${g}" stroke-width="2.4" filter="url(#glow)"/>`;
      case 'seraph':
        return join([-1, 1].map((sx) => join([0, 1, 2].map((k) =>
            `<path d="M100 120 C${100 + sx * 50} ${80 - k * 10} ${100 + sx * 90} ${70 + k * 30} ${100 + sx * (96 - k * 6)} ${150 + k * 26} C${100 + sx * 70} ${140 + k * 10} ${100 + sx * 40} 136 100 128Z" fill="${shade(m, -0.05 - k * 0.12)}" stroke="${shade(g, -0.25)}" stroke-width="1" opacity="${0.95 - k * 0.15}"/>`))))
          + `<circle cx="100" cy="96" r="58" fill="none" stroke="${g}" stroke-width="4" filter="url(#glow)" opacity=".85"/>`
          + `<circle cx="100" cy="96" r="50" fill="none" stroke="${g}" stroke-width="1" opacity=".6"/>`
          + `<path d="M100 52 C74 54 66 82 68 108 C70 138 84 156 100 160 C116 156 130 138 132 108 C134 82 126 54 100 52Z" fill="url(#mask)"/>`
          + eye(84, 98, 7) + eye(116, 98, 7) + eye(100, 78, 6) + eye(100, 122, 5) + eye(72, 120, 3.5) + eye(128, 120, 3.5)
          + `<path d="M90 142 Q100 148 110 142" fill="none" stroke="#6a5a40" stroke-width="1.5"/>`;
    }
    return String();
  }
  function monsterSVG(c, crop) {
    const L = c.look;
    const view = crop === 'face' ? '30 30 140 140' : crop === 'wide' ? '10 30 180 135' : '0 0 200 240';
    const withBg = crop !== 'clear';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" preserveAspectRatio="xMidYMid slice"><defs>`
      + `<radialGradient id="bg" cx="50%" cy="42%" r="78%"><stop offset="0" stop-color="${shade(c.color, -0.35)}"/><stop offset=".55" stop-color="${shade(c.color, -0.78)}"/><stop offset="1" stop-color="#07060f"/></radialGradient>`
      + `<linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(L.main, 0.18)}"/><stop offset="1" stop-color="${shade(L.main, -0.55)}"/></linearGradient>`
      + `<radialGradient id="orb" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="${L.glow}"/><stop offset=".45" stop-color="${L.main}"/><stop offset="1" stop-color="${shade(L.main, -0.6)}"/></radialGradient>`
      + `<radialGradient id="mask" cx="45%" cy="35%" r="75%"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="${shade(L.main, -0.25)}"/></radialGradient>`
      + '<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
      + '</defs>'
      + (withBg ? `<rect x="-20" y="-20" width="240" height="280" fill="url(#bg)"/><circle cx="100" cy="104" r="84" fill="none" stroke="${c.color}" stroke-width="1" opacity=".3"/>` : String())
      + monsterBody(L)
      + '</svg>';
  }

  function portraitSVG(id, crop) {
    const c = D.CHARACTERS[id];
    const L = c.look;
    if (L.monster) return monsterSVG(c, crop);
    const st = STYLES[L.style];
    const n = parseInt(L.hair.slice(1), 16);
    const bright = ((n >> 16) + ((n >> 8) & 255) + (n & 255)) / 3 > 190;
    const hair = L.hair, hairD = bright ? shade(c.color, 0.45) : shade(hair, -0.38), hairL = L.hairHi;
    const skin = L.skin || '#fde5d6', skinS = L.skin ? shade(L.skin, -0.14) : '#efb9a3';
    const lash = shade(hair, -0.72);
    const pupil = shade(L.eye, -0.78);
    const view = crop === 'face' ? '36 30 128 128' : crop === 'wide' ? '10 20 180 135' : '0 0 200 240';
    const withBg = crop !== 'clear';
    const sy = L.eyeScale || 1;

    const eye = `<path d="${EYE}" fill="${L.sclera || '#fff'}"/>`
      + `<g clip-path="url(#eyeclip)"><ellipse cx="85.5" cy="108.5" rx="8.4" ry="10.6" fill="url(#iris)" stroke="${shade(L.eye, -0.6)}" stroke-width=".8"/>`
      + `<ellipse cx="85.5" cy="110" rx="3.8" ry="5.4" fill="${pupil}"/>`
      + `<path d="M66 94 H104 V101.5 Q85 106 66 101.5Z" fill="${lash}" opacity=".14"/></g>`
      + `<path d="M70.5 106 Q74 96.5 85 96.5 Q95 96.5 98 104" fill="none" stroke="${lash}" stroke-width="2.9" stroke-linecap="round"/>`
      + `<path d="M71.2 105.4 L66.8 102.6" stroke="${lash}" stroke-width="2.2" stroke-linecap="round"/>`
      + `<path d="M77.5 116.4 Q85.5 119 93.5 115" fill="none" stroke="${lash}" stroke-width="1" opacity=".5"/>`;
    const eyes = `<g transform="translate(0 107) scale(1 ${sy}) translate(0 -107)">${eye}`
      + `<g transform="translate(200 0) scale(-1 1)">${eye}</g>`
      + '<circle cx="82.3" cy="104.6" r="2.8" fill="#fff"/><circle cx="88.6" cy="113" r="1.3" fill="#fff" opacity=".85"/>'
      + '<circle cx="111.3" cy="104.6" r="2.8" fill="#fff"/><circle cx="117.6" cy="113" r="1.3" fill="#fff" opacity=".85"/></g>';
    const brow = BROWS[L.brow] || BROWS.calm;

    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" preserveAspectRatio="xMidYMid slice">`
      + '<defs>'
      + `<radialGradient id="bg" cx="50%" cy="36%" r="78%"><stop offset="0" stop-color="${shade(c.color, -0.05)}"/><stop offset=".5" stop-color="${shade(c.color, -0.62)}"/><stop offset="1" stop-color="#0a0c1d"/></radialGradient>`
      + `<linearGradient id="hair" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hair}"/><stop offset="1" stop-color="${hairD}"/></linearGradient>`
      + `<linearGradient id="iris" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(L.eye, -0.7)}"/><stop offset=".5" stop-color="${L.eye}"/><stop offset="1" stop-color="${shade(L.eye, 0.6)}"/></linearGradient>`
      + '<linearGradient id="horn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cdb6ff"/><stop offset="1" stop-color="#2a1d44"/></linearGradient>'
      + '<linearGradient id="bone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3e6d8"/><stop offset=".55" stop-color="#7a2a36"/><stop offset="1" stop-color="#22070e"/></linearGradient>'
      + `<clipPath id="faceclip"><path d="${FACE}"/></clipPath>`
      + `<clipPath id="eyeclip"><path d="${EYE}"/></clipPath>`
      + '</defs>';
    if (withBg) {
      s += '<rect x="-20" y="-20" width="240" height="280" fill="url(#bg)"/>'
        + `<circle cx="100" cy="96" r="78" fill="none" stroke="${c.color}" stroke-width="1" opacity=".35"/>`
        + '<path d="M-20 170 L120 -20 L138 -20 L-2 170Z" fill="#fff" opacity=".06"/><path d="M60 260 L220 40 L228 40 L68 260Z" fill="#fff" opacity=".05"/>';
    }
    s += accessoryBack(L);
    s += `<path d="${st.back}" fill="url(#hair)"/>`;
    s += `<path d="M88 128 L88 170 Q100 177 112 170 L112 128Z" fill="${skinS}"/>`;
    s += outfit(L);
    s += `<ellipse cx="66" cy="110" rx="5" ry="9" fill="${skinS}"/><ellipse cx="134" cy="110" rx="5" ry="9" fill="${skinS}"/>`;
    s += `<path d="${FACE}" fill="${skin}"/>`;
    s += `<g clip-path="url(#faceclip)"><path d="${st.front}" transform="translate(0 5)" fill="${skinS}" opacity=".55"/>`
      + `<path d="M66 128 Q100 160 134 128 L134 160 L66 160Z" fill="${skinS}" opacity=".25"/></g>`;
    s += '<ellipse cx="77" cy="124" rx="6.5" ry="2.6" fill="#ff7d98" opacity=".32"/><ellipse cx="123" cy="124" rx="6.5" ry="2.6" fill="#ff7d98" opacity=".32"/>';
    s += eyes;
    s += `<path d="${brow}" fill="none" stroke="${shade(hair, -0.45)}" stroke-width="1.8" stroke-linecap="round"/>`
      + `<path d="${brow}" transform="translate(200 0) scale(-1 1)" fill="none" stroke="${shade(hair, -0.45)}" stroke-width="1.8" stroke-linecap="round"/>`;
    s += `<path d="M100.6 121.5 q-1 3.2 -2.6 4.2" fill="none" stroke="${skinS}" stroke-width="1.3" stroke-linecap="round"/>`;
    s += MOUTHS[L.mouth] || MOUTHS.flat;
    s += `<path d="${st.front}" fill="url(#hair)"/>`;
    if (st.locks) s += `<path d="${st.locks}" fill="url(#hair)"/>`;
    s += `<path d="M71 58 Q100 39 129 58 Q100 49 71 58Z" fill="${hairL}" opacity=".75"/>`
      + `<path d="M84 50 L87 62 L90 51Z M110 51 L113 62 L116 50Z" fill="${hairL}" opacity=".5"/>`;
    s += accessoryFront(L, hairD);
    s += '</svg>';
    return s;
  }

  const cache = {};
  function portrait(id, crop) {
    if (D.ART && D.ART[id]) return D.ART[id];
    const key = id + ':' + (crop || 'bust');
    const A3 = root.ERArt3D;
    if (A3 && A3.ready && A3.enabled !== false && A3.images[key]) return A3.images[key];
    if (!cache[key]) cache[key] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(portraitSVG(id, crop));
    return cache[key];
  }

  // 16x16 stroke icons, colored by currentColor.
  const ICONS = {
    shield: '<path d="M8 1.6 13.4 3.6V8c0 3.1-2.3 5.4-5.4 6.4C4.9 13.4 2.6 11.1 2.6 8V3.6Z"/>',
    str: '<path d="M8 14V3M3.8 7.2 8 3l4.2 4.2M4 14h8"/>',
    taunt: '<path d="M8 1.6 13.4 3.6V8c0 3.1-2.3 5.4-5.4 6.4C4.9 13.4 2.6 11.1 2.6 8V3.6Z"/><path d="M8 5v3.6M8 10.8v.4"/>',
    vuln: '<path d="M8 1.6 13.4 3.6V8c0 3.1-2.3 5.4-5.4 6.4C4.9 13.4 2.6 11.1 2.6 8V3.6Z"/><path d="M8.6 2.4 6.6 7l3 1.6-2 5"/>',
    weak: '<path d="M8 2v11M3.8 8.8 8 13l4.2-4.2M4 2h8"/>',
    poison: '<path d="M8 1.8S3.4 7 3.4 10a4.6 4.6 0 0 0 9.2 0C12.6 7 8 1.8 8 1.8Z"/>',
    mark: '<circle cx="8" cy="8" r="4.6"/><path d="M8 1v3.4M8 11.6V15M1 8h3.4M11.6 8H15"/>',
    crystal: '<path d="M8 1.2 14 6 8 14.8 2 6Z"/><path d="M2 6h12M5.6 6 8 14.8 10.4 6 8 1.2 5.6 6"/>',
    link: '<path d="M6.6 9.4 9.4 6.6"/><path d="M7.4 4.2 8.6 3a2.8 2.8 0 0 1 4 4l-1.2 1.2M8.6 11.8 7.4 13a2.8 2.8 0 0 1-4-4l1.2-1.2"/>',
    attack: '<path d="M13.5 2.5 6 10M10 2.5h3.5V6M4 9l3 3M3 13l2-2"/>',
    skill: '<path d="M8 1.5 13.6 4.7v6.6L8 14.5 2.4 11.3V4.7Z"/><path d="M8 5.5v5M5.5 8h5"/>',
    support: '<path d="M8 3v10M3 8h10"/><circle cx="8" cy="8" r="6.4"/>',
    close: '<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>',
    cards: '<rect x="2.5" y="3.5" width="7" height="10" rx="1.2"/><path d="M6.5 2.5h6a1.2 1.2 0 0 1 1.2 1.2V12"/>',
    bolt: '<path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8Z"/>',
    heart: '<path d="M8 13.6S2 10 2 6a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 4-6 7.6-6 7.6Z"/>',
    star: '<path d="m8 1.6 1.9 4.2 4.5.4-3.4 3 1 4.5L8 11.4l-4 2.3 1-4.5-3.4-3 4.5-.4Z"/>',
    counter: '<path d="M3 3l6 6M3 3v3M3 3h3M13 3 7 9M13 3v3M13 3h-3M5.5 10.5 2.5 13.5M10.5 10.5l3 3"/>',
    regen: '<path d="M8 13.6S2 10 2 6a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 4-6 7.6-6 7.6Z"/><path d="M8 6v4M6 8h4"/>',
    aim: '<circle cx="8" cy="8" r="5.6"/><circle cx="8" cy="8" r="2.2"/><path d="M8 .8v2.4M8 12.8v2.4M.8 8h2.4M12.8 8h2.4"/>',
    n_battle: '<path d="M3 13 13 3M10 3h3v3M3 10l3 3M13 13 3 3M3 6V3h3M13 10l-3 3"/>',
    n_elite: '<path d="M8 2c3.3 0 5.5 2.3 5.5 5.2 0 1.8-.9 3-2 3.8V13H4.5v-2C3.4 10.2 2.5 9 2.5 7.2 2.5 4.3 4.7 2 8 2Z"/><circle cx="5.8" cy="7.5" r="1.2"/><circle cx="10.2" cy="7.5" r="1.2"/><path d="M7 13v1.6M9 13v1.6"/>',
    n_unknown: '<path d="M5.5 5.6a2.6 2.6 0 1 1 3.6 2.4c-.8.4-1.1.9-1.1 1.8v.6M8 12.6v.4"/>',
    n_rest: '<path d="M3 13.5h10M5 13.5 8 9l3 4.5M8 9c-2-1.6-1.4-3.4 0-6 1.4 2.6 2 4.4 0 6Z"/>',
    n_shop: '<path d="M3.5 5.5h9l-.8 8H4.3Z"/><path d="M6 5.5V4.4a2 2 0 0 1 4 0v1.1"/>',
    n_treasure: '<rect x="2.5" y="6" width="11" height="7.5" rx="1"/><path d="M2.5 9h11M8 7.8v2.6M3.5 6a4.5 3 0 0 1 9 0"/>',
    n_boss: '<path d="M2.5 12.5h11L14 4.5l-3.4 3L8 2.8 5.4 7.5 2 4.5Z"/><circle cx="8" cy="10" r="1"/>',
    n_event: '<path d="M8 2 14 13.5H2Z"/><path d="M8 6.5v3.5M8 11.8v.2"/>',
    deck: '<rect x="3" y="2.5" width="8" height="11" rx="1.2"/><path d="M13 4.5v9a1 1 0 0 1-1 1H6"/>',
    coin: '<circle cx="8" cy="8" r="6"/><path d="M8 4.5v7M10 6H7a1.2 1.2 0 0 0 0 2.4h2A1.2 1.2 0 0 1 9 11H6"/>',
    brain: '<path d="M6 2.5a2.5 2.5 0 0 0-2.5 2.6A2.6 2.6 0 0 0 2.5 9.8a2.4 2.4 0 0 0 3 3.2A2 2 0 0 0 8 13.5V3.6A2.2 2.2 0 0 0 6 2.5ZM10 2.5a2.5 2.5 0 0 1 2.5 2.6 2.6 2.6 0 0 1 1 4.7 2.4 2.4 0 0 1-3 3.2A2 2 0 0 1 8 13.5"/>',
    frag: '<path d="M8 1.5 12.5 6 10 14.5H6L3.5 6Z"/><path d="M3.5 6h9M8 1.5 6 14.5M8 1.5l2 13"/>',
    rift: '<path d="M8 1.5c-2 3-2 5 0 6.5s2 3.5 0 6.5M4 4.5c-1.5 2-1.5 5 0 7M12 4.5c1.5 2 1.5 5 0 7"/>',
    core: '<path d="M8 1.5c2.6 2 4.6 4.2 4.6 7a4.6 4.6 0 0 1-9.2 0c0-2.8 2-5 4.6-7Z"/><path d="M8 6.2v4.6M5.9 8.5h4.2"/>',
    crown: '<path d="M2.5 12.5h11L14 4.5l-3.4 3L8 2.8 5.4 7.5 2 4.5Z"/>',
    globe: '<circle cx="8" cy="8" r="6.2"/><path d="M1.8 8h12.4M8 1.8c2 2 2 10.4 0 12.4M8 1.8c-2 2-2 10.4 0 12.4"/>',
    copy: '<rect x="5" y="5" width="8.5" height="8.5" rx="1.4"/><path d="M3 10.5V3.8C3 3.3 3.3 3 3.8 3h6.7"/>',
    w_fang: '<path d="M3 2.5c6 1 10 5 10.5 11-3-3.5-6-4.8-9.6-5.3Z"/><path d="M4 8.2 2.5 13.5"/>',
    w_chalice: '<path d="M3.5 2.5h9c0 4-2 6-4.5 6s-4.5-2-4.5-6Z"/><path d="M8 8.5v4M5 13.5h6"/>',
    w_sigil: '<path d="M8 1.6 13.4 3.6V8c0 3.1-2.3 5.4-5.4 6.4C4.9 13.4 2.6 11.1 2.6 8V3.6Z"/><path d="m8 5 1.2 2.2L8 9.4 6.8 7.2Z"/>',
    w_catalyst: '<path d="M8 1.2 12 5v6l-4 3.8L4 11V5Z"/><path d="M4 5l4 2.6L12 5M8 7.6v7.2"/>',
    w_horn: '<path d="M3 13.5C3 7 6.5 3 13 2.5 9.5 5 8 8 8.5 13.5Z"/>',
    w_edge: '<path d="M13.5 2.5 5.5 10.5M11 2.5h2.5V5M3.5 9.5l3 3M2.5 13.5l2-2"/><path d="M9 4.5l2.5 2.5"/>',
  };
  function icon(name) {
    const p = ICONS[name];
    if (!p) return '';
    return `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  }

  root.ERArt = { portrait, portraitSVG, icon, shade };
})(typeof self !== 'undefined' ? self : this);
