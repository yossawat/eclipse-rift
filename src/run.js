/* Eclipse Rift — Chaos Rift: the roguelike run.
   Two zones of branching nodes (battle, elite, unknown, rest, shop, treasure)
   that end in a boss. HP and Stress carry between fights, the deck grows from
   card rewards, cards can gain one Epiphany, and Fragments give run-long
   passives. Pure logic with its own seeded RNG; the UI and the battle engine
   sit on top of it. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'), require('./progression.js'));
  else root.ERRun = factory(root.ERData, root.ERProg);
})(typeof self !== 'undefined' ? self : this, function (D, G) {
  'use strict';

  const CH = D.CHAOS;

  function rnd(run) {
    let t = (run.rng = (run.rng + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const pick = (run, arr) => arr[Math.floor(rnd(run) * arr.length)];
  const between = (run, [a, b]) => a + Math.floor(rnd(run) * (b - a + 1));
  const maxHpOf = (spec) => Math.round(D.CHARACTERS[spec.id].hp * (spec.hpMul || 1));

  // ---------- start ----------
  function newRun(o) {
    const run = {
      v: 1, rng: o.seed >>> 0 || 1, level: o.level || 1, zone: 0, pos: null,
      credits: 0, fragments: [], deckUid: 0, cleared: 0, status: 'map', pending: null, result: null,
      team: o.team.map((spec) => ({ id: spec.id, spec, hp: maxHpOf(spec), maxHp: maxHpOf(spec), stress: 0 })),
      deck: [], removedThisShop: false,
    };
    for (const spec of o.team) for (const card of spec.deck) run.deck.push({ uid: ++run.deckUid, card, owner: spec.id, mods: [] });
    run.map = genMap(run, 0);
    return run;
  }

  // ---------- map ----------
  function nodeType(run, f) {
    if (f === 0) return 'battle';
    if (f === CH.floors - 2) return 'rest';
    const w = Object.assign({}, CH.nodeWeights);
    if (f < 2) w.elite = 0;
    if (f === 1) w.shop = 0;
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    let x = rnd(run) * total;
    for (const [k, v] of Object.entries(w)) { if ((x -= v) < 0) return k; }
    return 'battle';
  }
  function genMap(run, zone) {
    const floors = [];
    const L = CH.lanes;
    for (let f = 0; f < CH.floors; f++) {
      const row = [];
      if (f === CH.floors - 1) row.push({ id: `${zone}-${f}-1`, f, lane: 1, type: 'boss', next: [] });
      else {
        const lanes = [];
        for (let l = 0; l < L; l++) if (f === 0 || f === CH.floors - 2 || rnd(run) < 0.8) lanes.push(l);
        while (lanes.length < 2) { const l = Math.floor(rnd(run) * L); if (lanes.indexOf(l) < 0) lanes.push(l); }
        lanes.sort();
        for (const l of lanes) row.push({ id: `${zone}-${f}-${l}`, f, lane: l, type: nodeType(run, f), next: [] });
      }
      floors.push(row);
    }
    // Links: each node goes to 1-2 nodes one floor up within one lane; every node gets a parent.
    for (let f = 0; f < floors.length - 1; f++) {
      const up = floors[f + 1];
      for (const n of floors[f]) {
        const near = up.filter((u) => Math.abs(u.lane - n.lane) <= 1 || up.length === 1);
        const cands = near.length ? near : [up.reduce((a, b) => (Math.abs(b.lane - n.lane) < Math.abs(a.lane - n.lane) ? b : a))];
        const count = Math.min(cands.length, rnd(run) < 0.45 ? 2 : 1);
        const chosen = cands.slice().sort(() => rnd(run) - 0.5).slice(0, count);
        for (const c of chosen) if (n.next.indexOf(c.id) < 0) n.next.push(c.id);
      }
      for (const u of up) {
        if (floors[f].some((n) => n.next.indexOf(u.id) >= 0)) continue;
        const from = floors[f].reduce((a, b) => (Math.abs(b.lane - u.lane) < Math.abs(a.lane - u.lane) ? b : a));
        from.next.push(u.id);
      }
    }
    return { zone, floors };
  }
  const nodeById = (run, id) => {
    for (const row of run.map.floors) for (const n of row) if (n.id === id) return n;
    return null;
  };
  function available(run) {
    if (run.status !== 'map') return [];
    if (!run.pos) return run.map.floors[0].map((n) => n.id);
    const cur = nodeById(run, run.pos);
    return cur ? cur.next.slice() : [];
  }

  // ---------- entering nodes ----------
  function enter(run, id) {
    if (available(run).indexOf(id) < 0) return { ok: false, error: 'ไปทางนั้นไม่ได้' };
    const node = nodeById(run, id);
    node.visited = true;
    run.pos = id;
    let type = node.type;
    if (type === 'unknown') {
      const x = rnd(run);
      type = x < 0.55 ? 'event' : x < 0.8 ? 'battle' : 'treasure';
      node.revealed = type;
    }
    if (type === 'battle' || type === 'elite' || type === 'boss') {
      run.status = 'battle';
      run.pending = { kind: type, enc: encounter(run, type, node.f) };
    } else if (type === 'event') {
      run.status = 'event';
      run.pending = { kind: 'event', id: pick(run, D.EVENTS).id };
    } else if (type === 'rest') {
      run.status = 'rest';
      run.pending = { kind: 'rest' };
    } else if (type === 'shop') {
      run.status = 'shop';
      run.removedThisShop = false;
      run.pending = { kind: 'shop', stock: genShop(run) };
    } else if (type === 'treasure') {
      const credits = Math.round(between(run, CH.credits.treasure) * creditMul(run));
      const frag = rnd(run) < 0.45 ? randomFragment(run) : null;
      run.credits += credits;
      if (frag) run.fragments.push(frag);
      run.status = 'treasure';
      run.pending = { kind: 'treasure', credits, fragment: frag };
    }
    return { ok: true, type };
  }

  function encounter(run, kind, floor) {
    const Z = CH.zones[run.zone];
    if (kind === 'boss') return Z.boss.slice();
    if (kind === 'elite') return pick(run, Z.elite).slice();
    return pick(run, floor < 3 ? Z.early : Z.late).slice();
  }
  function enemySpecs(run, enc, floor) {
    const lv = run.level - 1;
    const r3 = (x) => Math.round(x * 1000) / 1000;
    return enc.map((id) => {
      // Bosses already have big base HP, so they scale by level only.
      const boss = !!D.CHARACTERS[id].boss;
      const hpMul = boss ? CH.bossHp * (1 + CH.levelHp * lv) : CH.baseHp * (1 + CH.levelHp * lv + CH.zoneHp * run.zone + CH.floorHp * floor);
      const outMul = CH.baseOut * (1 + CH.levelOut * lv + CH.zoneOut * run.zone + CH.floorOut * floor);
      return { id, lv: run.level, hpMul: r3(hpMul), outMul: r3(outMul) };
    });
  }

  /** Battle mods from the run's fragments. */
  function sideMods(run) {
    const m = { stressMul: 1 };
    for (const f of run.fragments) {
      const mods = D.FRAGMENTS[f].mods || {};
      for (const [k, v] of Object.entries(mods)) {
        if (k === 'stressMul') m.stressMul *= v;
        else m[k] = (m[k] || 0) + v;
      }
    }
    return m;
  }
  const runBonus = (run, key, dflt) => run.fragments.reduce((a, f) => {
    const r = D.FRAGMENTS[f].run;
    return r && r[key] != null ? (key === 'creditMul' ? a * r[key] : a + r[key]) : a;
  }, dflt);
  const creditMul = (run) => runBonus(run, 'creditMul', 1);

  /** Everything the engine needs to start the pending fight. */
  function battleSetup(run) {
    const node = nodeById(run, run.pos);
    const floor = node ? node.f : 0;
    return {
      teams: [run.team.map((t) => Object.assign({}, t.spec, { hp: t.hp, stress: t.stress })), enemySpecs(run, run.pending.enc, floor)],
      decks: [run.deck.map((c) => ({ uid: c.uid, card: c.card, owner: c.owner, mods: c.mods })), null],
      mods: [sideMods(run), null],
      stress: true, pve: true, first: 0,
    };
  }

  // ---------- after a fight ----------
  function afterBattle(run, res) {
    const kind = run.pending.kind;
    run.team.forEach((t, i) => {
      const u = res.units[i];
      if (!u) return;
      t.stress = Math.min(100, u.stress);
      if (u.alive) t.hp = u.hp;
      else { t.hp = Math.max(1, Math.round(t.maxHp * 0.15)); t.stress = Math.min(100, t.stress + 20); }
    });
    if (!res.win) {
      run.status = 'over';
      run.result = 'lose';
      run.pending = null;
      return { lose: true };
    }
    run.cleared++;
    const heal = runBonus(run, 'healAfter', 0);
    if (heal) run.team.forEach((t) => { t.hp = Math.min(t.maxHp, t.hp + heal); });
    const range = CH.credits[kind === 'elite' || kind === 'boss' ? kind : 'battle'];
    const credits = Math.round(between(run, range) * creditMul(run));
    run.credits += credits;
    const oddsKey = kind === 'boss' ? 'boss' : kind === 'elite' || run.pending.reward === 'rare' ? 'elite' : 'battle';
    const cards = cardChoices(run, oddsKey, 3, run.pending.reward === 'rare' ? 'rare' : null);
    const fragment = kind === 'elite' || kind === 'boss' ? randomFragment(run) : null;
    if (fragment) run.fragments.push(fragment);
    const after = kind !== 'boss' ? 'map' : run.zone + 1 < CH.zones.length ? 'zone' : 'clear';
    run.status = 'reward';
    run.pending = { kind: 'reward', credits, cards, fragment, after };
    return { credits, cards, fragment, after };
  }

  function takeReward(run, index) {
    const p = run.pending;
    if (!p || p.kind !== 'reward') return;
    if (index != null && p.cards[index]) {
      const c = p.cards[index];
      run.deck.push({ uid: ++run.deckUid, card: c.card, owner: c.owner, mods: c.mods.slice() });
    }
    if (p.after === 'zone') {
      run.zone++;
      run.map = genMap(run, run.zone);
      run.pos = null;
      run.team.forEach((t) => { t.hp = Math.min(t.maxHp, t.hp + Math.round(t.maxHp * CH.zoneHeal)); t.stress = Math.max(0, t.stress - 20); });
      run.status = 'map';
      run.pending = { kind: 'zone' };
    } else if (p.after === 'clear') {
      run.status = 'over';
      run.result = 'clear';
      run.pending = null;
    } else {
      run.status = 'map';
      run.pending = null;
    }
  }

  // ---------- cards ----------
  function teamPool(run, rarity) {
    const out = [];
    for (const t of run.team) for (const id of D.CHARACTERS[t.id].pool) if (!rarity || D.CARDS[id].rarity === rarity) out.push(id);
    return out;
  }
  function rollRarity(run, oddsKey) {
    const o = CH.cardOdds[oddsKey];
    const x = rnd(run) * 100;
    return x < o.epic ? 'epic' : x < o.epic + o.rare ? 'rare' : 'common';
  }
  function epiphanyFor(run, cardId) {
    const card = D.CARDS[cardId];
    // Number-boosting Epiphanies only go on cards that have damage, block or heal numbers.
    const numeric = card.effects.some((e) => (e.op === 'dmg' || e.op === 'block' || e.op === 'heal') && (e.v > 0 || e.scale));
    return Object.keys(D.EPIPHANY).filter((k) => !(k === 'swift' && card.cost === 0) && !((k === 'empower' || k === 'resonant') && !numeric));
  }
  function cardChoices(run, oddsKey, n, minRarity) {
    const out = [];
    for (let i = 0; i < n; i++) {
      let rarity = rollRarity(run, oddsKey);
      if (minRarity === 'rare' && rarity === 'common') rarity = 'rare';
      let pool = teamPool(run, rarity).filter((id) => !out.some((o) => o.card === id));
      if (!pool.length) pool = teamPool(run).filter((id) => !out.some((o) => o.card === id));
      if (!pool.length) break;
      const card = pick(run, pool);
      const mods = rnd(run) < CH.epiphanyChance ? [pick(run, epiphanyFor(run, card))] : [];
      out.push({ card, owner: D.CARDS[card].owner, mods });
    }
    return out;
  }

  /** Three Epiphany choices for a card in the deck (cards hold one Epiphany). */
  function epiphanyOptions(run, uid) {
    const c = run.deck.find((x) => x.uid === uid);
    if (!c || c.mods.length) return [];
    const keys = epiphanyFor(run, c.card).slice();
    const out = [];
    while (out.length < 3 && keys.length) out.push(keys.splice(Math.floor(rnd(run) * keys.length), 1)[0]);
    return out;
  }
  function applyEpiphany(run, uid, mod) {
    const c = run.deck.find((x) => x.uid === uid);
    if (!c || c.mods.length || !D.EPIPHANY[mod]) return false;
    c.mods = [mod];
    return true;
  }
  function removeCard(run, uid) {
    const i = run.deck.findIndex((x) => x.uid === uid);
    if (i < 0 || run.deck.length <= 6) return false;
    run.deck.splice(i, 1);
    return true;
  }

  // ---------- fragments ----------
  function randomFragment(run) {
    const pool = Object.keys(D.FRAGMENTS).filter((k) => run.fragments.indexOf(k) < 0);
    return pool.length ? pick(run, pool) : null;
  }

  // ---------- rest ----------
  function rest(run, choice) {
    if (run.status !== 'rest') return { ok: false };
    if (choice === 'heal') {
      run.team.forEach((t) => { t.hp = Math.min(t.maxHp, t.hp + Math.round(t.maxHp * CH.rest.heal)); t.stress = Math.max(0, t.stress - CH.rest.healStress); });
    } else if (choice === 'meditate') {
      run.team.forEach((t) => { t.stress = Math.max(0, t.stress - CH.rest.meditate); });
    }
    // 'epiphany' is applied with applyEpiphany() by the screen first
    run.status = 'map';
    run.pending = null;
    return { ok: true };
  }

  // ---------- shop ----------
  function genShop(run) {
    const P = CH.shop;
    const cards = cardChoices(run, 'battle', 5, null).map((c) => {
      const r = D.CARDS[c.card].rarity;
      return Object.assign(c, { price: Math.round(P[r] * (0.9 + rnd(run) * 0.2) * (c.mods.length ? 1.25 : 1)), sold: false });
    });
    const frags = [];
    const pool = Object.keys(D.FRAGMENTS).filter((k) => run.fragments.indexOf(k) < 0);
    while (frags.length < 2 && pool.length) frags.push({ id: pool.splice(Math.floor(rnd(run) * pool.length), 1)[0], price: Math.round(P.fragment * (0.9 + rnd(run) * 0.25)), sold: false });
    return { cards, frags, remove: P.remove };
  }
  function buy(run, kind, i) {
    const stock = run.pending && run.pending.stock;
    if (!stock) return { ok: false, error: 'ไม่ได้อยู่ในร้านค้า' };
    const item = kind === 'card' ? stock.cards[i] : stock.frags[i];
    if (!item || item.sold) return { ok: false, error: 'ขายไปแล้ว' };
    if (run.credits < item.price) return { ok: false, error: `เครดิตไม่พอ (ต้องใช้ ${item.price})` };
    run.credits -= item.price;
    item.sold = true;
    if (kind === 'card') run.deck.push({ uid: ++run.deckUid, card: item.card, owner: item.owner, mods: item.mods.slice() });
    else run.fragments.push(item.id);
    return { ok: true };
  }
  function shopRemove(run, uid) {
    const stock = run.pending && run.pending.stock;
    if (!stock || run.removedThisShop) return { ok: false, error: 'ร้านนี้ลบการ์ดได้ครั้งเดียว' };
    if (run.credits < stock.remove) return { ok: false, error: `เครดิตไม่พอ (ต้องใช้ ${stock.remove})` };
    if (!removeCard(run, uid)) return { ok: false, error: 'เด็คต้องเหลืออย่างน้อย 6 ใบ' };
    run.credits -= stock.remove;
    run.removedThisShop = true;
    return { ok: true };
  }
  function leave(run) {
    run.status = 'map';
    run.pending = null;
  }

  // ---------- events ----------
  /** Applies an event choice. Returns follow-ups the screen must handle. */
  function chooseEvent(run, index) {
    const ev = D.EVENTS.find((e) => e.id === run.pending.id);
    const ch = ev && ev.choices[index];
    if (!ch) return { ok: false };
    if (ch.cost && run.credits < ch.cost) return { ok: false, error: `เครดิตไม่พอ (ต้องใช้ ${ch.cost})` };
    if (ch.cost) run.credits -= ch.cost;
    const out = { ok: true, notes: [], next: 'map' };
    for (const fx of ch.fx) {
      if (fx.t === 'stress') { run.team.forEach((t) => { t.stress = Math.max(0, Math.min(100, t.stress + fx.v)); }); out.notes.push(`ความเครียด ${fx.v > 0 ? '+' : ''}${fx.v} ทุกคน`); }
      else if (fx.t === 'heal') { run.team.forEach((t) => { t.hp = Math.min(t.maxHp, t.hp + Math.round(t.maxHp * fx.pct)); }); out.notes.push(`ฟื้นฟู HP ${Math.round(fx.pct * 100)}% ทุกคน`); }
      else if (fx.t === 'hurt') { run.team.forEach((t) => { t.hp = Math.max(1, t.hp - fx.v); }); out.notes.push(`ทุกคนเสีย HP ${fx.v}`); }
      else if (fx.t === 'credits') { run.credits += fx.v; out.notes.push(`ได้ ${fx.v} เครดิต`); }
      else if (fx.t === 'card') {
        const c = cardChoices(run, 'elite', 1, fx.rarity)[0];
        if (c) { run.deck.push({ uid: ++run.deckUid, card: c.card, owner: c.owner, mods: c.mods.slice() }); out.card = c; out.notes.push(`ได้การ์ด ${D.CARDS[c.card].name}`); }
      } else if (fx.t === 'fragment') {
        const f = randomFragment(run);
        if (f) { run.fragments.push(f); out.fragment = f; out.notes.push(`ได้ ${D.FRAGMENTS[f].name}`); }
      } else if (fx.t === 'remove') out.next = 'remove';
      else if (fx.t === 'epiphany') out.next = 'epiphany';
      else if (fx.t === 'fight') {
        out.next = 'battle';
        run.status = 'battle';
        run.pending = { kind: 'battle', enc: fx.enc.slice(), reward: fx.reward };
        return out;
      }
    }
    run.status = out.next === 'map' ? 'map' : 'pick';
    if (out.next === 'map') run.pending = null;
    return out;
  }
  function finishPick(run) {
    run.status = 'map';
    run.pending = null;
  }

  /** Everything the final deck changed compared with the starter decks,
      each with its Faint Memory cost. Used to build a Save Data chip. */
  function saveCandidates(run) {
    const cost = CH.saveData.cost;
    const base = (id) => id.replace(/_plus$/, '');
    const left = [];
    run.team.forEach((t) => t.spec.deck.forEach((card) => left.push({ card, owner: t.id })));
    const items = [];
    for (const c of run.deck) {
      const r = D.CARDS[c.card].rarity;
      const i = r === 'starter' ? left.findIndex((s) => s.owner === c.owner && base(s.card) === base(c.card)) : -1;
      if (i >= 0) {
        left.splice(i, 1);
        if (c.mods.length) items.push({ kind: 'epi', card: c.card, owner: c.owner, mod: c.mods[0], cost: cost.epiphany });
      } else {
        items.push({ kind: 'add', card: c.card, owner: c.owner, mods: c.mods.slice(), cost: (cost[r] || cost.common) + (c.mods.length ? cost.epiphany : 0) });
      }
    }
    for (const s of left) items.push({ kind: 'remove', card: s.card, owner: s.owner, cost: cost.removal });
    return items;
  }
  const memoryCap = (level) => CH.saveData.cap[Math.max(0, Math.min(CH.saveData.cap.length - 1, level - 1))];

  /** Meta rewards for the profile when a run ends. */
  function finalRewards(run) {
    if (run.result === 'clear') {
      const i = run.level - 1;
      return { clear: true, crystals: CH.clear.crystals[i], cores: CH.clear.cores[i], weaponStage: CH.clear.stage[i] };
    }
    return { clear: false, crystals: run.cleared * CH.perNodeCrystals, cores: 0, weaponStage: 0 };
  }

  return {
    saveCandidates, memoryCap, newRun, genMap, nodeById, available, enter, battleSetup, afterBattle, takeReward, epiphanyOptions, applyEpiphany,
    removeCard, rest, buy, shopRemove, leave, chooseEvent, finishPick, finalRewards, sideMods,
  };
});
