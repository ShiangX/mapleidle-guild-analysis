// Post-build gate: opens the built index.html and fails if anything is wrong, so a broken
// page never reaches GitHub Pages.
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './browser.mjs';

// Expectations come from packed.json rather than constants, so adding a server or pulling in
// a guild from outside the top N does not silently pass or spuriously fail.
const packed = JSON.parse(fs.readFileSync('packed.json', 'utf8'));
const MIN_TOP = Number(process.env.TOP || 50);
const problems = [];

for (const s of packed.servers) {
  if (s.top < MIN_TOP) problems.push(`${s.label}: only ${s.top} top-ranked guilds, expected ${MIN_TOP}`);
  const bad = s.guilds.filter(g => !g.m?.length);
  if (bad.length) problems.push(`${s.label}: ${bad.length} guilds with no members`);
}

const size = fs.statSync('index.html').size;
if (size < 200_000) problems.push(`index.html is only ${size} bytes — data probably did not inject`);

const b = await launch();
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
p.on('pageerror', e => problems.push(`page error: ${e.message}`));
p.on('console', m => { if (m.type() === 'error') problems.push(`console error: ${m.text()}`); });
await p.goto('file://' + path.resolve('index.html'), { waitUntil: 'load' });
await p.waitForTimeout(1200);

const servers = await p.evaluate(() => [...document.querySelectorAll('#srvSeg button')].map(b => b.textContent));
if (servers.length !== packed.servers.length)
  problems.push(`expected ${packed.servers.length} servers, found ${servers.length}`);

for (let i = 0; i < servers.length; i++) {
  await p.evaluate(n => document.querySelectorAll('#srvSeg button')[n].click(), i);
  await p.waitForTimeout(600);
  const s = await p.evaluate(() => ({
    title: document.getElementById('pagetitle').textContent,
    guilds: document.querySelectorAll('.grow').length,
    members: document.querySelectorAll('#panels tbody tr').length,
    pcts: document.querySelectorAll('#panels .pct').length,
    link: document.querySelector('#panels tbody a')?.href || '',
    subtitle: document.getElementById('subtitle').textContent,
  }));
  const want = packed.servers[i].guilds.length;
  if (s.guilds !== want) problems.push(`${servers[i]}: ${s.guilds} guilds in picker, data has ${want}`);
  if (s.members < 5) problems.push(`${servers[i]}: member table has ${s.members} rows`);
  if (s.pcts < 20) problems.push(`${servers[i]}: only ${s.pcts} percentage cells rendered`);
  if (!s.link.startsWith('https://mapleidle.gg/')) problems.push(`${servers[i]}: member link looks wrong (${s.link})`);
  if (!/pulled \d{4}-\d{2}-\d{2}/.test(s.subtitle)) problems.push(`${servers[i]}: subtitle missing pull date`);
  const extra = want - packed.servers[i].top;
  console.log(`${servers[i].padEnd(8)} ${s.guilds} guilds${extra > 0 ? ` (${packed.servers[i].top} + ${extra} added)` : ''}` +
              ` · ${s.members} member rows · ${s.pcts} cells · ok`);
}
await b.close();

if (problems.length) { console.error('\nFAILED:'); problems.forEach(x => console.error('  ' + x)); process.exit(1); }
console.log(`\nindex.html looks good (${(size / 1024).toFixed(0)} KB).`);
