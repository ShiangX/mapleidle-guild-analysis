// Post-build gate: opens the built index.html and fails if anything is wrong, so a broken
// page never reaches GitHub Pages.
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './browser.mjs';

const EXPECT_SERVERS = Number(process.env.EXPECT_SERVERS || 2);
const EXPECT_GUILDS = Number(process.env.TOP || 50);
const problems = [];

const size = fs.statSync('index.html').size;
if (size < 200_000) problems.push(`index.html is only ${size} bytes — data probably did not inject`);

const b = await launch();
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
p.on('pageerror', e => problems.push(`page error: ${e.message}`));
p.on('console', m => { if (m.type() === 'error') problems.push(`console error: ${m.text()}`); });
await p.goto('file://' + path.resolve('index.html'), { waitUntil: 'load' });
await p.waitForTimeout(1200);

const servers = await p.evaluate(() => [...document.querySelectorAll('#srvSeg button')].map(b => b.textContent));
if (servers.length !== EXPECT_SERVERS) problems.push(`expected ${EXPECT_SERVERS} servers, found ${servers.length}`);

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
  if (s.guilds !== EXPECT_GUILDS) problems.push(`${servers[i]}: ${s.guilds} guilds in picker, expected ${EXPECT_GUILDS}`);
  if (s.members < 5) problems.push(`${servers[i]}: member table has ${s.members} rows`);
  if (s.pcts < 20) problems.push(`${servers[i]}: only ${s.pcts} percentage cells rendered`);
  if (!s.link.startsWith('https://mapleidle.gg/')) problems.push(`${servers[i]}: member link looks wrong (${s.link})`);
  if (!/pulled \d{4}-\d{2}-\d{2}/.test(s.subtitle)) problems.push(`${servers[i]}: subtitle missing pull date`);
  console.log(`${servers[i].padEnd(8)} ${s.guilds} guilds · ${s.members} member rows · ${s.pcts} cells · ok`);
}
await b.close();

if (problems.length) { console.error('\nFAILED:'); problems.forEach(x => console.error('  ' + x)); process.exit(1); }
console.log(`\nindex.html looks good (${(size / 1024).toFixed(0)} KB).`);
