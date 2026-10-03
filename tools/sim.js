/* Eclipse Rift — balance simulator (dev only, not loaded by the game).
   Open the game, then in the browser console:
     await import('./tools/sim.js')            // or add a <script> tag
     ERSim.chaos(20, 1, 10, 1)                 // 20 Chaos runs, level 1, team Lv10 A1
     ERSim.pvp(300)                            // bot vs bot, base characters
     ERSim.boss(40, 5, 10)                     // Boss Raid stage 5 with Lv10 teams
   The player side is played by the 'hard' bot, which plays about as well as a
   careful human, so real clear rates should land near these numbers. */
(function () {
  'use strict';
  const E = window.EREngine, AI = window.ERAI, D = window.ERData, G = window.ERProg, RN = window.ERRun;
  const rr = (a) => a[Math.floor(Math.random() * a.length)];
  const seed = () => (Math.random() * 4294967296) >>> 0;
  const team3 = () => D.ROSTER.slice().sort(() => Math.random() - 0.5).slice(0, 3);

  function playOut(state, levels) {
    let n = 0;
    const events = [];
    while (!state.over && n++ < 3000) {
      const r = E.applyAction(state, AI.chooseAction(state, levels[state.active]));
      if (!r.ok) throw new Error('illegal action: ' + r.error);
      events.push(...r.events);
    }
    return events;
  }

  function chaosRun(level, lv, awk) {
    const run = RN.newRun({ level, team: team3().map((id) => G.buildMember(id, { lv, awk }, null)), seed: seed() });
    let breakdowns = 0, diedAt = null;
    for (let steps = 0; run.status !== 'over' && steps < 300; steps++) {
      if (run.status === 'map') RN.enter(run, rr(RN.available(run)));
      else if (run.status === 'battle') {
        const { state } = E.createBattle(Object.assign({ seed: seed() }, RN.battleSetup(run)));
        breakdowns += playOut(state, ['hard', 'normal']).filter((e) => e.t === 'breakdown').length;
        if (state.winner !== 0) diedAt = run.pending.kind + '@zone' + (run.zone + 1);
        RN.afterBattle(run, { win: state.winner === 0, units: state.sides[0].units.map((u) => ({ hp: u.hp, alive: u.alive, stress: u.stress })) });
      } else if (run.status === 'reward') RN.takeReward(run, Math.random() < 0.85 ? Math.floor(Math.random() * run.pending.cards.length) : null);
      else if (run.status === 'rest') {
        const avg = run.team.reduce((a, t) => a + t.hp / t.maxHp, 0) / run.team.length;
        if (avg < 0.6) RN.rest(run, 'heal');
        else if (run.team.some((t) => t.stress > 60)) RN.rest(run, 'meditate');
        else {
          const c = rr(run.deck.filter((x) => !x.mods.length));
          RN.applyEpiphany(run, c.uid, RN.epiphanyOptions(run, c.uid)[0]);
          RN.rest(run, 'epiphany');
        }
      } else if (run.status === 'shop') {
        const st = run.pending.stock;
        st.cards.forEach((c, i) => { if (run.credits >= c.price && Math.random() < 0.5) RN.buy(run, 'card', i); });
        st.frags.forEach((f, i) => { if (run.credits >= f.price) RN.buy(run, 'frag', i); });
        RN.leave(run);
      } else if (run.status === 'treasure') RN.leave(run);
      else if (run.status === 'event') {
        const ev = D.EVENTS.find((e) => e.id === run.pending.id);
        if (!RN.chooseEvent(run, Math.floor(Math.random() * ev.choices.length)).ok) RN.chooseEvent(run, ev.choices.length - 1);
      } else if (run.status === 'pick') {
        const c = rr(run.deck.filter((x) => !x.mods.length));
        if (Math.random() < 0.5) RN.removeCard(run, c.uid);
        else RN.applyEpiphany(run, c.uid, RN.epiphanyOptions(run, c.uid)[0]);
        RN.finishPick(run);
      }
    }
    return { clear: run.result === 'clear', zone: run.zone, breakdowns, diedAt };
  }

  function chaos(N, level, lv, awk) {
    let clear = 0, zone2 = 0, bd = 0;
    const died = {};
    for (let i = 0; i < N; i++) {
      const r = chaosRun(level, lv, awk || 0);
      if (r.clear) clear++;
      if (r.zone >= 1) zone2++;
      bd += r.breakdowns;
      if (r.diedAt) died[r.diedAt] = (died[r.diedAt] || 0) + 1;
    }
    return `Chaos ${level} · Lv${lv} A${awk || 0}: clear ${Math.round((clear / N) * 100)}% · reached zone 2 ${Math.round((zone2 / N) * 100)}% · breakdowns/run ${(bd / N).toFixed(1)} · lost at ${JSON.stringify(died)}`;
  }

  function pvp(N) {
    let first = 0;
    const W = {}, GN = {};
    for (let g = 0; g < N; g++) {
      const teams = [team3().map(G.baseMember), team3().map(G.baseMember)];
      const { state } = E.createBattle({ teams, seed: seed() });
      playOut(state, ['normal', 'normal']);
      if (state.winner === state.first) first++;
      if (state.winner !== 'draw') teams[state.winner].forEach((m) => { W[m.id] = (W[m.id] || 0) + 1; });
      teams.flat().forEach((m) => { GN[m.id] = (GN[m.id] || 0) + 1; });
    }
    return `PvP: first player wins ${Math.round((first / N) * 100)}% · ` + D.ROSTER.map((id) => `${id} ${Math.round(((W[id] || 0) / GN[id]) * 100)}%`).join(', ');
  }

  function boss(N, stage, lv) {
    let w = 0;
    for (let g = 0; g < N; g++) {
      const team = team3().map((id) => G.buildMember(id, { lv, awk: 0 }, null));
      const { state } = E.createBattle({ teams: [team, [G.bossMember(stage)]], seed: seed(), first: 0, pve: true });
      playOut(state, ['hard', 'normal']);
      if (state.winner === 0) w++;
    }
    return `Boss Raid stage ${stage} · Lv${lv}: win ${Math.round((w / N) * 100)}%`;
  }

  window.ERSim = { chaos, chaosRun, pvp, boss };
})();
