/* Eclipse Rift — online play with friends through the page's shared store.
   A match is ONE document, matches/<CODE>:
     { seed, status: 'open'|'playing'|'done', fair, host, guest, moves: [{side, a}] }
   Both players run the same deterministic engine from the seed and apply the
   moves in order, so only actions travel. This is the hosted-page stand-in for
   a real game server; the protocol stays the same when you build one. */
(function (root) {
  'use strict';
  const NET = { ready: false, reason: '', db: null, user: null, room: null, uid: null, mock: false };
  let initPromise = null;

  function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const c = root.claude;
      if (!c || typeof c.use !== 'function') { NET.reason = 'nohost'; return false; }
      NET.mock = !!c.__mock;
      const [db, user, room] = await Promise.all([c.use('db'), c.use('user'), c.use('room')]);
      NET.db = db;
      NET.user = user;
      NET.room = room;
      NET.uid = user ? await user.id() : null;
      if (!db || !NET.uid) { NET.reason = 'nodb'; return false; }
      const can = user ? await user.can('data.write') : null;
      if (can === false) { NET.reason = 'readonly'; return false; }
      NET.ready = true;
      return true;
    })();
    return initPromise;
  }

  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const newCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  const ref = (code) => NET.db.doc('matches/' + code);

  async function createMatch(team, fair, deck) {
    pruneOld().catch(() => {});
    for (let i = 0; i < 5; i++) {
      const code = newCode();
      if ((await ref(code).get()).exists) continue;
      await ref(code).set({
        v: 1, code, seed: (Math.random() * 4294967296) >>> 0, status: 'open', fair: !!fair,
        host: { uid: NET.uid, team, deck: deck || null }, guest: null, moves: [], createdAt: Date.now(),
      });
      return code;
    }
    throw new Error('สร้างห้องไม่สำเร็จ ลองใหม่อีกครั้ง');
  }

  async function peek(code) {
    const snap = await ref(code).get();
    return snap.exists ? snap.data() : null;
  }

  async function joinMatch(code, team, deck) {
    const r = ref(code);
    // A short lease so two friends typing the same code cannot both take the seat.
    const lease = await r.acquire({ holder: NET.uid + ':' + Math.random().toString(36).slice(2, 8), ttlMs: 4000 });
    if (!lease.acquired) return { ok: false, error: 'มีคนกำลังเข้าห้องนี้อยู่ ลองใหม่ในอีกไม่กี่วินาที' };
    const snap = await r.get();
    if (!snap.exists) return { ok: false, error: 'ไม่พบห้องรหัสนี้' };
    const m = snap.data();
    if (m.status !== 'open' || m.guest) return { ok: false, error: 'ห้องนี้เริ่มเล่นไปแล้ว' };
    await r.update({ guest: { uid: NET.uid, team, deck: deck || null }, status: 'playing' });
    return { ok: true };
  }

  function watch(code, onDoc, onError) {
    return ref(code).onSnapshot((snap) => onDoc(snap.exists ? snap.data() : null), (e) => { if (onError) onError(e); });
  }

  async function pushMove(code, moves, move) {
    await ref(code).update({ moves: moves.concat([move]), at: Date.now() });
    ping(code);
  }
  async function finish(code, winner) {
    try { await ref(code).update({ status: 'done', winner }); } catch (e) { /* cosmetic */ }
  }
  async function cancel(code) {
    try { await ref(code).delete(); } catch (e) { /* already gone */ }
  }
  async function pruneOld() {
    const old = await NET.db.collection('matches').where('createdAt', '<', Date.now() - 86400000).limit(20).get();
    for (const d of old.docs) await NET.db.doc('matches/' + d.id).delete();
  }

  // A room "ping" makes the other player re-read at once even when live
  // delivery falls back to slow polling. The document stays the truth.
  const rooms = {};
  async function joinRoom(code, onPing) {
    if (!NET.room) return;
    try {
      const r = await NET.room.join('m-' + code.toLowerCase());
      rooms[code] = r;
      r.on('move', (msg) => { if (!msg.sameTab) onPing(); });
    } catch (e) { /* the ping is optional */ }
  }
  function ping(code) {
    const r = rooms[code];
    if (r) r.emit('move', { at: Date.now() }).catch(() => {});
  }
  function leaveRoom(code) {
    const r = rooms[code];
    if (r) { r.leave().catch(() => {}); delete rooms[code]; }
  }

  async function names(uids) {
    const out = {};
    if (!NET.user) return out;
    const ps = await NET.user.profiles(uids);
    for (const id of uids) out[id] = (ps[id] && ps[id].name) || '';
    return out;
  }

  root.ERNet = { NET, init, createMatch, peek, joinMatch, watch, pushMove, finish, cancel, joinRoom, leaveRoom, names, cleanCode };
})(typeof self !== 'undefined' ? self : this);
