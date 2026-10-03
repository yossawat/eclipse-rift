/* Eclipse Rift — Chaos Rift screens: lobby, branching map, rewards, rest,
   shop, events, deck picking and the end of a run. Game rules live in run.js;
   this file only shows the run and sends the player's choices to it. */
(function () {
  'use strict';
  const UI = window.ERUI;
  const { D, P, G, Art, icon, on, esc } = UI;
  const RN = window.ERRun;
  const CH = D.CHAOS;
  const A3 = window.ERArt3D;

  let run = P.loadRun();
  const save = () => P.saveRun(run);
  const lobby = { picks: null, level: 1 };

  const NODE = {
    battle: { icon: 'n_battle', th: 'ต่อสู้' },
    elite: { icon: 'n_elite', th: 'อีลีท' },
    unknown: { icon: 'n_unknown', th: 'ปริศนา' },
    event: { icon: 'n_event', th: 'เหตุการณ์' },
    treasure: { icon: 'n_treasure', th: 'สมบัติ' },
    rest: { icon: 'n_rest', th: 'พัก' },
    shop: { icon: 'n_shop', th: 'ร้านค้า' },
    boss: { icon: 'n_boss', th: 'บอส' },
  };

  // ---------- entry ----------
  UI.showChaos = () => {
    run = P.loadRun();
    if (!run) return showLobby();
    route();
  };
  on.chaos = () => {
    if (!P.data.team.length && !run) { UI.toast('ยังไม่มีตัวละคร ไปสุ่มที่ SUMMON ก่อน'); UI.showSummon(); return; }
    UI.showChaos();
  };

  function route() {
    save();
    if (!run) return showLobby();
    switch (run.status) {
      case 'battle': return startFight();
      case 'over': return showEnd();
      default:
        showMap();
        if (run.status === 'reward') showReward();
        else if (run.status === 'rest') showRest();
        else if (run.status === 'shop') showShop();
        else if (run.status === 'event') showEvent();
        else if (run.status === 'treasure') showTreasure();
        else if (run.status === 'pick') showPick(run.pending.pick || 'epiphany', true);
        else if (run.pending && run.pending.kind === 'zone') showZone();
    }
  }

  // ---------- lobby ----------
  function showLobby() {
    const p = P.data;
    const owned = D.ROSTER.filter((id) => p.roster[id]);
    if (!lobby.picks) lobby.picks = (p.team.length ? p.team : owned).slice(0, 3);
    lobby.picks = lobby.picks.filter((id) => p.roster[id]);
    const maxLevel = Math.min(CH.levels, (p.chaosCleared || 0) + 1);
    if (lobby.level > maxLevel) lobby.level = maxLevel;
    const specs = lobby.picks.map((id) => P.member(id));
    const lead = lobby.picks[0] || 'aria';
    UI.setScreen('chaos', `${UI.topbar('CHAOS RIFT')}
      <main class="chaos">
        <section class="ch-hero" style="--c:${D.CHARACTERS[lead].color}">
          <div class="ch-art" id="ch-art"><img src="${Art.portrait(lead, 'clear')}" alt=""></div>
          <div class="ch-copy">
            <small>ROGUELIKE · DECKBUILDING</small>
            <h2>Chaos Rift</h2>
            <p>ลงไปในรอยแยก 2 ชั้น เลือกเส้นทางบนแผนที่ สร้างเด็คระหว่างทาง แล้วโค่นบอสท้ายแต่ละชั้น</p>
            <ul class="ch-rules">
              <li>${icon('n_battle')}<span><b>HP ไม่รีเซ็ต</b> ความเสียหายติดตัวไปทุกด่าน พักฟื้นได้ที่จุดพัก</span></li>
              <li>${icon('deck')}<span><b>เด็คโตขึ้น</b> ชนะแล้วเลือกการ์ดใหม่ 1 ใน 3 ใบจากพูลของทีม</span></li>
              <li>${icon('star')}<span><b>Epiphany</b> การ์ดแต่ละใบตื่นรู้ได้ 1 ครั้ง เลือกได้ว่าจะให้เร็วขึ้น แรงขึ้น หรือได้ผลเสริม</span></li>
              <li>${icon('brain')}<span><b>ความเครียด</b> ถึง 100 จะ Breakdown ต้องเล่นการ์ดของตัวนั้นเพื่อฟื้นตัว</span></li>
              <li>${icon('frag')}<span><b>Fragment</b> ไอเทมติดตัวตลอดรอบ ได้จากอีลีท บอส ร้านค้า และสมบัติ</span></li>
            </ul>
          </div>
        </section>
        ${run ? '' : ''}
        <section class="ch-card">
          <h3>ทีมลงดัน <small>เลือก 3 คน · เลเวล อาวุธ และ Awakening ใช้ในรอบนี้ด้วย</small></h3>
          <div class="ch-picks">${D.ROSTER.map((id) => {
            const c = D.CHARACTERS[id], own = p.roster[id], i = lobby.picks.indexOf(id);
            return `<button class="rtile${own ? '' : ' locked'}${i >= 0 ? ' on' : ''}" data-act="ch-pick" data-id="${id}" style="--c:${c.color}"${own ? '' : ' disabled'}>`
              + `<img src="${Art.portrait(id, 'face')}" alt="">${UI.rar(c.rarity)}<b>${c.name}</b><small>${own ? `Lv ${own.lv}` : 'ยังไม่มี'}</small>${i >= 0 ? `<i class="chk">${i + 1}</i>` : ''}</button>`;
          }).join('')}</div>
          <div class="ch-styles">${lobby.picks.map((id) => `<p><b style="color:${D.CHARACTERS[id].color}">${D.CHARACTERS[id].name}</b> ${D.CHARACTERS[id].style}</p>`).join('')}</div>
          <p class="m-note">พลังทีม ${G.teamPower(specs).toLocaleString()} · เด็คเริ่มต้น ${specs.reduce((a, s) => a + s.deck.length, 0)} ใบ · การ์ดที่อาจได้ระหว่างทาง ${lobby.picks.length * 8} แบบ</p>
        </section>
        <section class="ch-card">
          <h3>ระดับ Chaos</h3>
          <div class="ch-levels">${Array.from({ length: CH.levels }, (_, i) => {
            const lv = i + 1, locked = lv > maxLevel;
            return `<button class="ch-lv${lv === lobby.level ? ' on' : ''}" data-act="ch-level" data-lv="${lv}"${locked ? ' disabled' : ''}>`
              + `<b>CHAOS ${lv}</b><span>${locked ? `ผ่าน Chaos ${lv - 1} ก่อน` : `ศัตรู HP +${Math.round(CH.levelHp * i * 100)}%`}</span>`
              + `<em>${icon('crystal')} ${CH.clear.crystals[i]} · ${icon('core')} ${CH.clear.cores[i]} · อาวุธ</em></button>`;
          }).join('')}</div>
          <div class="m-row"><button class="btn primary big" data-act="ch-start"${lobby.picks.length === 3 ? '' : ' disabled'}>${lobby.picks.length === 3 ? 'ลงดัน' : `เลือกอีก ${3 - lobby.picks.length} คน`}</button></div>
        </section>
      </main>`);
    if (A3 && A3.ready && D.CHARACTERS[lead]) A3.mount(document.getElementById('ch-art'), lead, 'clear');
  }
  on['ch-pick'] = (el) => {
    const id = el.dataset.id, i = lobby.picks.indexOf(id);
    if (i >= 0) lobby.picks.splice(i, 1);
    else if (lobby.picks.length < 3) lobby.picks.push(id);
    else UI.toast('เลือกได้ 3 คน แตะตัวที่เลือกไว้เพื่อเอาออก');
    showLobby();
  };
  on['ch-level'] = (el) => { lobby.level = +el.dataset.lv; showLobby(); };
  on['ch-start'] = () => {
    if (lobby.picks.length !== 3) return;
    run = RN.newRun({ level: lobby.level, team: lobby.picks.map((id) => P.member(id)), seed: (Math.random() * 4294967296) >>> 0 });
    save();
    showMap();
    UI.toast('เลือกจุดเริ่มต้นด้านล่างของแผนที่');
  };

  // ---------- map ----------
  function hud() {
    return `<aside class="run-hud">
      <div class="rh-zone"><small>CHAOS ${run.level}</small><b>${CH.zones[run.zone].th}</b><span>ชั้น ${run.zone + 1}/${CH.zones.length}</span></div>
      <div class="rh-team">${run.team.map((t) => {
        const c = D.CHARACTERS[t.id];
        return `<div class="rh-unit" style="--c:${c.color}"><img src="${Art.portrait(t.id, 'face')}" alt=""><div><b>${c.name}</b>`
          + `<span class="bar hp"><i style="width:${(t.hp / t.maxHp) * 100}%"></i><em>${t.hp}/${t.maxHp}</em></span>`
          + `<span class="bar stress${t.stress >= 70 ? ' hot' : ''}"><i style="width:${t.stress}%"></i><em>${icon('brain')}${t.stress}</em></span></div></div>`;
      }).join('')}</div>
      <div class="rh-row"><span class="rh-credits">${icon('coin')}<b>${run.credits}</b> เครดิต</span><button class="btn ghost sm" data-act="ch-deck">${icon('deck')} เด็ค ${run.deck.length}</button></div>
      <div class="rh-frags">${run.fragments.length ? run.fragments.map((f) => `<span class="frag" title="${esc(D.FRAGMENTS[f].th + ': ' + D.FRAGMENTS[f].desc)}">${icon('frag')}<b>${D.FRAGMENTS[f].th}</b></span>`).join('') : '<span class="m-note">ยังไม่มี Fragment</span>'}</div>
      <button class="linkbtn" data-act="ch-abandon">ยอมแพ้รอบนี้</button>
    </aside>`;
  }

  function showMap() {
    const floors = run.map.floors;
    const avail = RN.available(run);
    const rowH = 92, H = floors.length * rowH + 40;
    const pos = (n) => ({ x: ((n.lane + 1) / (CH.lanes + 1)) * 100, y: H - 40 - n.f * rowH });
    const visitedEdge = (a, b) => a.visited && b.visited;
    let lines = '';
    for (const row of floors) for (const n of row) for (const id of n.next) {
      const m = RN.nodeById(run, id);
      const a = pos(n), b = pos(m);
      lines += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${visitedEdge(n, m) ? 'walked' : ''}"/>`;
    }
    const nodes = floors.flat().map((n) => {
      const p = pos(n);
      const shown = n.revealed || n.type;
      const cls = [n.type, n.visited ? 'visited' : '', run.pos === n.id ? 'here' : '', avail.indexOf(n.id) >= 0 ? 'open' : ''].join(' ');
      return `<button class="mnode ${cls}" data-act="ch-node" data-id="${n.id}" style="left:${p.x}%;top:${p.y}px" aria-label="${NODE[shown].th}"${avail.indexOf(n.id) >= 0 ? '' : ' tabindex="-1"'}>${icon(NODE[shown].icon)}<small>${NODE[shown].th}</small></button>`;
    }).join('');
    UI.setScreen('chaosmap', `${UI.topbar('CHAOS RIFT')}
      <main class="chaos-run">
        ${hud()}
        <section class="map-wrap" id="map-wrap">
          <div class="map" style="height:${H}px">
            <svg class="map-lines" viewBox="0 0 100 ${H}" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
            ${nodes}
          </div>
          <div class="map-legend">${['battle', 'elite', 'unknown', 'rest', 'shop', 'boss'].map((k) => `<span>${icon(NODE[k].icon)}${NODE[k].th}</span>`).join('')}</div>
        </section>
      </main>`);
    const wrap = document.getElementById('map-wrap');
    const here = run.pos ? RN.nodeById(run, run.pos) : null;
    const targetY = here ? pos(here).y : H;
    if (wrap.scrollHeight > wrap.clientHeight + 1) wrap.scrollTop = Math.max(0, targetY - wrap.clientHeight * 0.6);
    else {
      // narrow screens scroll the whole page instead of the map box
      const focus = document.querySelector('.mnode.open') || document.querySelector('.mnode.here');
      if (focus) focus.scrollIntoView({ block: 'center' });
    }
  }

  on['ch-node'] = (el) => {
    if (!run || run.status !== 'map') return;
    const r = RN.enter(run, el.dataset.id);
    if (!r.ok) { UI.toast('ไปได้เฉพาะจุดที่เรืองแสงต่อจากจุดปัจจุบัน'); return; }
    route();
  };

  function startFight() {
    const enc = run.pending.enc;
    const kind = run.pending.kind;
    const names = enc.map((id) => D.CHARACTERS[id].name).join(' + ');
    const title = kind === 'boss' ? `BOSS · ${names}` : kind === 'elite' ? `ELITE · ${names}` : names;
    UI.battle.startChaos(RN.battleSetup(run), title);
  }

  /** Called by the battle screen when a Chaos fight ends. */
  UI.chaosBattleDone = (win, units) => {
    RN.afterBattle(run, { win, units });
    route();
  };

  // ---------- reward ----------
  function showReward() {
    const p = run.pending;
    UI.modal(`<div class="ch-reward">
        <h2 class="m-title">ชนะ!</h2>
        <ul class="loot-list">
          <li>${icon('coin')}<span>เครดิต <b>+${p.credits}</b></span></li>
          ${p.fragment ? `<li class="core">${icon('frag')}<span><b>${D.FRAGMENTS[p.fragment].th}</b> <small>${D.FRAGMENTS[p.fragment].desc}</small></span></li>` : ''}
        </ul>
        <p class="m-sub">เลือกการ์ดเข้าเด็ค 1 ใบ</p>
        <div class="pick-cards">${p.cards.map((c, i) => `<button class="pick-card" data-act="ch-take" data-i="${i}">${UI.cardFace(c, null)}<span class="pc-owner">${D.CHARACTERS[c.owner].name} · ${rarityTh(D.CARDS[c.card].rarity)}</span></button>`).join('')}</div>
        <div class="m-row center"><button class="btn ghost" data-act="ch-take" data-i="-1">ข้าม</button></div>
      </div>`, 'locked wide-modal');
  }
  const rarityTh = (r) => ({ common: 'Common', rare: 'Rare', epic: 'Epic', starter: 'Starter' }[r] || r);
  on['ch-take'] = (el) => {
    const i = +el.dataset.i;
    RN.takeReward(run, i >= 0 ? i : null);
    UI.closeModal();
    route();
  };

  function showZone() {
    UI.modal(`<div class="handoff"><small>ผ่านชั้นแรกแล้ว</small><b>${CH.zones[run.zone].th}</b>
      <p>ทีมพักฟื้น HP ${Math.round(CH.zoneHeal * 100)}% และความเครียดลดลง · ศัตรูข้างหน้าแข็งแกร่งกว่าเดิม</p>
      <button class="btn primary big" data-act="ch-zone-ok">ลุยต่อ</button></div>`, 'locked');
  }
  on['ch-zone-ok'] = () => { run.pending = null; save(); UI.closeModal(); };

  // ---------- rest ----------
  function showRest() {
    const heal = run.team.map((t) => Math.min(t.maxHp - t.hp, Math.round(t.maxHp * CH.rest.heal)));
    const canEpi = run.deck.some((c) => !c.mods.length);
    UI.modal(`<h2 class="m-title">${icon('n_rest')} จุดพัก</h2><p class="m-sub">เลือกได้ 1 อย่าง</p>
      <div class="rest-opts">
        <button class="rest-opt" data-act="ch-rest" data-c="heal"><b>พักฟื้น</b><span>ฟื้นฟู HP ${Math.round(CH.rest.heal * 100)}% (${heal.map((h, i) => `${D.CHARACTERS[run.team[i].id].name} +${h}`).join(', ')}) · ความเครียด −${CH.rest.healStress}</span></button>
        <button class="rest-opt" data-act="ch-rest" data-c="meditate"><b>ทำสมาธิ</b><span>ความเครียด −${CH.rest.meditate} ทุกคน</span></button>
        <button class="rest-opt" data-act="ch-rest" data-c="epiphany"${canEpi ? '' : ' disabled'}><b>Epiphany</b><span>เลือกการ์ด 1 ใบให้ตื่นรู้ (เลือกจาก 3 แบบ)</span></button>
      </div>`, 'locked');
  }
  on['ch-rest'] = (el) => {
    const c = el.dataset.c;
    UI.closeModal();
    if (c === 'epiphany') { run.status = 'pick'; run.pending = { kind: 'rest', pick: 'epiphany' }; save(); showPick('epiphany', true); return; }
    RN.rest(run, c);
    UI.toast(c === 'heal' ? 'พักฟื้นแล้ว' : 'จิตใจสงบลงแล้ว');
    route();
  };

  // ---------- deck picker (remove / epiphany / view) ----------
  let pickMode = null;
  function showPick(mode, required) {
    pickMode = mode;
    const cards = run.deck.filter((c) => mode !== 'epiphany' || !c.mods.length);
    const title = mode === 'remove' ? 'เลือกการ์ดที่จะลบ' : mode === 'shop-remove' ? `ลบการ์ด (${run.pending.stock.remove} เครดิต)` : mode === 'epiphany' ? 'เลือกการ์ดที่จะตื่นรู้ (Epiphany)' : `เด็ค ${run.deck.length} ใบ`;
    UI.modal(`<h2 class="m-title">${title}</h2>
      <div class="deck-grid">${cards.map((c) => `<button class="pick-card" data-act="ch-pickcard" data-uid="${c.uid}"${mode === 'view' ? ' tabindex="-1"' : ''}>${UI.cardFace(c, null)}</button>`).join('')}</div>
      <div class="m-row">${required ? '' : '<button class="btn ghost" data-act="ch-pick-close">ปิด</button>'}${required && mode !== 'view' ? '<button class="btn ghost" data-act="ch-pick-skip">ข้าม</button>' : ''}</div>`, (required ? 'locked ' : '') + 'wide-modal deck-modal');
  }
  on['ch-deck'] = () => showPick('view', false);
  on['ch-pick-close'] = () => { UI.closeModal(); if (run.status === 'shop') showShop(); };
  on['ch-pick-skip'] = () => { UI.closeModal(); RN.finishPick(run); route(); };
  on['ch-pickcard'] = (el) => {
    const uid = +el.dataset.uid;
    if (pickMode === 'view') return;
    if (pickMode === 'remove') {
      if (!RN.removeCard(run, uid)) { UI.toast('เด็คต้องเหลืออย่างน้อย 6 ใบ'); return; }
      UI.closeModal();
      UI.toast('ลบการ์ดแล้ว');
      RN.finishPick(run);
      route();
    } else if (pickMode === 'shop-remove') {
      const r = RN.shopRemove(run, uid);
      UI.closeModal();
      UI.toast(r.ok ? 'ลบการ์ดแล้ว' : r.error);
      save();
      showMap();
      showShop();
    } else if (pickMode === 'epiphany') {
      const opts = RN.epiphanyOptions(run, uid);
      const c = run.deck.find((x) => x.uid === uid);
      UI.modal(`<h2 class="m-title">Epiphany · ${D.CARDS[c.card].name}</h2><p class="m-sub">เลือกการตื่นรู้ 1 แบบ (การ์ดแต่ละใบตื่นรู้ได้ครั้งเดียว)</p>
        <div class="pick-cards">${opts.map((m) => `<button class="pick-card" data-act="ch-epi" data-uid="${uid}" data-m="${m}">${UI.cardFace({ card: c.card, mods: [m] }, null)}<span class="pc-owner">${D.EPIPHANY[m].name} · ${D.EPIPHANY[m].th}</span></button>`).join('')}</div>`, 'locked wide-modal');
    }
  };
  on['ch-epi'] = (el) => {
    RN.applyEpiphany(run, +el.dataset.uid, el.dataset.m);
    UI.closeModal();
    UI.toast('การ์ดตื่นรู้แล้ว!');
    RN.finishPick(run);
    route();
  };

  // ---------- shop ----------
  function showShop() {
    const st = run.pending.stock;
    UI.modal(`<h2 class="m-title">${icon('n_shop')} ร้านค้าในรอยแยก</h2><p class="m-sub">${icon('coin')} มี <b>${run.credits}</b> เครดิต</p>
      <div class="shop-cards">${st.cards.map((c, i) => `<div class="shop-item${c.sold ? ' sold' : ''}">${UI.cardFace(c, null)}<button class="btn ${run.credits >= c.price && !c.sold ? 'primary' : 'ghost'} sm" data-act="ch-buy" data-k="card" data-i="${i}"${c.sold ? ' disabled' : ''}>${c.sold ? 'ขายแล้ว' : `${icon('coin')}${c.price}`}</button></div>`).join('')}</div>
      <div class="shop-frags">${st.frags.map((f, i) => `<div class="shop-frag${f.sold ? ' sold' : ''}">${icon('frag')}<span><b>${D.FRAGMENTS[f.id].th}</b><small>${D.FRAGMENTS[f.id].desc}</small></span><button class="btn ${run.credits >= f.price && !f.sold ? 'primary' : 'ghost'} sm" data-act="ch-buy" data-k="frag" data-i="${i}"${f.sold ? ' disabled' : ''}>${f.sold ? 'ขายแล้ว' : `${icon('coin')}${f.price}`}</button></div>`).join('')}
        <div class="shop-frag">${icon('deck')}<span><b>ลบการ์ด</b><small>เอาการ์ดที่ไม่ต้องการออกจากเด็ค (ครั้งเดียวต่อร้าน)</small></span><button class="btn ghost sm" data-act="ch-shop-remove"${run.removedThisShop ? ' disabled' : ''}>${icon('coin')}${st.remove}</button></div>
      </div>
      <div class="m-row"><button class="btn primary" data-act="ch-leave">ออกจากร้าน</button></div>`, 'locked wide-modal');
  }
  on['ch-buy'] = (el) => {
    const r = RN.buy(run, el.dataset.k, +el.dataset.i);
    if (!r.ok) { UI.toast(r.error); return; }
    UI.toast('ซื้อแล้ว');
    save();
    showMap();
    showShop();
  };
  on['ch-shop-remove'] = () => {
    if (run.credits < run.pending.stock.remove) { UI.toast(`เครดิตไม่พอ (ต้องใช้ ${run.pending.stock.remove})`); return; }
    showPick('shop-remove', false);
  };
  on['ch-leave'] = () => { RN.leave(run); UI.closeModal(); route(); };

  // ---------- events and treasure ----------
  function showEvent() {
    const ev = D.EVENTS.find((e) => e.id === run.pending.id);
    UI.modal(`<div class="ch-event"><small>${icon('n_event')} เหตุการณ์</small><h2 class="m-title">${ev.title}</h2><p>${ev.text}</p>
      <div class="ev-choices">${ev.choices.map((c, i) => `<button class="rest-opt" data-act="ch-ev" data-i="${i}"${c.cost && run.credits < c.cost ? ' disabled' : ''}><b>${c.label}</b><span>${c.desc}</span></button>`).join('')}</div></div>`, 'locked');
  }
  on['ch-ev'] = (el) => {
    const r = RN.chooseEvent(run, +el.dataset.i);
    if (!r.ok) { UI.toast(r.error || 'เลือกไม่ได้'); return; }
    UI.closeModal();
    if (r.notes.length) UI.toast(r.notes.join(' · '));
    if (r.next === 'remove' || r.next === 'epiphany') {
      run.pending = { kind: 'event', pick: r.next };
      save();
      showMap();
      showPick(r.next, true);
      return;
    }
    route();
  };

  function showTreasure() {
    const p = run.pending;
    UI.modal(`<div class="handoff"><small>${icon('n_treasure')} สมบัติ</small><b>+${p.credits}</b><p>เครดิต${p.fragment ? ` และ <b>${D.FRAGMENTS[p.fragment].th}</b> — ${D.FRAGMENTS[p.fragment].desc}` : ''}</p>
      <button class="btn primary big" data-act="ch-leave">เก็บแล้วไปต่อ</button></div>`, 'locked');
  }

  // ---------- end of run ----------
  on['ch-abandon'] = () => {
    UI.modal(`<h2 class="m-title">ยอมแพ้รอบนี้?</h2><p class="m-sub">จะได้คริสตัลปลอบใจตามจำนวนด่านที่ผ่าน (${run.cleared} ด่าน)</p>
      <div class="m-row"><button class="btn ghost" data-act="close">เล่นต่อ</button><button class="btn danger" data-act="ch-abandon-yes">ยอมแพ้</button></div>`);
  };
  on['ch-abandon-yes'] = () => {
    run.status = 'over';
    run.result = 'lose';
    UI.closeModal();
    route();
  };

  // ---------- Save Data ----------
  let saveSel = null, replaceId = null;
  function showSaveData() {
    const items = RN.saveCandidates(run);
    if (!items.length) { run.saveDone = true; return showEnd(); }
    const cap = RN.memoryCap(run.level);
    if (!saveSel) {
      // start with the most valuable picks that fit
      saveSel = new Set();
      let used = 0;
      items.map((it, i) => [it, i]).sort((a, b) => b[0].cost - a[0].cost).forEach(([it, i]) => { if (used + it.cost <= cap) { saveSel.add(i); used += it.cost; } });
    }
    const used = [...saveSel].reduce((a, i) => a + items[i].cost, 0);
    const saves = P.data.saves;
    const full = saves.length >= CH.saveData.slots;
    const tag = { add: '<span class="sd-tag add">การ์ดใหม่</span>', epi: '<span class="sd-tag epi">Epiphany</span>', remove: '<span class="sd-tag rm">ลบออกจากเด็ค</span>' };
    UI.modal(`<div class="sd">
        <h2 class="m-title">${icon('frag')} บันทึก Save Data</h2>
        <p class="m-sub">เลือกสิ่งที่ทีมจะจดจำจากรอบนี้ แล้วใช้เด็คนี้ได้ใน BOSS RAID, BATTLE และ ONLINE (ทีมจริง) เมื่อจัดทีม ${run.team.map((t) => D.CHARACTERS[t.id].name).join(' · ')}</p>
        <div class="mem"><span>Faint Memory</span><i class="mem-bar"><i style="width:${Math.min(100, (used / cap) * 100)}%"></i></i><b class="${used > cap ? 'warn' : ''}">${used}/${cap}</b></div>
        <div class="sd-items">${items.map((it, i) => `<button class="sd-item k-${it.kind}${saveSel.has(i) ? ' on' : ''}" data-act="sd-toggle" data-i="${i}" aria-pressed="${saveSel.has(i)}">`
          + `${tag[it.kind]}${UI.cardFace({ card: it.card, mods: it.kind === 'epi' ? [it.mod] : it.mods || [] }, null)}<em>${it.cost} แต้ม</em></button>`).join('')}</div>
        ${full ? `<p class="m-note">ช่อง Save Data เต็ม (${CH.saveData.slots}) เลือกช่องที่จะเขียนทับ</p>
          <div class="sd-replace">${saves.map((s) => `<button class="seg-b${replaceId === s.id ? ' on' : ''}" data-act="sd-replace" data-id="${s.id}"><b>${esc(s.name)}</b><small>Faint Memory ${s.memory}/${s.cap}</small></button>`).join('')}</div>` : ''}
        <div class="m-row"><button class="btn ghost" data-act="sd-skip">ไม่บันทึก</button><button class="btn primary" data-act="sd-save"${full && !replaceId ? ' disabled' : ''}>บันทึก Save Data</button></div>
      </div>`, 'locked wide-modal');
  }
  on['sd-toggle'] = (el) => {
    const i = +el.dataset.i;
    const items = RN.saveCandidates(run);
    const cap = RN.memoryCap(run.level);
    if (saveSel.has(i)) saveSel.delete(i);
    else {
      const used = [...saveSel].reduce((a, k) => a + items[k].cost, 0);
      if (used + items[i].cost > cap) { UI.toast('Faint Memory ไม่พอ เอาอย่างอื่นออกก่อน'); return; }
      saveSel.add(i);
    }
    showSaveData();
  };
  on['sd-replace'] = (el) => { replaceId = el.dataset.id; showSaveData(); };
  on['sd-skip'] = () => { run.saveDone = true; saveSel = null; replaceId = null; UI.closeModal(); showEnd(); };
  on['sd-save'] = () => {
    const items = RN.saveCandidates(run);
    const pick = [...saveSel].map((i) => items[i]);
    const ids = run.team.map((t) => t.id);
    const entry = P.addSave({
      name: `Chaos ${run.level} · ${ids.map((id) => D.CHARACTERS[id].name).join('/')}`,
      team: ids, level: run.level, cap: RN.memoryCap(run.level),
      memory: pick.reduce((a, it) => a + it.cost, 0),
      add: pick.filter((it) => it.kind === 'add').map((it) => ({ card: it.card, owner: it.owner, mods: it.mods })),
      epi: pick.filter((it) => it.kind === 'epi').map((it) => ({ card: it.card, owner: it.owner, mod: it.mod })),
      remove: pick.filter((it) => it.kind === 'remove').map((it) => ({ card: it.card, owner: it.owner })),
    }, replaceId);
    if (P.teamKey(P.data.team) === P.teamKey(ids) || !P.activeSave()) P.useSave(entry.id);
    run.saveDone = true;
    saveSel = null;
    replaceId = null;
    UI.closeModal();
    UI.toast('บันทึก Save Data แล้ว ดูได้ที่หน้า TEAM');
    showEnd();
  };

  function showEnd() {
    if (run.result === 'clear' && !run.saveDone) { save(); return showSaveData(); }
    const rw = P.chaosResult(run, RN.finalRewards(run));
    const clear = run.result === 'clear';
    const team = run.team;
    const level = run.level;
    run = null;
    UI.setScreen('chaos', `${UI.topbar('CHAOS RIFT')}<main class="chaos"></main>`);
    UI.modal(`<div class="result ${clear ? 'win' : 'lose'}"><h2>${clear ? 'RIFT CLEARED' : 'RUN OVER'}</h2>
        <p class="m-sub">${clear ? `ผ่าน Chaos ${level} สำเร็จ!${level < CH.levels ? ` ปลดล็อก Chaos ${level + 1}` : ''}` : 'ทีมถอยกลับจากรอยแยก ลองจัดทีมหรือเส้นทางใหม่'}</p>
        <div class="res-team">${team.map((t) => `<img src="${Art.portrait(t.id, 'face')}" alt="${D.CHARACTERS[t.id].name}">`).join('')}</div>
        <ul class="loot-list big">
          <li>${icon('crystal')}<span>คริสตัล <b>+${rw.crystals}</b></span></li>
          ${rw.cores ? `<li class="core">${icon('core')}<span>หัวใจปีศาจ <b>+${rw.cores}</b></span></li>` : ''}
          ${rw.weapons.map((w) => `<li class="loot-w r-${w.rarity.toLowerCase()}">${UI.weaponIcon(w)}<span><b>${UI.weaponName(w)}</b> ${UI.rar(w.rarity)}<small>${UI.weaponStats(w)}</small></span></li>`).join('')}
        </ul>
        <div class="m-row center"><button class="btn ghost" data-act="res-home">หน้าหลัก</button><button class="btn primary" data-act="ch-again">ลงดันอีกครั้ง</button></div>
      </div>`, 'locked result-modal');
  }
  on['ch-again'] = () => { UI.closeModal(); showLobby(); };
})();
