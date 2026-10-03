/* Eclipse Rift — game data: rules, statuses, characters and their card pools,
   monsters, weapons, Chaos Rift (roguelike) content and economy.
   Pure data with no DOM and no randomness. The browser loads it as
   window.ERData; a Node server can require() the same file. Balance the game
   from this file. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RULES = {
    handSize: 5,
    maxAp: 3,
    openingHand: 4,        // PvP: whoever goes first gets a smaller first turn
    openingAp: 3,
    secondBurst: 25,       // PvP: Burst the side going second starts with
    linkMax: 3,
    linkBonus: 0.15,       // +15% damage / block / heal per Link level
    burstMax: 100,
    burstPerCard: 6,
    burstPerLink: 4,
    burstPerHpLost: 0.25,  // taking damage also fills Burst (comeback)
    roundLimit: 20,
    critMult: 1.5,
    momentumDmg: 2,        // each Momentum stack adds this to every hit
    // Stress (Chaos Rift only)
    stressPerHp: 1.3,      // stress gained per HP lost
    koStress: 20,          // stress for allies when someone falls
    breakdownCards: 4,     // cards that character must play to recover
    breakdownOut: 0.7,     // damage dealt while in breakdown
    breakdownIn: 1.2,      // damage taken while in breakdown
    recoverBurst: 40,      // team Burst gained on recovery
    recoverStress: 30,
  };

  const STATUS = {
    str:      { name: 'พลัง',          kind: 'buff',   icon: 'str',     desc: 'การโจมตีแต่ละ hit แรงขึ้นตามจำนวน (อยู่ถาวร)' },
    momentum: { name: 'โมเมนตัม',      kind: 'buff',   icon: 'bolt',    desc: 'การโจมตีแต่ละ hit แรงขึ้น 2 ต่อชั้น · หายไปเมื่อจบเทิร์นตัวเอง' },
    aim:      { name: 'เล็งเป้า',       kind: 'buff',   icon: 'aim',     desc: 'การโจมตี hit ถัดไปแรง ×2 แล้วหายไป' },
    counter:  { name: 'สวนกลับ',       kind: 'buff',   icon: 'counter', desc: 'เมื่อโดนโจมตี สร้างความเสียหายคืนเท่าจำนวน · หายไปเมื่อเริ่มเทิร์นตัวเอง' },
    regen:    { name: 'ฟื้นฟูต่อเนื่อง', kind: 'buff',   icon: 'regen',   desc: 'เริ่มเทิร์น ฟื้นฟู HP เท่าจำนวน แล้วลดลง 1' },
    taunt:    { name: 'ยั่วยุ',          kind: 'buff',   icon: 'taunt',   desc: 'ศัตรูต้องเล็งการ์ดเป้าหมายเดี่ยวมาที่ตัวนี้ · ลดลง 1 เมื่อเริ่มเทิร์นตัวเอง' },
    vuln:     { name: 'เปราะบาง',      kind: 'debuff', icon: 'vuln',    desc: 'รับความเสียหายเพิ่ม 50% · ลดลง 1 เมื่อจบเทิร์นของฝั่งตัวเอง' },
    weak:     { name: 'อ่อนแรง',       kind: 'debuff', icon: 'weak',    desc: 'สร้างความเสียหายลดลง 25% · ลดลง 1 เมื่อจบเทิร์นของฝั่งตัวเอง' },
    poison:   { name: 'กัดกร่อน',      kind: 'debuff', icon: 'poison',  desc: 'เริ่มเทิร์นเสีย HP เท่าจำนวน (ทะลุโล่) แล้วลดลง 1' },
    mark:     { name: 'ล็อกเป้า',      kind: 'debuff', icon: 'mark',    desc: 'การ์ดบางใบแรงขึ้นตามจำนวน · ถ้าอีกฝ่ายมี Rin จะยิงสนับสนุนเมื่อโจมตีเป้านี้ · ลดลง 1 เมื่อจบเทิร์นของฝั่งตัวเอง' },
  };

  /* Card effect schema
       op: dmg | block | heal | status | cleanse | clear | mul | draw | ap | revive
       to: target | self | allies | enemies | lowest (ally with lowest HP%)
       cond: link2 (LINK 2+) | follow (previous card was an ally's attack) | marked (target has Mark)
       scale: { from: 'self'|'target', key: status | 'block' | 'debuffs', v } adds v × count
     rarity: starter | common | rare | epic (reward pools) | monster */
  const C = (owner, name, rarity, cost, type, target, effects, extra) =>
    Object.assign({ owner, name, rarity, cost, type, target, effects }, extra || {});

  const CARDS = {
    // ---------- Kael · Vanguard: block, counter, protect ----------
    guard:          C('kael', 'Guard', 'starter', 1, 'skill', 'ally', [{ op: 'block', v: 8, to: 'target' }]),
    guard_plus:     C('kael', 'Guard+', 'starter', 1, 'skill', 'ally', [{ op: 'block', v: 11, to: 'target' }]),
    shield_bash:    C('kael', 'Shield Bash', 'starter', 1, 'attack', 'enemy', [{ op: 'dmg', v: 6, to: 'target' }, { op: 'block', v: 5, to: 'self' }]),
    provoke:        C('kael', 'Provoke', 'starter', 1, 'skill', 'none', [{ op: 'block', v: 8, to: 'self' }, { op: 'status', key: 'taunt', v: 1, to: 'self' }]),
    provoke_plus:   C('kael', 'Provoke+', 'starter', 1, 'skill', 'none', [{ op: 'block', v: 12, to: 'self' }, { op: 'status', key: 'taunt', v: 1, to: 'self' }, { op: 'block', v: 4, to: 'allies' }]),
    bulwark_slam:   C('kael', 'Bulwark Slam', 'common', 1, 'attack', 'enemy', [{ op: 'dmg', v: 0, scale: { from: 'self', key: 'block', v: 1 }, to: 'target' }]),
    iron_wall:      C('kael', 'Iron Wall', 'common', 2, 'skill', 'none', [{ op: 'block', v: 7, to: 'allies' }]),
    riposte:        C('kael', 'Riposte Stance', 'common', 1, 'skill', 'none', [{ op: 'block', v: 6, to: 'self' }, { op: 'status', key: 'counter', v: 4, to: 'self' }]),
    rally_cry:      C('kael', 'Rally Cry', 'common', 1, 'skill', 'none', [{ op: 'block', v: 4, to: 'allies' }, { op: 'status', key: 'str', v: 1, to: 'allies', cond: 'link2' }]),
    guardian_oath:  C('kael', "Guardian's Oath", 'rare', 1, 'skill', 'ally', [{ op: 'block', v: 10, to: 'target' }, { op: 'status', key: 'taunt', v: 1, to: 'self' }, { op: 'status', key: 'counter', v: 3, to: 'self' }]),
    shield_throw:   C('kael', 'Shield Throw', 'rare', 1, 'attack', 'enemy', [{ op: 'dmg', v: 5, to: 'target' }, { op: 'dmg', v: 5, to: 'target', cond: 'follow' }, { op: 'status', key: 'weak', v: 1, to: 'target', cond: 'follow' }]),
    unbreakable:    C('kael', 'Unbreakable', 'rare', 2, 'skill', 'none', [{ op: 'block', v: 16, to: 'self' }, { op: 'status', key: 'counter', v: 6, to: 'self' }], { exhaust: true }),
    judgement:      C('kael', 'Judgement Aegis', 'epic', 2, 'attack', 'none', [{ op: 'dmg', v: 0, scale: { from: 'self', key: 'block', v: 1 }, to: 'enemies' }], { exhaust: true }),

    // ---------- Aria · Striker: momentum, multi-hit, finishers ----------
    slash:          C('aria', 'Slash', 'starter', 1, 'attack', 'enemy', [{ op: 'dmg', v: 7, to: 'target' }, { op: 'status', key: 'momentum', v: 1, to: 'self' }]),
    slash_plus:     C('aria', 'Slash+', 'starter', 1, 'attack', 'enemy', [{ op: 'dmg', v: 10, to: 'target' }, { op: 'status', key: 'momentum', v: 1, to: 'self' }]),
    flurry:         C('aria', 'Petal Flurry', 'starter', 1, 'attack', 'enemy', [{ op: 'dmg', v: 3, hits: 3, to: 'target' }]),
    iaido:          C('aria', 'Crimson Iaido', 'starter', 2, 'attack', 'enemy', [{ op: 'dmg', v: 15, scale: { from: 'self', key: 'momentum', v: 4 }, to: 'target' }, { op: 'clear', key: 'momentum', to: 'self' }]),
    iaido_plus:     C('aria', 'Crimson Iaido+', 'starter', 2, 'attack', 'enemy', [{ op: 'dmg', v: 21, scale: { from: 'self', key: 'momentum', v: 5 }, to: 'target' }, { op: 'clear', key: 'momentum', to: 'self' }]),
    swift_draw:     C('aria', 'Swift Draw', 'common', 0, 'attack', 'enemy', [{ op: 'dmg', v: 4, to: 'target' }, { op: 'status', key: 'momentum', v: 1, to: 'self' }]),
    crescent_cut:   C('aria', 'Crescent Cut', 'common', 1, 'attack', 'enemy', [{ op: 'dmg', v: 6, to: 'target' }, { op: 'dmg', v: 6, to: 'target', cond: 'link2' }]),
    follow_blade:   C('aria', 'Follow Blade', 'common', 1, 'attack', 'enemy', [{ op: 'dmg', v: 6, to: 'target' }, { op: 'dmg', v: 5, to: 'target', cond: 'follow' }, { op: 'status', key: 'momentum', v: 1, to: 'self', cond: 'follow' }]),
    crimson_rush:   C('aria', 'Crimson Rush', 'common', 1, 'attack', 'enemy', [{ op: 'dmg', v: 8, to: 'target' }, { op: 'ap', v: 1, cond: 'marked' }]),
    blossom_storm:  C('aria', 'Blossom Storm', 'rare', 2, 'attack', 'enemy', [{ op: 'dmg', v: 3, hits: 5, to: 'target' }]),
    moonlit_exec:   C('aria', 'Moonlit Execution', 'rare', 2, 'attack', 'enemy', [{ op: 'dmg', v: 14, execute: 14, to: 'target' }]),
    zanshin:        C('aria', 'Zanshin', 'rare', 1, 'skill', 'none', [{ op: 'status', key: 'momentum', v: 2, to: 'self' }, { op: 'draw', v: 1 }]),
    final_petal:    C('aria', 'Final Petal', 'epic', 1, 'attack', 'enemy', [{ op: 'dmg', v: 6, scale: { from: 'self', key: 'momentum', v: 6 }, to: 'target' }, { op: 'clear', key: 'momentum', to: 'self' }], { exhaust: true }),

    // ---------- Lumi · Support: heal, regen, strength, revive ----------
    mend:           C('lumi', 'Mend', 'starter', 1, 'support', 'ally', [{ op: 'heal', v: 8, to: 'target' }]),
    mend_plus:      C('lumi', 'Mend+', 'starter', 1, 'support', 'ally', [{ op: 'heal', v: 12, to: 'target' }]),
    blessing:       C('lumi', 'Blessing', 'starter', 1, 'support', 'ally', [{ op: 'status', key: 'str', v: 2, to: 'target' }]),
    blessing_plus:  C('lumi', 'Blessing+', 'starter', 1, 'support', 'ally', [{ op: 'status', key: 'str', v: 3, to: 'target' }, { op: 'heal', v: 4, to: 'target' }]),
    purify:         C('lumi', 'Purify', 'starter', 0, 'support', 'ally', [{ op: 'cleanse', to: 'target' }, { op: 'heal', v: 4, to: 'target' }]),
    soothing_hymn:  C('lumi', 'Soothing Hymn', 'common', 1, 'support', 'none', [{ op: 'status', key: 'regen', v: 3, to: 'allies' }]),
    sanctified:     C('lumi', 'Sanctified Veil', 'common', 1, 'support', 'ally', [{ op: 'block', v: 6, to: 'target' }, { op: 'heal', v: 4, to: 'target' }]),
    inspire:        C('lumi', 'Inspire', 'common', 0, 'support', 'none', [{ op: 'draw', v: 1 }, { op: 'ap', v: 1, cond: 'link2' }]),
    holy_smite:     C('lumi', 'Holy Smite', 'common', 1, 'attack', 'enemy', [{ op: 'dmg', v: 7, to: 'target' }, { op: 'heal', v: 6, to: 'lowest', cond: 'follow' }]),
    valor_prayer:   C('lumi', 'Valor Prayer', 'rare', 1, 'support', 'none', [{ op: 'status', key: 'str', v: 1, to: 'allies' }], { exhaust: true }),
    mercy:          C('lumi', 'Mercy', 'rare', 2, 'support', 'none', [{ op: 'heal', v: 9, to: 'allies' }]),
    purging_light:  C('lumi', 'Purging Light', 'rare', 1, 'attack', 'none', [{ op: 'dmg', v: 5, to: 'enemies' }, { op: 'cleanse', to: 'allies' }]),
    seraph_gift:    C('lumi', "Seraph's Gift", 'epic', 1, 'support', 'none', [{ op: 'revive', pct: 0.3 }, { op: 'heal', v: 6, to: 'allies' }], { exhaust: true }),

    // ---------- Noir · Hexer: corrosion, vulnerable, detonate ----------
    hex_bolt:       C('noir', 'Hex Bolt', 'starter', 1, 'attack', 'enemy', [{ op: 'dmg', v: 6, to: 'target' }, { op: 'status', key: 'vuln', v: 2, to: 'target' }]),
    hex_bolt_plus:  C('noir', 'Hex Bolt+', 'starter', 1, 'attack', 'enemy', [{ op: 'dmg', v: 8, to: 'target' }, { op: 'status', key: 'vuln', v: 2, to: 'target' }]),
    void_nova:      C('noir', 'Void Nova', 'starter', 2, 'attack', 'none', [{ op: 'dmg', v: 7, to: 'enemies' }]),
    void_nova_plus: C('noir', 'Void Nova+', 'starter', 2, 'attack', 'none', [{ op: 'dmg', v: 10, to: 'enemies' }]),
    wither:         C('noir', 'Wither', 'starter', 1, 'skill', 'enemy', [{ op: 'status', key: 'weak', v: 2, to: 'target' }, { op: 'status', key: 'poison', v: 5, to: 'target' }]),
    venom_sigil:    C('noir', 'Venom Sigil', 'common', 1, 'skill', 'enemy', [{ op: 'status', key: 'poison', v: 8, to: 'target' }]),
    miasma:         C('noir', 'Miasma', 'common', 1, 'skill', 'none', [{ op: 'status', key: 'poison', v: 3, to: 'enemies' }]),
    hex_mark:       C('noir', 'Hex Mark', 'common', 0, 'skill', 'enemy', [{ op: 'status', key: 'vuln', v: 1, to: 'target' }, { op: 'status', key: 'mark', v: 1, to: 'target' }]),
    soul_siphon:    C('noir', 'Soul Siphon', 'common', 1, 'attack', 'enemy', [{ op: 'dmg', v: 5, to: 'target' }, { op: 'heal', v: 0, scale: { from: 'target', key: 'debuffs', v: 3 }, to: 'self' }]),
    abyssal_bloom:  C('noir', 'Abyssal Bloom', 'rare', 1, 'attack', 'enemy', [{ op: 'dmg', v: 0, scale: { from: 'target', key: 'poison', v: 2 }, to: 'target' }]),
    detonate:       C('noir', 'Detonate Curse', 'rare', 2, 'attack', 'enemy', [{ op: 'dmg', v: 4, scale: { from: 'target', key: 'poison', v: 3 }, to: 'target' }, { op: 'clear', key: 'poison', to: 'target' }]),
    despair:        C('noir', 'Despair', 'rare', 1, 'skill', 'none', [{ op: 'status', key: 'weak', v: 1, to: 'enemies' }, { op: 'status', key: 'vuln', v: 1, to: 'enemies' }]),
    eclipse_sigil:  C('noir', 'Eclipse Sigil', 'epic', 1, 'skill', 'enemy', [{ op: 'mul', key: 'poison', v: 2, to: 'target' }, { op: 'status', key: 'vuln', v: 1, to: 'target' }], { exhaust: true }),

    // ---------- Rin · Ranger: mark, tempo, precision ----------
    quick_shot:     C('rin', 'Quick Shot', 'starter', 0, 'attack', 'enemy', [{ op: 'dmg', v: 3, to: 'target' }, { op: 'status', key: 'mark', v: 2, to: 'target' }]),
    quick_shot_plus:C('rin', 'Quick Shot+', 'starter', 0, 'attack', 'enemy', [{ op: 'dmg', v: 5, to: 'target' }, { op: 'status', key: 'mark', v: 2, to: 'target' }]),
    recon:          C('rin', 'Recon', 'starter', 1, 'skill', 'none', [{ op: 'draw', v: 2 }]),
    recon_plus:     C('rin', 'Recon+', 'starter', 0, 'skill', 'none', [{ op: 'draw', v: 2 }]),
    overclock:      C('rin', 'Overclock', 'starter', 0, 'skill', 'none', [{ op: 'ap', v: 1 }, { op: 'draw', v: 1 }], { exhaust: true }),
    ricochet:       C('rin', 'Ricochet', 'common', 1, 'attack', 'enemy', [{ op: 'dmg', v: 3, hits: 2, scale: { from: 'target', key: 'mark', v: 2 }, to: 'target' }]),
    spotter:        C('rin', 'Spotter', 'common', 0, 'skill', 'enemy', [{ op: 'status', key: 'mark', v: 2, to: 'target' }, { op: 'draw', v: 1 }]),
    suppress:       C('rin', 'Suppressing Fire', 'common', 1, 'attack', 'none', [{ op: 'dmg', v: 4, to: 'enemies' }, { op: 'status', key: 'mark', v: 1, to: 'enemies' }]),
    relay_shot:     C('rin', 'Relay Shot', 'common', 1, 'attack', 'enemy', [{ op: 'dmg', v: 6, to: 'target' }, { op: 'draw', v: 2, cond: 'follow' }]),
    lock_on:        C('rin', 'Lock On', 'rare', 0, 'skill', 'ally', [{ op: 'status', key: 'aim', v: 1, to: 'target' }]),
    volley:         C('rin', 'Volley', 'rare', 2, 'attack', 'enemy', [{ op: 'dmg', v: 2, hits: 6, to: 'target' }]),
    deadeye:        C('rin', 'Deadeye', 'rare', 1, 'attack', 'enemy', [{ op: 'dmg', v: 8, scale: { from: 'target', key: 'mark', v: 4 }, to: 'target' }, { op: 'clear', key: 'mark', to: 'target' }]),
    overdrive:      C('rin', 'Overdrive', 'epic', 0, 'skill', 'none', [{ op: 'ap', v: 2 }, { op: 'draw', v: 1 }], { exhaust: true }),

    // ---------- Monsters (each turn they plan moves in advance = INTENT) ----------
    wisp_bolt:      C('wisp', 'Rift Bolt', 'monster', 1, 'attack', 'enemy', [{ op: 'dmg', v: 6, to: 'target' }]),
    wisp_glare:     C('wisp', 'Glare', 'monster', 1, 'attack', 'enemy', [{ op: 'dmg', v: 3, to: 'target' }, { op: 'status', key: 'weak', v: 1, to: 'target' }]),
    husk_claw:      C('husk', 'Hollow Claw', 'monster', 1, 'attack', 'enemy', [{ op: 'dmg', v: 8, to: 'target' }]),
    husk_brace:     C('husk', 'Brace', 'monster', 1, 'skill', 'none', [{ op: 'block', v: 9, to: 'self' }]),
    husk_rend:      C('husk', 'Rend', 'monster', 1, 'attack', 'enemy', [{ op: 'dmg', v: 5, to: 'target' }, { op: 'status', key: 'vuln', v: 1, to: 'target' }]),
    gnash_bite:     C('gnasher', 'Bite', 'monster', 1, 'attack', 'enemy', [{ op: 'dmg', v: 11, to: 'target' }]),
    gnash_frenzy:   C('gnasher', 'Frenzy', 'monster', 1, 'skill', 'none', [{ op: 'status', key: 'str', v: 2, to: 'self' }]),
    gnash_maul:     C('gnasher', 'Maul', 'monster', 1, 'attack', 'enemy', [{ op: 'dmg', v: 5, hits: 2, to: 'target' }]),
    leech_drain:    C('leech', 'Drain', 'monster', 1, 'attack', 'enemy', [{ op: 'dmg', v: 5, to: 'target' }, { op: 'heal', v: 5, to: 'self' }]),
    leech_hymn:     C('leech', 'Choir Hymn', 'monster', 1, 'skill', 'none', [{ op: 'heal', v: 6, to: 'allies' }, { op: 'block', v: 4, to: 'allies' }]),
    crawler_spit:   C('crawler', 'Acid Spit', 'monster', 1, 'attack', 'enemy', [{ op: 'dmg', v: 4, to: 'target' }, { op: 'status', key: 'poison', v: 3, to: 'target' }]),
    crawler_shell:  C('crawler', 'Shell Up', 'monster', 1, 'skill', 'none', [{ op: 'block', v: 10, to: 'self' }]),
    warden_smash:   C('warden', 'Smash', 'monster', 1, 'attack', 'enemy', [{ op: 'dmg', v: 13, to: 'target' }]),
    warden_sweep:   C('warden', 'Sweep', 'monster', 1, 'attack', 'none', [{ op: 'dmg', v: 6, to: 'enemies' }]),
    warden_aegis:   C('warden', 'Aegis', 'monster', 1, 'skill', 'none', [{ op: 'block', v: 12, to: 'self' }, { op: 'status', key: 'str', v: 1, to: 'self' }]),
    harb_volt:      C('harbinger', 'Volt Lance', 'monster', 1, 'attack', 'enemy', [{ op: 'dmg', v: 9, to: 'target' }, { op: 'status', key: 'vuln', v: 1, to: 'target' }]),
    harb_storm:     C('harbinger', 'Static Storm', 'monster', 1, 'attack', 'none', [{ op: 'dmg', v: 5, to: 'enemies' }, { op: 'status', key: 'weak', v: 1, to: 'enemies' }]),
    harb_charge:    C('harbinger', 'Overcharge', 'monster', 1, 'skill', 'none', [{ op: 'status', key: 'str', v: 3, to: 'self' }]),
    seraph_judge:   C('seraph', 'Judgement', 'monster', 1, 'attack', 'enemy', [{ op: 'dmg', v: 14, to: 'target' }]),
    seraph_hymn:    C('seraph', 'Hollow Hymn', 'monster', 1, 'attack', 'none', [{ op: 'dmg', v: 5, to: 'enemies' }, { op: 'status', key: 'weak', v: 1, to: 'enemies' }]),
    seraph_gaze:    C('seraph', 'Thousand Eyes', 'monster', 1, 'skill', 'none', [{ op: 'status', key: 'vuln', v: 2, to: 'enemies' }]),
    seraph_wings:   C('seraph', 'Shroud of Wings', 'monster', 1, 'skill', 'none', [{ op: 'block', v: 15, to: 'self' }, { op: 'status', key: 'regen', v: 4, to: 'self' }]),
    claw:           C('malvoth', 'Rending Claw', 'monster', 1, 'attack', 'enemy', [{ op: 'dmg', v: 9, to: 'target' }]),
    hellfire:       C('malvoth', 'Hellfire', 'monster', 2, 'attack', 'none', [{ op: 'dmg', v: 6, to: 'enemies' }]),
    dread_roar:     C('malvoth', 'Dread Roar', 'monster', 1, 'skill', 'none', [{ op: 'status', key: 'weak', v: 1, to: 'enemies' }]),
    carapace:       C('malvoth', 'Obsidian Shell', 'monster', 1, 'skill', 'none', [{ op: 'block', v: 14, to: 'self' }]),
    devour:         C('malvoth', 'Devour', 'monster', 2, 'attack', 'enemy', [{ op: 'dmg', v: 12, to: 'target' }, { op: 'heal', v: 8, to: 'self' }]),
    dark_pact:      C('malvoth', 'Dark Pact', 'monster', 1, 'skill', 'none', [{ op: 'status', key: 'str', v: 2, to: 'self' }]),
    doom_mark:      C('malvoth', 'Mark of Doom', 'monster', 1, 'attack', 'enemy', [{ op: 'dmg', v: 4, to: 'target' }, { op: 'status', key: 'vuln', v: 2, to: 'target' }]),
  };

  // Awakening = what each duplicate pull unlocks, in order (6 stages).
  // stat: +HP and +power · upgrade: card becomes its "_plus" version
  // passive: passive value becomes v · burst: start each battle with v Burst
  const CHARACTERS = {
    kael: {
      id: 'kael', name: 'Kael', full: 'Kael Varn', rarity: 'SR', role: 'Vanguard', roleTh: 'แนวหน้า',
      title: 'โล่เหล็กแห่งรุ่งอรุณ', color: '#5aa9ff', hp: 78,
      quote: 'ตราบใดที่ฉันยังยืนอยู่ ไม่มีใครผ่านไปได้',
      style: 'สะสมโล่ แล้วเปลี่ยนโล่เป็นดาเมจ · สวนกลับ · ดึงศัตรูให้ตีตัวเอง',
      passive: { id: 'iron_oath', name: 'Iron Oath', v: 6, text: 'เริ่มเทิร์น: มอบโล่ {v} ให้พันธมิตรที่ HP% ต่ำที่สุด' },
      burst: { name: 'Aegis Bastion', target: 'none', effects: [{ op: 'block', v: 12, to: 'allies' }, { op: 'status', key: 'taunt', v: 1, to: 'self' }, { op: 'status', key: 'counter', v: 5, to: 'self' }] },
      deck: ['guard', 'guard', 'shield_bash', 'provoke'],
      pool: ['bulwark_slam', 'iron_wall', 'riposte', 'rally_cry', 'guardian_oath', 'shield_throw', 'unbreakable', 'judgement'],
      awakening: [{ type: 'stat', v: 0.06 }, { type: 'upgrade', card: 'guard' }, { type: 'passive', v: 9 }, { type: 'stat', v: 0.06 }, { type: 'upgrade', card: 'provoke' }, { type: 'burst', v: 20 }],
      look: { style: 'spiky', hair: '#34477a', hairHi: '#86a8ee', eye: '#3fb0ff', eyeScale: 0.84, brow: 'serious', mouth: 'flat', outfit: '#26324f', trim: '#5aa9ff', acc: 'armor' },
    },
    aria: {
      id: 'aria', name: 'Aria', full: 'Aria Kurenai', rarity: 'SSR', role: 'Striker', roleTh: 'นักดาบ',
      title: 'ดาบจันทร์สีชาด', color: '#ff4f6d', hp: 58,
      quote: 'ช่องโหว่แค่เสี้ยววินาทีก็พอแล้ว',
      style: 'สะสมโมเมนตัมด้วยการโจมตีต่อเนื่อง แล้วปิดด้วยท่าไม้ตาย · ตีแรงใส่เป้าที่ติดดีบัฟ',
      passive: { id: 'duelist', name: "Duelist's Eye", v: 0.3, pct: true, text: 'สร้างความเสียหาย +{v} ใส่ศัตรูที่ติด เปราะบาง หรือ ล็อกเป้า' },
      burst: { name: 'Crimson Moon', target: 'enemy', effects: [{ op: 'status', key: 'momentum', v: 2, to: 'self' }, { op: 'dmg', v: 22, execute: 12, to: 'target' }] },
      deck: ['slash', 'slash', 'flurry', 'iaido'],
      pool: ['swift_draw', 'crescent_cut', 'follow_blade', 'crimson_rush', 'blossom_storm', 'moonlit_exec', 'zanshin', 'final_petal'],
      awakening: [{ type: 'stat', v: 0.06 }, { type: 'upgrade', card: 'slash' }, { type: 'passive', v: 0.5 }, { type: 'stat', v: 0.06 }, { type: 'upgrade', card: 'iaido' }, { type: 'burst', v: 20 }],
      look: { style: 'ponytail', hair: '#c41e44', hairHi: '#ff8aa0', eye: '#ff3b5c', eyeScale: 0.9, brow: 'serious', mouth: 'smirk', outfit: '#f1edf5', trim: '#c41e44', acc: 'katana' },
    },
    lumi: {
      id: 'lumi', name: 'Lumi', full: 'Lumi Seraph', rarity: 'SR', role: 'Support', roleTh: 'ผู้เยียวยา',
      title: 'เทวาผู้เยียวยา', color: '#ff8fc8', hp: 54,
      quote: 'ไม่มีใครต้องล้มลงคนเดียวหรอกนะ',
      style: 'ฮีล ฟื้นฟูต่อเนื่อง และแจกพลังให้เพื่อน · ชุบชีวิต · ช่วยต่อ LINK',
      passive: { id: 'grace', name: 'Grace', v: 3, text: 'จบเทิร์น: ฟื้นฟู HP {v} ให้พันธมิตรที่ HP% ต่ำที่สุด' },
      burst: { name: 'Sanctuary', target: 'none', effects: [{ op: 'revive', pct: 0.3 }, { op: 'heal', v: 10, to: 'allies' }, { op: 'cleanse', to: 'allies' }] },
      deck: ['mend', 'mend', 'blessing', 'purify'],
      pool: ['soothing_hymn', 'sanctified', 'inspire', 'holy_smite', 'valor_prayer', 'mercy', 'purging_light', 'seraph_gift'],
      awakening: [{ type: 'stat', v: 0.06 }, { type: 'upgrade', card: 'mend' }, { type: 'passive', v: 6 }, { type: 'stat', v: 0.06 }, { type: 'upgrade', card: 'blessing' }, { type: 'burst', v: 20 }],
      look: { style: 'long', hair: '#ffe0f0', hairHi: '#ffffff', eye: '#ff5fae', eyeScale: 1, brow: 'soft', mouth: 'smile', outfit: '#fbf8ff', trim: '#f2c14e', acc: 'halo' },
    },
    noir: {
      id: 'noir', name: 'Noir', full: 'Noir Nyx', rarity: 'SSR', role: 'Hexer', roleTh: 'ผู้สาปแช่ง',
      title: 'แม่มดแห่งสุริยคราส', color: '#a77bff', hp: 52,
      quote: 'ความมืดไม่เคยรีบร้อน… มันแค่รอ',
      style: 'สะสมกัดกร่อนแล้วจุดระเบิด · แปะเปราะบางให้ทั้งทีมตีแรง',
      passive: { id: 'abyss_echo', name: 'Abyss Echo', v: 2, text: 'จบเทิร์น: ศัตรูทุกตัวรับความเสียหาย {v} ต่อดีบัฟ 1 ชนิดที่ติดอยู่' },
      burst: { name: 'Eclipse Collapse', target: 'none', effects: [{ op: 'dmg', v: 10, to: 'enemies' }, { op: 'status', key: 'vuln', v: 2, to: 'enemies' }, { op: 'status', key: 'poison', v: 4, to: 'enemies' }] },
      deck: ['hex_bolt', 'hex_bolt', 'void_nova', 'wither'],
      pool: ['venom_sigil', 'miasma', 'hex_mark', 'soul_siphon', 'abyssal_bloom', 'detonate', 'despair', 'eclipse_sigil'],
      awakening: [{ type: 'stat', v: 0.06 }, { type: 'upgrade', card: 'hex_bolt' }, { type: 'passive', v: 3 }, { type: 'stat', v: 0.06 }, { type: 'upgrade', card: 'void_nova' }, { type: 'burst', v: 20 }],
      look: { style: 'hime', hair: '#2b2140', hairHi: '#8f74d8', eye: '#c08bff', eyeScale: 0.78, brow: 'calm', mouth: 'flat', outfit: '#1a1326', trim: '#a77bff', acc: 'horns' },
    },
    rin: {
      id: 'rin', name: 'Rin', full: 'Rin Hayate', rarity: 'SR', role: 'Ranger', roleTh: 'พลซุ่มยิง',
      title: 'เหยี่ยวไร้เงา', color: '#3be3a5', hp: 56,
      quote: 'เล็งไว้ให้แล้ว… ส่งต่อเลย!',
      style: 'ล็อกเป้าให้ทีม · จั่วการ์ดและเพิ่ม AP · เล็งเป้าให้เพื่อนตีแรง ×2',
      passive: { id: 'covering_fire', name: 'Covering Fire', v: 3, text: 'เมื่อพันธมิตรโจมตีศัตรูที่ติด ล็อกเป้า Rin ยิงสนับสนุน {v}' },
      burst: { name: 'Phantom Barrage', target: 'none', effects: [{ op: 'status', key: 'mark', v: 2, to: 'enemies' }, { op: 'draw', v: 2 }, { op: 'ap', v: 2 }] },
      deck: ['quick_shot', 'quick_shot', 'recon', 'overclock'],
      pool: ['ricochet', 'spotter', 'suppress', 'relay_shot', 'lock_on', 'volley', 'deadeye', 'overdrive'],
      awakening: [{ type: 'stat', v: 0.06 }, { type: 'upgrade', card: 'quick_shot' }, { type: 'passive', v: 5 }, { type: 'stat', v: 0.06 }, { type: 'upgrade', card: 'recon' }, { type: 'burst', v: 20 }],
      look: { style: 'messy', hair: '#1e8c6c', hairHi: '#74f7cf', eye: '#2ee6a6', eyeScale: 0.95, brow: 'soft', mouth: 'grin', outfit: '#24302f', trim: '#3be3a5', acc: 'headphones' },
    },
    malvoth: {
      id: 'malvoth', boss: true, name: 'Malvoth', full: 'Malvoth', rarity: 'BOSS', role: 'Demon Lord', roleTh: 'ราชาปีศาจ',
      title: 'ทรราชแห่งสุริยคราส', color: '#ff3d55', hp: 260, acts: 3,
      quote: 'แสงของพวกเจ้า… จะเป็นอาหารมื้อสุดท้าย',
      passive: { id: 'enrage', name: 'Eclipse Rage', v: 3, text: 'HP ต่ำกว่าครึ่งครั้งแรก: ได้รับ พลัง {v} และ AP +1 ถาวร' },
      burst: null,
      moves: ['claw', 'claw', 'claw', 'hellfire', 'dread_roar', 'carapace', 'devour', 'dark_pact', 'doom_mark'],
      look: { style: 'long', hair: '#24101a', hairHi: '#ff5d78', eye: '#ff2a3a', sclera: '#1a0810', skin: '#eadcec', eyeScale: 0.78, brow: 'serious', mouth: 'fang', outfit: '#14080e', trim: '#ff3d55', acc: 'demon' },
    },
  };

  // Rift horrors met in Chaos Rift. acts = moves planned per turn.
  const M = (id, name, roleTh, color, hp, acts, moves, look, extra) => Object.assign({
    id, monster: true, name, full: name, rarity: 'MOB', role: 'Horror', roleTh, title: roleTh, color, hp, acts, moves,
    passive: { id: 'none', name: '', v: 0, text: '' }, burst: null, look: Object.assign({ monster: true }, look),
  }, extra || {});
  Object.assign(CHARACTERS, {
    wisp:      M('wisp', 'Rift Wisp', 'ภูตรอยแยก', '#6fd6ff', 20, 1, ['wisp_bolt', 'wisp_glare'], { shape: 'wisp', main: '#3a8fd8', glow: '#bff3ff' }),
    husk:      M('husk', 'Hollow Husk', 'ร่างกลวง', '#9a8cff', 32, 1, ['husk_claw', 'husk_brace', 'husk_rend'], { shape: 'husk', main: '#2a2546', glow: '#c8b8ff' }),
    gnasher:   M('gnasher', 'Gnasher', 'ปากกระหาย', '#ff7a59', 38, 1, ['gnash_bite', 'gnash_frenzy', 'gnash_maul'], { shape: 'gnasher', main: '#7a2a2a', glow: '#ffb08a' }),
    leech:     M('leech', 'Choir Leech', 'ปลิงขับร้อง', '#b6ff6a', 24, 1, ['leech_drain', 'leech_hymn'], { shape: 'leech', main: '#3a5a24', glow: '#e4ffb0' }),
    crawler:   M('crawler', 'Thorn Crawler', 'แมงหนาม', '#ffb84d', 28, 1, ['crawler_spit', 'crawler_shell'], { shape: 'crawler', main: '#6a4410', glow: '#ffe2a0' },
      { passive: { id: 'thorns', name: 'Thorns', v: 2, text: 'เมื่อโดนโจมตี สวนกลับ {v}' } }),
    warden:    M('warden', 'Veil Warden', 'ผู้คุมม่านมิติ', '#6ab0ff', 80, 2, ['warden_smash', 'warden_sweep', 'warden_aegis'], { shape: 'warden', main: '#1e2c4a', glow: '#9fd0ff' }, { rarity: 'ELITE' }),
    harbinger: M('harbinger', 'Harbinger', 'ผู้นำพายุ', '#ffe14d', 70, 2, ['harb_volt', 'harb_storm', 'harb_charge'], { shape: 'harbinger', main: '#4a3a08', glow: '#fff3a0' }, { rarity: 'ELITE' }),
    seraph:    M('seraph', 'Hollow Seraph', 'เทวทูตกลวง', '#ffe9b0', 170, 2, ['seraph_judge', 'seraph_hymn', 'seraph_gaze', 'seraph_wings'], { shape: 'seraph', main: '#d8cfc0', glow: '#fff6d8' },
      { rarity: 'BOSS', boss: true, passive: { id: 'enrage', name: 'Hollow Choir', v: 2, text: 'HP ต่ำกว่าครึ่งครั้งแรก: ได้รับ พลัง {v} และ AP +1 ถาวร' } }),
  });

  const ROSTER = ['kael', 'aria', 'lumi', 'noir', 'rin'];

  const PROGRESSION = {
    caps: [10, 20, 30],        // level cap per Ascension stage
    ascendCores: [3, 6],       // Demon Cores to go 10→20 and 20→30
    levelStep: 0.025,          // +2.5% HP and power per level
    levelCostBase: 40,         // crystals for Lv n → n+1 = base + step × n
    levelCostStep: 20,
  };

  // Weapons drop from bosses. Each stat rolls ±15% around the template value.
  const WEAPONS = {
    fang:     { name: 'Abyssal Fang',  th: 'เขี้ยวอเวจี',     stats: { crit: 0.10, out: 0.05 } },
    chalice:  { name: 'Blood Chalice', th: 'จอกโลหิต',        stats: { lifesteal: 0.12, hp: 0.06 } },
    sigil:    { name: 'Bulwark Sigil', th: 'ตราปราการ',        stats: { hp: 0.16, out: 0.03 } },
    catalyst: { name: 'Rift Catalyst', th: 'ผลึกเร่งมิติ',     stats: { burst: 15, out: 0.04 } },
    horn:     { name: 'Tyrant Horn',   th: 'เขาทรราช',        stats: { out: 0.12, crit: 0.04 } },
    edge:     { name: 'Eclipse Edge',  th: 'คมสุริยคราส',     stats: { out: 0.13, crit: 0.08 }, ssrOnly: true },
  };
  const WEAPON_RARITY = {
    R:   { mult: 0.6, salvage: 20 },
    SR:  { mult: 1.0, salvage: 60 },
    SSR: { mult: 1.5, salvage: 160 },
  };
  const STAT_NAMES = { out: 'พลัง', hp: 'HP', crit: 'คริติคอล', lifesteal: 'ดูดเลือด', burst: 'Burst เริ่มต้น' };

  const BOSS_RAID = {
    boss: 'malvoth',
    stages: 10,
    hpStep: 0.30,
    outStep: 0.105,
    recommended: [1250, 1300, 1400, 1500, 1750, 1950, 2100, 2250, 2350, 2450],
    crystalBase: 100,
    crystalStep: 40,
    firstClear: 300,
    cores: [1, 1, 1, 2, 2, 2, 3, 3, 3, 3],
    extraWeaponChance: 0.3,
    loseCrystals: 30,
  };

  // ---------- Chaos Rift (roguelike run) ----------
  // Epiphany: a one-time upgrade a card can gain during a run (one per card).
  const EPIPHANY = {
    swift:     { name: 'Swift',     th: 'ค่า AP −1', cost: -1 },
    empower:   { name: 'Empowered', th: 'ตัวเลขทั้งหมด +35%', mult: 1.35 },
    insight:   { name: 'Insight',   th: 'จั่วเพิ่ม 1 ใบ', add: [{ op: 'draw', v: 1 }] },
    guarded:   { name: 'Guarded',   th: 'เจ้าของการ์ดได้โล่ 5', add: [{ op: 'block', v: 5, to: 'self' }] },
    steadfast: { name: 'Steadfast', th: 'ไม่ถูกทิ้งตอนจบเทิร์น', retain: true },
    resonant:  { name: 'Resonant',  th: 'ถ้า LINK 2+ ตัวเลขทั้งหมด ×1.6', linkMult: 1.6 },
  };

  // Fragments: passive items that last for one run.
  const FRAGMENTS = {
    iron_heart:  { name: 'Iron Heart',   th: 'หัวใจเหล็ก',       desc: 'เริ่มการต่อสู้: ทุกคนได้โล่ 7', mods: { startBlock: 7 } },
    quick_mind:  { name: 'Quick Mind',   th: 'จิตว่องไว',         desc: 'เทิร์นแรกของการต่อสู้จั่วเพิ่ม 2 ใบ', mods: { draw1: 2 } },
    surge_cell:  { name: 'Surge Cell',   th: 'เซลล์พลังงาน',      desc: 'เทิร์นแรกของการต่อสู้ได้ AP +1', mods: { ap1: 1 } },
    ember_charm: { name: 'Ember Charm',  th: 'เครื่องรางถ่านไฟ',   desc: 'เริ่มการต่อสู้พร้อม Burst 35%', mods: { burst: 35 } },
    sharp_edge:  { name: 'Sharp Edge',   th: 'คมมีดลับ',          desc: 'ทุกคนเริ่มการต่อสู้ด้วย พลัง +1', mods: { str: 1 } },
    thorn_mail:  { name: 'Thorn Mail',   th: 'เกราะหนาม',         desc: 'พันธมิตรที่โดนโจมตี สวนกลับ 2', mods: { thorns: 2 } },
    scope:       { name: 'Hunter Scope', th: 'กล้องเล็งพราน',      desc: 'คริติคอล +10% ทุกคน', mods: { crit: 0.1 } },
    chain_core:  { name: 'Chain Core',   th: 'แกนเชื่อมโยง',       desc: 'LINK แรงขึ้นอีก +5% ต่อขั้น', mods: { linkBonus: 0.05 } },
    calm_mind:   { name: 'Calm Mind',    th: 'จิตสงบ',            desc: 'ความเครียดเพิ่มช้าลง 40%', mods: { stressMul: 0.6 } },
    vital_bloom: { name: 'Vital Bloom',  th: 'ดอกไม้ชีวิต',        desc: 'ชนะการต่อสู้แล้วฟื้นฟู HP 8 ทุกคน', run: { healAfter: 8 } },
    lucky_coin:  { name: 'Lucky Coin',   th: 'เหรียญนำโชค',        desc: 'ได้เครดิตเพิ่ม 30%', run: { creditMul: 1.3 } },
  };

  const CHAOS = {
    levels: 3,
    floors: 7,                 // per zone, the last floor is the boss
    lanes: 3,
    zones: [
      { name: 'Outer Rift', th: 'รอยแยกชั้นนอก', boss: ['seraph'],
        early: [['wisp', 'wisp'], ['husk'], ['wisp', 'husk'], ['crawler']],
        late: [['husk', 'husk'], ['gnasher', 'wisp'], ['crawler', 'wisp', 'wisp'], ['leech', 'husk']],
        elite: [['warden'], ['harbinger']] },
      { name: 'Inner Rift', th: 'แก่นรอยแยก', boss: ['malvoth'],
        early: [['gnasher', 'leech'], ['husk', 'crawler'], ['wisp', 'wisp', 'husk']],
        late: [['gnasher', 'husk'], ['crawler', 'leech', 'wisp'], ['husk', 'husk', 'wisp']],
        elite: [['warden', 'leech'], ['harbinger', 'crawler']] },
    ],
    nodeWeights: { battle: 46, unknown: 22, elite: 12, rest: 10, shop: 10 },
    // Tuned with tools/sim.js: a careful player clears Chaos 1 with a fresh team
    // about a third of the time, and each level asks for a stronger team.
    baseHp: 1.3,               // enemy HP and damage multipliers before the steps below
    baseOut: 1.25,
    bossHp: 1.3,               // bosses scale by Chaos level only
    levelHp: 0.45,             // enemy HP +45% per Chaos level above 1
    levelOut: 0.3,
    zoneHp: 0.45,
    zoneOut: 0.22,
    floorHp: 0.04,
    floorOut: 0.025,
    credits: { battle: [18, 28], elite: [45, 60], boss: [80, 100], treasure: [35, 55] },
    shop: { common: 45, rare: 75, epic: 120, fragment: 120, remove: 60 },
    rest: { heal: 0.3, healStress: 20, meditate: 55 },
    zoneHeal: 0.4,             // heal after the first boss
    cardOdds: { battle: { rare: 30, epic: 6 }, elite: { rare: 55, epic: 15 }, boss: { rare: 70, epic: 25 } },
    epiphanyChance: 0.15,      // chance a reward card comes with an Epiphany
    clear: { crystals: [450, 700, 1000], cores: [2, 3, 5], stage: [3, 6, 9] },
    perNodeCrystals: 25,       // consolation per cleared node when a run fails
    // Save Data: what a cleared run may keep, paid for with Faint Memory points.
    saveData: {
      cap: [80, 130, 190],     // Faint Memory by the Chaos level that was cleared
      cost: { common: 10, rare: 20, epic: 35, epiphany: 15, removal: 10 },
      slots: 5,
    },
  };

  const EVENTS = [
    { id: 'whisper', title: 'เสียงกระซิบจากรอยแยก', text: 'เสียงที่ฟังคล้ายเพื่อนเก่ากระซิบสูตรการต่อสู้ที่ไม่มีใครรู้ แต่ทุกคำทำให้หัวใจเต้นแรงอย่างประหลาด',
      choices: [
        { label: 'ตั้งใจฟัง', desc: 'ได้การ์ดระดับ Rare 1 ใบ · ทุกคนเครียด +20', fx: [{ t: 'card', rarity: 'rare' }, { t: 'stress', v: 20 }] },
        { label: 'ปิดหูเดินผ่านไป', desc: 'ไม่มีอะไรเกิดขึ้น', fx: [] },
      ] },
    { id: 'lab', title: 'ห้องทดลองร้าง', text: 'โต๊ะทดลองยังมีเครื่องลบความทรงจำที่ใช้งานได้ ข้างๆ มีกล่องเสบียงที่ยังไม่ถูกเปิด',
      choices: [
        { label: 'ลบความทรงจำ', desc: 'ลบการ์ด 1 ใบออกจากเด็ค', fx: [{ t: 'remove' }] },
        { label: 'ค้นเสบียง', desc: 'ได้ 45 เครดิต', fx: [{ t: 'credits', v: 45 }] },
      ] },
    { id: 'merchant', title: 'พ่อค้าความทรงจำ', text: 'ร่างในเสื้อคลุมยื่นเศษผลึกเรืองแสงมาให้ “แลกกับเครดิตนิดหน่อย… ไม่แพงหรอก”',
      choices: [
        { label: 'จ่าย 60 เครดิต', desc: 'ได้ Fragment สุ่ม 1 ชิ้น', cost: 60, fx: [{ t: 'fragment' }] },
        { label: 'ปฏิเสธ', desc: 'เดินจากไป', fx: [] },
      ] },
    { id: 'spring', title: 'น้ำพุแสงจันทร์', text: 'น้ำใสสะท้อนแสงจันทร์ที่ไม่มีอยู่จริง ความเหนื่อยล้าเหมือนจะจางลงแค่ได้มอง',
      choices: [
        { label: 'ดื่มน้ำ', desc: 'ฟื้นฟู HP 25% ทุกคน', fx: [{ t: 'heal', pct: 0.25 }] },
        { label: 'นั่งสมาธิ', desc: 'ความเครียด −30 ทุกคน', fx: [{ t: 'stress', v: -30 }] },
      ] },
    { id: 'shadow', title: 'เงาของตัวเอง', text: 'เงาของทีมลุกขึ้นยืนเอง แล้วเดินขวางทางไว้',
      choices: [
        { label: 'เผชิญหน้า', desc: 'ต่อสู้ ถ้าชนะได้การ์ดระดับ Rare', fx: [{ t: 'fight', enc: ['husk', 'husk'], reward: 'rare' }] },
        { label: 'วิ่งหนี', desc: 'ทุกคนเครียด +15', fx: [{ t: 'stress', v: 15 }] },
      ] },
    { id: 'altar', title: 'แท่นบูชาสุริยคราส', text: 'แท่นหินเปื้อนแสงสีแดงเรียกร้องเลือดเพื่อแลกกับความเข้าใจ',
      choices: [
        { label: 'ถวายเลือด', desc: 'ทุกคนเสีย HP 10 · Epiphany การ์ด 1 ใบฟรี', fx: [{ t: 'hurt', v: 10 }, { t: 'epiphany' }] },
        { label: 'ไม่แตะต้อง', desc: 'เดินจากไป', fx: [] },
      ] },
  ];

  const GACHA = {
    single: 160,
    multi: 1600,
    ssrRate: 0.12,
    pity: 20,
    beginnerPulls: 10,
    maxAwakening: 6,
    dupeRefund: 80,
    startCrystals: 1600,
  };

  const REWARDS = {
    easy:   { label: 'Easy',   th: 'ง่าย', win: 160, lose: 40, lv: 1 },
    normal: { label: 'Normal', th: 'ปกติ', win: 240, lose: 60, lv: 4 },
    hard:   { label: 'Hard',   th: 'ยาก',  win: 400, lose: 80, lv: 12 },
    online: { label: 'Online', th: 'ออนไลน์', win: 200, lose: 60 },
  };

  // Real artwork: drop an image in assets/characters/ and point to it here,
  // e.g. aria: 'assets/characters/aria.png'. Empty = use the generated portrait.
  const ART = {};

  return { RULES, STATUS, CARDS, CHARACTERS, ROSTER, PROGRESSION, WEAPONS, WEAPON_RARITY, STAT_NAMES, BOSS_RAID, EPIPHANY, FRAGMENTS, CHAOS, EVENTS, GACHA, REWARDS, ART };
});
