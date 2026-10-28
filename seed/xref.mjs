// Cross-reference upload (standalone rerun of the seed's xref phase, with
// retries — the first attempt died on a VM egress socket error after
// chunk 0). Rebuilds the same xref list as seed.mjs and posts it in
// 1,000-entry chunks. Upserts are idempotent.

import { readFileSync, readdirSync } from 'node:fs';

const BASE = 'https://preflight.mrdavesemailaddress.workers.dev';
const STATS_KEY = 'd481a507eb6c803b9853beb9d53a68fe458e';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const xref = [];
const honeypot = JSON.parse(readFileSync('/home/hatch/workspace/honeypot/api/skills.json', 'utf8'));
const hpSkills = Array.isArray(honeypot) ? honeypot : honeypot.skills;
for (const s of hpSkills) xref.push({ pkg_key: `github:oidsdev/honeypot@skills/${s.name}`, in_honeypot: 1, label: s.name });

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
for (const r of [...repos].sort()) xref.push({ pkg_key: `github:${r}@.`, in_census: 1 });
console.log('xref entries:', xref.length);

let sent = 0;
for (let i = 0; i < xref.length; i += 1000) {
  const chunk = xref.slice(i, i + 1000);
  let ok = false;
  for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
    try {
      const res = await fetch(`${BASE}/api/seed-xref?key=${STATS_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: chunk }) });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { ok = true; sent += j.upserted || chunk.length; }
      else console.log('chunk', i, 'HTTP', res.status, 'attempt', attempt);
    } catch (e) { console.log('chunk', i, 'error', String(e.message || e), 'attempt', attempt); }
    if (!ok) await sleep(3000);
  }
  console.log('xref progress', Math.min(i + 1000, xref.length), '/', xref.length, ok ? 'ok' : 'FAILED');
  await sleep(400);
}
console.log('XREF DONE, upserted', sent);
