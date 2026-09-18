import fs from 'node:fs';
const SERVERS = (process.env.SERVERS || 'bera-1,bera-2').split(',');
const sets = SERVERS.map(s => JSON.parse(fs.readFileSync(`dataset-${s}.json`,'utf8')));
const MODES = sets[0].modes;
const dates = []; const dIdx = d => d == null ? -1 : (dates.includes(d) ? dates.indexOf(d) : (dates.push(d)-1));
const sig = (n, p=6) => n == null ? null : Number(n.toPrecision(p));
const packGuilds = ds => ds.guilds.map(g => ({
  r: g.rank, n: g.name, mc: g.membersCount, e: g.emblemHash,
  tcp: sig(g.totalCp, 6), tcpt: g.totalCpText, acp: g.avgCpText,
  cqr: g.conquestRank, cqt: sig(g.conquestTotal, 6),
  mr: MODES.map(m => g[m + 'Rank']), mt: MODES.map(m => sig(g.modeTotal[m], 6)),
  af: g.guildAvgVsField, ac: g.guildAvgVsClass, ma: MODES.map(m => g.modeAvgVsField[m]),
  m: g.members.map(x => [ x.name, x.job, x.level, sig(x.cp,5), x.tier === 'fourth' ? 1 : 0,
      x.avgVsField, x.avgVsClass, (x.spriteUrl||'').replace('https://cdn.mapleidle.gg/',''),
      MODES.map(k => { const d = x.modes[k]; return d ? [sig(d.score,5), sig(d.cp,5), dIdx(d.date), d.vsField, d.vsClass] : null; }) ])
}));
const SLUGS = { conquest:'conquest', worldBoss:'world_boss', guildWar:'guild_war',
  guildBossBattle:'guild_boss_battle', trainingGround:'training_ground' };
const out = {
  slugs: MODES.map(m => SLUGS[m]), modes: MODES,
  labels: MODES.map(m => sets[0].modeLabels[m]),
  short: ['Conquest','World Boss','Guild War','Boss Battle','Training'],
  dates,
  servers: sets.map(ds => ({
    id: ds.server, label: ds.server.replace(/^(\w)(\w*)-/, (_,a,b) => a.toUpperCase()+b+' '),
    region: ds.region, worldId: ds.worldId, scrapedAt: ds.scrapedAt,
    snap: MODES.map(m => ds.snapshotDates[m]), guilds: packGuilds(ds),
  })),
};
fs.writeFileSync('packed.json', JSON.stringify(out));
console.log('packed', fs.statSync('packed.json').size, 'bytes');
out.servers.forEach(s => console.log(' ', s.label, '| guilds', s.guilds.length, '| members', s.guilds.reduce((a,g)=>a+g.m.length,0)));
