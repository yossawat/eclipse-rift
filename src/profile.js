/* Eclipse Rift — player profile: crystals, roster, levels, weapons, boss
   progress and gacha. Saved in this browser only (localStorage). For a real
   release the roster, rolls and drops must live on a server so nobody can
   edit their own save. */
(function (root) {
  'use strict';
  const D = root.ERData;
  const G = root.ERProg;
  const GA = D.GACHA;
  const KEY = 'eclipse-rift:profile:v1';
  const MAX_WEAPONS = 80;

  const fresh = () => ({
    crystals: GA.startCrystals, roster: {}, team: [], pity: 0, pulls: 0,
    wins: 0, losses: 0, seenHelp: false, speed: 1,
    cores: 0, weapons: [], wuid: 0, bossCleared: 0, onlineWins: 0,
    chaosCleared: 0, chaosRuns: 0, art3d: true,
    saves: [], saveUid: 0, activeSave: null,
  });

  function load() {
    let d = fresh();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) d = Object.assign(fresh(), JSON.parse(raw));
    } catch (e) { /* storage blocked: play without saving */ }
    // Saves from the first prototype have no levels or weapon slots yet.
    for (const id of Object.keys(d.roster)) {
      d.roster[id] = Object.assign({ awk: 0, copies: 1, lv: 1, asc: 0, weapon: null }, d.roster[id]);
    }
    return d;
  }
  const data = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  }

  const byRarity = (r) => D.ROSTER.filter((id) => D.CHARACTERS[id].rarity === r);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const weapon = (uid) => data.weapons.find((w) => w.uid === uid) || null;
  const holderOf = (uid) => Object.keys(data.roster).find((id) => data.roster[id].weapon === uid) || null;

  // ---------- gacha ----------
  function rollOne() {
    data.pulls++;
    data.pity++;
    const owned = Object.keys(data.roster);
    const leftInWindow = GA.beginnerPulls - data.pulls;
    let id;
    if (data.pulls <= GA.beginnerPulls && owned.length < 3 && 3 - owned.length > leftInWindow) {
      const missing = D.ROSTER.filter((c) => !data.roster[c]);
      const missingSR = missing.filter((c) => D.CHARACTERS[c].rarity === 'SR');
      id = pick(missingSR.length ? missingSR : missing);
    } else if (data.pity >= GA.pity || Math.random() < GA.ssrRate) {
      id = pick(byRarity('SSR'));
    } else {
      id = pick(byRarity('SR'));
    }
    const rarity = D.CHARACTERS[id].rarity;
    if (rarity === 'SSR') data.pity = 0;

    const entry = data.roster[id];
    const res = { id, rarity, isNew: false, awakened: false, refund: 0 };
    if (!entry) {
      data.roster[id] = { awk: 0, copies: 1, lv: 1, asc: 0, weapon: null };
      res.isNew = true;
    } else {
      entry.copies++;
      if (entry.awk < GA.maxAwakening) { entry.awk++; res.awakened = true; }
      else { data.crystals += GA.dupeRefund; res.refund = GA.dupeRefund; }
    }
    res.awk = data.roster[id].awk;
    return res;
  }

  function summon(n) {
    const cost = n === 10 ? GA.multi : GA.single * n;
    if (data.crystals < cost) return { ok: false, error: `คริสตัลไม่พอ (ต้องใช้ ${cost})` };
    data.crystals -= cost;
    const results = [];
    for (let i = 0; i < n; i++) results.push(rollOne());
    for (const r of results) {
      if (data.team.length < 3 && data.team.indexOf(r.id) < 0) data.team.push(r.id);
    }
    save();
    return { ok: true, results };
  }

  // ---------- team & growth ----------
  function toggleTeam(id) {
    if (!data.roster[id]) return false;
    const i = data.team.indexOf(id);
    if (i >= 0) data.team.splice(i, 1);
    else if (data.team.length < 3) data.team.push(id);
    else return false;
    save();
    return true;
  }

  /** Level up by up to `n` levels, stopping at the cap or when crystals run out. */
  function levelUp(id, n) {
    const e = data.roster[id];
    if (!e) return { ok: false, error: 'ยังไม่มีตัวละครนี้' };
    const cap = G.capOf(e.asc);
    if (e.lv >= cap) return { ok: false, error: e.asc < D.PROGRESSION.caps.length - 1 ? 'ถึงขีดจำกัดแล้ว ต้องทะลวงขีดจำกัดก่อน' : 'เลเวลสูงสุดแล้ว' };
    let gained = 0, spent = 0;
    while (gained < n && e.lv < cap && data.crystals >= G.levelCost(e.lv)) {
      const c = G.levelCost(e.lv);
      data.crystals -= c;
      spent += c;
      e.lv++;
      gained++;
    }
    if (!gained) return { ok: false, error: `คริสตัลไม่พอ (ต้องใช้ ${G.levelCost(e.lv)})` };
    save();
    return { ok: true, gained, spent };
  }

  function ascend(id) {
    const e = data.roster[id];
    const need = G.ascendCost(e.asc);
    if (need == null) return { ok: false, error: 'ทะลวงครบแล้ว' };
    if (e.lv < G.capOf(e.asc)) return { ok: false, error: `ต้องถึง Lv ${G.capOf(e.asc)} ก่อน` };
    if (data.cores < need) return { ok: false, error: `หัวใจปีศาจไม่พอ (ต้องใช้ ${need}) · ฟาร์มได้จากบอส` };
    data.cores -= need;
    e.asc++;
    save();
    return { ok: true, cap: G.capOf(e.asc) };
  }

  function equip(id, uid) {
    const e = data.roster[id];
    if (!e) return false;
    if (uid) {
      const prev = holderOf(uid);
      if (prev && prev !== id) data.roster[prev].weapon = null;
    }
    e.weapon = uid || null;
    save();
    return true;
  }

  function salvage(uid) {
    const w = weapon(uid);
    if (!w) return { ok: false, error: 'ไม่พบอาวุธ' };
    if (holderOf(uid)) return { ok: false, error: 'ถอดอาวุธออกก่อนแยกชิ้น' };
    data.weapons = data.weapons.filter((x) => x.uid !== uid);
    const gain = D.WEAPON_RARITY[w.rarity].salvage;
    data.crystals += gain;
    save();
    return { ok: true, gain };
  }

  /** The battle spec for one owned character (level, Awakening, weapon). */
  function member(id) {
    const e = data.roster[id];
    return G.buildMember(id, e, e && e.weapon ? weapon(e.weapon) : null);
  }
  const teamSpecs = () => data.team.filter((id) => data.roster[id]).map(member);

  // ---------- rewards ----------
  function recordBattle(win, reward) {
    if (win) data.wins++;
    else data.losses++;
    data.crystals += reward;
    save();
  }

  function addWeapon(rolled) {
    if (data.weapons.length >= MAX_WEAPONS) {
      const gain = D.WEAPON_RARITY[rolled.rarity].salvage;
      data.crystals += gain;
      return Object.assign({ autoSalvaged: gain }, rolled);
    }
    const w = Object.assign({ uid: 'w' + ++data.wuid }, rolled);
    data.weapons.push(w);
    return w;
  }

  /** Boss result: rolls loot on a win. Returns what was gained. */
  function bossResult(stage, win) {
    const B = D.BOSS_RAID;
    const st = G.bossStage(stage);
    if (!win) {
      data.losses++;
      data.crystals += B.loseCrystals;
      save();
      return { win: false, crystals: B.loseCrystals, cores: 0, weapons: [], firstClear: false };
    }
    const firstClear = stage > data.bossCleared;
    const crystals = st.crystals + (firstClear ? B.firstClear : 0);
    const weapons = [addWeapon(G.rollWeapon(stage, Math.random))];
    if (Math.random() < B.extraWeaponChance) weapons.push(addWeapon(G.rollWeapon(stage, Math.random)));
    data.crystals += crystals;
    data.cores += st.cores;
    data.wins++;
    if (firstClear) data.bossCleared = stage;
    save();
    return { win: true, crystals, cores: st.cores, weapons, firstClear };
  }

  // ---------- Chaos Rift run (saved separately so a run survives reloads) ----------
  const RUN_KEY = 'eclipse-rift:run:v1';
  function loadRun() {
    try { const raw = localStorage.getItem(RUN_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function saveRun(run) {
    try {
      if (run) localStorage.setItem(RUN_KEY, JSON.stringify(run));
      else localStorage.removeItem(RUN_KEY);
    } catch (e) { /* ignore */ }
  }
  /** Pays out a finished run. Returns what was gained (weapon rolled here). */
  function chaosResult(run, rewards) {
    data.chaosRuns++;
    data.crystals += rewards.crystals;
    data.cores += rewards.cores;
    const out = Object.assign({ weapons: [] }, rewards);
    if (rewards.clear) {
      data.wins++;
      data.chaosCleared = Math.max(data.chaosCleared, run.level);
      out.weapons.push(addWeapon(G.rollWeapon(rewards.weaponStage, Math.random)));
    } else data.losses++;
    save();
    saveRun(null);
    return out;
  }

  // ---------- Save Data (cleared Chaos runs kept as deck changes) ----------
  const teamKey = (ids) => ids.slice().sort().join('+');
  function addSave(save, replaceId) {
    const entry = Object.assign({ id: 's' + ++data.saveUid, createdAt: Date.now() }, save);
    if (replaceId) data.saves = data.saves.filter((s) => s.id !== replaceId);
    data.saves.unshift(entry);
    save_();
    return entry;
  }
  function deleteSave(id) {
    data.saves = data.saves.filter((s) => s.id !== id);
    if (data.activeSave === id) data.activeSave = null;
    save_();
  }
  /** Equip a chip: switches the team to the chip's three characters. */
  function useSave(id) {
    const s = data.saves.find((x) => x.id === id);
    if (!s) return { ok: false, error: 'ไม่พบ Save Data' };
    if (!s.team.every((t) => data.roster[t])) return { ok: false, error: 'ต้องมีตัวละครครบทั้ง 3 ตัวก่อน' };
    data.team = s.team.slice();
    data.activeSave = id;
    save_();
    return { ok: true };
  }
  function unuseSave() { data.activeSave = null; save_(); }
  /** The equipped chip, only while the current team is exactly its team. */
  function activeSave() {
    const s = data.saves.find((x) => x.id === data.activeSave);
    return s && data.team.length === 3 && teamKey(s.team) === teamKey(data.team) ? s : null;
  }
  /** The deck the current team fights with (null = plain starter decks). */
  function activeDeck() {
    const s = activeSave();
    return s ? G.deckWithSave(teamSpecs(), s) : null;
  }
  const save_ = () => save();

  function set(key, value) {
    data[key] = value;
    save();
  }

  function reset() {
    saveRun(null);
    const f = fresh();
    for (const k of Object.keys(data)) delete data[k];
    Object.assign(data, f);
    save();
  }

  root.ERProfile = { data, addSave, deleteSave, useSave, unuseSave, activeSave, activeDeck, teamKey, summon, toggleTeam, levelUp, ascend, equip, salvage, member, teamSpecs, weapon, holderOf, recordBattle, bossResult, loadRun, saveRun, chaosResult, set, save, reset };
})(typeof self !== 'undefined' ? self : this);
