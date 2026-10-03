/* Eclipse Rift — Boss Raid: pick a stage of Malvoth, see rewards, show loot. */
(function () {
  'use strict';
  const UI = window.ERUI;
  const { D, P, G, Art, icon, on } = UI;

  let stageSel = 0;

  UI.showRaid = () => {
    const p = P.data;
    const R = D.BOSS_RAID;
    const boss = D.CHARACTERS[R.boss];
    const unlocked = Math.min(p.bossCleared + 1, R.stages);
    if (!stageSel || stageSel > unlocked) stageSel = unlocked;
    const st = G.bossStage(stageSel);
    const cp = G.teamPower(P.teamSpecs());
    const ready = cp >= st.recommended;
    const bossHp = Math.round(boss.hp * st.hpMul);

    UI.setScreen('raid', `${UI.topbar('BOSS RAID')}
      <main class="raid">
        <section class="raid-hero" style="--c:${boss.color}">
          <div class="embers" aria-hidden="true">${'<i></i>'.repeat(14)}</div>
          <div class="raid-stage" id="raid-stage"><img class="raid-art" src="${Art.portrait(boss.id, 'clear')}" alt="${boss.name}"></div>
          <div class="raid-cap">
            <small>${boss.roleTh} · BOSS</small>
            <h2>${boss.name}</h2>
            <p class="raid-title">${boss.title}</p>
            <q>${boss.quote}</q>
            <ul class="raid-tips">
              <li><b>INTENT</b> บอสประกาศท่าล่วงหน้า ดูว่าจะตีใคร แล้วให้โล่หรือยั่วยุตัดหน้า</li>
              <li><b>${boss.passive.name}</b> ${UI.passiveText(boss, boss.passive.v)}</li>
              <li><b>เวลาจำกัด</b> ต้องชนะภายใน ${D.RULES.roundLimit} รอบ</li>
            </ul>
          </div>
        </section>

        <section class="stages" aria-label="เลือกด่าน">${Array.from({ length: R.stages }, (_, i) => {
          const s = i + 1;
          const state = s <= p.bossCleared ? 'done' : s === unlocked ? 'next' : s > unlocked ? 'lock' : '';
          return `<button class="stg ${state}${s === stageSel ? ' on' : ''}" data-act="stage" data-s="${s}"${state === 'lock' ? ' disabled' : ''}>`
            + `<b>${s}</b><small>${state === 'done' ? 'ผ่านแล้ว' : state === 'lock' ? 'ล็อก' : 'ด่านถัดไป'}</small></button>`;
        }).join('')}</section>

        <section class="stage-info">
          <div class="si-col">
            <h3>ด่าน ${stageSel}</h3>
            <dl class="si-stats">
              <div><dt>HP บอส</dt><dd>${bossHp.toLocaleString()}</dd></div>
              <div><dt>ความแรง</dt><dd>×${st.outMul.toFixed(2)}</dd></div>
              <div><dt>พลังแนะนำ</dt><dd>${st.recommended.toLocaleString()}</dd></div>
              <div><dt>พลังทีมคุณ</dt><dd class="${ready ? 'ok' : 'warn'}">${cp.toLocaleString()}</dd></div>
            </dl>
            ${ready ? '' : '<p class="m-note">พลังทีมยังต่ำกว่าที่แนะนำ ลองอัปเลเวลหรือใส่อาวุธที่หน้า TEAM</p>'}
            <p class="m-note">เด็ค: ${P.activeSave() ? `<b class="sd-on">${UI.esc(P.activeSave().name)}</b>` : 'การ์ดเริ่มต้น (ใช้ Save Data ได้ที่หน้า TEAM)'}</p>
          </div>
          <div class="si-col">
            <h3>รางวัลเมื่อชนะ</h3>
            <ul class="loot-list">
              <li>${icon('crystal')}<span>คริสตัล <b>+${st.crystals}</b>${stageSel > p.bossCleared ? ` <em>ผ่านครั้งแรก +${R.firstClear}</em>` : ''}</span></li>
              <li class="core">${icon('core')}<span>หัวใจปีศาจ <b>+${st.cores}</b> <small>ใช้ทะลวงขีดจำกัดเลเวล</small></span></li>
              <li>${icon('w_edge')}<span>อาวุธ 1 ชิ้น <small>(${Math.round(R.extraWeaponChance * 100)}% ได้ชิ้นที่ 2)</small><br>
                <span class="odds-row"><i class="r">R ${st.odds.R}%</i><i class="sr">SR ${st.odds.SR}%</i><i class="ssr">SSR ${st.odds.SSR}%</i></span></span></li>
            </ul>
          </div>
        </section>
        <div class="raid-go">
          <button class="btn primary big" data-act="raid-go"${p.team.length ? '' : ' disabled'}>${p.team.length ? `ท้าทายด่าน ${stageSel}` : 'ต้องมีตัวละครก่อน'}</button>
        </div>
      </main>`);
    if (window.ERArt3D && window.ERArt3D.ready) window.ERArt3D.mount(document.getElementById('raid-stage'), boss.id, 'clear');
  };
  on.raid = () => {
    if (!P.data.team.length) { UI.toast('ยังไม่มีตัวละคร ไปสุ่มที่ SUMMON ก่อน'); UI.showSummon(); return; }
    UI.showRaid();
  };
  on.stage = (el) => { stageSel = +el.dataset.s; UI.showRaid(); };
  on['raid-go'] = () => UI.battle.startBoss(stageSel);

  /** Called by the battle screen when a boss fight ends. */
  UI.showLoot = (stage, loot) => {
    const weapons = loot.weapons.map((w) => `<li class="loot-w r-${w.rarity.toLowerCase()}">${UI.weaponIcon(w)}<span><b>${UI.weaponName(w)}</b> ${UI.rar(w.rarity)}<small>${UI.weaponStats(w)}</small>${w.autoSalvaged ? `<em>คลังเต็ม แยกชิ้นอัตโนมัติ +${w.autoSalvaged}</em>` : ''}</span></li>`).join('');
    UI.modal(`<div class="result ${loot.win ? 'win' : 'lose'}">
        <h2>${loot.win ? 'VICTORY' : 'DEFEAT'}</h2>
        <p class="m-sub">${loot.win ? `ปราบ Malvoth ด่าน ${stage} สำเร็จ${loot.firstClear ? ' · ผ่านครั้งแรก!' : ''}` : 'ลองอัปเลเวล ใส่อาวุธ หรือจัดทีมใหม่แล้วกลับมาสู้อีกครั้ง'}</p>
        <ul class="loot-list big">
          <li>${icon('crystal')}<span>คริสตัล <b>+${loot.crystals}</b></span></li>
          ${loot.cores ? `<li class="core">${icon('core')}<span>หัวใจปีศาจ <b>+${loot.cores}</b></span></li>` : ''}
          ${weapons}
        </ul>
        <div class="m-row center">
          <button class="btn ghost" data-act="res-home">หน้าหลัก</button>
          ${loot.weapons.length ? '<button class="btn ghost" data-act="res-team">ไปใส่อาวุธ</button>' : ''}
          <button class="btn primary" data-act="res-again">${loot.win && stage < D.BOSS_RAID.stages ? 'ด่านถัดไป' : 'สู้อีกครั้ง'}</button>
        </div>
      </div>`, 'locked result-modal');
    if (loot.win && stage === stageSel && stage < D.BOSS_RAID.stages) stageSel = stage + 1;
  };
  UI.raidStage = () => stageSel;
})();
