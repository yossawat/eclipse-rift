/* Eclipse Rift — menu screens: title, home, summon, team (level, Awakening,
   weapons) and the local-duel draft. */
(function () {
  'use strict';
  const UI = window.ERUI;
  const { D, P, G, Art, icon, on } = UI;
  const app = UI.app;

  // ---------- title ----------
  UI.showTitle = () => {
    UI.setScreen('title', `
      <div class="title">
        <div class="title-cast" aria-hidden="true">
          <img class="tc tc0" src="${Art.portrait('noir', 'clear')}" alt="">
          <img class="tc tc2" src="${Art.portrait('rin', 'clear')}" alt="">
          <img class="tc tc1" src="${Art.portrait('aria', 'clear')}" alt="">
        </div>
        <div class="title-copy">
          <h1 class="logo"><span>ECLIPSE</span><b>RIFT</b></h1>
          <p class="tag">Team Card Battle · ต้นแบบระบบเกม</p>
          <button class="btn primary big" data-act="home">เริ่มเกม</button>
        </div>
      </div>`);
  };

  // ---------- home ----------
  UI.showHome = () => {
    const p = P.data;
    const lead = p.team[0];
    const c = lead ? D.CHARACTERS[lead] : null;
    const fresh = !lead;
    const cp = G.teamPower(P.teamSpecs());
    const run = P.loadRun();
    UI.setScreen('home', `
      <header class="topbar"><div class="brand">ECLIPSE<b>RIFT</b></div><div class="record">${p.wins} ชนะ · ${p.losses} แพ้</div>${UI.wallet()}</header>
      <main class="home">
        <section class="hero" style="--c:${c ? c.color : '#5ce1ff'}">
          <div class="hero-stage" id="hero-stage"><img class="hero-art${fresh ? ' ghost' : ''}" src="${Art.portrait(lead || 'aria', 'clear')}" alt="${c ? c.full : ''}"></div>
          <div class="hero-cap">
            ${c ? `<small>${c.roleTh} · ${c.role} · Lv ${p.roster[lead].lv}</small><b>${c.full}</b><q>${c.quote}</q><span class="hero-cp">พลังทีม <b>${cp.toLocaleString()}</b></span>`
              : `<small>เริ่มต้นการเดินทาง</small><b>ยังไม่มีทีม</b><q>คุณได้รับ ${D.GACHA.startCrystals} คริสตัล ไปสุ่มตัวละครชุดแรกที่ SUMMON</q>`}
          </div>
        </section>
        <nav class="menu" aria-label="เมนูหลัก">
          <button class="mbtn${fresh ? '' : ' main'} chaos" data-act="chaos"><b>CHAOS RIFT</b><span>${run ? `<em>รอบค้างอยู่</em> · ชั้น ${run.zone + 1} · เด็ค ${run.deck.length} ใบ` : 'ลงดันโร้กไลก์ สร้างเด็คระหว่างทาง ล่าบอส 2 ชั้น'}</span></button>
          <div class="menu-row">
            <button class="mbtn" data-act="raid"><b>BOSS RAID</b><span>ฟาร์มอาวุธ · หัวใจปีศาจ</span></button>
            <button class="mbtn" data-act="online"><b>ONLINE</b><span>เล่นกับเพื่อน</span></button>
          </div>
          <div class="menu-row">
            <button class="mbtn${fresh ? ' main' : ''}" data-act="summon"><b>SUMMON</b><span>สุ่มตัวละคร${fresh ? ' · <em>เริ่มตรงนี้</em>' : ''}</span></button>
            <button class="mbtn" data-act="team"><b>TEAM</b><span>อัปเลเวล · อาวุธ</span></button>
          </div>
          <div class="menu-row">
            <button class="mbtn small" data-act="battle"><b>BATTLE</b><span>สู้กับบอท</span></button>
            <button class="mbtn small" data-act="duel"><b>LOCAL DUEL</b><span>2 คนเครื่องเดียว</span></button>
          </div>
          <div class="home-links"><button class="linkbtn" data-act="art-mode">ภาพตัวละคร: ${P.data.art3d === false ? '2D' : '3D'} · สลับ</button><button class="linkbtn" data-act="reset">ล้างเซฟเริ่มใหม่</button></div>
        </nav>
      </main>`);
    if (lead && window.ERArt3D && window.ERArt3D.ready) window.ERArt3D.mount(document.getElementById('hero-stage'), lead, 'clear');
  };
  on['art-mode'] = () => {
    const on3d = P.data.art3d === false;
    P.set('art3d', on3d);
    if (window.ERArt3D) window.ERArt3D.enabled = on3d;
    if (on3d && window.ERArt3D && !window.ERArt3D.ready) {
      UI.toast('กำลังโหลดโมเดล 3D…');
      window.ERArt3D.init().then((ok) => { UI.toast(ok ? 'เปิดภาพ 3D แล้ว' : 'โหลด 3D ไม่สำเร็จ ใช้ภาพ 2D แทน'); UI.showHome(); });
      return;
    }
    UI.showHome();
  };
  on.reset = () => {
    UI.modal(`<h2 class="m-title">ล้างเซฟ?</h2><p class="m-sub">ตัวละคร อาวุธ คริสตัล และสถิติทั้งหมดในเบราว์เซอร์นี้จะหายไป</p>
      <div class="m-row"><button class="btn ghost" data-act="close">ยกเลิก</button><button class="btn danger" data-act="reset-yes">ล้างเซฟ</button></div>`);
  };
  on['reset-yes'] = () => { P.reset(); UI.closeModal(); detailId = null; UI.showHome(); UI.toast('เริ่มใหม่แล้ว'); };

  on.battle = () => {
    const p = P.data;
    if (!p.team.length) { UI.toast('ยังไม่มีตัวละคร ไปสุ่มที่ SUMMON ก่อน'); UI.showSummon(); return; }
    UI.modal(`
      <h2 class="m-title">เลือกความยาก</h2>
      <p class="m-sub">ทีมของคุณ: ${p.team.map((id) => D.CHARACTERS[id].name).join(' · ')} · พลังทีม ${G.teamPower(P.teamSpecs()).toLocaleString()}</p>
      <div class="diff">${['easy', 'normal', 'hard'].map((k) => {
        const r = D.REWARDS[k];
        return `<button class="diff-btn d-${k}" data-act="start-bot" data-level="${k}"><b>${r.label}</b><span>${r.th} · ศัตรู Lv ${r.lv}</span><em>${icon('crystal')} ชนะ +${r.win}</em></button>`;
      }).join('')}</div>
      <p class="m-note">ทีมศัตรูสุ่มจากตัวละครทั้ง 5 ตัว ขนาดเท่าทีมคุณ${P.activeSave() ? ` · เด็ค: ${UI.esc(P.activeSave().name)}` : ''}</p>`);
  };
  on['start-bot'] = (el) => { UI.closeModal(); UI.battle.startBot(el.dataset.level); };

  // ---------- summon ----------
  let pullTimers = [];
  UI.showSummon = () => {
    const p = P.data, GA = D.GACHA;
    UI.setScreen('summon', `${UI.topbar('SUMMON')}
      <main class="summon">
        <section class="banner">
          <img class="bn-art b" src="${Art.portrait('noir', 'clear')}" alt="Noir">
          <img class="bn-art a" src="${Art.portrait('aria', 'clear')}" alt="Aria">
          <div class="bn-copy">
            <small>RATE UP · SSR</small>
            <h2>Eclipse Summon</h2>
            <p>Aria Kurenai · Noir Nyx</p>
          </div>
        </section>
        <section class="odds">
          <span><b class="g">SSR ${Math.round(GA.ssrRate * 100)}%</b> · SR ${100 - Math.round(GA.ssrRate * 100)}%</span>
          <span>การันตี SSR ภายใน <b>${GA.pity - p.pity}</b> ครั้ง</span>
          ${p.pulls < GA.beginnerPulls ? `<span class="beginner">${GA.beginnerPulls} ครั้งแรก ได้ตัวละครไม่ซ้ำอย่างน้อย 3 ตัว</span>` : ''}
        </section>
        <section class="pool" aria-label="ตัวละครที่สุ่มได้">${D.ROSTER.map((id) => {
          const c = D.CHARACTERS[id], own = p.roster[id];
          return `<div class="pool-tile${own ? '' : ' unowned'}" style="--c:${c.color}"><img src="${Art.portrait(id, 'face')}" alt="">${UI.rar(c.rarity)}<b>${c.name}</b><small>${own ? `Awakening ${own.awk}/${GA.maxAwakening}` : 'ยังไม่มี'}</small></div>`;
        }).join('')}</section>
        <div class="summon-btns">
          <button class="btn ghost big" data-act="pull" data-n="1">สุ่ม 1 ครั้ง<span class="cost">${icon('crystal')}${GA.single}</span></button>
          <button class="btn primary big" data-act="pull" data-n="10">สุ่ม 10 ครั้ง<span class="cost">${icon('crystal')}${GA.multi}</span></button>
        </div>
        <p class="m-note center">ได้ตัวซ้ำ = Awakening +1 (สูงสุด ${GA.maxAwakening} ขั้น) แต่ละขั้นปลดล็อกของใหม่ เช่น การ์ดอัปเกรด พาสซีฟแรงขึ้น ดูได้ที่หน้า TEAM</p>
      </main>`);
  };
  on.summon = () => UI.showSummon();
  on.pull = (el) => {
    const r = P.summon(+el.dataset.n);
    if (!r.ok) { UI.toast(r.error); return; }
    const gold = r.results.some((x) => x.rarity === 'SSR');
    const m = UI.modal(`
      <div class="pulls n${r.results.length}">${r.results.map((x) => {
        const c = D.CHARACTERS[x.id];
        const note = x.isNew ? '<em class="new">NEW</em>' : x.awakened ? `<em>Awakening ${x.awk}</em>` : `<em>+${x.refund} คริสตัล</em>`;
        return `<div class="pull r-${x.rarity.toLowerCase()}" style="--c:${c.color}"><div class="pull-in">`
          + `<div class="pull-back">${icon('crystal')}</div>`
          + `<div class="pull-front"><img src="${Art.portrait(x.id, 'face')}" alt="">${UI.rar(x.rarity)}<b>${c.name}</b>${note}</div>`
          + '</div></div>';
      }).join('')}</div>
      <div class="m-row center"><button class="btn ghost" data-act="pull-reveal">เปิดทั้งหมด</button><button class="btn primary" data-act="pull-done">ตกลง</button></div>`,
    'locked pull-modal' + (gold ? ' gold' : ''));
    const cards = [...m.querySelectorAll('.pull')];
    let t = 400;
    pullTimers.forEach(clearTimeout);
    pullTimers = cards.map((card, i) => {
      const at = t;
      t += r.results[i].rarity === 'SSR' ? 700 : 190;
      return setTimeout(() => card.classList.add('open'), at);
    });
  };
  on['pull-reveal'] = () => {
    pullTimers.forEach(clearTimeout);
    document.querySelectorAll('.pull').forEach((c) => c.classList.add('open'));
  };
  on['pull-done'] = () => { pullTimers.forEach(clearTimeout); UI.closeModal(); UI.showSummon(); };

  // ---------- team ----------
  let detailId = null;
  UI.showTeam = () => {
    const p = P.data;
    if (!detailId) detailId = p.team[0] || D.ROSTER.find((id) => p.roster[id]) || D.ROSTER[0];
    const y = app.scrollTop;
    const specs = P.teamSpecs();
    UI.setScreen('team', `${UI.topbar('TEAM')}
      <main class="teamscr">
        <section class="formation" aria-label="ทีมปัจจุบัน">${[0, 1, 2].map((i) => {
          const id = p.team[i];
          if (!id) return `<div class="slot empty"><span>ช่อง ${i + 1}</span><small>ว่าง</small></div>`;
          const c = D.CHARACTERS[id];
          return `<button class="slot" data-act="view" data-id="${id}" style="--c:${c.color}"><img src="${Art.portrait(id, 'face')}" alt=""><b>${c.name}</b><small>Lv ${p.roster[id].lv} · ${c.roleTh}</small></button>`;
        }).join('')}<div class="team-cp"><small>พลังทีม</small><b>${G.teamPower(specs).toLocaleString()}</b></div></section>
        ${savesHTML()}
        <section class="roster" aria-label="ตัวละครทั้งหมด">${D.ROSTER.map((id) => {
          const c = D.CHARACTERS[id], own = p.roster[id], inTeam = p.team.indexOf(id) >= 0;
          return `<button class="rtile${own ? '' : ' locked'}${id === detailId ? ' on' : ''}" data-act="view" data-id="${id}" style="--c:${c.color}">`
            + `<img src="${Art.portrait(id, 'face')}" alt="">${UI.rar(c.rarity)}<b>${c.name}</b><small>${own ? `Lv ${own.lv} · A${own.awk}` : 'ยังไม่มี'}</small>${inTeam ? '<i class="chk">ในทีม</i>' : ''}</button>`;
        }).join('')}</section>
        <section class="detail">${detailHTML(detailId)}</section>
      </main>`);
    app.scrollTop = y;
    if (window.ERArt3D && window.ERArt3D.ready) window.ERArt3D.mount(document.getElementById('det-art'), detailId, 'bust');
  };

  function savesHTML() {
    const saves = P.data.saves || [];
    const active = P.activeSave();
    return `<section class="saves"><h3>${icon('frag')} SAVE DATA <small>เด็คที่เก็บจาก CHAOS RIFT · ใช้ใน BOSS RAID, BATTLE และ ONLINE (ทีมจริง) เมื่อทีมตรงกัน</small></h3>
      ${saves.length ? `<div class="save-list">${saves.map((s) => {
        const on = active && active.id === s.id;
        const epis = s.epi.length + s.add.filter((a) => a.mods && a.mods.length).length;
        return `<div class="save-card${on ? ' on' : ''}"><div class="sc-team">${s.team.map((id) => `<img src="${Art.portrait(id, 'face')}" alt="${D.CHARACTERS[id].name}">`).join('')}</div>`
          + `<div class="sc-info"><b>${UI.esc(s.name)}</b><small>Faint Memory ${s.memory}/${s.cap} · การ์ดใหม่ ${s.add.length} · Epiphany ${epis} · ลบ ${s.remove.length}</small>${on ? '<em>ใช้อยู่</em>' : ''}</div>`
          + `<div class="sc-act">${on ? '<button class="btn ghost sm" data-act="sd-unuse">เลิกใช้</button>' : `<button class="btn primary sm" data-act="sd-use" data-id="${s.id}">ใช้</button>`}`
          + `<button class="btn ghost sm" data-act="sd-view" data-id="${s.id}">ดูเด็ค</button><button class="btn ghost sm" data-act="sd-del" data-id="${s.id}">ลบ</button></div></div>`;
      }).join('')}</div>` : '<p class="m-note">ยังไม่มี · ผ่าน CHAOS RIFT แล้วเลือกการ์ดที่จะเก็บไว้</p>'}
    </section>`;
  }
  on['sd-use'] = (el) => {
    const r = P.useSave(el.dataset.id);
    UI.toast(r.ok ? 'ใช้ Save Data แล้ว ทีมเปลี่ยนเป็นทีมของเด็คนี้' : r.error);
    UI.showTeam();
  };
  on['sd-unuse'] = () => { P.unuseSave(); UI.showTeam(); };
  on['sd-del'] = (el) => {
    if (el.dataset.armed !== '1') { el.dataset.armed = '1'; el.textContent = 'ยืนยันลบ?'; return; }
    P.deleteSave(el.dataset.id);
    UI.showTeam();
  };
  on['sd-view'] = (el) => {
    const s = P.data.saves.find((x) => x.id === el.dataset.id);
    const specs = s.team.map((id) => (P.data.roster[id] ? P.member(id) : G.baseMember(id)));
    const deck = G.deckWithSave(specs, s);
    UI.modal(`<h2 class="m-title">${UI.esc(s.name)}</h2><p class="m-sub">${deck.length} ใบ · Faint Memory ${s.memory}/${s.cap}</p>
      <div class="deck-grid">${deck.map((c) => `<div class="pick-card">${UI.cardFace(c, null)}</div>`).join('')}</div>
      <div class="m-row"><button class="btn ghost" data-act="close">ปิด</button></div>`, 'wide-modal deck-modal');
  };

  function detailHTML(id) {
    const p = P.data, c = D.CHARACTERS[id], e = p.roster[id];
    const own = !!e;
    const spec = own ? P.member(id) : G.baseMember(id);
    const awk = own ? e.awk : 0;
    const w = own && e.weapon ? P.weapon(e.weapon) : null;
    const inTeam = p.team.indexOf(id) >= 0;

    let growth = '';
    if (own) {
      const cap = G.capOf(e.asc);
      const atCap = e.lv >= cap;
      const ascendNeed = G.ascendCost(e.asc);
      let btns;
      if (atCap && ascendNeed != null) {
        btns = `<button class="btn primary" data-act="ascend" data-id="${id}"${p.cores < ascendNeed ? ' disabled' : ''}>ทะลวงขีดจำกัด → Lv ${G.capOf(e.asc + 1)}<span class="cost">${icon('core')}${p.cores}/${ascendNeed}</span></button>`
          + (p.cores < ascendNeed ? '<span class="m-note">หัวใจปีศาจได้จาก BOSS RAID</span>' : '');
      } else if (atCap) {
        btns = '<span class="m-note">เลเวลสูงสุดแล้ว</span>';
      } else {
        btns = `<button class="btn ghost" data-act="lvup" data-id="${id}" data-n="1">Lv +1<span class="cost">${icon('crystal')}${G.levelCost(e.lv)}</span></button>`
          + `<button class="btn ghost" data-act="lvup" data-id="${id}" data-n="99">ถึง Lv ${cap}<span class="cost">${icon('crystal')}${G.levelRangeCost(e.lv, cap).toLocaleString()}</span></button>`;
      }
      growth = `<div class="grow">
        <div class="lvline"><span class="lv">Lv <b>${e.lv}</b><small>/${cap}</small></span><i class="lvbar"><i style="width:${(e.lv / cap) * 100}%"></i></i><span class="cp">พลัง <b>${G.power(spec).toLocaleString()}</b></span></div>
        <div class="grow-btns">${btns}</div>
      </div>`;
    }

    const stats = [
      `${icon('heart')} HP <b>${Math.round(c.hp * spec.hpMul)}</b>`,
      `${icon('str')} พลัง <b>+${UI.pct(spec.outMul - 1)}</b>`,
      spec.crit ? `คริ <b>${UI.pct(spec.crit)}</b>` : '',
      spec.lifesteal ? `ดูดเลือด <b>${UI.pct(spec.lifesteal)}</b>` : '',
      spec.startBurst ? `Burst เริ่ม <b>${spec.startBurst}%</b>` : '',
    ].filter(Boolean).map((s) => `<span>${s}</span>`).join('');

    const weaponSlot = own ? `<button class="wslot" data-act="weapons" data-id="${id}">${w
      ? `${UI.weaponIcon(w)}<span><b>${UI.weaponName(w)}</b> ${UI.rar(w.rarity)}<small>${UI.weaponStats(w)}</small></span><em>เปลี่ยน</em>`
      : `<span class="wpn empty">${icon('w_edge')}</span><span><b>ยังไม่มีอาวุธ</b><small>${p.weapons.length ? `มีในคลัง ${p.weapons.length} ชิ้น · แตะเพื่อใส่` : 'อาวุธได้จาก BOSS RAID'}</small></span>`}</button>` : '';

    const counts = {};
    spec.deck.forEach((k) => { counts[k] = (counts[k] || 0) + 1; });
    let action;
    if (!own) action = '<button class="btn ghost" data-act="summon">ยังไม่มีตัวนี้ · ไปสุ่ม</button>';
    else if (inTeam) action = `<button class="btn ghost" data-act="team-toggle" data-id="${id}">เอาออกจากทีม</button>`;
    else action = `<button class="btn primary" data-act="team-toggle" data-id="${id}"${p.team.length >= 3 ? ' disabled' : ''}>${p.team.length >= 3 ? 'ทีมเต็ม (3 คน)' : 'ใส่ในทีม'}</button>`;

    return `<div class="det" style="--c:${c.color}">
      <div class="det-art" id="det-art"><img src="${Art.portrait(id, 'bust')}" alt="${c.full}"></div>
      <div class="det-body">
        <div class="det-head">${UI.rar(c.rarity)}<small>${c.roleTh} · ${c.role}</small><h2>${c.full}</h2><p>${c.title} — “${c.quote}”</p><p class="det-style">${c.style}</p></div>
        ${growth}
        <div class="det-stats">${stats}</div>
        ${weaponSlot}
        <div class="skill"><small>PASSIVE</small><b>${c.passive.name}</b><p>${UI.passiveText(c, spec.pv)}</p></div>
        <div class="skill burst"><small>BURST</small><b>${c.burst.name}</b><p>${UI.effectsText(c.burst.effects, null, 0)}</p></div>
        <div class="awaken"><small>AWAKENING · ได้จากการสุ่มติดตัวซ้ำ (${awk}/${D.GACHA.maxAwakening})</small>
          <ol>${c.awakening.map((a, i) => `<li class="${i < awk ? 'on' : ''}"><b>A${i + 1}</b><span>${UI.awakeningText(c, a)}</span></li>`).join('')}</ol>
        </div>
        <div class="det-sec"><small>เด็คเริ่มต้น</small></div>
        <div class="det-cards">${Object.keys(counts).map((k) => `<div class="mini-wrap">${UI.cardFace(k, null, { cls: ' mini' })}<span>×${counts[k]}</span></div>`).join('')}</div>
        <div class="det-sec"><small>การ์ดที่ได้ระหว่าง CHAOS RIFT</small></div>
        <div class="det-cards">${c.pool.map((k) => `<div class="mini-wrap">${UI.cardFace(k, null, { cls: ' mini' })}</div>`).join('')}</div>
        <div class="det-act">${action}</div>
      </div>
    </div>`;
  }
  on.team = () => UI.showTeam();
  on.view = (el) => { detailId = el.dataset.id; UI.showTeam(); };
  on['team-toggle'] = (el) => {
    if (!P.toggleTeam(el.dataset.id)) UI.toast('ทีมเต็มแล้ว เอาใครออกก่อน');
    UI.showTeam();
  };
  on.lvup = (el) => {
    const r = P.levelUp(el.dataset.id, +el.dataset.n);
    if (!r.ok) UI.toast(r.error);
    else UI.toast(`เลเวลขึ้น +${r.gained} (ใช้ ${r.spent.toLocaleString()} คริสตัล)`);
    UI.showTeam();
  };
  on.ascend = (el) => {
    const r = P.ascend(el.dataset.id);
    UI.toast(r.ok ? `ทะลวงขีดจำกัดสำเร็จ! เลเวลสูงสุดตอนนี้ ${r.cap}` : r.error);
    UI.showTeam();
  };

  // ---------- weapons ----------
  const RANK = { SSR: 3, SR: 2, R: 1 };
  function showWeapons(id) {
    const c = D.CHARACTERS[id];
    const list = P.data.weapons.slice().sort((a, b) => RANK[b.rarity] - RANK[a.rarity] || G.weaponScore(b) - G.weaponScore(a));
    UI.modal(`<h2 class="m-title">อาวุธ · ${c.name}</h2><p class="m-sub">คลัง ${list.length} ชิ้น · ค่าสเตตัสสุ่มทุกชิ้น ฟาร์มของดีได้จาก BOSS RAID</p>
      <div class="wlist">${list.map((w) => {
        const holder = P.holderOf(w.uid);
        const act = holder === id
          ? `<button class="btn ghost sm" data-act="unequip" data-id="${id}">ถอด</button>`
          : `<button class="btn primary sm" data-act="equip" data-id="${id}" data-w="${w.uid}">ใส่</button>`;
        const salvage = holder ? '' : `<button class="btn ghost sm" data-act="salvage" data-id="${id}" data-w="${w.uid}">แยก +${D.WEAPON_RARITY[w.rarity].salvage}</button>`;
        return `<div class="wrow">${UI.weaponIcon(w)}<div class="wrow-txt"><b>${UI.weaponName(w)}</b> ${UI.rar(w.rarity)}<small>${UI.weaponStats(w)}</small>${holder ? `<em>${holder === id ? 'ใส่อยู่' : 'ใช้อยู่กับ ' + D.CHARACTERS[holder].name}</em>` : ''}</div><div class="wrow-act">${act}${salvage}</div></div>`;
      }).join('') || '<p class="m-note">ยังไม่มีอาวุธ ไปล่าบอสที่ BOSS RAID</p>'}</div>
      <div class="m-row"><button class="btn ghost" data-act="close">ปิด</button></div>`, 'wide-modal');
  }
  on.weapons = (el) => showWeapons(el.dataset.id);
  on.equip = (el) => { P.equip(el.dataset.id, el.dataset.w); UI.closeModal(); UI.showTeam(); UI.toast('ใส่อาวุธแล้ว'); };
  on.unequip = (el) => { P.equip(el.dataset.id, null); UI.closeModal(); UI.showTeam(); };
  on.salvage = (el) => {
    if (el.dataset.armed !== '1') { el.dataset.armed = '1'; el.textContent = 'ยืนยันแยก?'; return; }
    const r = P.salvage(el.dataset.w);
    UI.toast(r.ok ? `แยกชิ้นแล้ว +${r.gain} คริสตัล` : r.error);
    UI.showTeam();
    showWeapons(el.dataset.id);
  };

  // ---------- local duel draft ----------
  const DR = { step: 0, picks: [[], []] };
  on.duel = () => { DR.step = 0; DR.picks = [[], []]; showDraft(); };
  function showDraft() {
    const k = DR.step, picks = DR.picks[k];
    UI.setScreen('draft', `${UI.topbar('LOCAL DUEL')}
      <main class="draft">
        <h2 class="draft-h"><span class="pl p${k + 1}">PLAYER ${k + 1}</span> เลือกทีม 3 ตัว</h2>
        <p class="m-sub">ใน Local Duel ทุกตัวเริ่มที่ Lv 1 ไม่มีอาวุธ · สองฝ่ายเลือกตัวซ้ำกันได้</p>
        <div class="roster">${D.ROSTER.map((id) => {
          const c = D.CHARACTERS[id], i = picks.indexOf(id);
          return `<button class="rtile${i >= 0 ? ' on' : ''}" data-act="draft-pick" data-id="${id}" style="--c:${c.color}" aria-pressed="${i >= 0}">`
            + `<img src="${Art.portrait(id, 'face')}" alt=""><b>${c.name}</b><small>${c.roleTh}</small>${i >= 0 ? `<i class="chk">${i + 1}</i>` : ''}</button>`;
        }).join('')}</div>
        <div class="draft-foot"><button class="btn primary big" data-act="draft-next"${picks.length === 3 ? '' : ' disabled'}>${k === 0 ? 'ต่อไป: PLAYER 2' : 'เริ่มต่อสู้'}</button></div>
      </main>`);
  }
  UI.showDraft = showDraft;
  on['draft-pick'] = (el) => {
    const picks = DR.picks[DR.step], id = el.dataset.id, i = picks.indexOf(id);
    if (i >= 0) picks.splice(i, 1);
    else if (picks.length < 3) picks.push(id);
    showDraft();
  };
  on['draft-next'] = () => {
    if (DR.step === 0) { DR.step = 1; showDraft(); return; }
    UI.battle.startDuel(DR.picks);
  };
})();
