/* Eclipse Rift — bot opponent.
   Tries every legal action on a cloned state, scores the result, and plays the
   best one until nothing beats ending the turn. Hard also looks one action
   ahead. The bot only talks to the engine through legalActions/applyAction, the
   same door a human or a network player uses. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.ERAI = factory(root.EREngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  const LEVELS = {
    easy:   { noise: 10, blunder: 0.3,  lookahead: false },
    normal: { noise: 2,  blunder: 0.05, lookahead: false },
    hard:   { noise: 0,  blunder: 0,    lookahead: true },
  };
  // How much a point of Strength is worth on each character (hits per turn, roughly).
  const STR_WEIGHT = { aria: 5, rin: 4, noir: 3, kael: 2, lumi: 1, malvoth: 6 };

  function unitValue(u) {
    if (!u.alive) return 0;
    const s = u.st;
    return 30 + u.hp + Math.min(u.hp, 20) * 0.5
      + Math.min(u.block, 25) * 0.7
      + (s.str || 0) * (STR_WEIGHT[u.id] || 3)
      + (s.taunt ? 3 : 0)
      + (s.momentum || 0) * 2.5
      + (s.counter || 0) * 1.2
      + (s.regen || 0) * 1.8
      + (s.aim ? 7 : 0)
      - (u.broken ? 14 : 0)
      - (u.stress || 0) * 0.08
      - (s.vuln ? 4 + 2 * Math.min(s.vuln, 2) : 0)
      - (s.weak ? 3 + s.weak : 0)
      - (s.poison || 0) * 1.6
      - (s.mark ? 2 + s.mark : 0);
  }

  function evaluate(st, me) {
    if (st.over) return st.winner === me ? 1e5 : st.winner === 'draw' ? 0 : -1e5;
    const mine = st.sides[me];
    const foe = st.sides[1 - me];
    let v = 0;
    for (const u of mine.units) v += unitValue(u);
    for (const u of foe.units) v -= unitValue(u) * 1.05;
    v += mine.burst * 0.12 - foe.burst * 0.1;
    if (st.active === me) v += mine.ap * 1.4 + mine.hand.length * 1.2;
    return v;
  }

  function chooseAction(st, level) {
    // Bosses follow the intents they announced instead of searching.
    if (st.sides[st.active].scripted) return E.scriptedAction(st);
    const L = LEVELS[level] || LEVELS.normal;
    const me = st.active;
    const base = evaluate(st, me);
    const scored = [];
    for (const a of E.legalActions(st)) {
      if (a.type === 'end') continue;
      const c = E.clone(st);
      if (!E.applyAction(c, a).ok) continue;
      let sc = evaluate(c, me);
      if (L.lookahead && !c.over && c.active === me) {
        for (const b of E.legalActions(c)) {
          if (b.type === 'end') continue;
          const c2 = E.clone(c);
          E.applyAction(c2, b);
          sc = Math.max(sc, evaluate(c2, me) - 0.5);
        }
      }
      sc += (Math.random() - 0.5) * 2 * L.noise;
      scored.push({ a, sc });
    }
    const good = scored.filter((x) => x.sc > base + 0.3).sort((x, y) => y.sc - x.sc);
    if (!good.length) return { type: 'end' };
    if (Math.random() < L.blunder) return good[Math.floor(Math.random() * good.length)].a;
    return good[0].a;
  }

  return { chooseAction, evaluate, LEVELS };
});
