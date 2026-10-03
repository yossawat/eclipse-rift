/* Eclipse Rift — battle engine.
   Pure and deterministic: every random roll (shuffles, crits, enemy plans)
   comes from the seeded RNG stored in the battle state, so the same seed plus
   the same list of actions always replays the same battle. Online play relies
   on this: both players run the engine and only send actions. No DOM here.

   API
     createBattle(opts) -> { state, events }
       opts.teams  [[memberSpec x1-3], [memberSpec x1-3]]   (see progression.js)
       opts.decks  optional [deck|null, deck|null], deck = [{ card, owner: charId, mods }]
       opts.mods   optional [sideMods|null, sideMods|null]  (Chaos Rift fragments)
       opts.seed, opts.first, opts.pve, opts.stress, opts.names
     legalActions(state)        -> [action]
     applyAction(state, action) -> { ok, events, error }   (mutates state)
     scriptedAction(state)      -> the enemy side's next planned action
   Actions
     { type: 'play',  uid, target: {side, slot} | null }
     { type: 'burst', slot, target: {side, slot} | null }
     { type: 'end' }
     { type: 'forfeit', side } */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
  else root.EREngine = factory(root.ERData);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  const R = D.RULES;
  const DEBUFFS = ['vuln', 'weak', 'poison', 'mark'];
  const TIMED_DEBUFFS = ['vuln', 'weak', 'mark'];
  const NUMERIC = { dmg: 1, block: 1, heal: 1 };

  // ---------- RNG (mulberry32, state lives in the battle) ----------
  function rand(st) {
    let t = (st.rng = (st.rng + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(st, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand(st) * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ---------- helpers ----------
  const other = (s) => 1 - s;
  const refOf = (u) => ({ side: u.side, slot: u.slot });
  const has = (u, k) => (u.st[k] || 0) > 0;
  const alive = (st, s) => st.sides[s].units.filter((u) => u.alive);
  const passiveName = (u) => D.CHARACTERS[u.id].passive.name;
  const isEnemyChar = (c) => !!(c.boss || c.monster);

  function lowest(st, s) {
    let best = null;
    for (const u of alive(st, s)) if (!best || u.hp / u.maxHp < best.hp / best.maxHp) best = u;
    return best;
  }
  function addStatus(u, key, v) {
    u.st[key] = (u.st[key] || 0) + v;
    if (u.st[key] <= 0) delete u.st[key];
  }
  function gainBurst(st, s, n) {
    const side = st.sides[s];
    side.burst = Math.min(R.burstMax, side.burst + Math.max(0, n));
  }

  /** A card instance's effective definition after Epiphany mods. */
  function cardOf(ci) {
    const base = D.CARDS[ci.card];
    if (!ci.mods || !ci.mods.length) return base;
    let cost = base.cost, mult = 1, retain = !!base.retain, linkMult = 1;
    const add = [];
    for (const m of ci.mods) {
      const E = D.EPIPHANY[m];
      if (!E) continue;
      if (E.cost) cost += E.cost;
      if (E.mult) mult *= E.mult;
      if (E.retain) retain = true;
      if (E.linkMult) linkMult = E.linkMult;
      if (E.add) add.push(...E.add);
    }
    const scaleV = (e) => (e.scale ? Object.assign({}, e.scale, { v: Math.round(e.scale.v * mult * 10) / 10 }) : e.scale);
    const effects = base.effects.map((e) => (mult !== 1 && NUMERIC[e.op] ? Object.assign({}, e, { v: Math.round(e.v * mult), scale: scaleV(e) }) : e)).concat(add);
    return Object.assign({}, base, { cost: Math.max(0, cost), effects, retain, linkMult, mods: ci.mods });
  }

  /** Extra amount from an effect's `scale` (e.g. +4 per Mark on the target). */
  function scaleBonus(sc, src, tgt) {
    if (!sc) return 0;
    const u = sc.from === 'self' ? src : tgt;
    if (!u) return 0;
    let n;
    if (sc.key === 'block') n = u.block;
    else if (sc.key === 'debuffs') n = DEBUFFS.filter((k) => u.st[k]).length;
    else n = u.st[sc.key] || 0;
    return n * sc.v;
  }

  /** Damage one hit would deal (before crits and Aim). `tgt` may be null for previews. */
  function calcDamage(src, tgt, base, link) {
    let d = base;
    if (src) d += (src.st.str || 0) + R.momentumDmg * (src.st.momentum || 0);
    d *= 1 + (src ? src.lb : R.linkBonus) * (link || 0);
    if (src) {
      d *= src.outMul || 1;
      if (has(src, 'weak')) d *= 0.75;
      if (src.broken) d *= R.breakdownOut;
    }
    if (tgt) {
      if (has(tgt, 'vuln')) d *= 1.5;
      if (tgt.broken) d *= R.breakdownIn;
      if (src && src.pid === 'duelist' && (has(tgt, 'vuln') || has(tgt, 'mark'))) d *= 1 + src.pv;
    }
    return Math.max(0, Math.round(d));
  }
  /** Block / heal amount after Link and the unit's power. */
  function outAmount(v, src, link) {
    return Math.max(0, Math.round(v * (1 + (src ? src.lb : R.linkBonus) * (link || 0)) * (src ? src.outMul || 1 : 1)));
  }
  /** Link level a card from `owner` would get if played right now. */
  function previewLink(st, s, owner) {
    const side = st.sides[s];
    if (side.scripted || side.lastOwner < 0 || side.lastOwner === owner) return 0;
    return Math.min(R.linkMax, side.link + 1);
  }
  /** Would a card from `owner` count as a follow-up right now? */
  function previewFollow(st, s, owner) {
    const side = st.sides[s];
    return side.lastOwner >= 0 && side.lastOwner !== owner && side.lastKind === 'attack';
  }

  // ---------- stress (Chaos Rift) ----------
  function addStress(st, u, n, ev) {
    if (!u.alive || u.stress == null || n === 0) return;
    const before = u.stress;
    u.stress = Math.max(0, Math.min(100, Math.round(u.stress + n * st.sides[u.side].stressMul)));
    if (u.stress >= 100 && !u.broken) {
      u.broken = R.breakdownCards;
      ev.push({ t: 'breakdown', side: u.side, slot: u.slot });
    } else if (u.stress !== before) {
      ev.push({ t: 'stress', side: u.side, slot: u.slot, stress: u.stress });
    }
  }

  // ---------- core mutations ----------
  function hurt(st, u, amount, ev, info) {
    if (!u.alive) return 0;
    let blocked = 0;
    if (!info.pierce) {
      blocked = Math.min(u.block, amount);
      u.block -= blocked;
    }
    const lost = Math.min(u.hp, amount - blocked);
    u.hp -= lost;
    ev.push({ t: 'damage', side: u.side, slot: u.slot, amount, blocked, lost, kind: info.kind || 'hit', crit: !!info.crit });
    gainBurst(st, u.side, Math.floor(lost * R.burstPerHpLost));
    if (lost > 0) addStress(st, u, lost * R.stressPerHp, ev);
    if (u.hp <= 0) knockOut(st, u, ev);
    else if (u.pid === 'enrage' && !u.enraged && u.hp <= u.maxHp / 2) {
      u.enraged = true;
      st.sides[u.side].bonusAp += 1;
      ev.push({ t: 'passive', side: u.side, slot: u.slot, name: passiveName(u) });
      addStatus(u, 'str', u.pv);
      ev.push({ t: 'status', side: u.side, slot: u.slot, key: 'str', v: u.pv });
    }
    return lost;
  }
  function knockOut(st, u, ev) {
    u.alive = false;
    u.hp = 0;
    u.block = 0;
    u.st = {};
    u.broken = 0;
    const side = st.sides[u.side];
    const keep = [];
    for (const c of side.hand) (c.owner === u.slot ? side.discard : keep).push(c);
    side.hand = keep;
    ev.push({ t: 'ko', side: u.side, slot: u.slot });
    for (const a of alive(st, u.side)) addStress(st, a, R.koStress, ev);
  }
  function healUnit(u, v, ev) {
    if (!u.alive) return;
    const n = Math.min(v, u.maxHp - u.hp);
    u.hp += n;
    ev.push({ t: 'heal', side: u.side, slot: u.slot, amount: n });
  }
  function gainBlock(u, v, ev) {
    if (!u.alive) return;
    u.block += v;
    ev.push({ t: 'block', side: u.side, slot: u.slot, amount: v });
  }
  function draw(st, s, n, ev) {
    const side = st.sides[s];
    let drawn = 0;
    for (let guard = 0; drawn < n && guard < 60; guard++) {
      if (!side.deck.length) {
        if (!side.discard.length) break;
        side.deck = shuffle(st, side.discard);
        side.discard = [];
        ev.push({ t: 'shuffle', side: s });
      }
      const c = side.deck.pop();
      // Cards of a knocked-out character are skipped until they are revived.
      if (!side.units[c.owner].alive || side.hand.length >= 10) {
        side.discard.push(c);
        continue;
      }
      side.hand.push(c);
      drawn++;
    }
    if (drawn) ev.push({ t: 'draw', side: s, n: drawn });
  }

  // ---------- targeting ----------
  /** Valid targets for a target kind. Taunt forces single-target enemy cards. */
  function targetsFor(st, s, kind) {
    if (kind === 'enemy') {
      const foes = alive(st, other(s));
      const taunters = foes.filter((u) => has(u, 'taunt'));
      return (taunters.length ? taunters : foes).map(refOf);
    }
    if (kind === 'ally') return alive(st, s).map(refOf);
    return [null];
  }
  function unitAt(st, ref) {
    if (!ref) return null;
    const sd = st.sides[ref.side];
    const u = sd && sd.units[ref.slot];
    return u && u.alive ? u : null;
  }
  function resolveTo(st, s, src, to, target) {
    switch (to) {
      case 'self': return src.alive ? [src] : [];
      case 'allies': return alive(st, s);
      case 'enemies': return alive(st, other(s));
      case 'lowest': { const u = lowest(st, s); return u ? [u] : []; }
      default: { const u = unitAt(st, target); return u ? [u] : []; }
    }
  }
  function condOk(cond, ctx, t) {
    if (!cond) return true;
    if (cond === 'link2') return ctx.link >= 2;
    if (cond === 'follow') return ctx.follow;
    if (cond === 'marked') return !!(t && has(t, 'mark'));
    return false;
  }

  // ---------- effects ----------
  /** One hit from src: damage, Aim, crit, lifesteal, then the target's counter. */
  function strike(st, src, t, base, link, kind, ev) {
    let d = calcDamage(src, t, base, link);
    if (has(src, 'aim')) { d *= 2; delete src.st.aim; }
    let crit = false;
    if (src.crit > 0 && rand(st) < src.crit) {
      d = Math.round(d * R.critMult);
      crit = true;
    }
    const lost = hurt(st, t, d, ev, { kind, crit });
    if (src.lifesteal > 0 && lost > 0 && src.alive) healUnit(src, Math.max(1, Math.round(lost * src.lifesteal)), ev);
    if (kind !== 'counter' && t.alive && src.alive && t.side !== src.side) {
      const back = (t.st.counter || 0) + (t.pid === 'thorns' ? t.pv : 0) + st.sides[t.side].thorns;
      if (back > 0) {
        ev.push({ t: 'counter', side: t.side, slot: t.slot });
        hurt(st, src, Math.round(back * (t.outMul || 1)), ev, { kind: 'counter' });
      }
    }
  }

  function coveringFire(st, s, src, t, ctx, ev) {
    if (!t.alive || !has(t, 'mark') || src.pid === 'covering_fire') return;
    if (ctx.kind !== 'attack' && ctx.kind !== 'burst') return;
    const key = t.side + ':' + t.slot;
    if (ctx.assisted.indexOf(key) >= 0) return;
    const rin = st.sides[s].units.find((u) => u.alive && u.pid === 'covering_fire');
    if (!rin) return;
    ctx.assisted.push(key);
    ev.push({ t: 'assist', side: s, slot: rin.slot, target: refOf(t) });
    strike(st, rin, t, rin.pv, 0, 'assist', ev);
  }

  function runEffects(st, s, src, effects, target, ctx, ev) {
    const cardTarget = unitAt(st, target);
    for (const e of effects) {
      if (st.over) return;
      const list = resolveTo(st, s, src, e.to, target);
      const mult = ctx.mult || 1;
      const scaleUnit = (t) => (e.to === 'target' || e.to === 'enemies' ? t : cardTarget);
      switch (e.op) {
        case 'dmg':
          for (const t of list) {
            if (!condOk(e.cond, ctx, t)) continue;
            for (let h = 0; h < (e.hits || 1) && t.alive; h++) {
              let base = e.v + scaleBonus(e.scale, src, t) + (e.execute && t.hp < t.maxHp * 0.5 ? e.execute : 0);
              base = Math.round(base * mult);
              strike(st, src, t, base, ctx.link, ctx.kind, ev);
            }
            coveringFire(st, s, src, t, ctx, ev);
          }
          break;
        case 'block':
          for (const t of list) {
            if (!condOk(e.cond, ctx, cardTarget)) continue;
            gainBlock(t, outAmount((e.v + scaleBonus(e.scale, src, scaleUnit(t))) * mult, src, ctx.link), ev);
          }
          break;
        case 'heal':
          for (const t of list) {
            if (!condOk(e.cond, ctx, cardTarget)) continue;
            healUnit(t, outAmount((e.v + scaleBonus(e.scale, src, scaleUnit(t))) * mult, src, ctx.link), ev);
          }
          break;
        case 'status':
          for (const t of list) {
            if (!condOk(e.cond, ctx, e.to === 'target' ? t : cardTarget)) continue;
            addStatus(t, e.key, e.v);
            ev.push({ t: 'status', side: t.side, slot: t.slot, key: e.key, v: e.v });
          }
          break;
        case 'clear':
          for (const t of list) { if (t.st[e.key]) { delete t.st[e.key]; ev.push({ t: 'clear', side: t.side, slot: t.slot, key: e.key }); } }
          break;
        case 'mul':
          for (const t of list) {
            if (!t.st[e.key]) continue;
            const add = Math.round(t.st[e.key] * (e.v - 1));
            addStatus(t, e.key, add);
            ev.push({ t: 'status', side: t.side, slot: t.slot, key: e.key, v: add });
          }
          break;
        case 'cleanse':
          for (const t of list) {
            for (const k of DEBUFFS) delete t.st[k];
            ev.push({ t: 'cleanse', side: t.side, slot: t.slot });
          }
          break;
        case 'draw':
          if (condOk(e.cond, ctx, cardTarget)) draw(st, s, e.v, ev);
          break;
        case 'ap':
          if (condOk(e.cond, ctx, cardTarget)) {
            st.sides[s].ap += e.v;
            ev.push({ t: 'ap', side: s, v: e.v });
          }
          break;
        case 'revive': {
          const dead = st.sides[s].units.find((u) => !u.alive);
          if (dead) {
            dead.alive = true;
            dead.hp = Math.max(1, Math.round(dead.maxHp * e.pct));
            dead.block = 0;
            dead.st = {};
            ev.push({ t: 'revive', side: s, slot: dead.slot, hp: dead.hp });
          }
          break;
        }
      }
    }
  }

  // ---------- enemy planning ----------
  /** Enemies choose next turn's moves now and announce them (INTENT). */
  function planEnemies(st, s, ev) {
    const side = st.sides[s];
    side.hand = [];
    const foes = alive(st, other(s));
    for (const u of side.units) {
      if (!u.alive) continue;
      const c = D.CHARACTERS[u.id];
      const moves = c.moves;
      let last = u.lastMove || null;
      for (let i = 0; i < (c.acts || 1); i++) {
        let pool = moves.filter((m) => m !== last);
        if (!pool.length) pool = moves;
        const card = pool[Math.floor(rand(st) * pool.length)];
        last = card;
        side.hand.push({ uid: ++st.uid, card, owner: u.slot, tgt: D.CARDS[card].target === 'enemy' && foes.length ? foes[Math.floor(rand(st) * foes.length)].slot : null });
      }
      u.lastMove = last;
    }
    ev.push({ t: 'intent', side: s });
  }
  /** Where a planned card will actually land right now (taunt and deaths redirect it). */
  function intentTarget(st, s, ci) {
    if (D.CARDS[ci.card].target !== 'enemy') return null;
    const valid = targetsFor(st, s, 'enemy');
    if (!valid.length) return null;
    const planned = valid.find((r) => r.slot === ci.tgt);
    if (planned) return planned;
    let best = valid[0];
    for (const r of valid) {
      if (st.sides[r.side].units[r.slot].hp < st.sides[best.side].units[best.slot].hp) best = r;
    }
    return best;
  }
  function scriptedAction(st) {
    const s = st.active;
    const side = st.sides[s];
    for (const ci of side.hand) {
      const card = D.CARDS[ci.card];
      if (card.cost > side.ap || !side.units[ci.owner].alive) continue;
      const target = intentTarget(st, s, ci);
      if (card.target === 'enemy' && !target) continue;
      return { type: 'play', uid: ci.uid, target };
    }
    return { type: 'end' };
  }

  // ---------- turn flow ----------
  function startTurn(st, s, ev, opening) {
    const side = st.sides[s];
    const first = side.turns === 0;
    st.active = s;
    side.ap = (opening ? R.openingAp : R.maxAp) + side.bonusAp + (first ? side.mods.ap1 || 0 : 0);
    side.link = 0;
    side.lastOwner = -1;
    side.lastKind = null;
    ev.push({ t: 'turn', side: s, round: st.round });
    for (const u of side.units) {
      if (!u.alive) continue;
      u.block = 0;
      if (u.st.taunt) addStatus(u, 'taunt', -1);
      delete u.st.counter;
      if (u.st.regen) {
        healUnit(u, u.st.regen, ev);
        addStatus(u, 'regen', -1);
      }
      if (u.st.poison) {
        const p = u.st.poison;
        addStatus(u, 'poison', -1);
        hurt(st, u, p, ev, { kind: 'poison', pierce: true });
      }
    }
    if (checkOver(st, ev)) return;
    if (first && side.mods.startBlock) for (const u of alive(st, s)) gainBlock(u, side.mods.startBlock, ev);
    for (const u of side.units) {
      if (u.alive && u.pid === 'iron_oath') {
        const t = lowest(st, s);
        ev.push({ t: 'passive', side: s, slot: u.slot, name: passiveName(u) });
        gainBlock(t, outAmount(u.pv, u, 0), ev);
      }
    }
    if (!side.scripted) draw(st, s, (opening ? R.openingHand : R.handSize) + (first ? side.mods.draw1 || 0 : 0), ev);
    side.turns++;
  }

  function endTurn(st, ev) {
    const s = st.active;
    const side = st.sides[s];
    const keep = [];
    for (const ci of side.hand) (cardOf(ci).retain && !side.scripted ? keep : side.discard).push(ci);
    side.hand = keep;
    ev.push({ t: 'endturn', side: s });
    for (const u of side.units) {
      if (!u.alive) continue;
      delete u.st.momentum;
      if (u.pid === 'grace') {
        const t = lowest(st, s);
        if (t && t.hp < t.maxHp) {
          ev.push({ t: 'passive', side: s, slot: u.slot, name: passiveName(u) });
          healUnit(t, outAmount(u.pv, u, 0), ev);
        }
      } else if (u.pid === 'abyss_echo') {
        const foes = alive(st, other(s)).filter((f) => DEBUFFS.some((k) => f.st[k]));
        if (foes.length) {
          ev.push({ t: 'passive', side: s, slot: u.slot, name: passiveName(u) });
          for (const f of foes) {
            const n = DEBUFFS.filter((k) => f.st[k]).length;
            hurt(st, f, Math.round(u.pv * n * (u.outMul || 1)), ev, { kind: 'echo' });
          }
        }
      }
    }
    for (const u of side.units) {
      if (u.alive) for (const k of TIMED_DEBUFFS) if (u.st[k]) addStatus(u, k, -1);
    }
    if (checkOver(st, ev)) return;
    if (side.scripted) planEnemies(st, s, ev);
    if (s !== st.first) {
      st.round++;
      if (st.round > R.roundLimit) return timeUp(st, ev);
    }
    startTurn(st, other(s), ev, false);
  }

  function checkOver(st, ev) {
    if (st.over) return true;
    const wiped = st.sides.map((sd) => sd.units.every((u) => !u.alive));
    if (!wiped[0] && !wiped[1]) return false;
    st.over = true;
    st.reason = 'ko';
    st.winner = wiped[0] && wiped[1] ? 'draw' : wiped[0] ? 1 : 0;
    ev.push({ t: 'over', winner: st.winner, reason: st.reason });
    return true;
  }
  function timeUp(st, ev) {
    const pct = st.sides.map((sd) => {
      let hp = 0, max = 0;
      for (const u of sd.units) { hp += u.hp; max += u.maxHp; }
      return hp / max;
    });
    st.over = true;
    st.reason = 'timeout';
    // Against monsters and bosses, running out the clock is a loss.
    if (st.pve) st.winner = 1;
    else st.winner = Math.abs(pct[0] - pct[1]) < 1e-9 ? 'draw' : pct[0] > pct[1] ? 0 : 1;
    ev.push({ t: 'over', winner: st.winner, reason: st.reason });
  }

  // ---------- actions ----------
  function playCard(st, a, ev) {
    const s = st.active;
    const side = st.sides[s];
    const idx = side.hand.findIndex((c) => c.uid === a.uid);
    const ci = side.hand[idx];
    const card = cardOf(ci);
    const src = side.units[ci.owner];
    side.ap -= card.cost;
    side.hand.splice(idx, 1);

    // Link: alternate characters to chain, repeat the same one and it breaks.
    const follow = side.lastOwner >= 0 && side.lastOwner !== ci.owner && side.lastKind === 'attack';
    if (!side.scripted) {
      if (side.lastOwner >= 0 && side.lastOwner !== ci.owner) {
        side.link = Math.min(R.linkMax, side.link + 1);
        ev.push({ t: 'link', side: s, level: side.link });
      } else if (side.lastOwner === ci.owner && side.link) {
        side.link = 0;
        ev.push({ t: 'linkbreak', side: s });
      }
    }
    side.lastOwner = ci.owner;
    side.lastKind = card.type;

    ev.push({ t: 'play', side: s, uid: ci.uid, card: ci.card, mods: ci.mods || null, owner: ci.owner, target: a.target || null, link: side.link, follow });
    const mult = card.linkMult > 1 && side.link >= 2 ? card.linkMult : 1;
    runEffects(st, s, src, card.effects, a.target, { link: side.link, kind: card.type, assisted: [], follow, mult }, ev);
    if (!side.scripted) (card.exhaust ? side.exhaust : side.discard).push(ci);
    gainBurst(st, s, R.burstPerCard + R.burstPerLink * side.link);
    if (src.broken && src.alive) {
      src.broken--;
      if (!src.broken) {
        src.stress = R.recoverStress;
        gainBurst(st, s, R.recoverBurst);
        ev.push({ t: 'recover', side: s, slot: src.slot });
      }
    }
    checkOver(st, ev);
  }

  function useBurst(st, a, ev) {
    const s = st.active;
    const side = st.sides[s];
    const u = side.units[a.slot];
    const b = D.CHARACTERS[u.id].burst;
    side.burst = 0;
    ev.push({ t: 'burst', side: s, slot: a.slot, id: u.id, target: a.target || null });
    runEffects(st, s, u, b.effects, a.target, { link: 0, kind: 'burst', assisted: [], follow: false }, ev);
    checkOver(st, ev);
  }

  function legalActions(st) {
    if (st.over) return [];
    const s = st.active;
    const side = st.sides[s];
    const acts = [];
    for (const ci of side.hand) {
      const card = cardOf(ci);
      if (card.cost > side.ap || !side.units[ci.owner].alive) continue;
      for (const t of targetsFor(st, s, card.target)) acts.push({ type: 'play', uid: ci.uid, target: t });
    }
    if (side.burst >= R.burstMax) {
      for (const u of side.units) {
        const b = D.CHARACTERS[u.id].burst;
        if (!u.alive || !b) continue;
        for (const t of targetsFor(st, s, b.target)) acts.push({ type: 'burst', slot: u.slot, target: t });
      }
    }
    acts.push({ type: 'end' });
    return acts;
  }

  function sameRef(a, b) {
    if (!a || !b) return !a && !b;
    return a.side === b.side && a.slot === b.slot;
  }
  function sameAction(a, b) {
    return a.type === b.type && (a.uid || 0) === (b.uid || 0) && (a.slot == null ? -1 : a.slot) === (b.slot == null ? -1 : b.slot) && sameRef(a.target, b.target);
  }

  /** Validates against legalActions, so a referee never has to trust a client. */
  function applyAction(st, action) {
    const ev = [];
    if (st.over) return { ok: false, error: 'การต่อสู้จบแล้ว', events: ev };
    if (action.type === 'forfeit') {
      if (action.side !== 0 && action.side !== 1) return { ok: false, error: 'ต้องระบุฝ่ายที่ยอมแพ้', events: ev };
      st.over = true;
      st.reason = 'forfeit';
      st.winner = other(action.side);
      ev.push({ t: 'over', winner: st.winner, reason: st.reason });
      return { ok: true, events: ev };
    }
    if (action.side != null && action.side !== st.active) return { ok: false, error: 'ยังไม่ถึงเทิร์นของคุณ', events: ev };
    if (!legalActions(st).some((a) => sameAction(a, action))) return { ok: false, error: 'ใช้แบบนี้ไม่ได้', events: ev };
    if (action.type === 'play') playCard(st, action, ev);
    else if (action.type === 'burst') useBurst(st, action, ev);
    else endTurn(st, ev);
    return { ok: true, events: ev };
  }

  function createBattle(opts) {
    const pve = !!opts.pve;
    const st = { rng: opts.seed >>> 0 || 1, round: 1, active: 0, first: 0, over: false, winner: null, reason: null, uid: 0, pve, sides: [] };
    opts.teams.forEach((team, s) => {
      const mods = (opts.mods && opts.mods[s]) || {};
      const side = {
        name: (opts.names && opts.names[s]) || 'Side ' + (s + 1),
        units: [], deck: [], hand: [], discard: [], exhaust: [],
        ap: 0, bonusAp: 0, burst: 0, link: 0, lastOwner: -1, lastKind: null, scripted: false, turns: 0,
        mods, thorns: mods.thorns || 0, stressMul: mods.stressMul || 1,
      };
      let startBurst = mods.burst || 0;
      team.forEach((m, slot) => {
        const c = D.CHARACTERS[m.id];
        const maxHp = Math.round(c.hp * (m.hpMul || 1));
        const u = {
          id: c.id, pid: c.passive.id, pv: m.pv != null ? m.pv : c.passive.v, side: s, slot,
          hp: m.hp != null ? Math.max(1, Math.min(maxHp, m.hp)) : maxHp, maxHp, block: 0, alive: true,
          lv: m.lv || 1, awk: m.awk || 0, outMul: m.outMul || 1, crit: (m.crit || 0) + (mods.crit || 0),
          lifesteal: m.lifesteal || 0, lb: R.linkBonus + (mods.linkBonus || 0), st: {},
          stress: opts.stress && !isEnemyChar(c) ? m.stress || 0 : null, broken: 0,
        };
        if (u.stress != null && u.stress >= 100) u.broken = R.breakdownCards;
        if (mods.str) u.st.str = mods.str;
        side.units.push(u);
        if (isEnemyChar(c)) side.scripted = true;
        startBurst += m.startBurst || 0;
        if (!opts.decks || !opts.decks[s]) {
          if (!isEnemyChar(c)) for (const cardId of m.deck || c.deck) side.deck.push({ uid: ++st.uid, card: cardId, owner: slot });
        }
      });
      if (opts.decks && opts.decks[s]) {
        const slotOf = {};
        side.units.forEach((u) => { slotOf[u.id] = u.slot; });
        for (const d of opts.decks[s]) {
          if (slotOf[d.owner] == null) continue;
          side.deck.push({ uid: ++st.uid, card: d.card, owner: slotOf[d.owner], mods: d.mods && d.mods.length ? d.mods.slice() : undefined, ref: d.uid });
        }
      }
      side.burst = Math.min(R.burstMax, startBurst);
      shuffle(st, side.deck);
      st.sides.push(side);
    });
    st.first = opts.first != null ? opts.first : rand(st) < 0.5 ? 0 : 1;
    if (!pve) gainBurst(st, other(st.first), R.secondBurst);
    const ev = [];
    st.sides.forEach((side, s) => { if (side.scripted) planEnemies(st, s, ev); });
    startTurn(st, st.first, ev, !pve);
    return { state: st, events: ev };
  }

  /** What one player is allowed to see (opponent's hand and decks hidden). */
  function viewFor(st, s) {
    const v = clone(st);
    const o = v.sides[other(s)];
    o.hand = o.hand.map(() => null);
    o.deck = o.deck.length;
    v.sides[s].deck = v.sides[s].deck.length;
    delete v.rng;
    return v;
  }

  function clone(st) {
    return JSON.parse(JSON.stringify(st));
  }

  return { createBattle, applyAction, legalActions, scriptedAction, intentTarget, targetsFor, calcDamage, outAmount, previewLink, previewFollow, scaleBonus, cardOf, viewFor, clone, DEBUFFS };
});
