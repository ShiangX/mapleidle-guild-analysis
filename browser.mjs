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
