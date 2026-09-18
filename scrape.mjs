import { chromium } from 'playwright-core';
import fs from 'node:fs';

const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const SERVER = process.env.SERVER || 'bera-2';
const [REGION, WORLD] = SERVER.split('-');
const TOP = Number(process.env.TOP || 50);

const b = await chromium.launch({ headless: true, executablePath: EXE });
const p = await b.newPage();
p.on('console', m => { if (m.type() === 'error') {} });

// ---- 1. guild ranking list ----
const guilds = [];
for (let page = 1; guilds.length < TOP; page++) {
  await p.goto(`https://mapleidle.gg/guild?server=${SERVER}&page=${page}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('table tbody tr');
  const rows = await p.evaluate(() => [...document.querySelectorAll('table tbody tr')].map(tr => {
    const c = [...tr.querySelectorAll('td')].map(td => td.innerText.trim());
    const a = tr.querySelector('a[href^="/guild/"]');
    return { rank: Number(c[0]), name: a ? decodeURIComponent(a.getAttribute('href').split('/').pop()) : c[1],
             href: a?.getAttribute('href'), server: c[2], members: Number(c[3]), avgCpText: c[4], totalCpText: c[5] };
  }));
  if (!rows.length) break;
  guilds.push(...rows);
  console.error(`list page ${page}: +${rows.length} (total ${guilds.length})`);
}
guilds.length = Math.min(guilds.length, TOP);

// ---- 2. baselines from the score-analysis page ----
await p.goto('https://mapleidle.gg/tools/score-analysis', { waitUntil: 'domcontentloaded' });
const baselines = await p.evaluate(async () => {
  const BS = String.fromCharCode(92);
  const h = await (await fetch('/tools/score-analysis')).text();
  const key = BS + '"analysis' + BS + '":';
  const i = h.indexOf(key);
  if (i < 0) throw new Error('analysis blob not found');
  const u = h.slice(i + key.length).split(BS + '"').join('"');
  let d = 0, end = -1;
  for (let k = 0; k < u.length; k++) { const c = u[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { end = k + 1; break; } } }
  const obj = JSON.parse(u.slice(0, end));
  const out = {};
  for (const t of Object.keys(obj)) { out[t] = {};
    for (const m of Object.keys(obj[t])) { const x = obj[t][m];
      out[t][m] = { fitA: x.fitA, fitB: x.fitB, snapshotDate: x.snapshotDate,
                    perClass: x.perClass.map(c => ({ job: c.job, residualPct: c.residualPct, n: c.n, inBars: c.inBars })) }; } }
  return out;
});
console.error('baselines:', Object.keys(baselines), Object.keys(baselines.fourth));

// ---- 3. per-guild member scores ----
const raw = [];
for (const g of guilds) {
  const url = `/api/score-analysis/guild?region=${encodeURIComponent(REGION)}&name=${encodeURIComponent(g.name)}`;
  const res = await p.evaluate(async (u) => {
    const r = await fetch(u);
    return { status: r.status, body: r.ok ? await r.json() : await r.text() };
  }, url);
  if (res.status !== 200) { console.error(`FAIL ${g.rank} ${g.name} -> ${res.status}`); raw.push({ ...g, error: res.status }); continue; }
  raw.push({ ...g, data: res.body });
  console.error(`ok ${g.rank} ${g.name} (${res.body.members.length} members)`);
  await p.waitForTimeout(250);
}
await b.close();

fs.writeFileSync(`raw-${SERVER}.json`, JSON.stringify({ server: SERVER, region: REGION, worldId: Number(WORLD), scrapedAt: new Date().toISOString(), baselines, guilds: raw }));
console.error(`wrote raw-${SERVER}.json`, fs.statSync(`raw-${SERVER}.json`).size, 'bytes');
