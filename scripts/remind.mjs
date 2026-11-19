// Sends a Day ledger reminder to every device saved as a PUSH_SUB_* repository secret.
// Run by .github/workflows/reminders.yml:  node scripts/remind.mjs [morning|night|test]
// With no argument the time in India decides: before 15:00 is morning, later is night.
// The push carries only the kind of reminder; the service worker (src/sw.js) holds the wording.
import { execFileSync } from 'node:child_process';
import { createECDH } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sendNotification, setVapidDetails } from 'web-push';

const REPO = `https://github.com/${process.env.GITHUB_REPOSITORY || 'Sathyanarayanan-2001/day-ledger'}`;
const SETUP = 'See "Reminders" in docs/SETUP.md.';
const errors = [];
const stop = msg => { console.log(`::error::${msg}`); process.exit(1); };

const istHour = new Date(Date.now() + 5.5 * 36e5).getUTCHours();
const kind = ['morning', 'night', 'test'].includes(process.argv[2]) ? process.argv[2] : istHour < 15 ? 'morning' : 'night';

// The private key must pair with the public key the app subscribes with.
const priv = (process.env.VAPID_PRIVATE_KEY || '').trim();
if (!priv) stop(`The VAPID_PRIVATE_KEY secret is missing. ${SETUP}`);
const appKey = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8').match(/const PUSH_KEY = '([\w-]+)'/)?.[1];
let pub;
try { const ecdh = createECDH('prime256v1'); ecdh.setPrivateKey(Buffer.from(priv, 'base64url')); pub = ecdh.getPublicKey().toString('base64url'); } catch { stop(`VAPID_PRIVATE_KEY is not a valid key. ${SETUP}`); }
if (pub !== appKey) stop(`VAPID_PRIVATE_KEY does not pair with PUSH_KEY in src/app.js. ${SETUP}`);
setVapidDetails(REPO, pub, priv);

let secrets = {};
try { secrets = JSON.parse(process.env.SECRETS || '{}'); } catch {}
const devices = Object.entries(secrets).filter(([k]) => k.startsWith('PUSH_SUB_')).sort();
if (!devices.length) stop(`No devices yet. In Day ledger, Settings > Reminders, turn reminders on and save the device key as a PUSH_SUB_ secret. ${SETUP}`);

// GitHub stops scheduled runs in a public repository after 60 days with no activity. Warn for the last 10.
const msg = { kind };
try {
  const last = +execFileSync('git', ['log', '-1', '--format=%ct'], { encoding: 'utf8' });
  const left = 60 - Math.floor((Date.now() / 1000 - last) / 86400);
  if (left <= 10 && kind !== 'morning') Object.assign(msg, { pauseIn: Math.max(1, left), pauseUrl: `${REPO}/pulls` });
} catch {}

await Promise.all(devices.map(async ([name, value]) => {
  let sub;
  try { sub = JSON.parse(value); if (!sub.endpoint || !sub.keys) throw 0; } catch { errors.push(`${name} is not a device key. Copy it again from Day ledger, Settings > Reminders.`); return; }
  try {
    // Two hours to live: a phone that is off for longer skips the reminder instead of buzzing late.
    await sendNotification(sub, JSON.stringify(msg), { TTL: 7200, urgency: 'high', topic: kind });
    console.log(`Sent the ${kind} reminder to ${name}`);
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) errors.push(`${name} has expired. Open Day ledger on that device, turn reminders on in Settings, and replace the secret.`);
    else errors.push(`${name} failed: ${e.statusCode || ''} ${e.body || e.message}`.replace(/\s+/g, ' ').trim());
  }
}));
if (msg.pauseIn) console.log(`::warning::Scheduled runs pause in ${msg.pauseIn} days unless the repository gets a commit.`);
for (const e of errors) console.log(`::error::${e}`);
if (errors.length) process.exit(1);
