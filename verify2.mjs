// Re-renders guilds on the live site and diffs every cell against our computed dataset.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const SERVER = process.env.SERVER || 'bera-2';
const ds = JSON.parse(fs.readFileSync(`dataset-${SERVER}.json`, 'utf8'));
const GUILDS = (process.env.GUILDS || '').split(',').filter(Boolean);
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const TABS = { conquest:'Guild Conquest', worldBoss:'World Boss', guildWar:'Guild War',
               guildBossBattle:'Guild Boss Battle', trainingGround:'Training Ground' };

const b = await chromium.launch({ headless: true, executablePath: EXE });
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
let checked = 0; const bad = [];

for (const gname of GUILDS) {
  // drive the site's own guild lookup through its deep link
  await p.goto(`https://mapleidle.gg/tools/score-analysis?kind=guild&region=${ds.region}&name=${encodeURIComponent(gname)}`,
    { waitUntil: 'domcontentloaded' });
  try { await p.waitForFunction(() => [...document.querySelectorAll('table')]
          .some(t => /vs all/i.test(t.querySelector('thead')?.innerText || '')), { timeout: 20000 }); }
  catch { bad.push(`${gname}: guild card never rendered`); continue; }

  const mine = ds.guilds.find(g => g.name === gname);
  if (!mine) { bad.push(`${gname}: not in dataset`); continue; }

  for (const [mode, label] of Object.entries(TABS)) {
    for (const btn of await p.$$('button')) {
      if (((await btn.innerText().catch(()=>'')) || '').trim() === label) { await btn.click(); break; } }
    await p.waitForTimeout(1000);
    const rows = await p.evaluate(() => {
      for (const tb of document.querySelectorAll('table')) {
        if (!/vs all/i.test(tb.querySelector('thead')?.innerText || '')) continue;
        return [...tb.querySelectorAll('tbody tr')].map(tr => {
          const td = [...tr.querySelectorAll('td')].map(x => x.innerText.replace(/\n/g, ' ').trim());
          // first cell reads "<name> Lv. 120 · Paladin" — take everything before " Lv."
          const m = td[0].match(/^(.*?)\s+Lv\./);
          return { name: m ? m[1].trim() : null, vsAll: td[3], vsClass: td[4] };
        });
      }
      return [];
    });
    if (!rows.length) { bad.push(`${gname}/${mode}: no rows`); continue; }
    for (const r of rows) {
      if (!r.name || r.vsAll === '—') continue;
      const m = mine.members.find(x => x.name === r.name);
      if (!m) { bad.push(`${gname}/${mode}/${r.name}: member not in dataset`); continue; }
      const siteF = parseFloat(r.vsAll), siteC = r.vsClass === '—' ? null : parseFloat(r.vsClass);
      const myF = m.modes[mode]?.vsField, myC = m.modes[mode]?.vsClass;
      checked++;
      if (myF == null || Math.abs(Math.round(myF * 10) / 10 - siteF) > 0.11)
        bad.push(`${gname}/${mode}/${r.name} vsAll site=${siteF} mine=${myF}`);
      if (siteC != null && myC != null && Math.abs(Math.round(myC * 10) / 10 - siteC) > 0.11)
        bad.push(`${gname}/${mode}/${r.name} vsClass site=${siteC} mine=${myC}`);
    }
  }
}
console.log(`${SERVER}: checked ${checked} cells across ${GUILDS.length} guilds x 5 modes; mismatches: ${bad.length}`);
bad.slice(0, 20).forEach(x => console.log('  ', x));
await b.close();
process.exit(bad.length ? 1 : 0);
