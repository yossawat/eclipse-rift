/* Eclipse Rift — local stand-in for the hosted page's db / user / room, so
   online mode can be tested on localhost: open the game in two tabs, create a
   room in one and join it from the other. Does nothing anywhere else. */
(function () {
  'use strict';
  if (window.claude || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;

  const PFX = 'mockdb:';
  let uid = sessionStorage.getItem('mock-uid');
  if (!uid) { uid = 'u_' + Math.random().toString(36).slice(2, 8); sessionStorage.setItem('mock-uid', uid); }

  const listeners = new Map();
  const read = (p) => { const r = localStorage.getItem(PFX + p); return r ? JSON.parse(r) : null; };
  const snapOf = (p) => {
    const d = read(p);
    return { id: p.split('/').pop(), exists: !!d, data: () => (d ? JSON.parse(JSON.stringify(d)) : undefined), metadata: { fromCache: false, hasPendingWrites: false } };
  };
  const notify = (p) => setTimeout(() => (listeners.get(p) || new Set()).forEach((fn) => fn(snapOf(p))), 20);
  window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith(PFX)) notify(e.key.slice(PFX.length)); });
  const write = (p, d) => {
    if (d == null) localStorage.removeItem(PFX + p);
    else localStorage.setItem(PFX + p, JSON.stringify(d));
    notify(p);
  };
  const merge = (a, b) => {
    for (const [k, v] of Object.entries(b)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) merge(a[k], v);
      else a[k] = v;
    }
    return a;
  };

  function docRef(p) {
    return {
      id: p.split('/').pop(),
      path: p,
      get: async () => snapOf(p),
      set: async (d) => write(p, d),
      update: async (d) => {
        const cur = read(p);
        if (!cur) throw { code: 'invalid_argument', message: 'document does not exist' };
        write(p, merge(cur, d));
      },
      delete: async () => write(p, null),
      acquire: async (o) => {
        const k = 'mocklease:' + p, now = Date.now();
        const l = JSON.parse(localStorage.getItem(k) || 'null');
        if (l && l.exp > now && l.h !== o.holder) return { acquired: false };
        localStorage.setItem(k, JSON.stringify({ h: o.holder, exp: now + (o.ttlMs || 30000) }));
        return { acquired: true };
      },
      onSnapshot: (next) => {
        if (!listeners.has(p)) listeners.set(p, new Set());
        listeners.get(p).add(next);
        setTimeout(() => next(snapOf(p)), 10);
        return () => listeners.get(p).delete(next);
      },
      collection: (c) => collRef(p + '/' + c),
    };
  }
  function collRef(c, filters, lim) {
    filters = filters || [];
    const test = { '<': (a, b) => a < b, '>': (a, b) => a > b, '==': (a, b) => a === b };
    return {
      path: c,
      doc: (id) => docRef(c + '/' + (id || Math.random().toString(36).slice(2))),
      where: (f, op, v) => collRef(c, filters.concat([[f, op, v]]), lim),
      orderBy: function () { return this; },
      limit: (n) => collRef(c, filters, n),
      get: async () => {
        const docs = Object.keys(localStorage)
          .filter((k) => k.startsWith(PFX + c + '/') && k.slice(PFX.length + c.length + 1).indexOf('/') < 0)
          .map((k) => snapOf(k.slice(PFX.length)))
          .filter((s) => filters.every(([f, op, v]) => test[op] && test[op](s.data()[f], v)))
          .slice(0, lim || 1000);
        return { docs, size: docs.length, empty: !docs.length, docChanges: () => [] };
      },
    };
  }

  const user = {
    id: async () => uid,
    can: async () => true,
    isOwner: async () => true,
    canEdit: async () => true,
    me: async () => ({ id: uid, name: 'แท็บนี้', avatarUrl: '', color: '#5ce1ff', email: null, isOwner: true, canEdit: true }),
    profiles: async (ids) => Object.fromEntries([].concat(ids).map((id) => [id, { id, name: id === uid ? 'แท็บนี้' : 'แท็บ ' + id.slice(-3), avatarUrl: '', color: '#888', email: null, isMe: id === uid, guest: false }])),
  };
  const room = {
    join: async (name) => {
      const bc = new BroadcastChannel('mockroom:' + name);
      const subs = [];
      bc.onmessage = (e) => subs.forEach(([t, fn]) => { if (t === e.data.topic) fn({ topic: t, data: e.data.data, sameTab: false, isMe: false, by: e.data.by }); });
      return {
        name,
        emit: async (topic, data) => bc.postMessage({ topic, data, by: uid }),
        on: (topic, fn) => { const s = [topic, fn]; subs.push(s); return () => subs.splice(subs.indexOf(s), 1); },
        leave: async () => bc.close(),
      };
    },
  };

  const api = { db: { doc: docRef, collection: (c) => collRef(c) }, user, room };
  window.claude = { __mock: true, use: async (name) => api[name] || null };
})();
