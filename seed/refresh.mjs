// Refresh pass: re-scan every successfully seeded URL under the final
// engine revision, so the launch corpus carries uniform verdicts (the seed
// ran across three calibration revisions). Re-scans update the stored report
// in place at the same content-hash URL; newly-scoped packages may also mint
// a fresh, correctly scoped report alongside the repo-level one.

import { readFileSync } from 'node:fs';

const BASE = 'https://hol-guard.mrdavesemailaddress.workers.dev';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = JSON.parse(readFileSync(new URL('./seed-results.json', import.meta.url), 'utf8'));
const urls = [...new Set(results.filter((d) => d.ok).map((d) => d.url))];
console.log('refreshing', urls.length, 'urls');
let n = 0;
for (const url of urls) {
  try {
    const res = await fetch(BASE + '/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) console.log('refresh failed', url, j.error || res.status);
  } catch (e) { console.log('refresh error', url, String(e.message || e)); }
  n++;
  if (n % 40 === 0) console.log('refreshed', n, '/', urls.length);
  await sleep(1100);
}
console.log('REFRESH DONE', n);
