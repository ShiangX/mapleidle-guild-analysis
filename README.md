# MapleIdle guild score analysis — Bera 1 & Bera 2

Scrapes the top 50 guilds on each server from mapleidle.gg, pulls every member's best score in
all five contents, and reproduces the site's own "vs baseline" percentages so guilds can be
compared member by member.

**Live: https://shiangx.github.io/mapleidle-guild-analysis/**

Or open `index.html` locally. Both servers are embedded, no server
needed. Switch between them with the Bera 1 / Bera 2 toggle.

Covers 100 guilds and 2,631 members.

## Pipeline

    SERVER=bera-1 node scrape.mjs    # guild list + /api/score-analysis/guild each → raw-bera-1.json
    SERVER=bera-2 node scrape.mjs
    SERVER=bera-1 node build.mjs     # baseline math + derived ranks → dataset-bera-1.json
    SERVER=bera-2 node build.mjs
    node pack.mjs                    # combines both servers → packed.json
    node -e 'const fs=require("fs");fs.writeFileSync("index.html",
      fs.readFileSync("template.html","utf8").replace("__DATA__",
      fs.readFileSync("packed.json","utf8").replace(/<\//g,"<\\/")))'

`TOP=50` controls depth; any world id works (`SERVER=aquila-3`).

Scraping needs a real browser — mapleidle.gg sits behind a Vercel JS challenge that blocks
curl. The scripts drive Playwright's bundled Chrome for Testing (already in
`~/Library/Caches/ms-playwright`), which passes it.

## How the percentages work

MapleIdle fits `score = exp(a + b·ln(CP))` per content and per job tier (4th job at Lv 100+,
3rd job below), then records each class's average offset from that curve.

- **vs all classes** — how far a member's best score sits above/below the fitted curve, using
  the CP they had when they set the score, not their current CP.
- **vs same class** — that figure divided by the class's own offset, so a Bishop is measured
  against Bishops.
- **Average** — unweighted mean of a member's five content percentages. A guild's average is
  the mean of its members' averages. Missing scores are skipped, not counted as zero.

## Guild-level numbers

- **Total CP** — the sum of member CP. This equals the total the site publishes on each guild
  page, checked on six guilds across both servers.
- **CP #** — rank by total CP. This is how MapleIdle orders its guild list, so it is also the
  guild's position in the top 50.
- **CQ #** — rank by the summed best Guild Conquest score of the roster. MapleIdle publishes
  no guild-level conquest ranking (`/guild-conquest` ranks individual characters), so this one
  is derived, and it ranks **only within these 50 guilds**. Like total CP it rewards larger
  rosters. The ▲/▼ badge is the gap against CP rank: a guild well above its CP rank is
  punching above its combat power.

Per-content ranks and totals for the other four contents are in `dataset-*.json` as
`<mode>Rank` and `modeTotal`, though the UI only surfaces conquest.

Both tables sort on every column, independently of each other: click a header to sort, click
again to reverse. Ties fall back to CP rank.

## Refreshing the data

    ./refresh.sh

Scrapes both servers, rebuilds, verifies against the live site, checks the built page, and
pushes only if all of that passes **and** the data actually moved. A bad run leaves the
published page untouched rather than replacing it with something worse.

**This has to run from a trusted connection, not GitHub Actions.** mapleidle.gg sits behind a
Vercel checkpoint that never clears from GitHub-hosted runners: a probe on 2026-09-18 sat at
"Vercel Security Checkpoint" for 60 seconds on every attempt across three runs, from Azure
IPs, while the identical code passes instantly from a home connection. Retries do not help —
the block is on who is asking, not how often. `.github/workflows/refresh.yml` is kept with its
schedule commented out; it would work unchanged on a self-hosted runner.

## Verification

`build.mjs` is a direct port of the site's client-side function. `verify2.mjs` re-renders
guilds on the live site and diffs every cell:

    SERVER=bera-2 GUILDS=Westhelm,Degens,Riot node verify2.mjs   # 397 cells, 0 mismatches
    SERVER=bera-1 GUILDS=Snooze,Casino,Petal node verify2.mjs    # 328 cells, 0 mismatches

`verify3.mjs` checks derived total CP against each guild's page — 6 of 6 exact.

## Deep links

Every name and percentage links back to mapleidle.gg. The tool has no visible share URL, but
its page does read these params:

    /tools/score-analysis?kind=character&region=bera&world=2&name=<name>[&mode=<mode>]
    /tools/score-analysis?kind=guild&region=bera&name=<guild>[&mode=<mode>]

`mode` is snake_case: `conquest`, `world_boss`, `guild_war`, `guild_boss_battle`,
`training_ground`. Clicking a percentage opens that character on that content's tab. The
`profile` link under each name goes to `/characters/<region>/<name>` instead.

## Files

| File | What it is |
|---|---|
| `index.html` | The deliverable. Server toggle, guild picker, sortable guild + member tables, diverging bars, CSV export |
| `raw-<server>.json` | Untouched API responses plus the baseline curves |
| `dataset-<server>.json` | Computed percentages and guild totals, readable key names |
| `packed.json` | Both servers, positional arrays, embedded into the HTML |
| `template.html` | The artifact with a `__DATA__` placeholder |

Data is from mapleidle.gg, an unofficial fan site not affiliated with Nexon. Snapshot dates
differ per content (Guild Boss Battle lags the others by about two weeks).
