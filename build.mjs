import fs from 'node:fs';
const SERVER = process.env.SERVER || 'bera-2';
const raw = JSON.parse(fs.readFileSync(`raw-${SERVER}.json`, 'utf8'));
const MODES = ['conquest', 'worldBoss', 'guildWar', 'guildBossBattle', 'trainingGround'];

// exact port of the site's function A(...)
function vs(base, cp, score, job) {
  if (!(cp > 0) || !(score > 0)) return null;
  const vsField = (Math.exp(Math.log(score) - (base.fitA + base.fitB * Math.log(cp))) - 1) * 100;
  const expectedField = Math.exp(base.fitA + base.fitB * Math.log(cp));
  const cls = base.perClass.find(c => c.job === job);
  return {
    vsField,
    vsClass: cls ? ((1 + vsField / 100) / (1 + cls.residualPct / 100) - 1) * 100 : null,
    expectedField,
    expectedClass: cls ? expectedField * (1 + cls.residualPct / 100) : null,
  };
}
const tierOf = lvl => (lvl >= 100 ? 'fourth' : 'sub');
const r2 = n => (n == null ? null : Math.round(n * 100) / 100);

const guilds = raw.guilds.filter(g => g.data).map(g => {
  const members = g.data.members.map(m => {
    const tier = tierOf(m.level);
    const modes = {};
    for (const mode of MODES) {
      const best = m.best?.[mode];
      if (!best) { modes[mode] = null; continue; }
      const v = vs(raw.baselines[tier][mode], best.cp, best.score, m.job ?? '');
      modes[mode] = { score: best.score, cp: best.cp, date: best.snapshotDate,
                      vsField: r2(v?.vsField), vsClass: r2(v?.vsClass), expected: v?.expectedField ?? null };
    }
    const fields = MODES.map(k => modes[k]?.vsField).filter(v => v != null);
    const classes = MODES.map(k => modes[k]?.vsClass).filter(v => v != null);
    return { accountId: m.accountId, name: m.name, job: m.job, level: m.level, cp: m.cp, tier,
             spriteUrl: m.spriteUrl, modes,
             avgVsField: fields.length ? r2(fields.reduce((a, b) => a + b, 0) / fields.length) : null,
             avgVsClass: classes.length ? r2(classes.reduce((a, b) => a + b, 0) / classes.length) : null,
             ranked: fields.length };
  }).sort((a, b) => (b.cp ?? 0) - (a.cp ?? 0));

  const avg = key => { const v = members.map(m => m[key]).filter(x => x != null);
                       return v.length ? r2(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  const modeAvg = {};
  for (const mode of MODES) { const v = members.map(m => m.modes[mode]?.vsField).filter(x => x != null);
                              modeAvg[mode] = v.length ? r2(v.reduce((a, b) => a + b, 0) / v.length) : null; }
  // Member CP sums exactly to the guild total the site publishes (verified against /api/search).
  const totalCp = members.reduce((a, m) => a + (m.cp ?? 0), 0);
  const modeTotal = {};
  for (const mode of MODES) modeTotal[mode] = members.reduce((a, m) => a + (m.modes[mode]?.score ?? 0), 0);
  return { rank: g.rank, name: g.name, server: g.server, membersCount: g.data.membersCount,
           emblemHash: g.data.emblemHash, totalCp, totalCpText: g.totalCpText, avgCpText: g.avgCpText,
           modeTotal, conquestTotal: modeTotal.conquest,
           guildAvgVsField: avg('avgVsField'), guildAvgVsClass: avg('avgVsClass'), modeAvgVsField: modeAvg, members };
});

// Derived rankings. The site publishes no guild-level conquest ranking, so these are ranks
// within this scraped top-50 cohort, by summed member score.
const rankBy = (key, get) => {
  guilds.slice().sort((a, b) => get(b) - get(a)).forEach((g, i) => { g[key] = i + 1; });
};
rankBy('cpRank', g => g.totalCp);
for (const mode of MODES) rankBy(mode + 'Rank', g => g.modeTotal[mode]);
rankBy('conquestRank', g => g.modeTotal.conquest);

const out = { server: raw.server, region: raw.region, worldId: raw.worldId, scrapedAt: raw.scrapedAt,
              modes: MODES, modeLabels: { conquest: 'Guild Conquest', worldBoss: 'World Boss', guildWar: 'Guild War',
              guildBossBattle: 'Guild Boss Battle', trainingGround: 'Training Ground' },
              snapshotDates: Object.fromEntries(MODES.map(m => [m, raw.baselines.fourth[m].snapshotDate])),
              baselines: raw.baselines, guilds };
fs.writeFileSync(`dataset-${SERVER}.json`, JSON.stringify(out));
const totalMembers = guilds.reduce((a, g) => a + g.members.length, 0);
const rankedMembers = guilds.reduce((a, g) => a + g.members.filter(m => m.ranked === 5).length, 0);
console.log(`${SERVER}: guilds=${guilds.length} members=${totalMembers} fullyRanked=${rankedMembers} bytes=${fs.statSync(`dataset-${SERVER}.json`).size}`);
console.log('cp rank vs conquest rank (biggest movers):');
guilds.slice().sort((a,b)=>Math.abs(b.cpRank-b.conquestRank)-Math.abs(a.cpRank-a.conquestRank)).slice(0,6)
  .forEach(g => console.log(`  ${g.name.padEnd(14)} cp #${String(g.cpRank).padStart(2)}  conquest #${String(g.conquestRank).padStart(2)}  (${g.conquestRank<g.cpRank?'+':''}${g.cpRank-g.conquestRank})`));
