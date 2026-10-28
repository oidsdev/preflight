// Seed corpus builder for Preflight.
// Sources, all data we already hold or public listings:
//   1. Honeypot index (~/workspace/honeypot/api/skills.json) — 19 skills.
//   2. skills.sh homepage leaderboard — (owner, repo, skill) triples.
//   3. Agent Census directory data (~/workspace/agent-directory-api/data/*.sql)
//      — GitHub repos, MCP/agent-flavoured names first, deterministic order.
// Scans are POSTed to the live worker with ~1.1s pacing (human pacing on
// fetches). Results land in seed/seed-results.json. Re-runnable: targets that
// already have a result are skipped.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';

const BASE = 'https://preflight.mrdavesemailaddress.workers.dev';
const STATS_KEY = 'd481a507eb6c803b9853beb9d53a68fe458e';
const RESULTS = new URL('./seed-results.json', import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- build target list ----------
const targets = []; // {url, source}
const xref = [];    // known_packages entries

const honeypot = JSON.parse(readFileSync('/home/hatch/workspace/honeypot/api/skills.json', 'utf8'));
const hpSkills = Array.isArray(honeypot) ? honeypot : honeypot.skills;
for (const s of hpSkills) {
  targets.push({ url: `https://github.com/oidsdev/honeypot/tree/main/skills/${s.name}`, source: 'honeypot' });
  xref.push({ pkg_key: `github:oidsdev/honeypot@skills/${s.name}`, in_honeypot: 1, label: s.name });
}

// skills.sh leaderboard
const html = await (await fetch('https://www.skills.sh/')).text();
const seenTriple = new Set();
const triples = [];
for (const m of html.matchAll(/"\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)"/g)) {
  const key = m[1] + '/' + m[2] + '/' + m[3];
  if (!seenTriple.has(key)) { seenTriple.add(key); triples.push([m[1], m[2], m[3]]); }
}
for (const [o, r, s] of triples.slice(0, 110)) {
  targets.push({ url: `https://skills.sh/${o}/${r}/${s}`, source: 'skills.sh' });
}

// census repos
const STOP_OWNERS = new Set(['features', 'about', 'topics', 'marketplace', 'sponsors', 'settings', 'login', 'orgs', 'users', 'site', 'blog', 'pricing', 'enterprise', 'collections', 'events', 'explore', 'search', 'pulls', 'issues', 'codespaces', 'github', 'apps', 'team', 'security', 'readme']);
const repos = new Set();
for (const f of readdirSync('/home/hatch/workspace/agent-directory-api/data').filter((x) => /^import-.*\.sql$/.test(x))) {
  const sql = readFileSync('/home/hatch/workspace/agent-directory-api/data/' + f, 'utf8');
  for (const m of sql.matchAll(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/g)) {
    const owner = m[1], repo = m[2].replace(/\.git$/, '');
    if (STOP_OWNERS.has(owner.toLowerCase())) continue;
    if (/^(www|api|docs|support|help)$/i.test(owner)) continue;
    repos.add(owner + '/' + repo);
  }
}
const repoList = [...repos].sort();
const mcpish = repoList.filter((r) => /mcp|agent|skill|server|tool|llm|gpt|claude|bot/i.test(r));
const rest = repoList.filter((r) => !/mcp|agent|skill|server|tool|llm|gpt|claude|bot/i.test(r));
const censusPick = [...mcpish, ...rest].slice(0, 240);
for (const r of censusPick) targets.push({ url: 'https://github.com/' + r, source: 'census' });
for (const r of repoList) xref.push({ pkg_key: `github:${r}@.`, in_census: 1 });

console.log(`targets: ${targets.length} (honeypot ${hpSkills.length}, skills.sh ${Math.min(110, triples.length)}, census ${censusPick.length}); xref entries: ${xref.length}`);

// ---------- scan (first: the xref upload below is slow in v1 — one D1
// upsert per entry through the worker — so it runs after the scans) ----------
const done = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : [];
const doneUrls = new Set(done.map((d) => d.url));
let ok = 0, failed = 0;
for (const t of targets) {
  if (doneUrls.has(t.url)) { ok++; continue; }
  const started = Date.now();
  try {
    const res = await fetch(BASE + '/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: t.url }) });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.hash) { done.push({ url: t.url, source: t.source, ok: true, hash: j.hash, grade: j.grade, score: j.score, name: j.name }); ok++; }
    else { done.push({ url: t.url, source: t.source, ok: false, error: j.error || ('HTTP ' + res.status) }); failed++; }
  } catch (e) {
    done.push({ url: t.url, source: t.source, ok: false, error: String(e.message || e) }); failed++;
  }
  writeFileSync(RESULTS, JSON.stringify(done, null, 1));
  const took = Date.now() - started;
  if (done.length % 20 === 0) console.log(`progress ${done.length}/${targets.length} ok=${ok} failed=${failed} last=${t.url} (${took}ms)`);
  await sleep(1100);
}
const grades = {};
for (const d of done) if (d.ok) grades[d.grade] = (grades[d.grade] || 0) + 1;
console.log(`SEED SCANS DONE: ${done.filter((d) => d.ok).length} ok / ${done.length} attempted; grades ${JSON.stringify(grades)}`);

// ---------- upload cross-reference (after scans; slow in v1) ----------
for (let i = 0; i < xref.length; i += 4000) {
  const chunk = xref.slice(i, i + 4000);
  const res = await fetch(`${BASE}/api/seed-xref?key=${STATS_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: chunk }) });
  console.log('xref chunk', i, '->', res.status);
}
console.log('SEED ALL DONE');
