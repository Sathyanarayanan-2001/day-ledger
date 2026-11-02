/* Core: dates, data model, calculations, quick-log parser, merge. No DOM here. */
const TT = {};
const pad = n => String(n).padStart(2, '0');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- dates ---------- */
const toDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtD = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => fmtD(new Date());
const addDays = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return fmtD(d); };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const niceDate = s => { const d = toDate(s); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const shortDate = s => { const d = toDate(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
function isoWeek(s) {
  const d = toDate(s); const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day + 3);
  const y = d.getFullYear(); const j4 = new Date(y, 0, 4);
  const w = 1 + Math.round(((d - j4) / 864e5 - 3 + ((j4.getDay() + 6) % 7)) / 7);
  return { y, w };
}
const mondayOf = s => { const d = toDate(s); return addDays(s, -((d.getDay() + 6) % 7)); };
const fyOf = s => { const d = toDate(s); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; };
const fyLabel = y => `FY ${y}-${pad((y + 1) % 100)}`;
const fyRange = y => ({ from: `${y}-04-01`, to: `${y + 1}-03-31` });
const monthRange = ym => { const [y, m] = ym.split('-').map(Number); return { from: `${ym}-01`, to: fmtD(new Date(y, m, 0)) }; };
function fyWeeks(y) {
  const out = []; const r = fyRange(y); let m = mondayOf(r.from);
  while (m <= r.to) { const w = isoWeek(m); out.push({ monday: m, w: w.w, y: w.y }); m = addDays(m, 7); }
  return out;
}
const hm = t => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const hhmm = n => `${pad(Math.floor(n / 60) % 24)}:${pad(n % 60)}`;
const fmtMins = n => { n = Math.round(n || 0); if (n < 60) return `${n}m`; const h = Math.floor(n / 60), m = n % 60; return m ? `${h}h ${m}m` : `${h}h`; };
const fmtH = n => (Math.round((n || 0) / 6) / 10).toFixed(1);

function periodRange(p) {
  if (p.kind === 'day') return { from: p.value, to: p.value, label: niceDate(p.value) };
  if (p.kind === 'cw') { const w = isoWeek(p.value); return { from: p.value, to: addDays(p.value, 6), label: `CW${w.w} ${w.y} (${shortDate(p.value)} to ${shortDate(addDays(p.value, 6))})` }; }
  if (p.kind === 'month') { const r = monthRange(p.value); const [y, m] = p.value.split('-').map(Number); return { ...r, label: `${MONTHS[m - 1]} ${y}` }; }
  if (p.kind === 'fy') return { ...fyRange(+p.value), label: fyLabel(+p.value) };
  if (p.kind === 'year') return { from: `${p.value}-01-01`, to: `${p.value}-12-31`, label: `${p.value}` };
  return { from: p.from, to: p.to, label: `${shortDate(p.from)} to ${shortDate(p.to)}` };
}
function defaultPeriodValue(kind, anchor = today()) {
  if (kind === 'day') return anchor;
  if (kind === 'cw') return mondayOf(anchor);
  if (kind === 'month') return anchor.slice(0, 7);
  if (kind === 'fy') return String(fyOf(anchor));
  if (kind === 'year') return anchor.slice(0, 4);
  return anchor;
}
function stepPeriod(p, dir) {
  if (p.kind === 'day') return { ...p, value: addDays(p.value, dir) };
  if (p.kind === 'cw') return { ...p, value: addDays(p.value, 7 * dir) };
  if (p.kind === 'month') { const [y, m] = p.value.split('-').map(Number); const d = new Date(y, m - 1 + dir, 1); return { ...p, value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}` }; }
  if (p.kind === 'fy' || p.kind === 'year') return { ...p, value: String(+p.value + dir) };
  return p;
}

/* ---------- state ---------- */
const DEFAULT_CATS = [
  ['Work', 0, 'work', 0, 0, ''],
  ['Meetings', 6, 'work', 0, 0, 'meeting meet call standup discussion sync interview'],
  ['Learning', 2, 'work', 0, 0, 'learn learning course study training reading webinar'],
  ['Personal', 1, 'personal', 0, 1, 'personal shopping bank errand errands chores groceries bill laundry cleaning'],
  ['Family', 4, 'personal', 0, 1, 'family kids mom dad parents wife son daughter'],
  ['Health', 5, 'personal', 0, 1, 'gym walk yoga run exercise workout doctor'],
  ['Meals', 3, 'personal', 1, 1, 'lunch breakfast dinner snack meal'],
  ['Break', 7, 'personal', 1, 1, 'break tea coffee rest nap'],
  ['Restroom', 9, 'personal', 1, 1, 'restroom toilet washroom bathroom loo'],
  ['Commute', 8, 'personal', 0, 1, 'commute travel drive cab bus train metro'],
  ['Sleep', 10, 'personal', 0, 1, 'sleep'],
];
const STATUSES = ['Planned', 'In progress', 'On hold', 'Blocked', 'Completed', 'Cancelled'];
function emptyData() {
  const t = 1;
  const categories = {};
  DEFAULT_CATS.forEach(([name, slot, kind, nest, noProject, keywords], i) => {
    const id = 'c' + i;
    categories[id] = { id, name, slot, kind, nest: !!nest, noProject: !!noProject, keywords, order: i, u: t };
  });
  return { projects: {}, tasks: {}, logs: {}, categories };
}
const S = { data: emptyData(), v: 0 };
const TABLES = ['projects', 'tasks', 'logs', 'categories'];
const live = t => Object.values(S.data[t]).filter(r => !r.del);
let idxCache = null, idxV = -1;

/* per-record merge: newest edit wins, deletions travel as tombstones */
function mergeData(a, b) {
  let changedA = false, changedB = false; const out = {};
  for (const t of TABLES) {
    out[t] = { ...(a[t] || {}) };
    const bt = b[t] || {};
    for (const id in bt) { const x = out[t][id]; if (!x || (bt[id].u || 0) > (x.u || 0)) { out[t][id] = bt[id]; changedA = true; } }
    for (const id in out[t]) { const y = bt[id]; if (!y || (out[t][id].u || 0) > (y.u || 0)) changedB = true; }
  }
  return { data: out, localChanged: changedA, remoteBehind: changedB };
}

/* ---------- index and time arithmetic ---------- */
const catOf = id => S.data.categories[id] || { id, name: 'Other', slot: 8, kind: 'personal' };
const logStart = l => hm(l.start);
const logEnd = l => l.start ? hm(l.start) + l.mins : null;
function unionLen(ranges) {
  const r = ranges.filter(x => x[1] > x[0]).sort((a, b) => a[0] - b[0]); let tot = 0, cur = null;
  for (const [s, e] of r) { if (!cur) cur = [s, e]; else if (s <= cur[1]) cur[1] = Math.max(cur[1], e); else { tot += cur[1] - cur[0]; cur = [s, e]; } }
  if (cur) tot += cur[1] - cur[0]; return tot;
}
function index() {
  if (idxCache && idxV === S.v) return idxCache;
  const byDate = {}, net = {}, byTask = {};
  for (const l of live('logs')) (byDate[l.date] ||= []).push(l);
  for (const d in byDate) {
    const ls = byDate[d].sort((a, b) => (logStart(a) ?? 9999) - (logStart(b) ?? 9999));
    const nests = ls.filter(l => l.start && catOf(l.category).nest).map(l => [logStart(l), logEnd(l)]);
    for (const l of ls) {
      let n = l.mins;
      if (l.start && !catOf(l.category).nest) {
        const s = logStart(l), e = logEnd(l);
        n -= unionLen(nests.map(([a, b]) => [Math.max(a, s), Math.min(b, e)]));
      }
      net[l.id] = Math.max(0, n);
      if (l.taskId) (byTask[l.taskId] ||= []).push(l);
    }
  }
  idxCache = { byDate, net, byTask }; idxV = S.v; return idxCache;
}
const netOf = l => index().net[l.id] ?? l.mins;
const logsOn = d => index().byDate[d] || [];
function logsIn(from, to) {
  const out = []; const bd = index().byDate;
  for (const d in bd) if (d >= from && d <= to) out.push(...bd[d]);
  return out.sort((a, b) => a.date.localeCompare(b.date) || (logStart(a) ?? 9999) - (logStart(b) ?? 9999));
}
function dayStats(d) {
  const ls = logsOn(d); let work = 0, personal = 0;
  for (const l of ls) { if (catOf(l.category).kind === 'work') work += netOf(l); else personal += netOf(l); }
  const covered = unionLen(ls.filter(l => l.start).map(l => [logStart(l), logEnd(l)]));
  const untimed = ls.filter(l => !l.start).reduce((a, l) => a + l.mins, 0);
  return { work, personal, total: work + personal, covered: Math.min(1440, covered + untimed), count: ls.length };
}
function gapsOn(d) {
  const ranges = logsOn(d).filter(l => l.start).map(l => [logStart(l), logEnd(l)]).sort((a, b) => a[0] - b[0]);
  const gaps = []; let c = 0;
  for (const [s, e] of ranges) { if (s > c) gaps.push([c, s]); c = Math.max(c, e); }
  if (c < 1440) gaps.push([c, 1440]);
  return gaps;
}
/* blocks that clash with a proposed slot; breaks and other nesting items never clash */
function findConflicts(date, start, mins, category, ignoreId) {
  if (start == null) return [];
  if (catOf(category).nest) return [];
  const e = start + mins;
  return logsOn(date).filter(l => l.id !== ignoreId && l.start && !catOf(l.category).nest && logStart(l) < e && logEnd(l) > start);
}
const nestedIn = (date, start, mins, ignoreId) => {
  const e = start + mins;
  return logsOn(date).filter(l => l.id !== ignoreId && l.start && logStart(l) < e && logEnd(l) > start);
};

/* ---------- tasks and projects ---------- */
const kids = id => live('tasks').filter(t => t.parentId === id);
const tasksOf = pid => live('tasks').filter(t => (t.projectId || null) === (pid || null) && !t.parentId);
function plannedOf(t) {
  const k = kids(t.id);
  if (k.length) return k.reduce((a, c) => a + plannedOf(c), 0);
  if (t.plannedMins) return t.plannedMins;
  if (t.plannedStart && t.plannedEnd && t.plannedStart.slice(0, 10) === t.plannedEnd.slice(0, 10)) {
    const m = (new Date(t.plannedEnd) - new Date(t.plannedStart)) / 6e4; return m > 0 ? m : 0;
  }
  return 0;
}
function actualLogs(t) { const own = index().byTask[t.id] || []; return kids(t.id).reduce((a, k) => a.concat(actualLogs(k)), own.slice()); }
const actualOf = t => actualLogs(t).reduce((a, l) => a + netOf(l), 0);
function actualSpan(logs) {
  if (!logs.length) return null;
  const s = logs.map(l => l.date).sort(); return { from: s[0], to: s[s.length - 1] };
}
function pctOf(t) {
  if (t.status === 'Completed') return 100;
  const k = kids(t.id).filter(x => x.status !== 'Cancelled');
  if (!k.length) return t.pct || 0;
  const w = k.map(x => plannedOf(x) || 60); const tot = w.reduce((a, b) => a + b, 0);
  return k.reduce((a, x, i) => a + pctOf(x) * w[i], 0) / tot;
}
function projectPct(pid) {
  const ts = tasksOf(pid).filter(x => x.status !== 'Cancelled'); if (!ts.length) return 0;
  const w = ts.map(x => plannedOf(x) || 60); const tot = w.reduce((a, b) => a + b, 0);
  return ts.reduce((a, x, i) => a + pctOf(x) * w[i], 0) / tot;
}
const isClosed = t => t.status === 'Completed' || t.status === 'Cancelled';
function isOverdue(t, now = new Date()) {
  if (isClosed(t) || !t.plannedEnd) return false;
  const end = t.plannedEnd.length <= 10 ? new Date(t.plannedEnd + 'T23:59') : new Date(t.plannedEnd);
  return end < now;
}
function taskBuckets(list) {
  const b = { active: [], pending: [], overdue: [], completed: [] };
  for (const t of list) {
    if (t.status === 'Cancelled') continue;
    if (t.status === 'Completed') b.completed.push(t);
    else if (isOverdue(t)) b.overdue.push(t);
    else if (t.status === 'In progress') b.active.push(t);
    else b.pending.push(t);
  }
  return b;
}
const nextProjectCode = () => {
  const n = Object.values(S.data.projects).map(p => +String(p.code).replace(/\D/g, '') || 0);
  return 'P-' + String((n.length ? Math.max(...n) : 0) + 1).padStart(3, '0');
};

/* ---------- keyword mapping ---------- */
const STOP = new Set('the a an of for to and on in at with from by review update work task new my re of is'.split(' '));
const tokens = s => (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 1 && !STOP.has(w));
function matchProject(text) {
  const q = tokens(text); if (!q.length) return null;
  let best = null;
  for (const p of live('projects')) {
    const name = new Set(tokens(p.name + ' ' + p.code)), other = new Set(tokens(p.desc));
    for (const t of live('tasks')) if (t.projectId === p.id) tokens(t.title).forEach(w => other.add(w));
    let sc = 0;
    for (const w of q) { if (name.has(w)) sc += 2; else if (other.has(w)) sc += 1; else if ([...name].some(n => n.length > 3 && w.length > 3 && (n.startsWith(w) || w.startsWith(n)))) sc += 1.5; }
    if (sc && (!best || sc > best.score)) best = { project: p, score: sc };
  }
  return best && best.score >= 2 ? best : null;
}
function matchTask(text, projectId) {
  const q = new Set(tokens(text)); if (!q.size) return null; let best = null;
  for (const t of live('tasks')) {
    if (isClosed(t) || (projectId && t.projectId !== projectId)) continue;
    const w = tokens(t.title); if (!w.length) continue;
    const hit = w.filter(x => q.has(x)).length / w.length;
    if (hit >= .6 && (!best || hit > best.hit)) best = { task: t, hit };
  }
  return best && best.task;
}
function guessCategory(text) {
  const q = new Set((text || '').toLowerCase().split(/[^a-z0-9]+/));
  for (const c of live('categories').sort((a, b) => b.order - a.order)) {
    if (q.has(c.name.toLowerCase()) || (c.keywords || '').split(/\s+/).some(k => k && q.has(k))) return c.id;
  }
  return null;
}

/* ---------- quick-log parser ---------- */
function parseClock(h, m, ap) {
  h = +h; m = +(m || 0);
  if (ap) { ap = ap.toLowerCase(); if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0; }
  return h * 60 + m;
}
function parseQuick(text, baseDate) {
  let s = ' ' + text.trim() + ' '; const r = { date: baseDate, start: null, mins: null, title: '', projectHint: null };
  const take = (re, fn) => { const m = s.match(re); if (m) { s = s.replace(m[0], ' '); fn(m); return true; } return false; };
  take(/\s(today|yesterday|(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*|\d{1,2}[\/.]\d{1,2}(?:[\/.]\d{2,4})?)\s/i, m => {
    const v = m[1].toLowerCase();
    if (v === 'today') r.date = today();
    else if (v === 'yesterday') r.date = addDays(today(), -1);
    else if (/^\d/.test(v)) {
      const [d, mo, y] = v.split(/[\/.]/).map(Number); const now = new Date();
      let yr = y ? (y < 100 ? 2000 + y : y) : now.getFullYear();
      let c = fmtD(new Date(yr, mo - 1, d)); if (!y && c > today()) c = fmtD(new Date(yr - 1, mo - 1, d));
      r.date = c;
    } else {
      const i = DAYS.findIndex(x => v.startsWith(x.toLowerCase()));
      if (i >= 0) { let c = today(); while (toDate(c).getDay() !== i) c = addDays(c, -1); r.date = c; } else s = ' ' + m[1] + s;
    }
  });
  take(/\s(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s/i, m => {
    let a = parseClock(m[1], m[2], m[3] || (m[6] && +m[1] < 12 && +m[4] < 12 && +m[1] <= +m[4] ? m[6] : null));
    let b = parseClock(m[4], m[5], m[6]);
    if (!m[3] && !m[6]) { if (a < 7 * 60) { a += 720; b += 720; } else if (b <= a && b + 720 > a) b += 720; }
    if (a < 1440 && b > a) { r.start = a; r.mins = b - a; } else if (a < 1440 && b < a) { r.start = a; r.mins = 1440 - a + b; }
  });
  take(/\s(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)(?:\s*(\d+)\s*(?:m|min|mins))?\s/i, m => { r.mins = Math.round(+m[1] * 60) + (+m[2] || 0); })
    || take(/\s(\d+)\s*(?:m|min|mins|minutes)\s/i, m => { r.mins = +m[1]; });
  if (r.start == null) take(/\s(\d{1,2})[:.](\d{2})\s*(am|pm)?\s|\s(\d{1,2})\s*(am|pm)\s/i, m => { r.start = parseClock(m[1] ?? m[4], m[2], m[3] || m[5]); });
  take(/\s@(\S+)/, m => { r.projectHint = m[1]; });
  r.title = s.replace(/\s+/g, ' ').trim();
  return r;
}
/* Split anything crossing midnight into one entry per day */
function splitMidnight(date, start, mins) {
  if (start == null || start + mins <= 1440) return [{ date, start, mins }];
  const parts = []; let d = date, s = start, left = mins;
  while (left > 0) { const m = Math.min(left, 1440 - s); parts.push({ date: d, start: s, mins: m }); left -= m; d = addDays(d, 1); s = 0; }
  return parts;
}
function periodStats(from, to) {
  const logs = logsIn(from, to); const byCat = {}, byProj = {}; let work = 0, personal = 0;
  for (const l of logs) {
    const n = netOf(l), c = catOf(l.category);
    byCat[c.id] = (byCat[c.id] || 0) + n;
    if (l.projectId) byProj[l.projectId] = (byProj[l.projectId] || 0) + n;
    if (c.kind === 'work') work += n; else personal += n;
  }
  return { logs, byCat, byProj, work, personal, total: work + personal };
}
function streak(endDate = today()) {
  let d = endDate, n = 0; if (!logsOn(d).length) d = addDays(d, -1);
  while (logsOn(d).length) { n++; d = addDays(d, -1); } return n;
}
Object.assign(TT, { S, uid, parseQuick, findConflicts, mergeData, isoWeek, fyOf, fyWeeks, periodRange, netOf, dayStats, gapsOn, pctOf, projectPct, plannedOf, actualOf, splitMidnight, matchProject, matchTask, guessCategory, taskBuckets });
