/* Eclipse Rift — progression math: level, Awakening, weapons and boss stages.
   Turns a player's saved character into the "member spec" the battle engine
   takes. Pure functions only (random rolls take a rnd() you pass in), so a
   server can run the exact same rules. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
  else root.ERProg = factory(root.ERData);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  const P = D.PROGRESSION;
  const r3 = (x) => Math.round(x * 1000) / 1000;

  const capOf = (asc) => P.caps[Math.min(asc || 0, P.caps.length - 1)];
  const levelCost = (lv) => P.levelCostBase + P.levelCostStep * lv;
  const ascendCost = (asc) => P.ascendCores[asc] || null;

  /** Cost in crystals to go from `from` to `to`. */
  function levelRangeCost(from, to) {
    let total = 0;
    for (let lv = from; lv < to; lv++) total += levelCost(lv);
    return total;
  }

  /** Battle member spec for one character. entry = { lv, awk }; weapon = saved weapon or null. */
  function buildMember(id, entry, weapon) {
    const c = D.CHARACTERS[id];
    const lv = (entry && entry.lv) || 1;
    const awk = (entry && entry.awk) || 0;
    let hpMul = 1 + P.levelStep * (lv - 1);
    let outMul = hpMul;
    let crit = 0, lifesteal = 0, startBurst = 0;
    let deck = c.deck.slice();
    let pv = c.passive.v;
    for (const a of (c.awakening || []).slice(0, awk)) {
      if (a.type === 'stat') { hpMul += a.v; outMul += a.v; }
      else if (a.type === 'upgrade') deck = deck.map((k) => (k === a.card ? a.card + '_plus' : k));
      else if (a.type === 'passive') pv = a.v;
      else if (a.type === 'burst') startBurst += a.v;
    }
    if (weapon) {
      const s = weapon.stats;
      hpMul += s.hp || 0;
      outMul += s.out || 0;
      crit += s.crit || 0;
      lifesteal += s.lifesteal || 0;
      startBurst += s.burst || 0;
    }
    return { id, lv, awk, hpMul: r3(hpMul), outMul: r3(outMul), crit: r3(crit), lifesteal: r3(lifesteal), startBurst, deck, pv };
  }
  const baseMember = (id) => buildMember(id, { lv: 1, awk: 0 }, null);

  /** One number to compare teams by (shown as "พลังทีม"). */
  function power(spec) {
    const c = D.CHARACTERS[spec.id];
    return Math.round(c.hp * spec.hpMul * 2 + 300 * spec.outMul * (1 + 0.5 * spec.crit + 0.4 * spec.lifesteal) + 2 * (spec.startBurst || 0) + 12 * (spec.awk || 0));
  }
  const teamPower = (specs) => specs.reduce((t, s) => t + power(s), 0);

  // ---------- boss raid ----------
  function bossStage(stage) {
    const B = D.BOSS_RAID;
    return {
      stage,
      hpMul: r3(1 + B.hpStep * (stage - 1)),
      outMul: r3(1 + B.outStep * (stage - 1)),
      crystals: B.crystalBase + B.crystalStep * stage,
      cores: B.cores[stage - 1] || 1,
      recommended: B.recommended[stage - 1],
      odds: rarityWeights(stage),
    };
  }
  function bossMember(stage) {
    const s = bossStage(stage);
    const c = D.CHARACTERS[D.BOSS_RAID.boss];
    return { id: c.id, lv: stage, hpMul: s.hpMul, outMul: s.outMul };
  }
  /** Percent chance of each weapon rarity at a stage. */
  function rarityWeights(stage) {
    const SSR = Math.round(3 + 2.5 * stage);
    const R = Math.max(0, 70 - 7 * stage);
    return { R, SR: 100 - R - SSR, SSR };
  }
  function rollWeapon(stage, rnd) {
    const w = rarityWeights(stage);
    const x = rnd() * 100;
    const rarity = x < w.SSR ? 'SSR' : x < w.SSR + w.SR ? 'SR' : 'R';
    const pool = Object.keys(D.WEAPONS).filter((k) => rarity === 'SSR' || !D.WEAPONS[k].ssrOnly);
    const tpl = pool[Math.floor(rnd() * pool.length)];
    const mult = D.WEAPON_RARITY[rarity].mult;
    const stats = {};
    for (const [k, v] of Object.entries(D.WEAPONS[tpl].stats)) {
      const val = v * mult * (0.85 + 0.3 * rnd());
      stats[k] = k === 'burst' ? Math.round(val) : r3(val);
    }
    return { tpl, rarity, stats };
  }
  function weaponScore(w) {
    const s = w.stats;
    return (s.out || 0) * 100 + (s.hp || 0) * 60 + (s.crit || 0) * 70 + (s.lifesteal || 0) * 50 + (s.burst || 0) * 0.6;
  }

  /** The deck a team fights with when a Save Data chip is equipped.
      A save stores changes (cards added, Epiphanies, removals), applied on top of
      the team's current starter deck so later Awakening upgrades still count. */
  function deckWithSave(specs, save) {
    const deck = [];
    for (const s of specs) for (const card of s.deck) deck.push({ card, owner: s.id, mods: [] });
    if (!save) return deck;
    const base = (id) => id.replace(/_plus$/, '');
    const find = (owner, card) => deck.findIndex((d) => d.owner === owner && base(d.card) === base(card) && !d.mods.length);
    for (const r of save.remove || []) { const i = find(r.owner, r.card); if (i >= 0) deck.splice(i, 1); }
    for (const e of save.epi || []) { const i = find(e.owner, e.card); if (i >= 0) deck[i].mods = [e.mod]; }
    for (const a of save.add || []) if (specs.some((s) => s.id === a.owner)) deck.push({ card: a.card, owner: a.owner, mods: (a.mods || []).slice() });
    return deck;
  }

  return { deckWithSave, buildMember, baseMember, power, teamPower, capOf, levelCost, levelRangeCost, ascendCost, bossStage, bossMember, rarityWeights, rollWeapon, weaponScore };
});
