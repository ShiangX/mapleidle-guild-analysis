#!/usr/bin/env bash
# Refresh the published guild data. Run from a machine whose connection mapleidle.gg's
# Vercel checkpoint accepts — GitHub-hosted runners are blocked, see the workflow file.
#
# Publishes only if every stage passes and the data actually moved.
set -euo pipefail
cd "$(dirname "$0")"

log() { printf '\n=== %s ===\n' "$1"; }

log "scrape"
SERVER=bera-1 node scrape.mjs
SERVER=bera-2 node scrape.mjs

log "build"
SERVER=bera-1 node build.mjs
SERVER=bera-2 node build.mjs
node pack.mjs
node make.mjs

log "verify against the live site"
SERVER=bera-1 GUILDS=Snooze,Grace node verify2.mjs
SERVER=bera-2 GUILDS=Westhelm,Degens node verify2.mjs

log "check the built page"
node check-build.mjs

log "publish"
if git diff --quiet -- index.html packed.json dataset-*.json; then
  echo "No change in the published data; nothing to push."
  exit 0
fi
git add -A
git commit -m "Refresh guild data ($(date -u +%Y-%m-%d))" \
           -m "Scrape of the Bera 1 and Bera 2 top 50."
git push
echo "Pushed. GitHub Pages redeploys in a minute or two."
