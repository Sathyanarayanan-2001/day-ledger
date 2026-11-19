/* Network first, so updates arrive when online; the cached page is the offline fallback. */
const CACHE = 'day-ledger-__VERSION__';
const ROOT = new URL('./', location).pathname;

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', 'manifest.webmanifest', 'icon-192.png'])));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone();
    caches.open(CACHE).then(c => c.put(url.pathname === ROOT ? './' : e.request, copy));
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./'))));
});

/* Reminders. GitHub sends a small push ({ kind, pauseIn, pauseUrl }) and the wording lives here. */
const LOG_TODAY = { action: 'today', title: 'Log today' };
const REMINDERS = {
  morning: { title: 'Morning check-in', body: "Log what you've done since you woke up, and fill any gaps left from yesterday.", actions: [LOG_TODAY, { action: 'yesterday', title: 'Fill yesterday' }] },
  night: { title: 'Log today before you sleep', body: "Fill in today's gaps while you still remember them.", actions: [LOG_TODAY] },
  test: { title: 'Test reminder', body: 'Reminders reach this device. Tap to open today.', actions: [] },
};

function remind(msg = {}) {
  const kind = REMINDERS[msg.kind] ? msg.kind : new Date().getHours() < 15 ? 'morning' : 'night';
  const r = REMINDERS[kind];
  const shown = [self.registration.showNotification(r.title, {
    body: r.body, icon: 'icon-192.png', badge: 'badge-96.png', tag: `reminder-${kind}`, renotify: true,
    actions: r.actions,
  })];
  if (msg.pauseIn > 0 && msg.pauseUrl) shown.push(self.registration.showNotification(`Reminders pause in ${msg.pauseIn} days`, {
    body: 'GitHub stops scheduled runs after 60 days with no commits. Merge an update or make any commit to keep reminders coming.',
    icon: 'icon-192.png', badge: 'badge-96.png', tag: 'reminder-pause', data: { url: msg.pauseUrl },
  }));
  return Promise.all(shown);
}

self.addEventListener('push', e => {
  let msg = {};
  try { msg = e.data ? e.data.json() : {}; } catch {}
  e.waitUntil(remind(msg));
});

/* "Send a test" in Settings uses the same path as a real reminder. */
self.addEventListener('message', e => { if (e.data && e.data.remind) e.waitUntil(remind(e.data.remind)); });

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {};
  if (d.url) { e.waitUntil(clients.openWindow(d.url)); return; }
  const open = e.action === 'yesterday' ? 'log/yesterday' : 'log/today';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const tab = list.find(c => c.url.startsWith(self.registration.scope));
    if (tab) { tab.postMessage({ open }); return tab.focus(); }
    return clients.openWindow(`${self.registration.scope}#${open}`);
  }));
});
