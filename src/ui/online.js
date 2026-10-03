/* Eclipse Rift — online lobby: create a room or join a friend's by code. */
(function () {
  'use strict';
  const UI = window.ERUI;
  const { D, P, G, Art, icon, on } = UI;
  const N = window.ERNet;

  const OL = { fair: true, picks: null, waiting: null, unsub: null, busy: false };

  function myTeam(fair) {
    if (fair) return OL.picks.map((id) => G.baseMember(id));
    return P.teamSpecs();
  }

  UI.showOnline = async () => {
    if (!OL.picks) OL.picks = (P.data.team.length === 3 ? P.data.team : ['kael', 'aria', 'lumi']).slice();
    UI.setScreen('online', `${UI.topbar('ONLINE')}<main class="online"><p class="m-sub">กำลังเชื่อมต่อ…</p></main>`);
    const ok = await N.init();
    if (UI.screen !== 'online') return;
    if (!ok) { renderUnavailable(); return; }
    render();
  };
  on.online = () => UI.showOnline();

  function renderUnavailable() {
    const why = {
      nohost: 'เวอร์ชันนี้ยังไม่มีเซิร์ฟเวอร์ออนไลน์ โหมดเล่นกับเพื่อนตอนนี้ใช้ได้เฉพาะเวอร์ชันบน claude.ai (เพื่อนต้องได้รับเชิญ) · โหมดอื่นเล่นได้ครบ',
      nodb: 'ต้องลงชื่อเข้าใช้ claude.ai และเปิดผ่านลิงก์ของเกมนี้',
      readonly: 'บัญชีนี้ดูเกมได้อย่างเดียว เจ้าของต้องเชิญคุณเป็น Editor (เมนู Share) ก่อนจึงจะสร้างหรือเข้าห้องได้',
    }[N.NET.reason] || 'ตอนนี้เชื่อมต่อโหมดออนไลน์ไม่ได้';
    UI.$('.online').innerHTML = `<section class="ol-card"><h2>${icon('globe')} เล่นออนไลน์ไม่ได้ตอนนี้</h2><p>${why}</p>${howToInvite()}</section>`;
  }
  function howToInvite() {
    return `<div class="ol-how"><b>ชวนเพื่อนมาเล่น</b>
      <ol><li>เจ้าของเกมกด <b>Share</b> บนหน้านี้ แล้วเชิญเพื่อนทางอีเมลเป็น <b>Editor</b></li>
      <li>เพื่อนเปิดลิงก์ด้วยบัญชี claude.ai ของตัวเอง แล้วกด ONLINE</li>
      <li>คนหนึ่งสร้างห้อง แล้วส่งรหัส 5 ตัวให้อีกคนกรอก</li></ol></div>`;
  }

  function render() {
    const team = P.teamSpecs();
    UI.$('.online').innerHTML = `
      ${N.NET.mock ? '<p class="dev-note">โหมดทดสอบในเครื่อง: เปิดเกมอีกแท็บเพื่อเล่นเป็นเพื่อน</p>' : ''}
      <section class="ol-card">
        <h2>${icon('globe')} สร้างห้อง</h2>
        <div class="seg" role="group" aria-label="กติกา">
          <button class="seg-b${OL.fair ? ' on' : ''}" data-act="ol-rule" data-fair="1"><b>ยุติธรรม</b><small>ทุกตัว Lv 1 ไม่มีอาวุธ เลือกได้ทั้ง 5 ตัว</small></button>
          <button class="seg-b${OL.fair ? '' : ' on'}" data-act="ol-rule" data-fair="0"><b>ทีมจริง</b><small>ใช้เลเวล อาวุธ Awakening ของแต่ละคน</small></button>
        </div>
        ${OL.fair ? `<div class="ol-picks">${D.ROSTER.map((id) => {
          const c = D.CHARACTERS[id], i = OL.picks.indexOf(id);
          return `<button class="rtile${i >= 0 ? ' on' : ''}" data-act="ol-pick" data-id="${id}" style="--c:${c.color}" aria-pressed="${i >= 0}"><img src="${Art.portrait(id, 'face')}" alt=""><b>${c.name}</b>${i >= 0 ? `<i class="chk">${i + 1}</i>` : ''}</button>`;
        }).join('')}</div>` : `<p class="m-sub">ทีมของคุณ: ${team.map((s) => `${D.CHARACTERS[s.id].name} Lv${s.lv}`).join(' · ') || 'ยังไม่มี'} · พลัง ${G.teamPower(team).toLocaleString()}</p>`}
        <div class="m-row"><button class="btn primary" data-act="ol-create"${canPlay(OL.fair) ? '' : ' disabled'}>สร้างห้อง</button></div>
      </section>
      <section class="ol-card">
        <h2>${icon('link')} เข้าห้องเพื่อน</h2>
        <form class="ol-join" data-form="join">
          <label for="ol-code">รหัสห้อง</label>
          <input id="ol-code" maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="เช่น K7Q2M">
          <button class="btn primary" type="submit">เข้าห้อง</button>
        </form>
        <p class="m-note">กติกาเป็นไปตามคนสร้างห้อง ถ้าเป็นแบบยุติธรรม จะใช้ 3 ตัวที่คุณเลือกไว้ด้านบน</p>
      </section>
      <section class="ol-card soft">${howToInvite()}</section>`;
    const form = document.querySelector('[data-form="join"]');
    form.addEventListener('submit', (e) => { e.preventDefault(); join(UI.$('#ol-code').value); });
  }
  function canPlay(fair) {
    return fair ? OL.picks.length === 3 : P.teamSpecs().length > 0;
  }

  on['ol-rule'] = (el) => { OL.fair = el.dataset.fair === '1'; render(); };
  on['ol-pick'] = (el) => {
    const id = el.dataset.id, i = OL.picks.indexOf(id);
    if (i >= 0) OL.picks.splice(i, 1);
    else if (OL.picks.length < 3) OL.picks.push(id);
    render();
  };

  on['ol-create'] = async () => {
    if (OL.busy) return;
    OL.busy = true;
    try {
      const code = await N.createMatch(myTeam(OL.fair), OL.fair, OL.fair ? null : P.activeDeck());
      OL.waiting = code;
      UI.modal(`<div class="handoff"><small>รหัสห้อง</small><b class="code">${code}</b>
          <p>ส่งรหัสนี้ให้เพื่อน แล้วรอเพื่อนเข้าห้อง · กติกา${OL.fair ? 'ยุติธรรม' : 'ทีมจริง'}</p>
          <div class="m-row center"><button class="btn ghost" data-act="ol-copy" data-code="${code}">${icon('copy')} คัดลอกรหัส</button><button class="btn danger" data-act="ol-cancel">ยกเลิกห้อง</button></div>
          <p class="m-note waiting">รอเพื่อนเข้าห้อง…</p></div>`, 'locked');
      OL.unsub = N.watch(code, (doc) => {
        if (!doc || OL.waiting !== code) return;
        if (doc.status === 'playing' && doc.guest) startMatch(code, 0, doc);
      }, () => UI.toast('การเชื่อมต่อขาด ลองสร้างห้องใหม่'));
    } catch (e) {
      UI.toast(e.message || 'สร้างห้องไม่สำเร็จ');
    }
    OL.busy = false;
  };
  on['ol-copy'] = async (el) => {
    try { await navigator.clipboard.writeText(el.dataset.code); UI.toast('คัดลอกรหัสแล้ว'); }
    catch (e) { UI.toast('คัดลอกไม่ได้ จดรหัส ' + el.dataset.code + ' ไว้แทน'); }
  };
  on['ol-cancel'] = () => {
    if (OL.unsub) OL.unsub();
    if (OL.waiting) N.cancel(OL.waiting);
    OL.waiting = null;
    UI.closeModal();
  };

  async function join(raw) {
    const code = N.cleanCode(raw);
    if (code.length !== 5) { UI.toast('รหัสห้องมี 5 ตัวอักษร'); return; }
    if (OL.busy) return;
    OL.busy = true;
    try {
      const m = await N.peek(code);
      if (!m) { UI.toast('ไม่พบห้องรหัสนี้'); return; }
      if (!canPlay(m.fair)) { UI.toast(m.fair ? 'เลือกตัวละคร 3 ตัวด้านบนก่อน' : 'ห้องนี้ใช้ทีมจริง คุณต้องมีตัวละครในทีมก่อน'); return; }
      const r = await N.joinMatch(code, myTeam(m.fair), m.fair ? null : P.activeDeck());
      if (!r.ok) { UI.toast(r.error); return; }
      const doc = await N.peek(code);
      startMatch(code, 1, doc);
    } catch (e) {
      UI.toast('เข้าห้องไม่สำเร็จ ลองอีกครั้ง');
    } finally {
      OL.busy = false;
    }
  }

  async function startMatch(code, side, doc) {
    if (OL.unsub) { OL.unsub(); OL.unsub = null; }
    OL.waiting = null;
    UI.closeModal();
    const nm = await N.names([doc.host.uid, doc.guest.uid]);
    const names = [nm[doc.host.uid] || 'HOST', nm[doc.guest.uid] || 'GUEST'];
    if (doc.host.uid === doc.guest.uid) { names[0] = 'PLAYER 1'; names[1] = 'PLAYER 2'; }
    UI.battle.startOnline({ code, side, doc, names });
  }
})();
