// The score-analysis API has no leader flag; the guild page marks it. Pull it for named guilds.
import { launch, goto, retry } from './browser.mjs';
const REGION = process.env.REGION || 'bera';
const GUILDS = (process.env.GUILDS || '').split(',').filter(Boolean);
const b = await launch(); const p = await b.newPage();
for (const g of GUILDS) {
  const info = await retry(`leader ${g}`, 3, async () => {
    await goto(p, `https://mapleidle.gg/guild/${REGION}/${encodeURIComponent(g)}`);
    await p.waitForSelector('table tbody tr', { timeout: 30000 });
    return p.evaluate(() => {
      const out = { leader: null, officers: [] };
      for (const tr of document.querySelectorAll('table tbody tr')) {
        const t = tr.innerText;
        const name = tr.querySelector('a[href^="/characters/"]')?.getAttribute('href').split('/').pop();
        if (!name) continue;
        // word-boundary match: "Bowmaster" must not read as "master"
        if (/\bLEADER\b/i.test(t)) out.leader = decodeURIComponent(name);
        else if (/\bOFFICER\b|\bSUB ?MASTER\b|\bVICE\b/i.test(t)) out.officers.push(decodeURIComponent(name));
      }
      return out;
    });
  });
  console.log(`${g.padEnd(12)} leader: ${(info.leader || '?').padEnd(16)} officers: ${info.officers.join(', ') || '(none marked)'}`);
}
await b.close();
