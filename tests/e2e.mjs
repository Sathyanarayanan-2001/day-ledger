// End-to-end checks in a real browser. Run with: npm test
import assert from 'node:assert/strict';
import { mkdirSync, statSync } from 'node:fs';
import { chromium } from 'playwright';
import { serve } from '../scripts/serve.mjs';

const URL = 'http://localhost:8123/';
const OUT = 'test-output';
mkdirSync(OUT, { recursive: true });
const server = await serve();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => m.type() === 'error' && errors.push(m.text()));

let failed = 0;
const test = async (name, fn) => {
  try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
};
const go = async (p, hash, wait = 300) => { await p.evaluate(h => { location.hash = h; }, hash); await p.waitForTimeout(wait); };

await page.goto(URL);
await page.waitForSelector('.guide');

await test('first visit opens the guide', async () => {
  assert.equal(await page.textContent('h1'), 'Start here');
  assert.ok((await page.$$('.golist a')).length === 5);
});

await test('no Microsoft sign-in code is left in the page', async () => {
  const html = await page.content();
  for (const word of ['login.microsoftonline', 'graph.microsoft', 'msToken', 'Sign in to OneDrive']) assert.ok(!html.includes(word), word);
});

await test('quick log parsing', async () => {
  const r = await page.evaluate(() => ['10:15 restroom 5m', '9-11:30 grid code review', '2-3:30 CEA report', '1.5h PQ test', '2pm-4pm call', '1h 30m training'].map(s => TT.parseQuick(s, '2026-11-02')));
  assert.deepEqual([r[0].start, r[0].mins, r[0].title], [615, 5, 'restroom']);
  assert.deepEqual([r[1].start, r[1].mins], [540, 150]);
  assert.deepEqual([r[2].start, r[2].mins], [840, 90]);
  assert.deepEqual([r[3].start, r[3].mins], [null, 90]);
  assert.deepEqual([r[4].start, r[4].mins], [840, 120]);
  assert.equal(r[5].mins, 90);
});

await test('breaks inside a task come off its time', async () => {
  const r = await page.evaluate(() => {
    const c = n => Object.values(TT.S.data.categories).find(x => x.name === n).id, D = '2026-10-05';
    TT.saveEntry({ date: D, start: 540, mins: 120, title: 'Two hours', category: c('Work') });
    TT.saveEntry({ date: D, start: 600, mins: 5, title: 'Restroom', category: c('Restroom') });
    return Object.values(TT.S.data.logs).filter(x => x.date === D).map(x => [x.title, TT.netOf(x)]);
  });
  assert.equal(r.find(x => x[0] === 'Two hours')[1], 115);
});

await test('clashing work asks, and can cut the existing entry', async () => {
  await page.evaluate(() => { const c = Object.values(TT.S.data.categories).find(x => x.name === 'Work').id; TT.saveEntry({ date: '2026-10-05', start: 600, mins: 90, title: 'Clash', category: c }); });
  await page.waitForSelector('dialog h2');
  await page.click('[data-c=split]');
  await page.waitForTimeout(100);
  const r = await page.evaluate(() => Object.values(TT.S.data.logs).filter(x => !x.del && x.title === 'Two hours').map(x => x.mins));
  assert.deepEqual(r, [60]);
});

await test('dates, weeks and merging', async () => {
  const r = await page.evaluate(() => {
    const a = { logs: { x: { id: 'x', u: 5, title: 'old' }, y: { id: 'y', u: 9, title: 'a' } } };
    const b = { logs: { x: { id: 'x', u: 7, title: 'new' }, y: { id: 'y', u: 1, del: true }, z: { id: 'z', u: 2 } } };
    return { m: TT.mergeData(a, b).data.logs, mid: TT.splitMidnight('2026-10-05', 1410, 60), w: [TT.isoWeek('2026-11-02'), TT.isoWeek('2027-01-01')], fy: TT.fyOf('2027-03-31') };
  });
  assert.deepEqual([r.m.x.title, r.m.y.title, !!r.m.z], ['new', 'a', true]);
  assert.equal(r.mid[1].date, '2026-10-06');
  assert.deepEqual([r.w[0].w, r.w[1].w, r.w[1].y, r.fy], [45, 53, 2026, 2026]);
});

await test('folder sync keeps 3 saves and picks up another device', async () => {
  const r = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('sync', { create: true });
    const S = TT.Sync; TT.Folder.dir = dir; S.state = 'ok';
    const names = async () => { const n = []; for await (const [k] of dir.entries()) n.push(k); return n.sort(); };
    await S.push();
    for (let i = 0; i < 3; i++) { S.sessionFile = null; await new Promise(f => setTimeout(f, 1100)); await S.push(); }
    const kept = await names();
    const read = async n => JSON.parse(await new Response((await (await dir.getFileHandle(n)).getFile()).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    const write = async (n, j) => { const b = await new Response(new Blob([JSON.stringify(j)]).stream().pipeThrough(new CompressionStream('gzip'))).blob(); const w = await (await dir.getFileHandle(n, { create: true })).createWritable(); await w.write(b); await w.close(); };
    const base = await read(kept[2]);
    const phone = 'tracker-save-29990101000000-phone.json.gz';
    base.data.logs.p1 = { id: 'p1', date: '2026-10-07', start: null, mins: 30, title: 'From phone', category: 'c0', u: Date.now() + 5 };
    await write(phone, base); await S.pull(); const first = !!TT.S.data.logs.p1;
    /* the phone updates the same session file */
    base.data.logs.p2 = { ...base.data.logs.p1, id: 'p2', u: Date.now() + 9 };
    await new Promise(f => setTimeout(f, 50)); await write(phone, base); await S.pull(); const second = !!TT.S.data.logs.p2;
    /* a half-delivered file must not stop sync */
    const w = await (await dir.getFileHandle('tracker-save-29990102000000-bad.json.gz', { create: true })).createWritable(); await w.write('not finished'); await w.close();
    await S.pull();
    const state = S.state; TT.Folder.dir = null; S.state = 'off';
    return { count: kept.length, first, second, state };
  });
  assert.deepEqual(r, { count: 3, first: true, second: true, state: 'ok' });
});

await page.evaluate(() => { TT.sampleData(); return TT.commit({ silent: true }); });

await test('every period opens on the dashboard', async () => {
  await go(page, 'dash');
  for (const k of ['day', 'cw', 'fy', 'year', 'custom', 'month']) { await page.click(`[data-act=pKind][data-k=${k}]`); await page.waitForTimeout(80); }
});

await test('CSV, Excel and PDF exports download', async () => {
  await go(page, 'ledger');
  await page.click('[data-act=pKind][data-k=fy]');
  await page.waitForTimeout(150);
  for (const f of ['csv', 'xlsx', 'pdf']) {
    const [d] = await Promise.all([page.waitForEvent('download'), page.click(`[data-act=exp][data-f=${f}]`)]);
    await d.saveAs(`${OUT}/export.${f}`);
    assert.ok(statSync(`${OUT}/export.${f}`).size > 1000, f);
  }
});

await test('Excel import assigns project IDs', async () => {
  const r = await page.evaluate(async () => {
    const b = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(b, XLSX.utils.aoa_to_sheet([['Date', 'Activity', 'Start', 'End', 'Project'], ['15/06/2026', 'Imported job', '09:00', '10:30', 'Legacy thing']]), 'S');
    await TT.importFile(new File([XLSX.write(b, { type: 'array', bookType: 'xlsx' })], 'a.xlsx'));
    document.querySelector('#doImport').click();
    await new Promise(f => setTimeout(f, 100));
    const l = Object.values(TT.S.data.logs).find(x => x.title === 'Imported job');
    return { mins: l.mins, date: l.date, code: TT.S.data.projects[l.projectId].code };
  });
  assert.deepEqual(r, { mins: 90, date: '2026-06-15', code: 'P-003' });
});

await test('project prompt shows for work, not for restroom', async () => {
  await go(page, 'log');
  await page.fill('#quickIn', '9-10 Yaw brake audit');
  await page.waitForTimeout(80);
  assert.ok((await page.textContent('#quickPrev')).includes('No matching project'));
  await page.fill('#quickIn', '10:15 restroom 5m');
  await page.waitForTimeout(80);
  assert.ok(!(await page.textContent('#quickPrev')).includes('No matching project'));
  await page.fill('#quickIn', '');
});

await test('focus timer runs', async () => {
  await page.evaluate(() => TT.actions.focusTask({ dataset: { id: Object.values(TT.S.data.tasks).find(x => x.status === 'Planned').id } }));
  await page.waitForTimeout(1200);
  assert.ok(await page.isVisible('#dock'));
  await page.evaluate(() => TT.Timer.stop());
});

await test('page reloads offline', async () => {
  await page.evaluate(() => Promise.race([navigator.serviceWorker.ready, new Promise(f => setTimeout(f, 4000))]));
  await page.reload(); await page.waitForTimeout(400);
  await context.setOffline(true); await page.reload();
  await page.waitForSelector('.nav');
  await context.setOffline(false);
});

const shots = [['home', 'home'], ['dash', 'dashboard'], ['log', 'log-time'], ['guide', 'guide']];
for (const [hash, name] of shots) { await go(page, hash, 400); await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }); }

const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const mp = await phone.newPage();
mp.on('pageerror', e => errors.push(`phone: ${e.message}`));
await mp.goto(URL + '#home');
await mp.waitForSelector('.hero');
await mp.evaluate(() => { TT.sampleData(); return TT.commit({ silent: true }); });
for (const h of ['home', 'dash', 'log', 'plan', 'ledger', 'settings', 'guide']) {
  await test(`phone layout fits: ${h}`, async () => {
    await go(mp, h, 350);
    assert.ok(await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await mp.screenshot({ path: `${OUT}/phone-${h}.png`, fullPage: true });
  });
}

await test('no page errors', async () => assert.deepEqual(errors, []));
await browser.close();
server.close();
if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log('All passed');
