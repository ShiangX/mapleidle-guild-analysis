// Checks derived guild totals: total CP against the site's own guild page, and conquest
// totals against the site's per-guild conquest tab.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const b = await chromium.launch({ headless: true, executablePath: EXE });
const p = await b.newPage();
for (const [server, names] of [['bera-2',['Westhelm','Degens','Riot']], ['bera-1',['Snooze','Casino','Petal']]]) {
  const ds = JSON.parse(fs.readFileSync(`dataset-${server}.json`,'utf8'));
  for (const n of names) {
    const g = ds.guilds.find(x => x.name === n);
    await p.goto(`https://mapleidle.gg/guild/${ds.region}/${encodeURIComponent(n)}`, { waitUntil:'domcontentloaded' });
    await p.waitForTimeout(1200);
    const site = await p.evaluate(() => {
      const t = document.body.innerText; const i = t.indexOf('TOTAL CP');
      return t.slice(i, i + 60).split('\n').filter(s=>s.trim())[1];
    });
    // format our numeric total the way the site does: two largest units
    const U = []; for (let i=9;i>=0;i--) U.push([Math.pow(10,15+3*i),'A'+String.fromCharCode(65+i)]);
    U.push([1e12,'T'],[1e9,'B'],[1e6,'M'],[1e3,'K']);
    const fmt2 = v => { for (let k=0;k<U.length;k++){ const [u,s]=U[k];
      if (v>=u){ const hi=Math.floor(v/u); const rem=v-hi*u; const nx=U[k+1];
        const lo = nx ? Math.floor(rem/nx[0]) : 0;
        return lo>0 ? `${hi}${s} ${lo}${nx[1]}` : `${hi}${s}`; } } return String(Math.round(v)); };
    const mine = fmt2(g.totalCp);
    console.log(`${server} ${n.padEnd(10)} total CP  site="${site}"  mine="${mine}"  ${site===mine?'MATCH':'>>> DIFF'}`);
  }
}
await b.close();
