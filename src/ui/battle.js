/* Eclipse Rift — battle screen for every mode: bot, boss raid, local duel and
   online. The screen never changes game state itself: actions go to the engine
   (or, online, to the shared match document first) and the events that come
   back are animated. Controllers per side: 'human' | 'bot' | 'remote'. */
(function () {
  'use strict';
  const UI = window.ERUI;
  const { D, E, AI, P, G, Art, icon, on, esc } = UI;
  const N = window.ERNet;
  const R = D.RULES;
  const fx = UI.fx;
  const $ = UI.$;

  const B = { id: 0, st: null, mode: 'bot', level: 'normal', stage: 0, view: 0, ctrl: ['human', 'bot'], sel: null, busy: false, auto: false, log: [], timer: 0, pending: null, resume: false, net: null, done: false };
  const speed = () => P.data.speed || 1;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms / speed()));
  const unitEl = (side, slot) => document.getElementById(`u-${side}-${slot}`);
  const isHumanTurn = () => !!B.st && !B.st.over && B.ctrl[B.st.active] === 'human' && B.st.active === B.view && !B.auto;
  const unitName = (side, slot) => {
    const n = D.CHARACTERS[B.st.sides[side].units[slot].id].name;
    if (B.mode === 'duel') return `P${side + 1} ${n}`;
    return (side === B.view ? '' : 'ศัตรู ') + n;
  };
  const canAuto = () => B.mode === 'bot' || B.mode === 'boss' || B.mode === 'chaos';

  UI.modalClosed.push(() => { if (B.resume) { B.resume = false; nextStep(); } });
  UI.onEscape = () => { if (B.sel) { B.sel = null; refresh(); } };
  window.addEventListener('resize', () => { if (UI.screen === 'battle') layoutHand(); });

  // ---------- starting a battle ----------
  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function startBot(level) {
    const mine = P.teamSpecs();
    const lv = D.REWARDS[level].lv;
    const foe = shuffled(D.ROSTER).slice(0, mine.length).map((id) => G.buildMember(id, { lv, awk: 0 }, null));
    begin({ mode: 'bot', level, ctrl: ['human', 'bot'], teams: [mine, foe], decks: [P.activeDeck(), null], names: ['YOU', `Rift Echo · ${D.REWARDS[level].label}`] });
  }
  function startBoss(stage) {
    begin({ mode: 'boss', stage, ctrl: ['human', 'bot'], teams: [P.teamSpecs(), [G.bossMember(stage)]], decks: [P.activeDeck(), null], names: ['YOU', `Malvoth · ด่าน ${stage}`], pve: true, first: 0 });
  }
  function startDuel(picks) {
    begin({ mode: 'duel', ctrl: ['human', 'human'], teams: picks.map((p) => p.map((id) => G.baseMember(id))), names: ['PLAYER 1', 'PLAYER 2'] });
  }
  function startOnline(o) {
    begin({
      mode: 'online', ctrl: o.side === 0 ? ['human', 'remote'] : ['remote', 'human'], teams: [o.doc.host.team, o.doc.guest.team],
      decks: [o.doc.host.deck || null, o.doc.guest.deck || null],
      names: o.names, seed: o.doc.seed, view: o.side,
      net: { code: o.code, side: o.side, applied: 0, queue: [], moves: [], sending: false, unsub: null, poll: 0 },
    });
    const net = B.net;
    const reread = () => N.peek(net.code).then((d) => { if (d && B.net === net) onMatchDoc(d); }).catch(() => {});
    N.joinRoom(net.code, reread);
    net.unsub = N.watch(net.code, (d) => { if (B.net === net) onMatchDoc(d); });
    net.poll = setInterval(() => { if (B.st && !B.st.over && B.ctrl[B.st.active] === 'remote') reread(); }, 5000);
  }
  function startChaos(setup, title) {
    begin(Object.assign({ mode: 'chaos', ctrl: ['human', 'bot'], names: ['YOU', title] }, setup));
  }
  UI.battle = { startBot, startBoss, startDuel, startOnline, startChaos, state: () => B };

  function begin(cfg) {
    endSession();
    const seed = cfg.seed != null ? cfg.seed : (Math.random() * 4294967296) >>> 0;
    const { state, events } = E.createBattle({ teams: cfg.teams, names: cfg.names, seed, first: cfg.first, pve: cfg.pve, decks: cfg.decks, mods: cfg.mods, stress: cfg.stress });
    Object.assign(B, {
      id: B.id + 1, st: state, mode: cfg.mode, level: cfg.level || 'normal', stage: cfg.stage || 0, ctrl: cfg.ctrl,
      view: cfg.view != null ? cfg.view : cfg.mode === 'duel' ? state.active : 0,
      sel: null, busy: false, auto: false, log: [], pending: null, resume: false, net: cfg.net || null, done: false,
    });
    build();
    if (cfg.mode === 'duel') { B.pending = events; showHandoff(); return; }
    go(events);
    if (!P.data.seenHelp) { P.set('seenHelp', true); showHelp(); }
  }

  function endSession() {
    clearTimeout(B.timer);
    if (B.net) {
      if (B.net.unsub) B.net.unsub();
      clearInterval(B.net.poll);
      N.leaveRoom(B.net.code);
    }
    B.net = null;
    B.id++;
    B.st = null;
    B.resume = false;
    UI.closeModal();
    fx.innerHTML = '';
  }

  async function go(events) {
    const id = B.id;
    B.busy = true;
    const el = $('#battle');
    if (el) el.classList.add('busy');
    await runEvents(events);
    if (id !== B.id) return;
    B.busy = false;
    refresh();
    if (B.net && B.net.queue.length) { drainNet(); return; }
    nextStep();
  }

  function act(action) {
    if (B.busy || !B.st) return;
    if (B.mode === 'online') { sendNet(action); return; }
    const r = E.applyAction(B.st, action);
    if (!r.ok) { UI.toast(r.error); return; }
    B.sel = null;
    if (action.type === 'play') {
      const el = document.querySelector(`.b-hand .card[data-uid="${action.uid}"]`);
      if (el) el.remove();
    }
    go(r.events);
  }

  function nextStep() {
    if (UI.screen !== 'battle' || !B.st) return;
    if (document.querySelector('.modal.pause')) { B.resume = true; return; }
    const st = B.st;
    if (st.over) { clearTimeout(B.timer); B.timer = setTimeout(finish, 650); return; }
    const who = B.ctrl[st.active];
    if (who === 'bot' || (B.auto && who === 'human' && st.active === B.view)) {
      clearTimeout(B.timer);
      B.timer = setTimeout(botStep, 380 / speed());
      return;
    }
    if (B.mode === 'duel' && st.active !== B.view) showHandoff();
  }
  function botStep() {
    if (UI.screen !== 'battle' || B.busy || !B.st || B.st.over) return;
    if (document.querySelector('.modal.pause')) { B.resume = true; return; }
    const who = B.ctrl[B.st.active];
    if (who === 'human' && !B.auto) return;
    if (who === 'remote') return;
    act(AI.chooseAction(B.st, who === 'human' ? 'hard' : B.level));
  }

  // ---------- online sync ----------
  async function sendNet(action) {
    const net = B.net;
    if (!net || net.sending) return;
    if (action.type !== 'forfeit') {
      if (B.st.active !== net.side) return;
      const test = E.applyAction(E.clone(B.st), action);
      if (!test.ok) { UI.toast(test.error); return; }
    }
    if (net.moves.length !== net.applied + net.queue.length) { UI.toast('กำลังซิงก์กับอีกฝ่าย ลองอีกครั้ง'); return; }
    net.sending = true;
    B.sel = null;
    const el = $('#battle');
    if (el) el.classList.add('busy');
    if (action.type === 'play') {
      const c = document.querySelector(`.b-hand .card[data-uid="${action.uid}"]`);
      if (c) c.remove();
    }
    try {
      await N.pushMove(net.code, net.moves, { side: net.side, a: Object.assign({}, action, { side: net.side }) });
    } catch (e) {
      UI.toast('ส่งไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่');
      refresh();
    } finally {
      net.sending = false;
    }
  }
  function onMatchDoc(doc) {
    const net = B.net;
    if (!net || !B.st) return;
    if (!doc) { if (!B.st.over) UI.toast('ห้องนี้ถูกปิดแล้ว'); return; }
    const moves = doc.moves || [];
    if (moves.length < net.moves.length) return;
    net.moves = moves;
    while (net.applied + net.queue.length < moves.length) net.queue.push(moves[net.applied + net.queue.length]);
    drainNet();
  }
  function drainNet() {
    const net = B.net;
    if (!net || B.busy || !net.queue.length || !B.st || B.st.over) return;
    const mv = net.queue.shift();
    net.applied++;
    const r = E.applyAction(B.st, mv.a);
    if (!r.ok) { UI.toast('ข้อมูลไม่ตรงกับอีกฝ่าย: ' + r.error); return; }
    go(r.events);
  }

  // ---------- layout ----------
  function unitHTML(u) {
    const c = D.CHARACTERS[u.id];
    return `<button class="unit${c.boss ? ' boss' : ''}" id="u-${u.side}-${u.slot}" data-act="unit" data-side="${u.side}" data-slot="${u.slot}" style="--c:${c.color};--d:${u.slot * 0.7}s" aria-label="${c.name}">`
      + `<span class="u-art"><img src="${Art.portrait(u.id, c.boss ? 'wide' : 'face')}" alt="" draggable="false">`
      + `<span class="u-tag"><b>${c.name}</b><i class="u-lv">Lv${u.lv}</i>${u.awk ? `<i class="u-awk">A${u.awk}</i>` : ''}<small>${c.role}</small></span>`
      + `<span class="u-block" hidden>${icon('shield')}<b></b></span><span class="u-threat" hidden></span><span class="u-ko">K.O.</span></span>`
      + '<span class="u-hp"><i class="lag"></i><i class="fill"></i><b class="txt"></b></span>'
      + (u.stress != null ? '<span class="u-stress" title="ความเครียด"><i></i></span>' : '')
      + '<span class="u-st"></span></button>';
  }

  function build() {
    const st = B.st, me = B.view, foe = 1 - me;
    const bossFight = st.sides[foe].units.some((u) => D.CHARACTERS[u.id].boss);
    UI.setScreen('battle', `
      <div class="battle${bossFight ? ' bossfight' : ''}" id="battle">
        ${bossFight ? `<div class="embers" aria-hidden="true">${'<i></i>'.repeat(16)}</div>` : ''}
        <header class="b-top">
          <button class="b-icon" data-act="quit" aria-label="ออกจากการต่อสู้">${icon('close')}</button>
          <div class="b-round" id="b-round"></div>
          ${B.mode === 'online' ? `<span class="b-mode">${icon('globe')} ONLINE · ${esc(B.net.code)}</span>` : ''}
          <div class="b-tools">
            <button class="chip" data-act="speed" id="b-speed" aria-label="ความเร็วแอนิเมชัน"></button>
            ${canAuto() ? '<button class="chip" data-act="auto" id="b-auto">AUTO</button>' : ''}
            <button class="chip" data-act="log">LOG</button>
            <button class="chip" data-act="help" aria-label="วิธีเล่น">?</button>
          </div>
        </header>
        <div class="b-name"><b>${esc(st.sides[foe].name)}</b><span id="b-foeinfo"></span></div>
        <section class="b-team foe${bossFight ? ' boss' : ''}" style="--n:${st.sides[foe].units.length}">${st.sides[foe].units.map(unitHTML).join('')}</section>
        <div class="b-intents" id="b-intents" hidden></div>
        <div class="b-mid" id="b-mid">
          <div class="b-turn" id="b-turn"></div>
          <div class="b-link" id="b-link"></div>
          <div class="b-hint" id="b-hint"></div>
        </div>
        <section class="b-team mine" style="--n:${st.sides[me].units.length}">${st.sides[me].units.map(unitHTML).join('')}</section>
        <footer class="b-foot">
          <div class="b-ap" id="b-ap"></div>
          <div class="b-hand" id="b-hand"></div>
          <div class="b-ctrl">
            <button class="b-burst" id="b-burst" data-act="burst" aria-label="Burst"></button>
            <button class="b-end" id="b-end" data-act="end"></button>
          </div>
        </footer>
      </div>`);
    refresh();
  }

  function refreshUnit(u, threat) {
    const el = unitEl(u.side, u.slot);
    if (!el) return;
    const pct = (u.hp / u.maxHp) * 100;
    el.classList.toggle('dead', !u.alive);
    el.classList.toggle('low', u.alive && pct <= 30);
    el.querySelector('.fill').style.width = pct + '%';
    el.querySelector('.lag').style.width = pct + '%';
    el.querySelector('.txt').textContent = `${u.hp} / ${u.maxHp}`;
    const blk = el.querySelector('.u-block');
    blk.hidden = !u.block;
    blk.querySelector('b').textContent = u.block;
    const th = el.querySelector('.u-threat');
    th.hidden = !threat;
    if (threat) th.innerHTML = `${icon('attack')}${threat}`;
    const sb = el.querySelector('.u-stress');
    if (sb) { sb.firstChild.style.width = (u.stress || 0) + '%'; sb.classList.toggle('hot', (u.stress || 0) >= 70); }
    el.classList.toggle('broken', !!u.broken);
    const brk = u.broken ? `<i class="sc brk" title="Mental Breakdown: ทำดาเมจ −30% รับดาเมจ +20% · ใช้การ์ดของตัวนี้อีก ${u.broken} ใบเพื่อฟื้นตัว">${icon('brain')}<b>${u.broken}</b></i>` : '';
    el.querySelector('.u-st').innerHTML = brk + Object.keys(u.st).map((k) => {
      const s = D.STATUS[k];
      return `<i class="sc ${s.kind}" title="${s.name} ${u.st[k]}: ${s.desc}">${icon(s.icon)}<b>${u.st[k]}</b></i>`;
    }).join('');
  }

  /** Boss intents: what each planned card does and to whom, plus damage per target. */
  function intents() {
    const st = B.st, foe = 1 - B.view, side = st.sides[foe];
    const out = { chips: [], threat: {} };
    if (!side.scripted || st.over) return out;
    const many = side.units.filter((u) => u.alive).length > 1;
    for (const ci of side.hand) {
      const boss = side.units[ci.owner];
      if (!boss || !boss.alive) continue;
      const card = D.CARDS[ci.card];
      const tgt = E.intentTarget(st, foe, ci);
      const tu = tgt ? st.sides[tgt.side].units[tgt.slot] : null;
      const parts = [];
      for (const e of card.effects) {
        if (e.op === 'dmg') {
          const victims = e.to === 'enemies' ? st.sides[B.view].units.filter((u) => u.alive) : tu ? [tu] : [];
          let shown = 0;
          for (const v of victims) {
            const n = E.calcDamage(boss, v, e.v, 0) * (e.hits || 1);
            out.threat[v.slot] = (out.threat[v.slot] || 0) + n;
            shown = Math.max(shown, n);
          }
          parts.push(`${icon('attack')}<b>${shown || E.calcDamage(boss, null, e.v, 0)}</b>${e.to === 'enemies' ? ' ทุกคน' : ''}`);
        } else if (e.op === 'block') parts.push(`${icon('shield')}<b>${E.outAmount(e.v, boss, 0)}</b>`);
        else if (e.op === 'heal') parts.push(`${icon('heart')}<b>+${E.outAmount(e.v, boss, 0)}</b>`);
        else if (e.op === 'status') parts.push(`${icon(D.STATUS[e.key].icon)}${D.STATUS[e.key].name}`);
      }
      const where = tu ? `<i>→ ${D.CHARACTERS[tu.id].name}</i>` : '';
      out.chips.push(`<span class="intent t-${card.type}" title="${D.CHARACTERS[boss.id].name}: ${card.name}"><small>${many ? D.CHARACTERS[boss.id].name + ' · ' : ''}${card.name}</small>${parts.join(' ')}${where}</span>`);
    }
    return out;
  }

  function handCard(ci, mine) {
    const st = B.st, s = B.view, side = st.sides[s];
    const card = E.cardOf(ci);
    const link = mine ? E.previewLink(st, s, ci.owner) : 0;
    let tag = '';
    if (mine && side.lastOwner >= 0) {
      const follow = E.previewFollow(st, s, ci.owner) && card.effects.some((e) => e.cond === 'follow');
      if (follow) tag = '<span class="c-tag up follow">ต่อเนื่อง</span>';
      else if (side.lastOwner !== ci.owner) tag = `<span class="c-tag up">${icon('link')}${link}</span>`;
      else if (side.link) tag = '<span class="c-tag break">BREAK</span>';
    }
    const playable = mine && card.cost <= side.ap;
    const sel = B.sel && B.sel.kind === 'card' && B.sel.uid === ci.uid;
    const mult = card.linkMult > 1 && link >= 2 ? card.linkMult : 1;
    return UI.cardFace(ci, side.units[ci.owner], {
      link, mult, tag, tagName: 'button', attrs: `data-act="card" data-uid="${ci.uid}"`,
      cls: (playable ? '' : ' off') + (sel ? ' sel' : ''),
    });
  }

  function layoutHand() {
    const hand = $('#b-hand');
    if (!hand) return;
    const cards = hand.querySelectorAll('.card');
    const n = cards.length;
    if (n < 2) { hand.style.setProperty('--gap', '0px'); return; }
    const cw = cards[0].offsetWidth;
    hand.style.setProperty('--gap', Math.min(8, (hand.clientWidth - 4 - n * cw) / (n - 1)) + 'px');
  }

  function defaultHint(mine, side) {
    const st = B.st;
    if (st.over) return '';
    if (B.sel) {
      if (B.sel.kind === 'burst') return 'เลือกเป้าหมายสำหรับ BURST · Esc เพื่อยกเลิก';
      if (B.sel.target === 'enemy') return 'เลือกศัตรูที่ไฮไลต์เป็นเป้าหมาย';
      if (B.sel.target === 'ally') return 'เลือกพันธมิตรที่จะรับผล';
      return 'แตะการ์ดอีกครั้งเพื่อใช้';
    }
    if (!mine) {
      if (B.auto && st.active === B.view) return 'AUTO กำลังเล่นให้ · แตะ AUTO เพื่อเล่นเอง';
      if (B.mode === 'online' && st.active !== B.view) return 'รอเพื่อนเล่น…';
      return st.active === B.view ? '' : 'อีกฝ่ายกำลังเล่น…';
    }
    if (!E.legalActions(st).some((a) => a.type !== 'end')) return 'ใช้การ์ดไม่ได้แล้ว กดจบเทิร์นได้เลย';
    if (st.sides[1 - B.view].scripted && side.lastOwner < 0) return 'ดู INTENT ของศัตรู แล้วให้โล่ตัวที่กำลังจะโดนตี';
    if (side.lastOwner < 0) return 'ใช้การ์ดสลับตัวละครเพื่อสะสม LINK';
    return side.link ? 'การ์ดป้าย LINK จะแรงขึ้น · ใช้ตัวเดิมซ้ำ LINK จะขาด' : 'ใช้การ์ดของตัวอื่นต่อเพื่อเริ่ม LINK';
  }

  function refresh() {
    if (UI.screen !== 'battle' || !B.st) return;
    const st = B.st, me = B.view, foe = 1 - me, side = st.sides[me], fs = st.sides[foe];
    const mine = isHumanTurn() && !B.busy && !(B.net && B.net.sending);
    const it = intents();
    for (const sd of st.sides) for (const u of sd.units) refreshUnit(u, sd === side && u.alive ? it.threat[u.slot] : 0);

    const intentsEl = $('#b-intents');
    intentsEl.hidden = !it.chips.length;
    intentsEl.innerHTML = it.chips.length ? `<span class="it-label">INTENT</span>${it.chips.join('')}` : '';

    $('#b-round').innerHTML = `ROUND <b>${Math.min(st.round, R.roundLimit)}</b><span>/${R.roundLimit}</span>`;
    $('#b-foeinfo').innerHTML = fs.scripted ? '' : `<span title="การ์ดในมือ">${icon('cards')}${fs.hand.length}</span><span class="mini-burst${fs.burst >= R.burstMax ? ' full' : ''}">BURST ${fs.burst}%</span>`;

    const turnSide = st.sides[st.active];
    const viewTurn = st.active === me;
    $('#b-turn').innerHTML = st.over ? 'จบการต่อสู้'
      : `<i class="dot ${viewTurn ? 'mine' : 'foe'}"></i>${viewTurn ? (B.mode === 'duel' ? `เทิร์นของ ${esc(side.name)}` : 'เทิร์นของคุณ') : `เทิร์นของ ${esc(fs.name)}`}`;
    const lk = $('#b-link');
    lk.classList.toggle('foe', !viewTurn);
    lk.hidden = !!turnSide.scripted;
    lk.innerHTML = `<span class="lk-label">${icon('link')}LINK</span>${[1, 2, 3].map((i) => `<i class="seg${i <= turnSide.link ? ' on' : ''}"></i>`).join('')}`
      + `<span class="lk-pct">+${Math.round(turnSide.link * R.linkBonus * 100)}%</span>`
      + (turnSide.lastOwner >= 0 ? `<span class="lk-last" title="การ์ดล่าสุด"><img src="${Art.portrait(turnSide.units[turnSide.lastOwner].id, 'face')}" alt=""></span>` : '');

    const orbs = Math.max(R.maxAp, side.ap);
    $('#b-ap').innerHTML = `<div class="orbs">${Array.from({ length: orbs }, (_, i) => `<i class="${i < side.ap ? 'on' : ''}"></i>`).join('')}</div><div class="ap-num"><b>${side.ap}</b><small>AP</small></div>`;

    const hand = $('#b-hand');
    hand.innerHTML = side.hand.length ? side.hand.map((ci) => handCard(ci, mine)).join('')
      : `<div class="hand-empty">${viewTurn ? 'ไม่มีการ์ดในมือ' : 'รอเทิร์นถัดไป'}</div>`;
    layoutHand();

    const bb = $('#b-burst');
    const full = side.burst >= R.burstMax;
    bb.style.setProperty('--p', side.burst);
    bb.classList.toggle('full', full);
    bb.innerHTML = `<span class="bb-txt"><b>${full ? 'BURST' : side.burst + '%'}</b><small>${full ? 'พร้อมใช้' : 'BURST'}</small></span>`;

    const eb = $('#b-end');
    eb.disabled = !mine;
    eb.innerHTML = mine ? '<b>END TURN</b><small>จบเทิร์น</small>'
      : B.auto && viewTurn && !st.over ? '<b>AUTO</b><small>กำลังเล่นให้…</small>' : '<b>WAIT</b><small>รออีกฝ่าย</small>';
    eb.classList.toggle('nudge', mine && !E.legalActions(st).some((a) => a.type !== 'end'));

    const targets = B.sel ? E.targetsFor(st, me, B.sel.target).filter(Boolean) : [];
    document.querySelectorAll('.unit').forEach((el) => {
      const s = +el.dataset.side, k = +el.dataset.slot;
      const ok = targets.some((t) => t.side === s && t.slot === k);
      el.classList.toggle('targetable', ok);
      el.classList.toggle('foe-t', ok && s !== me);
      el.classList.toggle('owner', !!B.sel && s === me && k === B.sel.owner);
    });
    $('#b-hint').textContent = defaultHint(mine, side);

    const sp = $('#b-speed');
    if (sp) sp.textContent = `×${speed()}`;
    const au = $('#b-auto');
    if (au) { au.classList.toggle('on', B.auto); au.setAttribute('aria-pressed', B.auto); }
    $('#battle').classList.toggle('busy', B.busy || !!(B.net && B.net.sending));
  }

  // ---------- input ----------
  on.card = (el) => {
    if (!isHumanTurn() || B.busy) return;
    const uid = +el.dataset.uid;
    const side = B.st.sides[B.view];
    const ci = side.hand.find((c) => c.uid === uid);
    if (!ci) return;
    const card = E.cardOf(ci);
    if (card.cost > side.ap) { UI.toast(`AP ไม่พอ (ต้องใช้ ${card.cost})`); return; }
    if (B.sel && B.sel.kind === 'card' && B.sel.uid === uid) {
      if (card.target === 'none') act({ type: 'play', uid, target: null });
      else { B.sel = null; refresh(); }
      return;
    }
    B.sel = { kind: 'card', uid, target: card.target, owner: ci.owner };
    refresh();
  };
  on.unit = (el) => {
    const ref = { side: +el.dataset.side, slot: +el.dataset.slot };
    if (B.sel && isHumanTurn() && !B.busy) {
      const ok = E.targetsFor(B.st, B.view, B.sel.target).some((t) => t && t.side === ref.side && t.slot === ref.slot);
      if (ok) {
        if (B.sel.kind === 'card') act({ type: 'play', uid: B.sel.uid, target: ref });
        else act({ type: 'burst', slot: B.sel.slot, target: ref });
      } else {
        UI.toast(B.sel.target === 'none' ? 'การ์ดนี้ไม่ต้องเลือกเป้า แตะการ์ดอีกครั้งเพื่อใช้' : 'เลือกเป้าหมายที่มีกรอบไฮไลต์');
      }
      return;
    }
    showUnitInfo(ref);
  };
  on.end = () => { if (isHumanTurn() && !B.busy) act({ type: 'end' }); };
  on.burst = () => {
    if (!isHumanTurn() || B.busy) return;
    const side = B.st.sides[B.view];
    if (side.burst < R.burstMax) { UI.toast(`BURST ${side.burst}% · เติมจากการใช้การ์ด, LINK และการโดนโจมตี`); return; }
    UI.modal(`<h2 class="m-title">เลือก BURST</h2><p class="m-sub">ท่าไม้ตายของใครก็ได้ในทีม · ไม่ใช้ AP · เกจจะกลับเป็น 0</p>
      <div class="bpick">${side.units.filter((u) => u.alive).map((u) => {
        const c = D.CHARACTERS[u.id];
        return `<button class="bp" data-act="burst-pick" data-slot="${u.slot}" style="--c:${c.color}"><img src="${Art.portrait(u.id, 'face')}" alt="">`
          + `<span><small>${c.name}</small><b>${c.burst.name}</b><em>${UI.effectsText(c.burst.effects, u, 0)}</em></span></button>`;
      }).join('')}</div>
      <div class="m-row"><button class="btn ghost" data-act="close">ยกเลิก</button></div>`, 'pause');
  };
  on['burst-pick'] = (el) => {
    UI.closeModal();
    const slot = +el.dataset.slot;
    const u = B.st.sides[B.view].units[slot];
    const b = D.CHARACTERS[u.id].burst;
    if (b.target === 'none') act({ type: 'burst', slot, target: null });
    else { B.sel = { kind: 'burst', slot, target: b.target, owner: slot }; refresh(); }
  };
  on.speed = () => { P.set('speed', speed() === 2 ? 1 : 2); refresh(); };
  on.auto = () => {
    B.auto = !B.auto;
    B.sel = null;
    refresh();
    if (B.auto && !B.busy) nextStep();
  };
  on.log = () => {
    UI.modal(`<h2 class="m-title">บันทึกการต่อสู้</h2><ol class="log" reversed>${B.log.slice().reverse().map((l) => `<li class="${l.cls || ''}">${l.html}</li>`).join('') || '<li>ยังไม่มีเหตุการณ์</li>'}</ol>
      <div class="m-row"><button class="btn ghost" data-act="close">ปิด</button></div>`, 'pause');
  };
  on.help = () => showHelp();
  on.quit = () => {
    const live = B.st && !B.st.over;
    const msg = !live ? 'กลับไปหน้าหลัก'
      : B.mode === 'online' ? 'จะนับเป็นยอมแพ้ และเพื่อนชนะทันที'
      : B.mode === 'duel' ? 'การต่อสู้นี้จะถูกยกเลิก' : B.mode === 'chaos' ? 'รอบ Chaos นี้จะจบลงทันที (นับเป็นแพ้)' : 'จะนับเป็นแพ้ และไม่ได้รับรางวัล';
    UI.modal(`<h2 class="m-title">ออกจากการต่อสู้?</h2><p class="m-sub">${msg}</p>
      <div class="m-row"><button class="btn ghost" data-act="close">สู้ต่อ</button><button class="btn danger" data-act="quit-yes">ออก</button></div>`, 'pause');
  };
  on['quit-yes'] = async () => {
    const live = B.st && !B.st.over;
    if (live && B.mode === 'chaos') {
      const units = B.st.sides[0].units.map((u) => ({ hp: u.hp, alive: u.alive, stress: u.stress || 0 }));
      endSession();
      UI.chaosBattleDone(false, units);
      return;
    }
    if (live && (B.mode === 'bot' || B.mode === 'boss')) P.recordBattle(false, 0);
    if (live && B.mode === 'online') {
      const net = B.net;
      UI.closeModal();
      try { await N.pushMove(net.code, net.moves, { side: net.side, a: { type: 'forfeit', side: net.side } }); } catch (e) { /* the friend sees the room go quiet */ }
      P.recordBattle(false, 0);
      endSession();
      UI.showOnline();
      UI.toast('ยอมแพ้แล้ว');
      return;
    }
    const mode = B.mode;
    endSession();
    if (mode === 'boss') UI.showRaid();
    else UI.showHome();
  };

  function showUnitInfo(ref) {
    const u = B.st.sides[ref.side].units[ref.slot];
    const c = D.CHARACTERS[u.id];
    const keys = Object.keys(u.st);
    const extra = [u.crit ? `คริ ${UI.pct(u.crit)}` : '', u.lifesteal ? `ดูดเลือด ${UI.pct(u.lifesteal)}` : '', u.outMul !== 1 ? `พลัง ×${u.outMul.toFixed(2)}` : ''].filter(Boolean).join(' · ');
    UI.modal(`<div class="info" style="--c:${c.color}">
        <img src="${Art.portrait(u.id, 'face')}" alt="">
        <div><small>${ref.side === B.view ? 'พันธมิตร' : 'ศัตรู'} · ${c.roleTh} · Lv ${u.lv}${u.awk ? ` · A${u.awk}` : ''}</small><h2>${c.full}</h2>
        <p>${icon('heart')} ${u.hp}/${u.maxHp}${u.block ? ` · ${icon('shield')} โล่ ${u.block}` : ''}${u.alive ? '' : ' · ล้มแล้ว'}${extra ? ' · ' + extra : ''}</p></div>
      </div>
      <div class="skill"><small>PASSIVE</small><b>${c.passive.name}</b><p>${UI.passiveText(c, u.pv)}</p></div>
      ${c.burst ? `<div class="skill burst"><small>BURST</small><b>${c.burst.name}</b><p>${UI.effectsText(c.burst.effects, u.alive ? u : null, 0)}</p></div>` : ''}
      ${keys.length ? `<ul class="info-st">${keys.map((k) => {
        const s = D.STATUS[k];
        return `<li><span class="kw ${s.kind}">${icon(s.icon)} ${s.name} ${u.st[k]}</span>${s.desc}</li>`;
      }).join('')}</ul>` : '<p class="m-note">ไม่มีบัฟหรือดีบัฟ</p>'}
      <div class="m-row"><button class="btn ghost" data-act="close">ปิด</button></div>`, 'pause');
  }

  function showHelp() {
    UI.modal(`<h2 class="m-title">วิธีเล่น</h2>
      <ul class="help">
        <li><b>${icon('bolt')} 3 AP ต่อเทิร์น</b>จั่ว 5 ใบจากเด็ครวมของทั้งทีม การ์ดแต่ละใบเป็นของตัวละครเจ้าของ (ดูสีกรอบและรูป) ค่า AP อยู่มุมซ้ายบน</li>
        <li><b>${icon('link')} LINK</b>ใช้การ์ดสลับตัวละคร LINK +1 (สูงสุด 3) การ์ดแรงขึ้น 15% ต่อขั้น ใช้การ์ดของตัวเดิมติดกัน LINK จะขาด</li>
        <li><b>BURST</b>เกจทีมเต็ม 100% ใช้ท่าไม้ตายของใครก็ได้ ไม่เสีย AP เติมจากการเล่นการ์ด LINK และการโดนโจมตี</li>
        <li><b>${icon('shield')} โล่</b>กันความเสียหายก่อน HP และหายไปเมื่อเริ่มเทิร์นของตัวเอง</li>
        <li><b>${icon('brain')} ความเครียด (Chaos)</b>โดนตีแล้วแถบม่วงใต้ HP จะเพิ่ม ถึง 100 จะเกิด Breakdown (ตีเบาลง โดนแรงขึ้น) ใช้การ์ดของตัวนั้น 4 ใบเพื่อฟื้นตัว แล้วทีมได้ Burst</li>
        <li><b>${icon('attack')} INTENT ของบอส</b>บอสประกาศท่าเทิร์นหน้าไว้ใต้รูปบอส ตัวที่กำลังจะโดนตีจะมีป้ายแดงบอกดาเมจ ให้โล่หรือใช้ยั่วยุของ Kael ดึงไปที่ตัวเอง</li>
        <li><b>ช่วยกันเล่น</b>Rin ล็อกเป้า → Aria แรงขึ้นและ Rin ยิงตาม · Noir แปะดีบัฟ → Abyss Echo ตอนจบเทิร์น · Lumi ให้พลัง → Petal Flurry ตี 3 ครั้ง · Kael ยั่วยุ → กันตัวบาง</li>
      </ul>
      <dl class="help-st">${Object.keys(D.STATUS).map((k) => {
        const s = D.STATUS[k];
        return `<div><dt class="kw ${s.kind}">${icon(s.icon)}${s.name}</dt><dd>${s.desc}</dd></div>`;
      }).join('')}</dl>
      <div class="m-row"><button class="btn primary" data-act="close">เข้าใจแล้ว</button></div>`, 'pause help-modal');
  }

  function showHandoff() {
    const s = B.st.active;
    UI.modal(`<div class="handoff"><small>ส่งเครื่องให้</small><b class="p${s + 1}">${esc(B.st.sides[s].name)}</b><p>อีกฝ่ายอย่าแอบดูการ์ดในมือนะ</p>
      <button class="btn primary big" data-act="handoff-ready">พร้อมแล้ว</button></div>`, 'locked opaque');
  }
  on['handoff-ready'] = () => {
    B.view = B.st.active;
    build();
    UI.closeModal();
    const ev = B.pending;
    B.pending = null;
    if (ev) go(ev);
    else nextStep();
  };

  // ---------- results ----------
  function finish() {
    if (UI.screen !== 'battle' || !B.st || B.done) return;
    B.done = true;
    const st = B.st;
    if (B.mode === 'boss') { UI.showLoot(B.stage, P.bossResult(B.stage, st.winner === 0)); return; }
    if (B.mode === 'chaos') {
      const units = st.sides[0].units.map((u) => ({ hp: u.hp, alive: u.alive, stress: u.stress || 0 }));
      const win = st.winner === 0;
      endSession();
      UI.chaosBattleDone(win, units);
      return;
    }
    let title, cls, reward = '';
    let showSide = 0;
    const reasonText = st.reason === 'timeout' ? `ครบ ${R.roundLimit} รอบ · ตัดสินจาก HP% ที่เหลือ` : st.reason === 'forfeit' ? 'อีกฝ่ายยอมแพ้' : '';
    if (B.mode === 'bot' || B.mode === 'online') {
      const win = st.winner === B.view;
      const rw = D.REWARDS[B.mode === 'online' ? 'online' : B.level];
      const amount = win ? rw.win : rw.lose;
      P.recordBattle(win, amount);
      if (B.mode === 'online') {
        if (win) P.set('onlineWins', (P.data.onlineWins || 0) + 1);
        if (B.net.side === 0) N.finish(B.net.code, st.winner);
      }
      showSide = B.view;
      title = win ? 'VICTORY' : st.winner === 'draw' ? 'DRAW' : 'DEFEAT';
      cls = win ? 'win' : 'lose';
      reward = `<div class="reward">${icon('crystal')} +${amount} <small>คริสตัล</small></div>`;
    } else {
      showSide = st.winner === 'draw' ? 0 : st.winner;
      title = st.winner === 'draw' ? 'DRAW' : `${st.sides[st.winner].name} WINS`;
      cls = 'win';
    }
    const again = { bot: 'สู้อีกครั้ง', duel: 'เลือกทีมใหม่', online: 'กลับห้องออนไลน์' }[B.mode];
    UI.modal(`<div class="result ${cls}"><h2>${esc(title)}</h2>${reasonText ? `<p class="m-sub">${reasonText}</p>` : ''}
        <div class="res-team">${st.sides[showSide].units.map((u) => `<img class="${u.alive ? '' : 'dead'}" src="${Art.portrait(u.id, 'face')}" alt="${D.CHARACTERS[u.id].name}">`).join('')}</div>
        ${reward}
        <div class="m-row center"><button class="btn ghost" data-act="res-home">หน้าหลัก</button><button class="btn primary" data-act="res-again">${again}</button></div>
      </div>`, 'locked result-modal');
  }
  on['res-home'] = () => { endSession(); UI.showHome(); };
  on['res-team'] = () => { endSession(); UI.showTeam(); };
  on['res-again'] = () => {
    const mode = B.mode, level = B.level;
    endSession();
    if (mode === 'bot') startBot(level);
    else if (mode === 'boss') startBoss(UI.raidStage());
    else if (mode === 'online') UI.showOnline();
    else on.duel();
  };

  // ---------- event playback ----------
  function log(html, cls) {
    B.log.push({ html, cls });
    if (B.log.length > 200) B.log.shift();
  }

  async function runEvents(events) {
    const id = B.id;
    let synced = false;
    const sync = () => { if (!synced) { synced = true; refresh(); } };
    for (const e of events) {
      if (B.id !== id || UI.screen !== 'battle') return;
      switch (e.t) {
        case 'turn':
          sync();
          log(`ROUND ${e.round} · ${esc(B.st.sides[e.side].name)}`, 'turn');
          await banner(e);
          break;
        case 'play': {
          const card = D.CARDS[e.card];
          log(`<b>${unitName(e.side, e.owner)}</b> ใช้ ${card.name}${e.target ? ` → ${unitName(e.target.side, e.target.slot)}` : ''}${e.link ? ` · LINK ${e.link}` : ''}`);
          await castCard(e);
          break;
        }
        case 'burst': {
          const u = B.st.sides[e.side].units[e.slot];
          log(`<b>${unitName(e.side, e.slot)}</b> BURST: ${D.CHARACTERS[u.id].burst.name}`, 'burst');
          await cutIn(e);
          break;
        }
        case 'link': linkSplash(e); await wait(160); break;
        case 'linkbreak': floatMid('LINK BREAK', 'break'); break;
        case 'damage':
          sync();
          hitFx(e);
          if (e.lost || e.blocked) log(`${unitName(e.side, e.slot)} −${e.lost}${e.crit ? ' (คริติคอล)' : ''}${e.blocked ? ` (โล่กัน ${e.blocked})` : ''}${e.kind === 'poison' ? ' จากกัดกร่อน' : ''}`, 'dmg');
          await wait(e.crit ? 220 : e.kind === 'poison' ? 200 : 130);
          break;
        case 'heal':
          sync();
          if (e.amount) { floatAt(e.side, e.slot, `<b>+${e.amount}</b>`, 'heal'); log(`${unitName(e.side, e.slot)} +${e.amount} HP`, 'heal'); }
          await wait(100);
          break;
        case 'block': sync(); floatAt(e.side, e.slot, `${icon('shield')}<b>+${e.amount}</b>`, 'block'); await wait(100); break;
        case 'status': {
          sync();
          const s = D.STATUS[e.key];
          floatAt(e.side, e.slot, `${icon(s.icon)}${s.name} ${e.key === 'str' ? '+' : ''}${e.v}`, `tag ${s.kind}`);
          await wait(90);
          break;
        }
        case 'cleanse': sync(); floatAt(e.side, e.slot, 'ล้างดีบัฟ', 'tag buff'); break;
        case 'passive':
          sync();
          floatAt(e.side, e.slot, e.name, 'tag passive');
          pulse(unitEl(e.side, e.slot), 'glint');
          log(`${unitName(e.side, e.slot)}: ${e.name}`, 'passive');
          await wait(280);
          break;
        case 'assist':
          sync();
          floatAt(e.side, e.slot, `${icon('mark')}ASSIST`, 'tag passive');
          pulse(unitEl(e.side, e.slot), 'glint');
          log(`${unitName(e.side, e.slot)} ยิงสนับสนุน`, 'passive');
          await wait(220);
          break;
        case 'ko':
          sync();
          pulse(unitEl(e.side, e.slot), 'ko-anim');
          log(`${unitName(e.side, e.slot)} ล้มลง`, 'ko');
          await wait(420);
          break;
        case 'revive':
          sync();
          floatAt(e.side, e.slot, 'REVIVE', 'tag heal');
          log(`${unitName(e.side, e.slot)} ฟื้นคืนชีพ`, 'heal');
          await wait(300);
          break;
        case 'intent':
          sync();
          pulse($('#b-intents'), 'flash');
          break;
        case 'counter':
          floatAt(e.side, e.slot, `${icon('counter')}COUNTER`, 'tag buff');
          await wait(140);
          break;
        case 'clear': {
          const s = D.STATUS[e.key];
          floatAt(e.side, e.slot, `${icon(s.icon)}${s.name} ×`, 'tag ' + s.kind);
          break;
        }
        case 'stress': sync(); break;
        case 'breakdown':
          sync();
          floatAt(e.side, e.slot, `${icon('brain')}BREAKDOWN`, 'tag brk');
          pulse(unitEl(e.side, e.slot), 'hit');
          log(`${unitName(e.side, e.slot)} เกิด Mental Breakdown! ใช้การ์ดของตัวนี้ ${R.breakdownCards} ใบเพื่อฟื้นตัว`, 'ko');
          await wait(600);
          break;
        case 'recover':
          sync();
          floatAt(e.side, e.slot, `${icon('brain')}RECOVER`, 'tag heal');
          pulse(unitEl(e.side, e.slot), 'glint');
          log(`${unitName(e.side, e.slot)} ฟื้นจาก Breakdown · ทีมได้ Burst +${R.recoverBurst}%`, 'heal');
          await wait(400);
          break;
        case 'over':
          sync();
          log(e.winner === 'draw' ? 'เสมอ' : `${esc(B.st.sides[e.winner].name)} ชนะ`, 'turn');
          break;
      }
    }
    sync();
  }

  function pulse(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  const lastFloat = {};
  function floatAt(side, slot, html, cls) {
    const el = unitEl(side, slot);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const key = side + ':' + slot;
    const now = performance.now();
    const k = lastFloat[key] && now - lastFloat[key].t < 500 ? lastFloat[key].k + 1 : 0;
    lastFloat[key] = { t: now, k };
    const n = document.createElement('div');
    n.className = 'float ' + cls;
    n.innerHTML = html;
    n.style.left = r.left + r.width / 2 + (k % 2 ? 16 : -8) + 'px';
    n.style.top = r.top + r.height * 0.34 - (k % 4) * 17 + 'px';
    fx.appendChild(n);
    setTimeout(() => n.remove(), 1200);
  }
  function midPoint() {
    const m = $('#b-mid');
    if (!m) return { x: innerWidth / 2, y: innerHeight / 2 };
    const r = m.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function floatMid(text, cls) {
    const p = midPoint();
    const n = document.createElement('div');
    n.className = 'float tag ' + cls;
    n.textContent = text;
    n.style.left = p.x + 'px';
    n.style.top = p.y + 'px';
    fx.appendChild(n);
    setTimeout(() => n.remove(), 1200);
  }

  function hitFx(e) {
    const el = unitEl(e.side, e.slot);
    if (e.lost > 0) {
      const big = e.lost >= 15 || e.crit;
      floatAt(e.side, e.slot, `${e.crit ? '<small>CRIT</small>' : ''}<b>${e.lost}</b>`, 'dmg' + (big ? ' big' : '') + (e.crit ? ' crit' : '') + (e.kind === 'poison' ? ' poison' : ''));
      pulse(el, 'hit');
      if (big) pulse($('#battle'), 'quake');
    }
    if (e.blocked > 0) floatAt(e.side, e.slot, `${icon('shield')}<b>${e.blocked}</b>`, 'blocked');
    if (!e.lost && !e.blocked) floatAt(e.side, e.slot, '<b>0</b>', 'dmg');
  }

  async function castCard(e) {
    const unit = B.st.sides[e.side].units[e.owner];
    const fast = e.side === B.view && B.ctrl[e.side] === 'human' && !B.auto;
    const node = document.createElement('div');
    node.className = 'cast ' + (e.side === B.view ? 'mine' : 'foe');
    node.innerHTML = UI.cardFace({ card: e.card, mods: e.mods }, unit, { link: e.link, tag: e.follow ? '<span class="c-tag up follow">ต่อเนื่อง</span>' : e.link ? `<span class="c-tag up">${icon('link')}${e.link}</span>` : '' });
    fx.appendChild(node);
    const owner = unitEl(e.side, e.owner);
    const tgt = e.target ? unitEl(e.target.side, e.target.slot) : null;
    if (owner) owner.classList.add('acting');
    if (tgt) tgt.classList.add('aimed');
    await wait(fast ? 300 : 800);
    node.classList.add('out');
    setTimeout(() => node.remove(), 260);
    setTimeout(() => {
      if (owner) owner.classList.remove('acting');
      if (tgt) tgt.classList.remove('aimed');
    }, 420);
  }

  function linkSplash(e) {
    const p = midPoint();
    const n = document.createElement('div');
    n.className = 'linksplash ' + (e.side === B.view ? 'mine' : 'foe');
    n.innerHTML = `<small>${icon('link')}LINK</small><b>×${e.level}</b><i>+${Math.round(e.level * R.linkBonus * 100)}%</i>`;
    n.style.left = p.x + 'px';
    n.style.top = p.y + 'px';
    fx.appendChild(n);
    setTimeout(() => n.remove(), 950);
  }

  async function banner(e) {
    const mine = e.side === B.view;
    const label = B.mode === 'duel' ? `${B.st.sides[e.side].name} TURN` : mine ? 'YOUR TURN' : B.st.sides[e.side].scripted ? 'BOSS TURN' : 'ENEMY TURN';
    const n = document.createElement('div');
    n.className = 'turnbanner ' + (mine ? 'mine' : 'foe');
    n.innerHTML = `<div class="bn-band"><b>${esc(label)}</b><small>ROUND ${e.round}</small></div>`;
    fx.appendChild(n);
    await wait(950);
    n.remove();
  }

  async function cutIn(e) {
    const u = B.st.sides[e.side].units[e.slot];
    const c = D.CHARACTERS[u.id];
    const n = document.createElement('div');
    n.className = 'cutin ' + (e.side === B.view ? 'mine' : 'foe');
    n.style.setProperty('--c', c.color);
    n.innerHTML = `<div class="ci-band"><div class="ci-lines"></div><img class="ci-art" src="${Art.portrait(u.id, 'clear')}" alt="">`
      + `<div class="ci-txt"><small>BURST · ${c.name}</small><b>${c.burst.name}</b></div></div>`;
    fx.appendChild(n);
    await wait(1350);
    n.classList.add('out');
    setTimeout(() => n.remove(), 320);
  }
})();
