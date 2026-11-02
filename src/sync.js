/* Storage and sync. Local copy in IndexedDB; shared copy as save files in a chosen folder,
   which the OneDrive desktop app (laptops) or a sync app (Android) carries between devices. */
const Store = (() => {
  let db;
  const open = () => new Promise((res, rej) => {
    const r = indexedDB.open('tracker', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => { db = r.result; res(); }; r.onerror = () => rej(r.error);
  });
  const tx = (mode, fn) => new Promise((res, rej) => {
    if (!db) return res(null);
    const t = db.transaction('kv', mode); const q = fn(t.objectStore('kv'));
    t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error);
  });
  return { open, get: k => tx('readonly', s => s.get(k)), set: (k, v) => tx('readwrite', s => s.put(v, k)), del: k => tx('readwrite', s => s.delete(k)) };
})();

const KEEP = 3;
const SAVE_PREFIX = 'tracker-save-';
const lsGet = (k, d) => { try { const v = localStorage.getItem('tt.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem('tt.' + k, JSON.stringify(v)); } catch {} };
const deviceId = lsGet('device') || (() => { const d = uid().slice(-5); lsSet('device', d); return d; })();

async function gz(text) {
  if (!window.CompressionStream) return new Blob([text]);
  return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
}
async function gunzip(blob, name) {
  if (!name.endsWith('.gz')) return blob.text();
  return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
const saveName = () => `${SAVE_PREFIX}${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${deviceId}.json${window.CompressionStream ? '.gz' : ''}`;

const Folder = {
  dir: null,
  supported: () => !!window.showDirectoryPicker,
  async pick() { this.dir = await showDirectoryPicker({ id: 'tracker', mode: 'readwrite' }); await Store.set('dirHandle', this.dir); return true; },
  async resume(interactive) {
    this.dir = this.dir || await Store.get('dirHandle'); if (!this.dir) return false;
    let p = await this.dir.queryPermission({ mode: 'readwrite' });
    if (p !== 'granted' && interactive) p = await this.dir.requestPermission({ mode: 'readwrite' });
    return p === 'granted';
  },
  async list() {
    const out = [];
    for await (const [name, h] of this.dir.entries()) {
      if (h.kind !== 'file' || !name.startsWith(SAVE_PREFIX)) continue;
      const f = await h.getFile();
      out.push({ name, stamp: `${name}:${f.lastModified}:${f.size}`, file: f });
    }
    return out.sort((a, b) => b.name.localeCompare(a.name));
  },
  async write(name, blob) { const h = await this.dir.getFileHandle(name, { create: true }); const w = await h.createWritable(); await w.write(blob); await w.close(); },
  async remove(name) { await this.dir.removeEntry(name); },
  disconnect() { this.dir = null; return Store.del('dirHandle'); },
};

const Sync = {
  on: false, state: 'off', msg: '', lastAt: lsGet('lastSync', null), sessionFile: null, seen: new Set(), timer: null, busy: false, dirty: !!lsGet('dirty', false),
  onChange: () => {}, onRemote: () => {},
  set(state, msg) { this.state = state; this.msg = msg || ''; this.onChange(); },
  async start() {
    if (lsGet('syncMode', null) !== 'folder' || !Folder.supported()) { this.set('off'); return; }
    this.on = true;
    if (!(await Folder.resume(false))) { this.set('reconnect', 'Allow folder access to sync'); return; }
    await this.pull();
  },
  /* merge every save not read yet, so nothing is missed when a sync app delivers files late */
  async absorbAll(list) {
    for (const f of list) {
      if (f.name === this.sessionFile || this.seen.has(f.stamp)) continue;
      try {
        const remote = JSON.parse(await gunzip(f.file, f.name));
        const { data, localChanged, remoteBehind } = mergeData(S.data, remote.data);
        this.seen.add(f.stamp);
        if (localChanged) { S.data = data; S.v++; await Store.set('state', S.data); this.onRemote(); }
        if (remoteBehind) this.markDirty();
      } catch { /* a file still being delivered: try it next time */ }
    }
  },
  async pull() {
    if (!Folder.dir || this.busy) return; this.busy = true; this.set('working', 'Loading latest save');
    try { await this.absorbAll(await Folder.list()); this.finish(); } catch (e) { this.fail(e); } finally { this.busy = false; }
    if (this.dirty) this.push();
  },
  markDirty() { this.dirty = true; lsSet('dirty', true); },
  changed() { this.markDirty(); clearTimeout(this.timer); if (Folder.dir && ['ok', 'pending', 'error'].includes(this.state)) { this.timer = setTimeout(() => this.push(), 3000); this.set('pending', 'Changes waiting to save'); } },
  async push() {
    if (!Folder.dir || this.busy) return;
    this.busy = true; this.set('working', 'Saving');
    try {
      const list = await Folder.list(); await this.absorbAll(list);
      const name = this.sessionFile || saveName();
      await Folder.write(name, await gz(JSON.stringify({ app: 'tracker', v: 1, device: deviceId, savedAt: new Date().toISOString(), data: S.data })));
      this.sessionFile = name; this.dirty = false; lsSet('dirty', false);
      const names = [...new Set([name, ...list.map(f => f.name)])].sort().reverse();
      for (const old of names.slice(KEEP)) await Folder.remove(old);
      this.finish();
    } catch (e) { this.fail(e); } finally { this.busy = false; }
  },
  finish() { this.lastAt = Date.now(); lsSet('lastSync', this.lastAt); this.set('ok', ''); },
  fail(e) {
    if (e.name === 'NotAllowedError') { this.set('reconnect', 'Allow folder access to sync'); return; }
    this.set('error', e.message);
  },
  async connect() { await Folder.pick(); lsSet('syncMode', 'folder'); this.on = true; await this.pull(); },
  async reconnect() { if (await Folder.resume(true)) { this.on = true; await this.pull(); } },
  stop() { Folder.disconnect(); this.on = false; lsSet('syncMode', null); this.sessionFile = null; this.seen = new Set(); this.set('off'); },
};
document.addEventListener('visibilitychange', () => {
  if (!Folder.dir || ['reconnect', 'off'].includes(Sync.state)) return;
  if (document.hidden) { if (Sync.dirty) { clearTimeout(Sync.timer); Sync.push(); } } else Sync.pull();
});
