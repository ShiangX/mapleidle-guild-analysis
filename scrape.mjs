// Pulls the top N guilds for one server, plus every member's best score in all five contents.
// Writes raw-<server>.json. Exits non-zero if anything is missing, so CI never publishes a
// partial scrape.
import fs from 'node:fs';
import { launch, retry } from './browser.mjs';

const SERVER = process.env.SERVER || 'bera-2';
const [REGION, WORLD] = SERVER.split('-');
const TOP = Number(process.env.TOP || 50);
const TRIES = Number(process.env.TRIES || 4);

const b = await launch();
const p = await b.newPage();
p.setDefaultTimeout(45000);

// ---- 1. guild ranking list ----
const guilds = [];
for (let page = 1; guilds.length < TOP; page++) {
  const rows = await retry(`guild list page ${page}`, TRIES, async () => {
    await p.goto(`https://mapleidle.gg/guild?server=${SERVER}&page=${page}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('table tbody tr', { timeout: 30000 });
    return p.evaluate(() => [...document.querySelectorAll('table tbody tr')].map(tr => {
      const c = [...tr.querySelectorAll('td')].map(td => td.innerText.trim());
      const a = tr.querySelector('a[href^="/guild/"]');
      return { rank: Number(c[0]), name: a ? decodeURIComponent(a.getAttribute('href').split('/').pop()) : c[1],
               href: a?.getAttribute('href'), server: c[2], members: Number(c[3]),
               avgCpText: c[4], totalCpText: c[5] };
    }));
  });
  if (!rows.length) break;
  guilds.push(...rows);
  console.error(`list page ${page}: +${rows.length} (total ${guilds.length})`);
}
guilds.length = Math.min(guilds.length, TOP);
if (guilds.length < TOP) throw new Error(`only found ${guilds.length} guilds, expected ${TOP}`);

// ---- 2. baseline curves from the score-analysis page ----
const baselines = await retry('baselines', TRIES, async () => {
  await p.goto('https://mapleidle.gg/tools/score-analysis', { waitUntil: 'domcontentloaded' });
  return p.evaluate(async () => {
    const BS = String.fromCharCode(92);
    const h = await (await fetch('/tools/score-analysis')).text();
    const key = BS + '"analysis' + BS + '":';
    const i = h.indexOf(key);
    if (i < 0) throw new Error('analysis blob not found in page HTML');
    const u = h.slice(i + key.length).split(BS + '"').join('"');
    let d = 0, end = -1;
    for (let k = 0; k < u.length; k++) { const c = u[k];
      if (c === '{') d++; else if (c === '}') { d--; if (!d) { end = k + 1; break; } } }
    const obj = JSON.parse(u.slice(0, end));
    const out = {};
    for (const t of Object.keys(obj)) { out[t] = {};
      for (const m of Object.keys(obj[t])) { const x = obj[t][m];
        out[t][m] = { fitA: x.fitA, fitB: x.fitB, snapshotDate: x.snapshotDate,
          perClass: x.perClass.map(c => ({ job: c.job, residualPct: c.residualPct, n: c.n, inBars: c.inBars })) }; } }
    return out;
  });
});
for (const tier of ['fourth', 'sub'])
  for (const mode of ['conquest', 'worldBoss', 'guildWar', 'guildBossBattle', 'trainingGround'])
    if (!Number.isFinite(baselines?.[tier]?.[mode]?.fitA))
      throw new Error(`baseline ${tier}.${mode} missing or malformed`);
console.error('baselines ok:', Object.keys(baselines), Object.keys(baselines.fourth));

// ---- 3. per-guild member scores ----
const raw = [];
for (const g of guilds) {
  const url = `/api/score-analysis/guild?region=${encodeURIComponent(REGION)}&name=${encodeURIComponent(g.name)}`;
  const data = await retry(`guild ${g.rank} ${g.name}`, TRIES, async () => {
    const res = await p.evaluate(async u => {
      const r = await fetch(u);
      return { status: r.status, body: r.ok ? await r.json() : (await r.text()).slice(0, 200) };
    }, url);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    if (!Array.isArray(res.body?.members)) throw new Error('no members array');
    if (res.body.members.length !== res.body.membersCount)
      throw new Error(`got ${res.body.members.length} members, guild reports ${res.body.membersCount}`);
    return res.body;
  });
  raw.push({ ...g, data });
  console.error(`ok ${g.rank} ${g.name} (${data.members.length} members)`);
  await p.waitForTimeout(250);
}
await b.close();

const missing = raw.filter(g => !g.data);
if (missing.length) throw new Error(`${missing.length} guilds failed: ${missing.map(g => g.name).join(', ')}`);

fs.writeFileSync(`raw-${SERVER}.json`, JSON.stringify({
  server: SERVER, region: REGION, worldId: Number(WORLD),
  scrapedAt: new Date().toISOString(), baselines, guilds: raw,
}));
console.error(`wrote raw-${SERVER}.json`, fs.statSync(`raw-${SERVER}.json`).size, 'bytes',
              `| ${raw.length} guilds, ${raw.reduce((a, g) => a + g.data.members.length, 0)} members`);
