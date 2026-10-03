/* Eclipse Rift — shared UI pieces: click routing, modal, toast, card faces,
   text for effects / passives / Awakening / weapons. Other ui/*.js files add
   their screens to window.ERUI. */
(function () {
  'use strict';
  const D = window.ERData, E = window.EREngine, Art = window.ERArt, P = window.ERProfile;
  const icon = Art.icon;
  const app = document.getElementById('app');
  const fx = document.getElementById('fx');

  const UI = {
    D, E, Art, P, G: window.ERProg, AI: window.ERAI, icon, app, fx,
    screen: '',
    on: {},              // click handlers by data-act
    modalClosed: [],     // callbacks after a modal closes
  };
  window.ERUI = UI;

  UI.$ = (sel) => document.querySelector(sel);
  UI.esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  UI.setScreen = (name, html) => {
    UI.screen = name;
    app.className = 'scr-' + name;
    app.innerHTML = html;
  };

  // ---------- input ----------
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (el && !el.disabled && UI.on[el.dataset.act]) { UI.on[el.dataset.act](el, e); return; }
    if (e.target.classList && e.target.classList.contains('modal') && !e.target.classList.contains('locked')) UI.closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.querySelector('.modal:not(.locked)')) UI.closeModal();
    else if (UI.onEscape) UI.onEscape();
  });

  UI.modal = (html, cls) => {
    UI.closeModal();
    const m = document.createElement('div');
    m.className = 'modal ' + (cls || '');
    m.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(m);
    const f = m.querySelector('.btn.primary, button');
    if (f) f.focus({ preventScroll: true });
    return m;
  };
  UI.closeModal = () => {
    document.querySelectorAll('.modal').forEach((m) => m.remove());
    UI.modalClosed.forEach((fn) => fn());
  };
  UI.on.close = () => UI.closeModal();

  let toastTimer = 0;
  UI.toast = (msg) => {
    let t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.setAttribute('role', 'status');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  };

  // ---------- small pieces ----------
  UI.wallet = () => `<div class="wallet" title="คริสตัล · หัวใจปีศาจ">${icon('crystal')}<b>${P.data.crystals.toLocaleString()}</b><span class="w-core">${icon('core')}<b>${P.data.cores}</b></span></div>`;
  UI.topbar = (title) => `<header class="topbar"><button class="back" data-act="home" aria-label="กลับหน้าหลัก">‹<span>${title}</span></button>${UI.wallet()}</header>`;
  UI.rar = (r) => `<span class="rar ${r.toLowerCase()}">${r}</span>`;
  UI.pct = (v) => Math.round(v * 100) + '%';

  UI.passiveText = (c, pv) => c.passive.text.replace('{v}', c.passive.pct ? UI.pct(pv) : pv);

  UI.awakeningText = (c, a) => {
    switch (a.type) {
      case 'stat': return `HP และพลัง +${UI.pct(a.v)}`;
      case 'upgrade': return `${D.CARDS[a.card].name} อัปเกรดเป็น ${D.CARDS[a.card + '_plus'].name}`;
      case 'passive': return `${c.passive.name} แรงขึ้น (${c.passive.pct ? UI.pct(a.v) : a.v})`;
      case 'burst': return `เริ่มทุกการต่อสู้พร้อม Burst ${a.v}%`;
    }
    return '';
  };

  UI.weaponName = (w) => D.WEAPONS[w.tpl].name;
  UI.weaponStats = (w) => Object.entries(w.stats).map(([k, v]) => `${D.STAT_NAMES[k]} +${k === 'burst' ? v : UI.pct(v)}`).join(' · ');
  UI.weaponIcon = (w) => `<span class="wpn r-${w.rarity.toLowerCase()}">${icon('w_' + w.tpl)}</span>`;

  function num(val, base) {
    const cls = val > base ? ' up' : val < base ? ' down' : '';
    return `<b class="n${cls}">${val}</b>`;
  }
  /** Card / burst text in Thai, with live numbers when a battle unit is given. */
  const kwOf = (k) => `<span class="kw ${D.STATUS[k].kind}">${D.STATUS[k].name}</span>`;
  const COND = { link2: 'LINK 2+', follow: 'ต่อเนื่อง', marked: 'ถ้าเป้าติดล็อกเป้า' };
  function scaleText(sc) {
    const where = sc.from === 'self' ? 'ของตัวเอง' : 'บนเป้า';
    if (sc.key === 'block') return `+${sc.v === 1 ? '' : sc.v + '× '}โล่${where}`;
    if (sc.key === 'debuffs') return `+${sc.v} ต่อดีบัฟ${where}`;
    return `+${sc.v} ต่อ ${kwOf(sc.key)}${where}`;
  }
  UI.effectsText = (effects, src, link, mult) => effects.map((e) => {
    const m = mult || 1;
    let t = '';
    switch (e.op) {
      case 'dmg': {
        const selfBonus = src && e.scale && e.scale.from === 'self' ? E.scaleBonus(e.scale, src, null) : 0;
        const base = Math.round((e.v + selfBonus) * m);
        const v = src ? E.calcDamage(src, null, base, link) : base;
        const showNum = !(e.v === 0 && e.scale && !(src && e.scale.from === 'self'));
        t = `โจมตี${e.to === 'enemies' ? 'ศัตรูทุกตัว' : ''} ${showNum ? num(v, e.v) : ''}${e.hits > 1 ? ` ×${e.hits}` : ''}`;
        if (e.scale && !(src && e.scale.from === 'self')) t += ` <small>(${scaleText(e.scale)})</small>`;
        if (e.execute) t += ` <small>(+${e.execute} ถ้าเป้า HP ต่ำกว่าครึ่ง)</small>`;
        break;
      }
      case 'block': {
        const v = src ? E.outAmount(e.v * m, src, link) : Math.round(e.v * m);
        t = e.to === 'self' ? `รับโล่ ${num(v, e.v)}` : e.to === 'allies' ? `ทุกคนรับโล่ ${num(v, e.v)}` : `มอบโล่ ${num(v, e.v)}`;
        break;
      }
      case 'heal': {
        const v = src ? E.outAmount(e.v * m, src, link) : Math.round(e.v * m);
        const amount = e.v === 0 && e.scale ? `<small>(${scaleText(e.scale)})</small>` : `${num(v, e.v)}${e.scale ? ` <small>(${scaleText(e.scale)})</small>` : ''}`;
        t = e.to === 'allies' ? `ฟื้นฟูทุกคน ${amount} HP` : e.to === 'self' ? `ฟื้นฟูตัวเอง ${amount} HP` : e.to === 'lowest' ? `ฟื้นฟูพันธมิตร HP ต่ำสุด ${amount}` : `ฟื้นฟู ${amount} HP`;
        break;
      }
      case 'status': {
        const s = D.STATUS[e.key];
        const k = `${kwOf(e.key)} ${e.key === 'str' || e.key === 'momentum' ? '+' : ''}${e.key === 'aim' ? '' : e.v}`;
        if (e.to === 'enemies') t = `ศัตรูทุกตัวติด ${k}`;
        else if (e.to === 'allies') t = `ทุกคนได้ ${k}`;
        else if (e.to === 'self') t = `รับ ${k}`;
        else t = s.kind === 'buff' ? `ให้ ${k}` : `ติด ${k}`;
        break;
      }
      case 'clear': t = `แล้วล้าง ${kwOf(e.key)}${e.to === 'self' ? 'ของตัวเอง' : 'ของเป้า'}`; break;
      case 'mul': t = `${kwOf(e.key)}บนเป้า ×${e.v}`; break;
      case 'cleanse': t = e.to === 'allies' ? 'ล้างดีบัฟทุกคน' : 'ล้างดีบัฟ'; break;
      case 'draw': t = `จั่ว ${e.v} ใบ`; break;
      case 'ap': t = `ได้รับ ${e.v} AP`; break;
      case 'revive': t = `ชุบชีวิตพันธมิตรที่ล้ม (${UI.pct(e.pct)} HP)`; break;
    }
    return e.cond ? `<i class="cond">${COND[e.cond]}</i> ${t}` : t;
  }).join('<br>');

  const TYPE = { attack: 'Attack', skill: 'Skill', support: 'Support' };
  /** A card face. `ref` is a card id or a card instance { card, mods }. */
  UI.cardFace = (ref, unit, o) => {
    o = o || {};
    const id = typeof ref === 'string' ? ref : ref.card;
    const card = typeof ref === 'string' ? D.CARDS[id] : E.cardOf(ref);
    const c = D.CHARACTERS[card.owner];
    const tag = o.tagName || 'div';
    const epi = card.mods && card.mods.length ? D.EPIPHANY[card.mods[0]] : null;
    const cls = `card t-${card.type} r-${card.rarity}${o.cls || ''}${id.endsWith('_plus') ? ' plus' : ''}${epi ? ' epi' : ''}`;
    return `<${tag} class="${cls}" ${o.attrs || ''} style="--c:${c.color}">`
      + `<span class="c-art" style="background-image:url('${Art.portrait(card.owner, 'face')}')"></span>`
      + `<span class="c-cost">${card.cost}</span>${o.tag || ''}`
      + (epi ? `<span class="c-epi" title="Epiphany: ${epi.th}">${epi.name}</span>` : '')
      + '<span class="c-body">'
      + `<span class="c-name">${card.name}</span>`
      + `<span class="c-type">${icon(card.type)}${TYPE[card.type]}<i>${c.name}</i></span>`
      + `<span class="c-text">${UI.effectsText(card.effects, unit, o.link || 0, o.mult)}${card.exhaust ? '<em>ใช้แล้วหายไป</em>' : ''}${card.retain ? '<em>เก็บในมือข้ามเทิร์น</em>' : ''}${card.linkMult > 1 ? `<em>LINK 2+: ตัวเลข ×${card.linkMult}</em>` : ''}</span>`
      + `</span></${tag}>`;
  };

  UI.on.home = () => { UI.closeModal(); UI.showHome(); };
})();
