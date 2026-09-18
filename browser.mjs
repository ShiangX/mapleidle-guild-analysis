// Single place that knows how to get a browser that clears mapleidle.gg's Vercel challenge.
//
// The bundled headless shell is not enough — the full Chromium build is what passes, so every
// caller launches with channel:'chromium'. CHROME_PATH overrides the binary if you need to
// point at a system Chrome.
import { chromium } from 'playwright';

export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
                  '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

export function launch(opts = {}) {
  return chromium.launch({
    headless: true,
    channel: 'chromium',
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    ...opts,
  });
}

/**
 * Navigate, then wait out mapleidle.gg's Vercel checkpoint if it appears. The checkpoint
 * serves a JS challenge and self-redirects once solved; on a slow or suspect network that
 * can take a while, so poll rather than assume the first paint is the real page.
 */
export async function goto(p, url, { settleMs = 60000 } = {}) {
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const deadline = Date.now() + settleMs;
  while (Date.now() < deadline) {
    const t = await p.title().catch(() => '');
    if (!/security checkpoint|just a moment|attention required/i.test(t)) return;
    await p.waitForTimeout(2000);
  }
  throw new Error(`blocked at "${await p.title().catch(() => '?')}" after ${settleMs}ms — ${url}`);
}

/** Describe whatever the page is actually showing. Used to make timeouts diagnosable. */
export async function describe(p) {
  try {
    const d = await p.evaluate(() => ({
      url: location.href, title: document.title,
      text: document.body?.innerText.replace(/\s+/g, ' ').slice(0, 220) || '',
    }));
    return `url=${d.url} title="${d.title}" body="${d.text}"`;
  } catch (e) { return `could not inspect page: ${e.message}`; }
}

/** Run `fn`, retrying on failure with linear backoff. Throws the last error if all tries fail. */
export async function retry(label, tries, fn) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try { return await fn(i); }
    catch (e) {
      last = e;
      console.error(`  retry ${i}/${tries} — ${label}: ${e.message}`);
      if (i < tries) await new Promise(r => setTimeout(r, 3000 * i));
    }
  }
  throw last;
}
