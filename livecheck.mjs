import { chromium } from 'playwright-core';
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PAGE = 'https://shiangx.github.io/mapleidle-guild-analysis/';
const b = await chromium.launch({ headless: true, executablePath: EXE });
const p = await b.newPage({ viewport:{width:1560,height:1120}, deviceScaleFactor:2 });
const errs=[], ext=[];
p.on('pageerror', e=>errs.push('PAGEERROR '+e.message));
p.on('console', m=>{ if(m.type()==='error') errs.push(m.text()); });
p.on('request', r => { const u=new URL(r.url()); if(!u.hostname.endsWith('github.io')) ext.push(r.url()); });
const t0 = Date.now();
const res = await p.goto(PAGE, { waitUntil:'load' });
await p.waitForTimeout(1500);
console.log('http', res.status(), '| load', Date.now()-t0, 'ms');
console.log('external requests (should be none):', ext.length ? ext : 'none');
console.log(JSON.stringify(await p.evaluate(() => ({
  title: document.title,
  h1: document.getElementById('pagetitle').textContent,
  servers: [...document.querySelectorAll('#srvSeg button')].map(b=>b.textContent),
  guilds: document.querySelectorAll('.grow').length,
  memberRows: document.querySelectorAll('#panels tbody tr').length,
  firstMember: document.querySelector('#panels tbody tr').innerText.replace(/\n/g,' ').slice(0,80),
  firstLink: document.querySelector('#panels tbody a').href,
})), null, 1));
// exercise the server switch live
await p.evaluate(()=>document.querySelectorAll('#srvSeg button')[0].click());
await p.waitForTimeout(700);
console.log('after switch:', await p.evaluate(()=>document.getElementById('pagetitle').textContent));
await p.screenshot({ path:'live.png' });
console.log('errors:', errs.length?errs:'none');
await b.close();
