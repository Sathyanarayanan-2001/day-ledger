/* UI */
const $ = (s, r = document) => r.querySelector(s);
const ICON = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  dash: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  log: '<path d="M12 5v14M5 12h14"/>',
  plan: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  ledger: '<path d="M4 4h16v16H4zM4 10h16M4 15h16M10 10v10"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>',
  left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11"/>',
};
const svg = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
const PAGES = [['home', 'Home'], ['dash', 'Dashboard'], ['log', 'Log time'], ['plan', 'Projects'], ['ledger', 'All entries'], ['settings', 'Settings'], ['guide', 'Guide']];
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const slotVar = s => `var(--s${s})`;
const slotHex = s => css(`--s${s}`);

const UI = {
  page: 'home', date: today(), dashP: { kind: 'month', value: defaultPeriodValue('month') },
  ledP: { kind: 'month', value: defaultPeriodValue('month') }, led: { q: '', cat: '', proj: '', kind: '', group: 'date', sort: [['date', -1]], limit: 200 },
  projSel: null, quick: '', quickSkipNew: false, charts: [],
};

/* ---------- persistence ---------- */
async function commit(opts = {}) {
  S.v++;
  try { await Store.set('state', S.data); } catch { toast('Could not save on this device. Export a backup from Settings.'); }
  if (!opts.silent) Sync.changed();
  render();
}
const put = (t, r) => { r.u = Date.now(); S.data[t][r.id] = r; return r; };
const rm = (t, id) => { const r = S.data[t][id]; if (r) { S.data[t][id] = { id, del: true, u: Date.now() }; } };

let toastT;
function toast(msg, undo) {
  const t = $('#toast'); t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button id="undo">Undo</button>' : ''}`; t.classList.add('show');
  if (undo) $('#undo').onclick = () => { undo(); t.classList.remove('show'); };
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), undo ? 7000 : 3500);
}

/* ---------- writing logs ---------- */
function makeLogs(e) {
  const made = [];
  for (const p of splitMidnight(e.date, e.start, e.mins)) {
    made.push(put('logs', { id: uid(), date: p.date, start: p.start == null ? null : hhmm(p.start), mins: p.mins, title: e.title, desc: e.desc || '', category: e.category, projectId: e.projectId || null, taskId: e.taskId || null, sample: e.sample }));
  }
  if (e.taskId) { const t = S.data.tasks[e.taskId]; if (t && t.status === 'Planned') setStatus(t, 'In progress', ''); }
  return made;
}
function setStatus(t, status, note) {
  if (t.status === status && !note) return;
  const hist = (t.history || []).concat({ at: new Date().toISOString(), status, note });
  const pct = status === 'Completed' ? 100 : t.pct;
  put('tasks', { ...t, status, statusNote: note || t.statusNote || '', history: hist, pct });
}
/* the single gate every entry passes through */
function saveEntry(e, ignoreId) {
  const conflicts = e.start == null ? [] : findConflicts(e.date, e.start, Math.min(e.mins, 1440 - e.start), e.category, ignoreId);
  const finish = (entry) => {
    if (ignoreId) rm('logs', ignoreId);
    const made = makeLogs(entry);
    let msg = `Logged ${fmtMins(entry.mins)}${entry.title ? ': ' + entry.title : ''}`;
    if (entry.start != null && catOf(entry.category).nest) {
      const host = nestedIn(entry.date, entry.start, entry.mins, made[0].id).find(l => !catOf(l.category).nest);
      if (host) msg = `${fmtMins(entry.mins)} taken off ${host.title || catOf(host.category).name}`;
    }
    UI.date = entry.date; commit();
    toast(msg, () => { made.forEach(m => rm('logs', m.id)); commit(); });
  };
  if (conflicts.length) conflictDialog(e, conflicts, finish, ignoreId); else finish(e);
}
function conflictDialog(e, conflicts, finish, ignoreId) {
  const s = e.start, end = e.start + e.mins;
  /* longest free stretch inside the proposed slot */
  const busy = conflicts.map(l => [Math.max(logStart(l), s), Math.min(logEnd(l), end)]).sort((a, b) => a[0] - b[0]);
  let c = s, free = null;
  for (const [a, b] of busy) { if (a > c && (!free || a - c > free[1] - free[0])) free = [c, a]; c = Math.max(c, b); }
  if (c < end && (!free || end - c > free[1] - free[0])) free = [c, end];
  dialog(`<h2>These times overlap</h2>
    <p class="sub">${esc(e.title || catOf(e.category).name)} ${hhmm(s)} to ${hhmm(end)} clashes with:</p>
    <div>${conflicts.map(l => `<div class="row small"><i class="dot" style="background:${slotVar(catOf(l.category).slot)}"></i><span class="num">${l.start} to ${hhmm(logEnd(l))}</span><span class="grow">${esc(l.title || catOf(l.category).name)}</span></div>`).join('')}</div>
    <div class="stack">
      ${free ? `<button class="btn pri" data-c="trim">Shorten new entry to ${hhmm(free[0])} to ${hhmm(free[1])}</button>` : ''}
      <button class="btn" data-c="split">Keep new entry and cut the existing ${conflicts.length > 1 ? 'ones' : 'one'} around it</button>
      <button class="btn" data-c="both">Keep both (time counts twice)</button>
      <button class="btn ghost" data-c="cancel">Go back</button>
    </div>`, d => {
    d.onclick = ev => {
      const a = ev.target.closest('[data-c]')?.dataset.c; if (!a) return;
      d.close();
      if (a === 'trim') finish({ ...e, start: free[0], mins: free[1] - free[0] });
      if (a === 'both') finish(e);
      if (a === 'split') {
        for (const l of conflicts) {
          const ls = logStart(l), le = logEnd(l);
          rm('logs', l.id);
          const base = { ...l, id: undefined }; delete base.id;
          if (ls < s) put('logs', { ...base, id: uid(), start: hhmm(ls), mins: s - ls });
          if (le > end) put('logs', { ...base, id: uid(), start: hhmm(end), mins: le - end });
        }
        S.v++; finish(e);
      }
    };
  });
}
function createProject(name, extra = {}) {
  return put('projects', { id: uid(), code: nextProjectCode(), name, desc: '', plannedStart: '', plannedEnd: '', ...extra });
}

/* ---------- quick log ---------- */
function resolveQuick(text, baseDate) {
  const q = parseQuick(text, baseDate);
  const cat = guessCategory(q.title) || null;
  let pm = null;
  if (q.projectHint) pm = live('projects').find(p => (p.name + ' ' + p.code).toLowerCase().includes(q.projectHint.toLowerCase())) || null;
  const hint = pm ? { project: pm } : (q.title ? matchProject(q.title) : null);
  const category = cat || (live('categories').find(c => c.name === 'Work') || live('categories')[0]).id;
  const noProj = catOf(category).noProject;
  const project = noProj ? null : hint?.project || null;
  const task = noProj ? null : matchTask(q.title, project?.id);
  return { ...q, category, project: project || (task ? S.data.projects[task.projectId] : null), task, noProj };
}
function quickPreview(baseDate) {
  const text = UI.quick; if (!text.trim()) return '<span class="muted">Try: 10:15 restroom 5m, or 9-11:30 grid code review, or yesterday lunch 30m</span>';
  const r = resolveQuick(text, baseDate); const c = catOf(r.category);
  const when = r.start != null ? `${hhmm(r.start)}${r.mins ? ' to ' + hhmm((r.start + r.mins) % 1440) : ''}` : 'No clock time';
  let h = `<span class="tag">${shortDate(r.date)}</span><span class="tag num">${when}</span><span class="tag">${r.mins ? fmtMins(r.mins) : 'Add a duration'}</span>
  <span class="tag row" style="gap:5px"><i class="dot" style="background:${slotVar(c.slot)}"></i>${esc(c.name)}</span>`;
  if (r.project) h += `<span class="tag">${esc(r.project.code)} ${esc(r.project.name)}</span>`;
  if (r.task) h += `<span class="tag">Task: ${esc(r.task.title)}</span>`;
  if (!r.project && !r.noProj && r.title && r.mins && !UI.quickSkipNew) {
    h += `<div class="prompt" style="width:100%"><span class="grow">No matching project. Create ${nextProjectCode()} "${esc(r.title)}"?</span><button class="btn sm" data-act="quickNewProject">Create project</button><button class="btn sm ghost" data-act="quickSkip">No project</button></div>`;
  }
  return h;
}
function quickSubmit(baseDate) {
  const r = resolveQuick(UI.quick, baseDate);
  if (!r.mins) { toast('Add a duration, like 30m or 1.5h, or a range like 9-10:30'); return; }
  saveEntry({ date: r.date, start: r.start, mins: r.mins, title: r.title, category: r.category, projectId: r.project?.id, taskId: r.task?.id });
  UI.quick = ''; UI.quickSkipNew = false;
}
const quickBox = base => `<form class="quick" data-form="quick" data-base="${base}">
  <input id="quickIn" aria-label="Quick log" placeholder="What did you do? e.g. 2-3:30 CEA compliance report" autocomplete="off" value="${esc(UI.quick)}">
  <button class="btn pri">Log</button></form><div class="preview" id="quickPrev">${quickPreview(base)}</div>`;
function frequent() {
  const seen = {}; const since = addDays(today(), -30);
  for (const l of logsIn(since, today())) if (l.title) { const k = l.title.toLowerCase(); (seen[k] ||= { l, n: 0 }).n++; }
  return Object.values(seen).sort((a, b) => b.n - a.n).slice(0, 7).map(x => x.l);
}

/* ---------- day strip ---------- */
function stripHTML(d, big) {
  const ls = logsOn(d).filter(l => l.start); const pct = n => (n / 14.4).toFixed(3) + '%';
  const bars = ls.map(l => {
    const c = catOf(l.category), tip = `${l.start} to ${hhmm(logEnd(l))}, ${l.title || c.name} (${fmtMins(l.mins)})`;
    return `<button class="${c.nest ? 'n' : 'b'}" data-act="editLog" data-id="${l.id}" title="${esc(tip)}" aria-label="${esc(tip)}" style="left:${pct(logStart(l))};width:${pct(Math.max(l.mins, 3))};background:${slotVar(c.slot)}"></button>`;
  }).join('');
  const nowM = new Date(); const now = d === today() ? `<div class="now" style="left:${pct(nowM.getHours() * 60 + nowM.getMinutes())}"></div>` : '';
  return `<div class="strip" role="img" aria-label="Day timeline, unlogged time is hatched">${bars}${now}</div>
  <div class="hours num"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>`;
}
function legendFor(logs) {
  const c = {}; logs.forEach(l => c[l.category] = 1);
  return `<div class="legend">${Object.keys(c).map(id => `<span><i class="dot" style="background:${slotVar(catOf(id).slot)}"></i>${esc(catOf(id).name)}</span>`).join('')}</div>`;
}

/* ---------- pages ---------- */
function pageHome() {
  const d = today(), st = dayStats(d), w = isoWeek(d), b = taskBuckets(live('tasks').filter(t => !t.parentId));
  const weekFrom = mondayOf(d), week = periodStats(weekFrom, addDays(weekFrom, 6));
  const gaps = lastMissing(14);
  return `<div class="head"><div><h1>${niceDate(d)}</h1><p class="sub">CW${w.w}, ${fyLabel(fyOf(d))}</p></div></div>
  <section class="hero">
    <div class="row between wrap"><div><span class="big num">${fmtMins(st.total)}</span> <span class="sub">logged today</span></div>
    <div class="sub small num">${fmtMins(st.work)} work, ${fmtMins(st.personal)} personal</div></div>
    ${stripHTML(d)}${legendFor(logsOn(d))}
  </section>
  <section class="panel" style="margin-bottom:14px">${quickBox(d)}</section>
  ${gaps.length ? `<p class="small sub" style="margin:0 0 14px">Nothing logged on ${gaps.slice(0, 5).map(g => `<a href="#log" data-act="goDay" data-d="${g}">${shortDate(g)}</a>`).join(', ')}${gaps.length > 5 ? ` and ${gaps.length - 5} more` : ''}.</p>` : ''}
  <nav class="hubnav" aria-label="Sections">
    <a href="#dash"><b>Dashboard</b><span class="small sub">${fmtMins(week.total)} this week, ${b.overdue.length} overdue</span></a>
    <a href="#log"><b>Log time</b><span class="small sub">Fill any day, any gap</span></a>
    <a href="#plan"><b>Projects</b><span class="small sub">${live('projects').length} projects, ${b.active.length} active tasks</span></a>
    <a href="#ledger"><b>All entries</b><span class="small sub">Filter, group, export</span></a>
    <a href="#settings"><b>Settings</b><span class="small sub">${esc(syncLabel())}</span></a>
    <a href="#guide"><b>Guide</b><span class="small sub">Set up and how it works</span></a>
  </nav>`;
}
function lastMissing(n) { const o = []; for (let i = 1; i <= n; i++) { const d = addDays(today(), -i); if (!logsOn(d).length) o.push(d); } return S.data && live('logs').length ? o : []; }

function pageLog() {
  const d = UI.date, st = dayStats(d), mon = mondayOf(d), w = isoWeek(d);
  const days = [...Array(7)].map((_, i) => addDays(mon, i));
  const ls = logsOn(d), timed = ls.filter(l => l.start), untimed = ls.filter(l => !l.start);
  const rows = []; let c = 0;
  for (const l of timed) {
    const s = logStart(l);
    if (s > c) rows.push(gapRow(d, c, s));
    rows.push(entryRow(l, catOf(l.category).nest && s < c)); c = Math.max(c, logEnd(l));
  }
  if (c < 1440 && timed.length) rows.push(gapRow(d, c, d === today() ? Math.max(c, Math.min(1440, new Date().getHours() * 60 + new Date().getMinutes())) : 1440));
  const fr = frequent();
  return `<div class="head"><h1>Log time</h1>
    <div class="row wrap"><button class="btn icon" data-act="dayStep" data-n="-7" aria-label="Previous week">${svg('left')}</button><input type="date" id="datePick" value="${d}" style="width:auto"><button class="btn icon" data-act="dayStep" data-n="7" aria-label="Next week">${svg('right')}</button><button class="btn" data-act="goToday">Today</button></div></div>
  <p class="small sub" style="margin:-10px 0 8px">CW${w.w}</p>
  <div class="weekbar">${days.map(x => { const s = dayStats(x); return `<button class="wd ${x === d ? 'on' : ''}" data-act="goDay" data-d="${x}">${DAYS[toDate(x).getDay()]}<b class="num">${toDate(x).getDate()}</b><span class="num">${s.total ? fmtH(s.total) + 'h' : ''}&nbsp;</span><div class="cov"><i style="width:${Math.min(100, s.covered / 14.4)}%"></i></div></button>`; }).join('')}</div>
  <section class="panel" style="margin-bottom:14px">${quickBox(d)}
    <div class="row wrap" style="margin-top:6px;gap:6px">
      ${fr.map(l => `<button class="chip" data-act="useFreq" data-id="${l.id}"><i class="dot" style="background:${slotVar(catOf(l.category).slot)}"></i>${esc(l.title)}</button>`).join('')}
      <button class="btn sm" data-act="newLog">Full entry</button><button class="btn sm" data-act="startWatch">${svg('play')}Start timer</button>
    </div></section>
  <section class="hero"><div class="row between wrap"><h2>${niceDate(d)}</h2><span class="sub small num">${fmtMins(st.total)} logged, ${Math.round(st.covered / 14.4)}% of the day accounted for</span></div>
    ${stripHTML(d)}${legendFor(ls)}</section>
  <section class="panel">${ls.length ? rows.join('') + (untimed.length ? `<h3 style="margin:14px 0 4px">No clock time</h3>${untimed.map(l => entryRow(l)).join('')}` : '') : `<p class="empty">Nothing logged for this day yet. Type above, or <button class="btn sm" data-act="newLog">add a full entry</button></p>`}</section>`;
}
function gapRow(d, a, b) { return `<button class="entry gap" data-act="fillGap" data-a="${a}" data-b="${b}"><span class="t num">${hhmm(a)} to ${b === 1440 ? '24:00' : hhmm(b)}</span><span class="grow">Unlogged, ${fmtMins(b - a)}</span><span>Fill</span></button>`; }
function entryRow(l, nested) {
  const c = catOf(l.category), p = S.data.projects[l.projectId], n = netOf(l);
  return `<button class="entry ${nested ? 'nest' : ''}" data-act="editLog" data-id="${l.id}"><span class="t num">${l.start ? `${l.start} to ${hhmm(logEnd(l) % 1440)}` : ''}</span><i class="bar" style="background:${slotVar(c.slot)}"></i>
  <span class="grow"><span class="title" style="display:block">${esc(l.title || c.name)}</span><span class="small muted">${esc(c.name)}${p ? ', ' + esc(p.code) + ' ' + esc(p.name) : ''}</span></span>
  <span class="right num nowrap">${fmtMins(n)}${n !== l.mins ? `<span class="small muted" style="display:block">of ${fmtMins(l.mins)}</span>` : ''}</span></button>`;
}

function periodBar(key) {
  const p = UI[key]; const r = periodRange(p); const now = today();
  const kinds = [['day', 'Day'], ['cw', 'Week'], ['month', 'Month'], ['fy', 'FY'], ['year', 'Year'], ['custom', 'Custom']];
  let pick = '';
  if (p.kind === 'day') pick = `<input type="date" data-pv="${key}" value="${p.value}">`;
  if (p.kind === 'month') pick = `<input type="month" data-pv="${key}" value="${p.value}">`;
  if (p.kind === 'cw') {
    const fy = fyOf(p.value);
    pick = `<select data-pfy="${key}" aria-label="Financial year">${fyOptions(fy)}</select><select data-pv="${key}" aria-label="Calendar week">${fyWeeks(fy).map(w => `<option value="${w.monday}" ${w.monday === p.value ? 'selected' : ''}>CW${w.w}, ${shortDate(w.monday)}</option>`).join('')}</select>`;
  }
  if (p.kind === 'fy') pick = `<select data-pv="${key}">${fyOptions(+p.value)}</select>`;
  if (p.kind === 'year') { const y = +now.slice(0, 4); pick = `<select data-pv="${key}">${[...Array(8)].map((_, i) => `<option ${y - i === +p.value ? 'selected' : ''}>${y - i}</option>`).join('')}</select>`; }
  if (p.kind === 'custom') pick = `<input type="date" data-pc="${key}.from" value="${r.from}"><input type="date" data-pc="${key}.to" value="${r.to}">`;
  return `<div class="filters"><div class="seg" role="group" aria-label="Period">${kinds.map(([k, l]) => `<button class="${p.kind === k ? 'on' : ''}" data-act="pKind" data-key="${key}" data-k="${k}">${l}</button>`).join('')}</div>
  ${p.kind !== 'custom' ? `<button class="btn icon" data-act="pStep" data-key="${key}" data-n="-1" aria-label="Previous period">${svg('left')}</button>` : ''}${pick}${p.kind !== 'custom' ? `<button class="btn icon" data-act="pStep" data-key="${key}" data-n="1" aria-label="Next period">${svg('right')}</button>` : ''}</div>`;
}
function fyOptions(sel) { const y = fyOf(today()); const list = [...Array(8)].map((_, i) => y - i); if (!list.includes(sel)) list.push(sel); return list.map(v => `<option value="${v}" ${v === sel ? 'selected' : ''}>${fyLabel(v)}</option>`).join(''); }

function pageDash() {
  const r = periodRange(UI.dashP), st = periodStats(r.from, r.to);
  const all = live('tasks').filter(t => !kids(t.id).length);
  const inP = t => { const s = (t.plannedStart || '').slice(0, 10), e = (t.plannedEnd || '').slice(0, 10); const logged = actualLogs(t).some(l => l.date >= r.from && l.date <= r.to); return logged || (s && s <= r.to && (!e || e >= r.from)) || (!s && !e && t.status !== 'Completed'); };
  const b = taskBuckets(all.filter(inP)); const open = taskBuckets(all); /* overdue and active are live states */
  const days = Math.max(1, (toDate(r.to > today() ? today() : r.to) - toDate(r.from)) / 864e5 + 1);
  const logged = new Set(st.logs.map(l => l.date)).size;
  return `<div class="head"><div><h1>Dashboard</h1><p class="sub">${esc(r.label)}</p></div></div>${periodBar('dashP')}
  <div class="metrics">
    <div class="metric"><div class="v num">${open.active.length}</div><div class="l">${open.active.length ? '<i class="breathe"></i>' : ''}Active</div></div>
    <div class="metric"><div class="v num">${open.pending.length}</div><div class="l">Pending</div></div>
    <div class="metric over"><div class="v num">${open.overdue.length}</div><div class="l">Overdue</div></div>
    <div class="metric"><div class="v num">${b.completed.length}</div><div class="l">Completed</div></div>
    <div class="metric"><div class="v num">${fmtH(st.total)}h</div><div class="l">Time logged</div></div>
    <div class="metric"><div class="v num">${logged}<span class="small muted"> of ${r.from > today() ? 0 : Math.round(days)}</span></div><div class="l">Days logged</div></div>
  </div>
  <div class="gridmain">
    <div class="stack">
      <section class="panel"><h2>Most time spent</h2>${st.total ? `<div class="chart" id="c1w"><canvas id="c1"></canvas></div>` : emptyDash()}</section>
      <section class="panel"><h2>Time by ${trendUnit(r)}</h2>${st.total ? `<div class="chart" id="c3w"><canvas id="c3"></canvas></div>` : emptyDash()}</section>
      <section class="panel"><h2>Planned vs actual</h2>${pvaData(r).labels.length ? `<div class="chart" id="c2w"><canvas id="c2"></canvas></div>` : `<p class="empty">Add planned hours to tasks in <a href="#plan">Projects</a> to compare them with logged time.</p>`}</section>
    </div>
    <div class="stack">
      ${focusPanel()}
      <section class="panel"><h2>Work and personal</h2>${splitBar(st)}</section>
      <section class="panel"><h2>Overdue</h2>${taskMini(open.overdue, 'Nothing overdue.')}</section>
      <section class="panel"><h2>Active</h2>${taskMini(open.active, 'No tasks in progress.')}</section>
      <section class="panel"><h2>Logging streak: ${streak()} days</h2>${heat()}</section>
    </div>
  </div>`;
}
const emptyDash = () => `<p class="empty">Nothing logged in this period. <a href="#log">Log some time</a></p>`;
const trendUnit = r => { const n = (toDate(r.to) - toDate(r.from)) / 864e5; return n <= 31 ? 'day' : n <= 120 ? 'week' : 'month'; };
function splitBar(st) {
  if (!st.total) return '<p class="muted small">Nothing logged yet.</p>';
  const w = st.work / st.total * 100;
  return `<div class="row between small num"><span>Work ${fmtH(st.work)}h</span><span>Personal ${fmtH(st.personal)}h</span></div>
  <div class="row" style="gap:2px;margin-top:6px;height:12px"><i style="width:${w}%;height:100%;background:var(--s0);border-radius:4px 0 0 4px"></i><i style="flex:1;height:100%;background:var(--s1);border-radius:0 4px 4px 0"></i></div>`;
}
function taskMini(list, none) {
  if (!list.length) return `<p class="muted small">${none}</p>`;
  return list.slice(0, 6).map(t => `<div class="task"><div class="top"><button class="name grow" data-act="editTask" data-id="${t.id}">${esc(t.title)}</button><button class="btn sm" data-act="focusTask" data-id="${t.id}" aria-label="Start focus on ${esc(t.title)}">${svg('play')}</button></div><div class="pbar" style="margin-top:6px"><i style="width:${pctOf(t)}%"></i></div></div>`).join('') + (list.length > 6 ? `<p class="small muted" style="margin-top:6px">${list.length - 6} more in <a href="#plan">Projects</a></p>` : '');
}
function focusPanel() {
  const opts = taskBuckets(live('tasks').filter(t => !kids(t.id).length)); const list = [...opts.active, ...opts.overdue, ...opts.pending];
  const set = lsGet('pomo', { focus: 25, brk: 5, long: 15 });
  return `<section class="panel"><h2>Focus timer</h2><div class="stack">
    <select id="pomoTask" aria-label="Task to focus on"><option value="">Choose a task</option>${list.map(t => `<option value="${t.id}">${esc(t.title)}</option>`).join('')}</select>
    <div class="fields keep"><label class="f">Focus (min)<input type="number" min="1" id="pF" value="${set.focus}"></label><label class="f">Break (min)<input type="number" min="1" id="pB" value="${set.brk}"></label></div>
    <button class="btn pri" data-act="pomoStart">Start focus</button></div></section>`;
}
function heat() {
  const y = fyOf(today()), r = fyRange(y); let d = mondayOf(r.from); const cells = [];
  const end = today() < r.to ? addDays(mondayOf(today()), 6) : r.to;
  while (d <= end) {
    const s = dayStats(d), lv = !s.total ? 0 : .25 + .75 * Math.min(1, s.covered / 960);
    cells.push(`<button data-act="goDay" data-d="${d}" title="${shortDate(d)}: ${fmtMins(s.total)}" aria-label="${shortDate(d)}: ${fmtMins(s.total)}" ${lv ? `style="background:color-mix(in srgb,var(--accent) ${Math.round(lv * 100)}%,var(--bg))"` : ''}></button>`);
    d = addDays(d, 1);
  }
  return `<div class="heat">${cells.join('')}</div><p class="small muted">${fyLabel(y)}. Darker days are more fully accounted for. Tap a day to fill it.</p>`;
}
function pvaData(r) {
  const out = []; const addRow = (name, ts) => {
    const inR = t => actualLogs(t).filter(l => l.date >= r.from && l.date <= r.to).reduce((a, l) => a + netOf(l), 0);
    const planned = ts.reduce((a, t) => a + plannedOf(t), 0), act = ts.reduce((a, t) => a + inR(t), 0);
    if (planned || act) out.push({ name, planned, act });
  };
  live('projects').forEach(p => addRow(`${p.code} ${p.name}`, tasksOf(p.id)));
  addRow('No project', tasksOf(null));
  const rows = out.filter(o => o.act || o.planned).sort((a, b) => b.act - a.act).slice(0, 7);
  return { labels: rows.map(o => o.name.length > 26 ? o.name.slice(0, 25) + '…' : o.name), planned: rows.map(o => +(o.planned / 60).toFixed(1)), act: rows.map(o => +(o.act / 60).toFixed(1)) };
}
function drawDash() {
  UI.charts.forEach(c => c.destroy()); UI.charts = [];
  if (UI.page !== 'dash' || !window.Chart) return;
  const r = periodRange(UI.dashP), st = periodStats(r.from, r.to); const ink = css('--ink2'), grid = css('--grid');
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily; Chart.defaults.color = ink; Chart.defaults.animation = false;
  const scale = (extra = {}) => ({ grid: { color: grid, drawTicks: false }, border: { display: false }, ...extra });
  const hours = ctx => `${ctx.dataset.label ? ctx.dataset.label + ': ' : ''}${(ctx.parsed.x ?? ctx.parsed.y ?? 0)}${ctx.chart.options.indexAxis === 'y' ? (ctx.parsed.x, 'h') : 'h'}`;
  const tip = { callbacks: { label: ctx => `${ctx.dataset.label ? ctx.dataset.label + ': ' : ''}${ctx.chart.options.indexAxis === 'y' ? ctx.parsed.x : ctx.parsed.y}h` } };
  if ($('#c1')) {
    const rows = Object.entries(st.byCat).sort((a, b) => b[1] - a[1]); const top = rows.slice(0, 7), rest = rows.slice(7).reduce((a, x) => a + x[1], 0);
    const labels = top.map(x => catOf(x[0]).name), vals = top.map(x => +(x[1] / 60).toFixed(1)), cols = top.map(x => slotHex(catOf(x[0]).slot));
    if (rest) { labels.push('Other'); vals.push(+(rest / 60).toFixed(1)); cols.push(slotHex(9)); }
    UI.charts.push(new Chart($('#c1'), { type: 'bar', data: { labels, datasets: [{ data: vals, backgroundColor: cols, borderRadius: 4, maxBarThickness: 22 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: tip }, scales: { x: scale({ title: { display: true, text: 'Hours' } }), y: { grid: { display: false }, border: { display: false } } } } }));
  }
  if ($('#c2')) {
    const d = pvaData(r);
    UI.charts.push(new Chart($('#c2'), { type: 'bar', data: { labels: d.labels, datasets: [{ label: 'Planned', data: d.planned, backgroundColor: slotHex(9), borderRadius: 4, maxBarThickness: 12 }, { label: 'Actual', data: d.act, backgroundColor: slotHex(0), borderRadius: 4, maxBarThickness: 12 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', align: 'start', labels: { boxWidth: 10, boxHeight: 10 } }, tooltip: tip }, scales: { x: scale({ title: { display: true, text: 'Hours' } }), y: { grid: { display: false }, border: { display: false } } } } }));
  }
  if ($('#c3')) {
    const unit = trendUnit(r), buckets = {};
    const keyOf = d => unit === 'day' ? d : unit === 'week' ? mondayOf(d) : d.slice(0, 7);
    let d = r.from; const end = r.to > today() ? today() : r.to;
    if (r.from <= end) while (d <= end) { (buckets[keyOf(d)] ||= { w: 0, p: 0 }); d = addDays(d, 1); }
    for (const l of st.logs) { const b = (buckets[keyOf(l.date)] ||= { w: 0, p: 0 }); if (catOf(l.category).kind === 'work') b.w += netOf(l); else b.p += netOf(l); }
    const keys = Object.keys(buckets).sort();
    const lab = k => unit === 'day' ? String(toDate(k).getDate()) : unit === 'week' ? `CW${isoWeek(k).w}` : MONTHS[+k.slice(5) - 1];
    const surface = css('--surface');
    const ds = (label, key, col) => ({ label, data: keys.map(k => +(buckets[k][key] / 60).toFixed(1)), backgroundColor: col, borderRadius: 3, maxBarThickness: 26, borderColor: surface, borderWidth: { top: 1 } });
    UI.charts.push(new Chart($('#c3'), { type: 'bar', data: { labels: keys.map(lab), datasets: [ds('Work', 'w', slotHex(0)), ds('Personal', 'p', slotHex(1))] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', align: 'start', labels: { boxWidth: 10, boxHeight: 10 } }, tooltip: tip }, scales: { x: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 8 } }, y: scale({ stacked: true, title: { display: true, text: 'Hours' } }) } } }));
  }
}

function statusClass(t) { return isOverdue(t) ? 'over' : t.status === 'In progress' ? 'prog' : (t.status === 'On hold' || t.status === 'Blocked') ? 'hold' : ''; }
function taskRow(t, sub) {
  const pl = plannedOf(t), ac = actualOf(t), pct = pctOf(t), k = kids(t.id);
  return `<div class="task ${sub ? 'sub' : ''}"><div class="top">
    <button class="name grow" data-act="editTask" data-id="${t.id}">${esc(t.title)}</button>
    <span class="status ${statusClass(t)}">${isOverdue(t) ? 'Overdue' : esc(t.status)}</span>
    <span class="small num muted">${fmtMins(ac)}${pl ? ' of ' + fmtMins(pl) : ''}</span>
    ${isClosed(t) || k.length ? '' : `<button class="btn sm" data-act="focusTask" data-id="${t.id}" aria-label="Start focus">${svg('play')}</button>`}
    ${sub ? '' : `<button class="btn sm" data-act="newTask" data-parent="${t.id}" data-project="${t.projectId || ''}">Add sub-task</button>`}
  </div><div class="row" style="margin-top:6px"><div class="pbar grow"><i style="width:${pct}%"></i></div><span class="small num">${Math.round(pct)}%</span></div>
  ${t.statusNote ? `<p class="small sub" style="margin-top:3px">${esc(t.statusNote)}</p>` : ''}</div>${k.map(x => taskRow(x, true)).join('')}`;
}
function pageProjects() {
  const ps = live('projects').sort((a, b) => String(a.code).localeCompare(b.code));
  let sel = UI.projSel; if (sel !== 'none' && !S.data.projects[sel]?.name) sel = ps[0]?.id || 'none';
  const pid = sel === 'none' ? null : sel, p = pid && S.data.projects[pid];
  const ts = tasksOf(pid); const logs = live('logs').filter(l => (l.projectId || null) === pid && (pid || l.taskId));
  const span = actualSpan(logs); const allDone = ts.length && ts.every(isClosed);
  return `<div class="head"><h1>Projects</h1><div class="row"><button class="btn" data-act="newProject">New project</button><button class="btn pri" data-act="newTask" data-project="${pid || ''}">New task</button></div></div>
  <div class="gridmain" style="grid-template-columns:minmax(0,1fr) minmax(0,2.3fr)" id="pgrid">
    <section class="panel">${ps.map(x => `<button class="proj ${x.id === sel ? 'on' : ''}" data-act="pickProject" data-id="${x.id}"><div class="row between"><span class="grow" style="font-weight:500">${esc(x.name)}</span><span class="small muted num">${esc(x.code)}</span></div><div class="row" style="margin-top:5px"><div class="pbar grow"><i style="width:${projectPct(x.id)}%"></i></div><span class="small num">${Math.round(projectPct(x.id))}%</span></div></button>`).join('')}
      <button class="proj ${sel === 'none' ? 'on' : ''}" data-act="pickProject" data-id="none">Tasks with no project</button></section>
    <section class="panel">
      ${p ? `<div class="row between wrap"><div class="grow"><h2 style="margin:0">${esc(p.name)}</h2><p class="small muted">${esc(p.code)}${p.desc ? ', ' + esc(p.desc) : ''}</p></div><button class="btn sm" data-act="editProject" data-id="${p.id}">Edit</button></div>
      <div class="row" style="margin:12px 0 6px"><div class="pbar grow" style="height:10px"><i style="width:${projectPct(pid)}%"></i></div><b class="num">${Math.round(projectPct(pid))}%</b></div>
      <div class="fields keep small" style="margin:10px 0 12px"><div><span class="muted">Planned</span><br>${p.plannedStart ? shortDate(p.plannedStart) : 'Not set'} to ${p.plannedEnd ? shortDate(p.plannedEnd) : 'not set'}</div><div><span class="muted">Actual</span><br>${span ? `${shortDate(span.from)} to ${allDone ? shortDate(span.to) : 'now'}` : 'Not started'}, ${fmtMins(logs.reduce((a, l) => a + netOf(l), 0))}</div></div>` : `<h2>Tasks with no project</h2>`}
      ${ts.length ? ts.map(t => taskRow(t)).join('') : `<p class="empty">No tasks here yet. <button class="btn sm" data-act="newTask" data-project="${pid || ''}">Add the first task</button></p>`}
    </section></div>`;
}

/* ---------- ledger ---------- */
function ledRows() {
  const r = periodRange(UI.ledP), f = UI.led; let rows = logsIn(r.from, r.to).map(l => {
    const c = catOf(l.category), p = S.data.projects[l.projectId], t = S.data.tasks[l.taskId];
    return { id: l.id, date: l.date, cw: isoWeek(l.date).w, month: l.date.slice(0, 7), start: l.start || '', end: l.start ? hhmm(logEnd(l) % 1440) : '', mins: l.mins, net: netOf(l), title: l.title, desc: l.desc, category: c.name, kind: c.kind, project: p ? `${p.code} ${p.name}` : '', task: t?.title || '', status: t?.status || '', catId: c.id, projectId: l.projectId || '' };
  });
  const q = f.q.toLowerCase();
  if (q) rows = rows.filter(x => `${x.title} ${x.desc} ${x.project} ${x.task} ${x.category}`.toLowerCase().includes(q));
  if (f.cat) rows = rows.filter(x => x.catId === f.cat);
  if (f.proj) rows = rows.filter(x => x.projectId === f.proj);
  if (f.kind) rows = rows.filter(x => x.kind === f.kind);
  rows.sort((a, b) => { for (const [k, d] of f.sort) { const v = a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0; if (v) return v * d; } return 0; });
  return { rows, r };
}
const LCOLS = [['date', 'Date'], ['cw', 'CW'], ['start', 'Start'], ['end', 'End'], ['net', 'Time'], ['title', 'Activity'], ['category', 'Category'], ['project', 'Project'], ['task', 'Task']];
function pageLedger() {
  const { rows, r } = ledRows(), f = UI.led; const total = rows.reduce((a, x) => a + x.net, 0);
  const gk = { date: x => x.date, cw: x => `CW${x.cw}, ${x.date.slice(0, 4)}`, month: x => x.month, category: x => x.category, project: x => x.project || 'No project', none: () => '' }[f.group];
  const groups = new Map(); rows.forEach(x => { const k = gk(x); (groups.get(k) || groups.set(k, []).get(k)).push(x); });
  let n = 0, body = '';
  for (const [k, list] of groups) {
    if (n >= f.limit) break;
    if (f.group !== 'none') body += `<tr class="grp"><td colspan="9"><span class="row between"><span>${esc(f.group === 'date' ? niceDate(k) : k)}</span><span class="num">${fmtMins(list.reduce((a, x) => a + x.net, 0))}</span></span></td></tr>`;
    for (const x of list) {
      if (n++ >= f.limit) break;
      body += `<tr data-id="${x.id}" data-act="editLog"><td class="d num nowrap">${x.date}</td><td class="num">${x.cw}</td><td class="num">${x.start}</td><td class="num">${x.end}</td><td class="m num nowrap">${fmtMins(x.net)}</td><td class="t" title="${esc(x.title)}">${esc(x.title || x.category)}</td><td>${esc(x.category)}</td><td class="c">${esc(x.project)}</td><td>${esc(x.task)}</td></tr>`;
    }
  }
  const sortMark = k => { const s = f.sort.find(x => x[0] === k); return s ? (s[1] > 0 ? ' ▲' : ' ▼') : ''; };
  return `<div class="head"><div><h1>All entries</h1><p class="sub num">${rows.length} entries, ${fmtH(total)}h, ${esc(r.label)}</p></div>
    <div class="row wrap"><button class="btn sm" data-act="exp" data-f="csv">CSV</button><button class="btn sm" data-act="exp" data-f="xlsx">Excel</button><button class="btn sm" data-act="exp" data-f="pdf">PDF</button><button class="btn sm" data-act="importFile">Import</button></div></div>
  ${periodBar('ledP')}
  <div class="filters" style="position:static;padding-top:0">
    <input id="ledQ" placeholder="Search" value="${esc(f.q)}" style="max-width:190px" aria-label="Search entries">
    <select data-led="cat" aria-label="Category"><option value="">All categories</option>${live('categories').sort((a, b) => a.order - b.order).map(c => `<option value="${c.id}" ${f.cat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
    <select data-led="proj" aria-label="Project"><option value="">All projects</option>${live('projects').map(p => `<option value="${p.id}" ${f.proj === p.id ? 'selected' : ''}>${esc(p.code)} ${esc(p.name)}</option>`).join('')}</select>
    <select data-led="kind" aria-label="Work or personal"><option value="">Work and personal</option><option value="work" ${f.kind === 'work' ? 'selected' : ''}>Work</option><option value="personal" ${f.kind === 'personal' ? 'selected' : ''}>Personal</option></select>
    <select data-led="group" aria-label="Group by">${[['date', 'Group by day'], ['cw', 'Group by week'], ['month', 'Group by month'], ['category', 'Group by category'], ['project', 'Group by project'], ['none', 'No grouping']].map(([v, l]) => `<option value="${v}" ${f.group === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
  </div>
  <section class="panel">${rows.length ? `<div class="tablewrap"><table class="ledger"><thead><tr>${LCOLS.map(([k, l]) => `<th data-act="sort" data-k="${k}" title="Click to sort, Shift+click to add a second sort">${l}${sortMark(k)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>${rows.length > f.limit ? `<button class="btn" style="margin-top:10px" data-act="more">Show more</button>` : ''}` : `<p class="empty">No entries match. Change the period or filters, or <a href="#log">log some time</a>.</p>`}</section>`;
}
function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
const exportRows = rows => rows.map(x => ({ Date: x.date, CW: x.cw, Start: x.start, End: x.end, 'Logged (min)': x.mins, 'Net (min)': x.net, 'Net (h)': +(x.net / 60).toFixed(2), Activity: x.title, Description: x.desc || '', Category: x.category, Type: x.kind, Project: x.project, Task: x.task, 'Task status': x.status }));
function exportNow(fmt) {
  const { rows, r } = ledRows(); if (!rows.length) { toast('Nothing to export in this view'); return; }
  const base = `tracker-${r.from}-to-${r.to}`, data = exportRows(rows);
  if (fmt === 'csv') {
    const heads = Object.keys(data[0]); const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    download(base + '.csv', new Blob(['﻿' + [heads.join(','), ...data.map(o => heads.map(h => q(o[h])).join(','))].join('\r\n')], { type: 'text/csv' }));
  } else if (fmt === 'xlsx') {
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Entries');
    const sum = {}; rows.forEach(x => sum[x.category] = (sum[x.category] || 0) + x.net);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.entries(sum).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ Category: k, Hours: +(v / 60).toFixed(2) }))), 'By category');
    XLSX.writeFile(wb, base + '.xlsx');
  } else {
    const { jsPDF } = window.jspdf; const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(15); doc.text('Time entries', 40, 40); doc.setFontSize(10);
    doc.text(`${r.label}, ${rows.length} entries, ${fmtH(rows.reduce((a, x) => a + x.net, 0))} hours`, 40, 58);
    doc.autoTable({ startY: 72, styles: { fontSize: 8.5, cellPadding: 3 }, headStyles: { fillColor: [4, 122, 90] }, head: [['Date', 'CW', 'Start', 'End', 'Time', 'Activity', 'Category', 'Project', 'Task']], body: rows.map(x => [x.date, x.cw, x.start, x.end, fmtMins(x.net), x.title, x.category, x.project, x.task]) });
    doc.save(base + '.pdf');
  }
  toast(`Exported ${rows.length} entries as ${fmt.toUpperCase()}`);
}
/* import: CSV or Excel, columns matched by header name */
const IMPORT_MAP = { date: /^(date|day|logged on|completed date)$/i, start: /^(start|start time|actual start)$/i, end: /^(end|end time|actual end)$/i, mins: /^(net \(min\)|minutes|mins|duration \(min\)|logged \(min\))$/i, hours: /^(hours|hrs|net \(h\)|duration|duration \(h\))$/i, title: /^(activity|title|task|task name|description|name)$/i, category: /^category$/i, project: /^(project|project name)$/i, desc: /^(description|notes|remarks)$/i };
function excelDate(v) {
  if (v instanceof Date) return fmtD(v);
  if (typeof v === 'number') return fmtD(new Date(Math.round((v - 25569) * 864e5) + new Date().getTimezoneOffset() * 6e4));
  const s = String(v || '').trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/))) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return null;
}
function excelTime(v) {
  if (v === '' || v == null) return null;
  if (v instanceof Date) return v.getHours() * 60 + v.getMinutes();
  if (typeof v === 'number') return Math.round((v % 1) * 1440);
  const m = String(v).match(/(\d{1,2})[:.](\d{2})\s*(am|pm)?/i); return m ? parseClock(m[1], m[2], m[3]) : null;
}
async function importFile(file) {
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true }); const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  if (!rows.length) { toast('That file has no rows'); return; }
  const heads = Object.keys(rows[0]); const col = {}; for (const k in IMPORT_MAP) col[k] = heads.find(h => IMPORT_MAP[k].test(h.trim()) && !Object.values(col).includes(h)) || '';
  dialog(`<h2>Import ${rows.length} rows</h2><p class="sub small">Check which column fills each field. New projects get an ID automatically.</p>
    <div class="fields keep">${[['date', 'Date'], ['start', 'Start'], ['end', 'End'], ['mins', 'Minutes'], ['hours', 'Hours'], ['title', 'Activity'], ['category', 'Category'], ['project', 'Project'], ['desc', 'Description']].map(([k, l]) => `<label class="f">${l}<select data-map="${k}"><option value="">Not in file</option>${heads.map(h => `<option ${col[k] === h ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></label>`).join('')}</div>
    <div class="dlgfoot"><button class="btn ghost" data-close>Cancel</button><button class="btn pri" id="doImport">Import rows</button></div>`, d => {
    $('#doImport', d).onclick = () => {
      const m = {}; d.querySelectorAll('[data-map]').forEach(s => m[s.dataset.map] = s.value);
      let ok = 0, skip = 0; const seen = new Set(live('logs').map(l => `${l.date}|${l.start}|${l.title}`));
      const byName = n => live('projects').find(p => p.name.toLowerCase() === n.toLowerCase() || p.code.toLowerCase() === n.toLowerCase());
      for (const row of rows) {
        const date = excelDate(row[m.date]); const s = excelTime(row[m.start]), e = excelTime(row[m.end]);
        let mins = +row[m.mins] || Math.round((parseFloat(row[m.hours]) || 0) * 60);
        if (!mins && s != null && e != null) mins = e > s ? e - s : 0;
        const title = String(row[m.title] || '').trim();
        if (!date || !mins || seen.has(`${date}|${s == null ? null : hhmm(s)}|${title}`)) { skip++; continue; }
        const cn = String(row[m.category] || '').trim().toLowerCase(); let cat = live('categories').find(c => c.name.toLowerCase() === cn)?.id || guessCategory(title) || live('categories').find(c => c.name === 'Work').id;
        const pn = String(row[m.project] || '').trim(); const proj = pn ? (byName(pn) || createProject(pn)) : null;
        S.v++; makeLogs({ date, start: s, mins, title, desc: String(row[m.desc] || ''), category: cat, projectId: proj?.id }); ok++;
      }
      d.close(); commit(); toast(`Imported ${ok} rows${skip ? `, skipped ${skip} with no date or time, or already present` : ''}`);
    };
  });
}

/* ---------- settings ---------- */
function syncLabel() {
  const m = { off: 'Sync off', ok: Sync.lastAt ? `Saved ${timeAgo(Sync.lastAt)}` : 'Saved', working: Sync.msg, pending: 'Saving soon', reconnect: 'Folder access needed', error: 'Sync problem' };
  return m[Sync.state] || '';
}
const timeAgo = t => { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : new Date(t).toLocaleString(); };
function pageSettings() {
  const connected = lsGet('syncMode', null) === 'folder';
  const cats = live('categories').sort((a, b) => a.order - b.order); const set = lsGet('pomo', { focus: 25, brk: 5, long: 15 });
  return `<div class="head"><h1>Settings</h1></div><div class="stack">
  <section class="panel"><h2>Sync folder</h2>
    <p class="sub small" style="margin-bottom:10px">${!connected ? 'Not connected. Entries stay on this device until you choose a folder.' : esc(syncLabel()) + (Sync.state === 'error' ? `: ${esc(Sync.msg)}` : '')}</p>
    ${Folder.supported() ? `<div class="row wrap">${connected ? `<button class="btn" data-act="syncNow">Save now</button><button class="btn" data-act="syncPull">Load latest</button><button class="btn" data-act="pickFolder">Change folder</button><button class="btn danger" data-act="syncStop">Disconnect folder</button>` : `<button class="btn pri" data-act="pickFolder">Choose sync folder</button>`}</div>` : `<p class="small sub">This browser can't use a folder. Use Chrome or Edge, or move data with a backup file below.</p>`}
    <p class="small muted" style="margin-top:10px">Saves about 3 seconds after each change and keeps the last 3 sessions. Edits from different devices merge by entry, newest edit wins. <a href="#guide">How to set this up</a></p>
  </section>
  <section class="panel"><h2>Backup and restore</h2><div class="row wrap"><button class="btn" data-act="backup">Download backup</button><button class="btn" data-act="restore">Restore from backup</button><button class="btn" data-act="sample">${live('logs').some(l => l.sample) ? 'Remove sample data' : 'Load sample data'}</button></div></section>
  <section class="panel"><h2>Categories</h2><p class="small muted" style="margin-bottom:8px">"Inside tasks" items, like breaks, are deducted from the task they fall within instead of raising a clash.</p>
    <div class="tablewrap"><table><thead><tr><th>Name</th><th>Colour</th><th>Type</th><th>Inside tasks</th><th>No project</th><th></th></tr></thead><tbody>
    ${cats.map(c => `<tr><td><input data-cat="${c.id}" data-f="name" value="${esc(c.name)}" style="min-width:110px"></td><td><select data-cat="${c.id}" data-f="slot" style="min-width:64px;background:${slotVar(c.slot)};color:transparent">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(s => `<option value="${s}" ${+c.slot === s ? 'selected' : ''} style="color:#000">Colour ${s + 1}</option>`).join('')}</select></td><td><select data-cat="${c.id}" data-f="kind" style="min-width:96px"><option value="work" ${c.kind === 'work' ? 'selected' : ''}>Work</option><option value="personal" ${c.kind === 'personal' ? 'selected' : ''}>Personal</option></select></td><td><input type="checkbox" data-cat="${c.id}" data-f="nest" ${c.nest ? 'checked' : ''} aria-label="Inside tasks"></td><td><input type="checkbox" data-cat="${c.id}" data-f="noProject" ${c.noProject ? 'checked' : ''} aria-label="No project"></td><td><button class="btn sm ghost danger" data-act="delCat" data-id="${c.id}">Delete</button></td></tr>`).join('')}
    </tbody></table></div><button class="btn sm" style="margin-top:10px" data-act="addCat">Add category</button></section>
  <section class="panel"><h2>Focus timer</h2><div class="fields keep"><label class="f">Focus (min)<input type="number" data-pomo="focus" value="${set.focus}"></label><label class="f">Break (min)<input type="number" data-pomo="brk" value="${set.brk}"></label><label class="f">Long break (min)<input type="number" data-pomo="long" value="${set.long}"></label></div>
    <div class="row wrap" style="margin-top:10px"><label class="row small"><input type="checkbox" id="pomoLog" ${lsGet('pomoLog', true) ? 'checked' : ''}> Log finished focus time to the task</label>${'Notification' in window ? `<button class="btn sm" data-act="notif">Allow notifications</button>` : ''}</div></section>
  </div>`;
}


function pageGuide() {
  const ex = [['10:15 restroom 5m', 'A timed entry'], ['9-11:30 grid code review', 'A time range; the duration is worked out'], ['2pm-4pm site call', 'am and pm work too'], ['1.5h PQ test report', 'Duration with no clock time'], ['yesterday lunch 30m', 'Today, yesterday or a weekday name'], ['28/10 9-10 training', 'A past date, day first'], ['2h audit @CEA', 'Force a project with @ and part of its name']];
  const go = [['#log', 'Log time', 'Add entries and fill gaps in any day'], ['#dash', 'Dashboard', 'Task status, charts and focus timer'], ['#plan', 'Projects', 'Projects, tasks, sub-tasks and progress'], ['#ledger', 'All entries', 'Search, group, export and import'], ['#settings', 'Settings', 'Sync folder, categories and backups']];
  return `<div class="head"><div><h1>Start here</h1><p class="sub">Log first, tidy later. Any day can be filled in whenever you get to it.</p></div></div>
  <div class="guide stack">
  <section class="panel"><h2>Go to</h2><nav class="golist" aria-label="Sections">${go.map(([h, t, d]) => `<a href="${h}"><b>${t}</b><span class="small sub">${d}</span></a>`).join('')}</nav></section>
  <section class="panel"><h2>Set up sync, once per device</h2>
    <p class="sub small" style="margin-bottom:10px">Your entries are kept in this browser. Save files in a shared folder carry them between devices. OneDrive moves the files, so nothing else holds your data.</p>
    <h3>Laptops</h3><ol class="steps"><li>Open this page in Chrome or Edge, and check the OneDrive desktop app is running.</li><li>Create a folder in OneDrive, such as <code>OneDrive/Day ledger</code>.</li><li>In <a href="#settings">Settings</a>, tap Choose sync folder and pick it. Use the same folder on both laptops.</li><li>Choose "Allow on every visit" if Chrome offers it.</li></ol>
    <h3 style="margin-top:14px">Android phone</h3><ol class="steps"><li>Install a OneDrive sync app, such as OneSync, and set two-way sync between the <code>Day ledger</code> OneDrive folder and a folder on the phone.</li><li>Open this page in Chrome, then use the Chrome menu and Add to Home screen.</li><li>Open it from the home screen. In <a href="#settings">Settings</a>, tap Choose sync folder and pick the phone folder.</li></ol>
    <p class="small muted" style="margin-top:10px">Test it: log one entry on the phone, wait for the sync app, then open the page on a laptop.</p></section>
  <section class="panel"><h2>Quick log</h2><p class="sub small" style="margin-bottom:8px">Type one line and check the preview under the box before you press Log.</p>
    <div class="tablewrap"><table class="plain"><tbody>${ex.map(([a, b]) => `<tr><td><code>${a}</code></td><td class="sub">${b}</td></tr>`).join('')}</tbody></table></div></section>
  <section class="panel"><h2>Missed a day, week or month?</h2><p class="sub">Open <a href="#log">Log time</a> and pick the date. Hatched parts of the strip are unlogged, and each gap has a Fill button. On the <a href="#dash">Dashboard</a>, tap any pale day in the logging grid to jump to it.</p></section>
  <section class="panel"><h2>How time is counted</h2><ul class="steps">
    <li>Breaks, meals and restroom entries can sit inside a task. Their minutes come off that task automatically.</li>
    <li>Two real pieces of work at the same time raise a prompt: shorten the new one, cut the existing one, or keep both.</li>
    <li>Entries that cross midnight split into two days.</li>
    <li>Weeks are ISO calendar weeks, Monday to Sunday. Financial years run 1 April to 31 March.</li>
    <li>You choose which categories sit inside tasks in <a href="#settings">Settings</a>.</li></ul></section>
  <section class="panel"><h2>Projects and tasks</h2><ul class="steps">
    <li>As you type, entries are matched to projects by keyword. If nothing matches, you're asked whether to create one, and it gets the next ID.</li>
    <li>Sub-task progress drives the task, and task progress drives the project bar.</li>
    <li>Add planned effort to a task to see it in Planned vs actual. Actual dates come from logged time.</li></ul></section>
  <section class="panel"><h2>If something looks wrong</h2><ul class="steps">
    <li><b>An entry is missing on another device:</b> check the sync app has run, then open the page again. Save files can arrive late, and they merge when they do.</li>
    <li><b>Asked to allow folder access:</b> tap Allow. Browsers sometimes need this after a restart.</li>
    <li><b>A new browser or cleared data:</b> choose the sync folder again and your last save loads.</li>
    <li><b>Before big changes:</b> download a backup from <a href="#settings">Settings</a>. The folder keeps only the last 3 sessions.</li></ul></section>
  </div>`;
}

/* ---------- dialogs ---------- */
function dialog(html, onOpen) {
  const d = document.createElement('dialog'); d.innerHTML = `<div class="dlg">${html}</div>`; document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
  d.showModal(); onOpen && onOpen(d); return d;
}
const projOptions = sel => `<option value="">No project</option>${live('projects').map(p => `<option value="${p.id}" ${sel === p.id ? 'selected' : ''}>${esc(p.code)} ${esc(p.name)}</option>`).join('')}<option value="__new">Create new project</option>`;
const catOptions = sel => live('categories').sort((a, b) => a.order - b.order).map(c => `<option value="${c.id}" ${sel === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
function taskOptions(pid, sel) {
  const list = live('tasks').filter(t => (t.projectId || '') === (pid || '') && !isClosed(t) || t.id === sel);
  const tops = list.filter(t => !t.parentId);
  return `<option value="">No task</option>` + tops.map(t => `<option value="${t.id}" ${sel === t.id ? 'selected' : ''}>${esc(t.title)}</option>` + list.filter(k => k.parentId === t.id).map(k => `<option value="${k.id}" ${sel === k.id ? 'selected' : ''}>&nbsp;&nbsp;${esc(k.title)}</option>`).join('')).join('');
}
function logDialog(l = {}) {
  const editing = !!l.id;
  const startV = l.start || '', endV = l.start ? hhmm(logEnd(l) % 1440) : '', cat = l.category || live('categories')[0].id;
  const d = dialog(`<h2>${editing ? 'Edit entry' : 'Add entry'}</h2>
  <form id="lf" class="stack"><div class="fields">
    <label class="f full">What<input name="title" value="${esc(l.title)}" autocomplete="off" required></label>
    <label class="f">Date<input type="date" name="date" value="${l.date || UI.date}" required></label>
    <label class="f">Category<select name="category">${catOptions(cat)}</select></label>
    <div class="fields keep full"><label class="f">Start<input type="time" name="start" value="${startV}"></label><label class="f">End<input type="time" name="end" value="${endV}"></label></div>
    <div class="fields keep full"><label class="f">Hours<input type="number" step="0.25" min="0" name="h" value="${l.mins ? Math.floor(l.mins / 60) : ''}"></label><label class="f">Minutes<input type="number" min="0" name="m" value="${l.mins ? l.mins % 60 : ''}"></label></div>
    <label class="f">Project<select name="projectId">${projOptions(l.projectId)}</select></label>
    <label class="f">Task or sub-task<select name="taskId">${taskOptions(l.projectId, l.taskId)}</select></label>
    <label class="f full">Notes<textarea name="desc">${esc(l.desc)}</textarea></label>
  </div><p class="small" id="mapHint"></p>
  <div class="dlgfoot">${editing ? `<button type="button" class="btn danger" id="delLog" style="margin-right:auto">Delete</button>` : ''}<button type="button" class="btn ghost" data-close>Cancel</button><button class="btn pri">Save entry</button></div></form>`, d => {
    const f = $('#lf', d), el = n => f.elements[n];
    const sync = () => { const s = hm(el('start').value), e = hm(el('end').value); if (s != null && e != null) { const n = e > s ? e - s : e + 1440 - s; el('h').value = Math.floor(n / 60); el('m').value = n % 60; } };
    el('start').onchange = sync; el('end').onchange = sync;
    const hint = () => {
      const c = guessCategory(el('title').value); if (c && !editing) el('category').value = c;
      const noP = catOf(el('category').value).noProject, h = $('#mapHint', d); h.innerHTML = '';
      if (noP || el('projectId').value || !el('title').value.trim()) return;
      const m = matchProject(el('title').value);
      if (m) { el('projectId').value = m.project.id; el('taskId').innerHTML = taskOptions(m.project.id); h.textContent = `Matched to ${m.project.code} ${m.project.name}. Change it above if that is wrong.`; }
      else h.textContent = `No matching project. Choose "Create new project" to give this one ID ${nextProjectCode()}.`;
    };
    el('title').onchange = hint;
    el('projectId').onchange = () => {
      if (el('projectId').value === '__new') { const name = el('title').value.trim() || 'New project'; const p = createProject(name); S.v++; el('projectId').innerHTML = projOptions(p.id); $('#mapHint', d).textContent = `Created ${p.code} ${p.name}.`; }
      el('taskId').innerHTML = taskOptions(el('projectId').value);
    };
    if ($('#delLog', d)) $('#delLog', d).onclick = () => { const copy = S.data.logs[l.id]; rm('logs', l.id); d.close(); commit(); toast('Entry deleted', () => { put('logs', copy); commit(); }); };
    f.onsubmit = ev => {
      ev.preventDefault(); const v = Object.fromEntries(new FormData(f));
      const s = hm(v.start); let mins = Math.round((+v.h || 0) * 60) + (+v.m || 0);
      if (!mins) { toast('Enter an end time, or hours and minutes'); return; }
      d.close();
      saveEntry({ date: v.date, start: s, mins, title: v.title.trim(), desc: v.desc, category: v.category, projectId: v.projectId, taskId: v.taskId }, l.id);
    };
  });
}
function projectDialog(p = {}) {
  dialog(`<h2>${p.id ? `Edit ${esc(p.code)}` : `New project ${nextProjectCode()}`}</h2><form id="pf" class="fields">
    <label class="f full">Name<input name="name" value="${esc(p.name)}" required></label>
    <label class="f full">Description, used for keyword matching<textarea name="desc">${esc(p.desc)}</textarea></label>
    <label class="f">Planned start<input type="date" name="plannedStart" value="${p.plannedStart || ''}"></label><label class="f">Planned end<input type="date" name="plannedEnd" value="${p.plannedEnd || ''}"></label>
    <div class="dlgfoot full">${p.id ? `<button type="button" class="btn danger" id="delP" style="margin-right:auto">Delete</button>` : ''}<button type="button" class="btn ghost" data-close>Cancel</button><button class="btn pri">Save project</button></div></form>`, d => {
    if ($('#delP', d)) $('#delP', d).onclick = () => { if (!confirmIn(d, 'delP', 'Tap again to delete. Entries stay, without a project.')) return; rm('projects', p.id); live('logs').filter(l => l.projectId === p.id).forEach(l => put('logs', { ...l, projectId: null })); live('tasks').filter(t => t.projectId === p.id).forEach(t => put('tasks', { ...t, projectId: null })); d.close(); UI.projSel = null; commit(); };
    $('#pf', d).onsubmit = ev => { ev.preventDefault(); const v = Object.fromEntries(new FormData(ev.target)); const r = p.id ? put('projects', { ...p, ...v }) : createProject(v.name.trim(), v); UI.projSel = r.id; d.close(); commit(); };
  });
}
function confirmIn(d, id, msg) { const b = $('#' + id, d); if (b.dataset.armed) return true; b.dataset.armed = 1; b.textContent = msg; return false; }
function taskDialog(t = {}, defaults = {}) {
  const pid = t.projectId ?? defaults.projectId ?? '', parent = t.parentId ?? defaults.parentId ?? null, status = t.status || 'Planned';
  const leaf = !t.id || !kids(t.id).length, al = t.id ? actualLogs(t) : [], sp = actualSpan(al);
  dialog(`<h2>${t.id ? 'Edit' : 'New'} ${parent ? 'sub-task' : 'task'}</h2><form id="tf" class="fields">
    <label class="f full">Title<input name="title" value="${esc(t.title)}" required autocomplete="off"></label>
    <label class="f full">Description<textarea name="desc">${esc(t.desc)}</textarea></label>
    <label class="f">Project<select name="projectId" ${parent ? 'disabled' : ''}>${projOptions(pid)}</select></label>
    <label class="f">Category<select name="category">${catOptions(t.category || live('categories')[0].id)}</select></label>
    <label class="f">Planned start<input type="datetime-local" name="plannedStart" value="${t.plannedStart || ''}"></label><label class="f">Planned end<input type="datetime-local" name="plannedEnd" value="${t.plannedEnd || ''}"></label>
    <label class="f">Planned effort (hours)<input type="number" step="0.25" min="0" name="planH" value="${t.plannedMins ? t.plannedMins / 60 : ''}" ${leaf ? '' : 'disabled placeholder="Sum of sub-tasks"'}></label>
    <label class="f">Status<select name="status">${STATUSES.map(s => `<option ${s === status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
    <label class="f full">Status note<input name="note" placeholder="Why it's at this status" value="${esc(t.statusNote)}"></label>
    ${leaf ? `<label class="f full">Complete: <span id="pv" class="num">${t.pct || 0}%</span><input type="range" name="pct" min="0" max="100" step="5" value="${t.pct || 0}"></label>` : `<p class="small sub full">Progress comes from its sub-tasks: ${Math.round(pctOf(t))}%.</p>`}
    ${t.id ? `<p class="small sub full">Actual: ${sp ? `${sp.from} to ${sp.to}, ${fmtMins(actualOf(t))}` : 'no time logged yet'}. Actual dates come from logged time.</p>` : ''}
    ${t.history?.length ? `<details class="full small"><summary>Status history</summary>${t.history.slice().reverse().map(h => `<p class="muted">${new Date(h.at).toLocaleDateString()} ${esc(h.status)}${h.note ? ': ' + esc(h.note) : ''}</p>`).join('')}</details>` : ''}
    <div class="dlgfoot full">${t.id ? `<button type="button" class="btn danger" id="delT" style="margin-right:auto">Delete</button>` : ''}<button type="button" class="btn ghost" data-close>Cancel</button><button class="btn pri">Save task</button></div></form>`, d => {
    const f = $('#tf', d);
    if (f.elements.pct) f.elements.pct.oninput = e => $('#pv', d).textContent = e.target.value + '%';
    f.elements.projectId.onchange = e => { if (e.target.value === '__new') { const p = createProject(f.elements.title.value.trim() || 'New project'); S.v++; e.target.innerHTML = projOptions(p.id); } };
    if ($('#delT', d)) $('#delT', d).onclick = () => { if (!confirmIn(d, 'delT', 'Tap again to delete. Logged time stays.')) return; kids(t.id).forEach(k => rm('tasks', k.id)); rm('tasks', t.id); d.close(); commit(); };
    f.onsubmit = ev => {
      ev.preventDefault(); const v = Object.fromEntries(new FormData(f));
      const base = { ...t, id: t.id || uid(), title: v.title.trim(), desc: v.desc, category: v.category, projectId: (parent ? pid : v.projectId) || null, parentId: parent, plannedStart: v.plannedStart, plannedEnd: v.plannedEnd, plannedMins: Math.round((+v.planH || 0) * 60), pct: v.pct != null ? +v.pct : t.pct, status: t.status || 'Planned', history: t.history || [{ at: new Date().toISOString(), status: 'Planned', note: '' }] };
      const r = put('tasks', base); S.v++;
      if (v.status !== r.status || (v.note || '') !== (t.statusNote || '')) { setStatus(r, v.status, v.note); }
      if (base.pct === 100 && v.status !== 'Completed' && kids(r.id).length === 0) { /* full bar, leave status to the user */ }
      d.close(); commit();
    };
  });
}

/* ---------- focus timer and stopwatch ---------- */
const Timer = {
  s: lsGet('timer', null),
  save() { lsSet('timer', this.s); this.paint(); },
  start(o) { this.s = o; this.save(); },
  left() { const s = this.s; if (!s) return 0; if (s.mode === 'watch') return Math.floor((Date.now() - s.startedAt) / 1000); return Math.ceil(((s.paused ?? s.endsAt) - (s.paused ? 0 : Date.now())) / 1000); },
  beep() {
    try { const a = new (window.AudioContext || webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 660; g.gain.value = .12; o.start(); o.stop(a.currentTime + .35); } catch {}
    navigator.vibrate && navigator.vibrate([200, 100, 200]);
  },
  notify(msg) { this.beep(); toast(msg); try { if (Notification.permission === 'granted') new Notification('Tracker', { body: msg }); } catch {} },
  tick() {
    const s = this.s; if (!s) return;
    if (s.mode !== 'watch' && !s.paused && Date.now() >= s.endsAt) {
      if (s.mode === 'focus') {
        const set = lsGet('pomo', { focus: 25, brk: 5, long: 15 }); const round = (s.round || 0) + 1;
        if (lsGet('pomoLog', true)) this.logRun(s, s.mins);
        const brk = round % 4 === 0 ? set.long : set.brk;
        this.s = { ...s, mode: 'break', round, mins: brk, endsAt: s.endsAt + brk * 6e4 };
        if (Date.now() >= this.s.endsAt) { this.s = null; } this.notify(`Focus done. Take ${brk} minutes.`);
      } else { this.notify('Break over.'); this.s = null; }
      this.save();
    }
    this.paint();
  },
  logRun(s, mins) {
    const end = new Date(s.startedAt + mins * 6e4), st = new Date(s.startedAt), t = S.data.tasks[s.taskId];
    saveEntryQuiet({ date: fmtD(st), start: st.getHours() * 60 + st.getMinutes(), mins: Math.max(1, Math.round(mins)), title: s.title, category: t?.category || s.category || live('categories')[0].id, projectId: t?.projectId, taskId: s.taskId });
  },
  stop() {
    const s = this.s; if (!s) return;
    if (s.mode === 'watch') { const m = Math.round((Date.now() - s.startedAt) / 6e4); if (m >= 1) this.logRun(s, m); else toast('Under a minute, nothing logged'); }
    if (s.mode === 'focus' && lsGet('pomoLog', true)) { const m = Math.round((s.mins * 60 - this.left()) / 60); if (m >= 1) this.logRun(s, m); }
    this.s = null; this.save();
  },
  pause() { const s = this.s; if (s.paused) { s.endsAt = Date.now() + s.paused; s.paused = null; } else { s.paused = s.endsAt - Date.now(); } this.save(); },
  paint() {
    const el = $('#dock'), s = this.s; el.classList.toggle('show', !!s); if (!s) return;
    const n = Math.max(0, this.left()), txt = `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;
    if (!$('#dClock')) el.innerHTML = `<div class="grow" style="min-width:0"><div class="small sub" id="dLabel" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div><div class="clock num" id="dClock"></div></div><button class="btn sm" id="dPause" data-act="tPause"></button><button class="btn sm" data-act="tStop">Stop</button>`;
    $('#dClock').textContent = txt; $('#dLabel').textContent = `${s.mode === 'break' ? 'Break' : s.title}`;
    $('#dPause').style.display = s.mode === 'watch' ? 'none' : ''; $('#dPause').textContent = s.paused ? 'Resume' : 'Pause';
  },
};
function saveEntryQuiet(e) { makeLogs(e); commit(); }
const startFocus = (taskId, focus, brk) => {
  const t = S.data.tasks[taskId]; if (!t) return;
  const set = { ...lsGet('pomo', { focus: 25, brk: 5, long: 15 }) }; if (focus) set.focus = focus; if (brk) set.brk = brk; lsSet('pomo', set);
  if (t.status === 'Planned') { setStatus(t, 'In progress', ''); commit(); }
  Timer.start({ mode: 'focus', title: t.title, taskId, mins: set.focus, startedAt: Date.now(), endsAt: Date.now() + set.focus * 6e4, round: 0 });
};

/* ---------- sample data ---------- */
function sampleData() {
  const pad3 = (name, desc, st, en) => createProject(name, { desc, plannedStart: st, plannedEnd: en, sample: true });
  const cat = n => live('categories').find(c => c.name === n)?.id; const d0 = today();
  const a = pad3('CEA grid code compliance', 'LVRT HVRT power quality test reports', addDays(d0, -40), addDays(d0, 30));
  const b = pad3('Technician training module', 'Onshore wind turbine training content', addDays(d0, -25), addDays(d0, -2));
  const T = (project, title, status, pct, h, offS, offE, parentId) => put('tasks', { id: uid(), title, projectId: project?.id || null, parentId: parentId || null, category: cat('Work'), status, pct, plannedMins: h * 60, plannedStart: addDays(d0, offS) + 'T09:00', plannedEnd: addDays(d0, offE) + 'T18:00', history: [], desc: '', sample: true });
  const t1 = T(a, 'LVRT test report review', 'In progress', 0, 0, -12, 6); const s1 = T(a, 'Check voltage dip profiles', 'Completed', 100, 6, -12, -6, t1.id), s2 = T(a, 'Draft comments for test agency', 'In progress', 40, 5, -5, 6, t1.id);
  const t2 = T(b, 'Slides for yaw system unit', 'In progress', 70, 10, -20, -3); T(a, 'Power quality summary', 'Planned', 0, 4, 2, 9);
  const t4 = T(b, 'Quiz bank', 'Completed', 100, 3, -24, -18);
  S.v++;
  const plan = [[0, '09:15', 110, 'Check voltage dip profiles', 'Work', s1, a], [0, '11:30', 60, 'Team meeting', 'Meetings'], [0, '13:00', 40, 'Lunch', 'Meals'], [0, '14:00', 150, 'Slides for yaw system unit', 'Work', t2, b], [0, '10:20', 5, 'Restroom', 'Restroom'], [0, '15:10', 15, 'Tea break', 'Break'], [0, '19:00', 45, 'Evening walk', 'Health'], [0, '08:15', 45, 'Commute', 'Commute']];
  for (let i = 28; i >= 0; i--) {
    const d = addDays(d0, -i), wd = toDate(d).getDay(); if (i === 9 || (wd === 0 && i > 1)) continue;
    for (const [_, st, m, title, c, tk, pj] of plan) {
      if (wd === 6 && (c === 'Work' || c === 'Meetings' || c === 'Commute')) continue;
      if (i === 0 && hm(st) > 15 * 60) continue;
      const tkn = i < 8 && tk === s1 ? s2 : tk;
      makeLogs({ date: d, start: hm(st), mins: m + (i * 7 % 3) * 5, title: tk === s1 && i < 8 ? 'Draft comments for test agency' : title, category: cat(c), projectId: pj?.id, taskId: tkn?.id, sample: true }); S.v++;
    }
  }
}

/* ---------- render and events ---------- */
function render() {
  const app = $('#app');
  const y = window.scrollY;
  const html = { home: pageHome, dash: pageDash, log: pageLog, plan: pageProjects, ledger: pageLedger, settings: pageSettings, guide: pageGuide }[UI.page]();
  app.innerHTML = html;
  document.querySelectorAll('[data-nav]').forEach(n => n.classList.toggle('on', n.dataset.nav === UI.page));
  window.scrollTo(0, y); paintSync(); drawDash();
  const ht = $('.heat'); if (ht) ht.scrollLeft = ht.scrollWidth;
  const pg = $('#pgrid'); if (pg && innerWidth < 980) pg.style.gridTemplateColumns = 'minmax(0,1fr)';
}
function paintSync() {
  const cls = { ok: 'ok', error: 'err', reconnect: 'wait', pending: 'wait', working: 'wait' }[Sync.state] || '';
  document.querySelectorAll('.syncdot').forEach(el => { el.className = 'syncdot ' + cls; el.innerHTML = `<i></i>${esc(syncLabel())}`; });
  const b = $('#banner'); const need = Sync.state === 'reconnect' ? ['Allow folder access to load your latest save.', 'folderResume', 'Allow'] : Sync.state === 'error' ? [`Sync problem: ${Sync.msg}`, 'syncNow', 'Try again'] : null;
  b.classList.toggle('show', !!need); if (need) b.innerHTML = `<span>${esc(need[0])}</span><button class="btn sm" data-act="${need[1]}">${need[2]}</button>`;
}
Sync.onChange = paintSync; Sync.onRemote = () => render();
const setTheme = t => { document.documentElement.dataset.theme = t; lsSet('theme', t); const m = $('meta[name=theme-color]'); if (m) m.content = css('--bg'); if (UI.page === 'dash') drawDash(); };

const actions = {
  goDay: el => { UI.date = el.dataset.d; location.hash = 'log'; if (UI.page === 'log') render(); },
  goToday: () => { UI.date = today(); render(); },
  dayStep: el => { UI.date = addDays(UI.date, +el.dataset.n); render(); },
  newLog: () => logDialog({ date: UI.date }),
  editLog: el => { const l = S.data.logs[el.dataset.id]; if (l) logDialog(l); },
  fillGap: el => logDialog({ date: UI.date, start: hhmm(+el.dataset.a), mins: Math.min(+el.dataset.b - +el.dataset.a, 1439) }),
  useFreq: el => { const l = S.data.logs[el.dataset.id]; logDialog({ date: UI.date, title: l.title, category: l.category, projectId: l.projectId, taskId: l.taskId, mins: l.mins }); },
  startWatch: () => { Timer.start({ mode: 'watch', title: UI.quick.trim() || 'Timed work', category: guessCategory(UI.quick) || live('categories')[0].id, startedAt: Date.now() }); },
  quickNewProject: () => { const q = parseQuick(UI.quick, UI.date); const p = createProject(q.title); commit(); toast(`Created ${p.code} ${p.name}`); },
  quickSkip: () => { UI.quickSkipNew = true; refreshPreview(); },
  pKind: el => { const k = el.dataset.k, key = el.dataset.key, cur = periodRange(UI[key]); const anchor = cur.to > today() && cur.from <= today() ? today() : cur.from; UI[key] = k === 'custom' ? { kind: k, from: cur.from, to: cur.to } : { kind: k, value: defaultPeriodValue(k, anchor) }; render(); },
  pStep: el => { UI[el.dataset.key] = stepPeriod(UI[el.dataset.key], +el.dataset.n); render(); },
  newProject: () => projectDialog(), editProject: el => projectDialog(S.data.projects[el.dataset.id]),
  pickProject: el => { UI.projSel = el.dataset.id; render(); },
  newTask: el => taskDialog({}, { projectId: el.dataset.project || '', parentId: el.dataset.parent || null }),
  editTask: el => taskDialog(S.data.tasks[el.dataset.id]),
  focusTask: el => startFocus(el.dataset.id),
  pomoStart: () => { const id = $('#pomoTask').value; if (!id) { toast('Choose a task first'); return; } startFocus(id, +$('#pF').value, +$('#pB').value); },
  tPause: () => Timer.pause(), tStop: () => Timer.stop(),
  sort: (el, ev) => { const k = el.dataset.k, f = UI.led; const cur = f.sort.find(s => s[0] === k); if (ev.shiftKey) { if (cur) cur[1] *= -1; else f.sort.push([k, 1]); } else f.sort = [[k, cur ? -cur[1] : 1]]; render(); },
  more: () => { UI.led.limit += 300; render(); }, exp: el => exportNow(el.dataset.f),
  importFile: () => pickFile('.csv,.xlsx,.xls', importFile),
  theme: () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'),
  pickFolder: async () => { try { await Sync.connect(); render(); } catch (e) { if (e.name !== 'AbortError') toast(e.message); } },
  folderResume: async () => { await Sync.reconnect(); render(); },
  syncNow: () => Sync.push(), syncPull: () => Sync.pull(), syncStop: () => { Sync.stop(); render(); },
  backup: () => download(`tracker-backup-${today()}.json`, new Blob([JSON.stringify({ app: 'tracker', v: 1, data: S.data })], { type: 'application/json' })),
  restore: () => pickFile('.json', async f => { try { const j = JSON.parse(await f.text()); S.data = mergeData(S.data, j.data).data; commit(); toast('Backup merged into your data'); } catch { toast('That file is not a tracker backup'); } }),
  sample: () => {
    if (live('logs').some(l => l.sample)) { for (const t of ['logs', 'tasks', 'projects']) live(t).filter(r => r.sample).forEach(r => rm(t, r.id)); toast('Sample data removed'); } else { sampleData(); toast('Sample data loaded. Remove it here before real use.'); }
    commit();
  },
  addCat: () => { const n = live('categories').length; const id = uid(); put('categories', { id, name: 'New category', slot: 8, kind: 'personal', nest: false, noProject: true, keywords: '', order: n + 1 }); commit(); },
  delCat: el => { if (live('logs').some(l => l.category === el.dataset.id)) { toast('This category has entries. Rename it instead.'); return; } rm('categories', el.dataset.id); commit(); },
  notif: () => Notification.requestPermission().then(p => toast(p === 'granted' ? 'Notifications on' : 'Notifications not allowed')),
};
function pickFile(accept, fn) { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = () => i.files[0] && fn(i.files[0]); i.click(); }
function refreshPreview() { const p = $('#quickPrev'), f = $('form[data-form=quick]'); if (p && f) p.innerHTML = quickPreview(f.dataset.base); }

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  if (el.tagName === 'A') e.preventDefault();
  actions[el.dataset.act]?.(el, e);
});
document.addEventListener('submit', e => { if (e.target.dataset.form === 'quick') { e.preventDefault(); quickSubmit(e.target.dataset.base); } });
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'quickIn') { UI.quick = t.value; UI.quickSkipNew = false; refreshPreview(); }
  if (t.id === 'ledQ') { UI.led.q = t.value; clearTimeout(UI.qT); UI.qT = setTimeout(() => { render(); const i = $('#ledQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); }
});
document.addEventListener('change', e => {
  const t = e.target, ds = t.dataset;
  if (t.id === 'datePick' && t.value) { UI.date = t.value; render(); }
  if (ds.pv && t.value) { UI[ds.pv] = { ...UI[ds.pv], value: t.value }; render(); }
  if (ds.pfy) { const weeks = fyWeeks(+t.value); UI[ds.pfy] = { kind: 'cw', value: weeks[0].monday }; render(); }
  if (ds.pc) { const [k, f] = ds.pc.split('.'); UI[k] = { ...UI[k], [f]: t.value }; render(); }
  if (ds.led) { UI.led[ds.led] = t.value; render(); }
  if (ds.cat) { const c = S.data.categories[ds.cat]; let v = t.type === 'checkbox' ? t.checked : t.value; if (ds.f === 'slot') v = +v; put('categories', { ...c, [ds.f]: v }); commit(); }
  if (ds.pomo) { const p = lsGet('pomo', { focus: 25, brk: 5, long: 15 }); p[ds.pomo] = Math.max(1, +t.value || 1); lsSet('pomo', p); }
  if (t.id === 'pomoLog') lsSet('pomoLog', t.checked);
});
function route() { if (!location.hash && !lsGet('seenGuide', false) && !live('logs').length) { lsSet('seenGuide', true); location.replace('#guide'); return; } const h = location.hash.slice(1); UI.page = PAGES.some(p => p[0] === h) ? h : 'home'; render(); window.scrollTo(0, 0); }
addEventListener('hashchange', route);
let rzT, lastW = innerWidth; addEventListener('resize', () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(rzT); rzT = setTimeout(() => { if (!document.activeElement?.matches('input,textarea,select')) render(); }, 200); });

async function boot() {
  const navItem = ([k, l]) => `<a class="nav" href="#${k}" data-nav="${k}">${svg({ home: 'home', dash: 'dash', log: 'log', plan: 'plan', ledger: 'ledger', settings: 'gear', guide: 'book' }[k])}<span>${l}</span></a>`;
  $('#rail').innerHTML = `<div class="brand"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="9" width="7" height="6" fill="#047a5a"/><rect x="9" y="9" width="4" height="6" fill="#2a78d6"/><rect x="14" y="9" width="9" height="6" fill="#eb6834"/></svg>Day ledger</div>${PAGES.map(navItem).join('')}<div id="railfoot"><button class="syncdot" data-act="syncNow"></button><button class="nav" data-act="theme">${svg('sun')}<span>Light or dark</span></button></div>`;
  $('#tabs').innerHTML = PAGES.filter(p => !['settings', 'guide'].includes(p[0])).map(([k, l]) => navItem([k, { 'Dashboard': 'Stats', 'Log time': 'Log', 'All entries': 'Entries' }[l] || l])).join('') + navItem(['settings', 'More']);
  setTheme(lsGet('theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  try { await Store.open(); const d = await Store.get('state'); if (d) { S.data = mergeData(emptyData(), d).data; S.v++; } } catch { toast('This browser is blocking storage. Entries will not be kept.'); }
  route(); Timer.paint(); setInterval(() => Timer.tick(), 1000);
  setInterval(() => { if (UI.page === 'home' && !document.activeElement?.matches('input')) { const n = $('.strip .now'); if (n) { const x = new Date(); n.style.left = ((x.getHours() * 60 + x.getMinutes()) / 14.4) + '%'; } } }, 60000);
  await Sync.start().catch(e => Sync.fail(e));
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
}
Object.assign(TT, { UI, actions, Sync, Folder, saveEntry, sampleData, commit, exportNow, importFile, Timer, ledRows, Store, render, resolveQuick });
window.TT = TT;
boot();
