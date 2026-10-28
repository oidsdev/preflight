// Package resolution + SSRF-safe fetching.
// We only ever fetch public http(s) URLs, with size caps, timeouts, and a
// redirect limit. Scanned code is treated as inert text — never executed,
// never imported, never evaluated.

import { unzip, sha256Hex } from './zip.js';

const MAX_ZIP = 12 * 1024 * 1024;       // compressed download cap
const MAX_FILE = 512 * 1024;            // per-file text cap
const MAX_FILES = 80;
const TIMEOUT_MS = 15000;

const TEXT_EXT = /\.(md|mdx|txt|rst|json|jsonc|toml|ya?ml|js|mjs|cjs|ts|tsx|jsx|py|sh|bash|zsh|ps1|rb|go|rs|php|pl|lua|html|css|xml|csv|ini|cfg|lock)$/i;
const TEXT_NAME = /^(SKILL\.md|README[^/]*|LICENSE[^/]*|Dockerfile|Makefile|server\.json|plugin\.json|manifest\.json|\.env\.example)$/i;
const SKIP_DIR = /(^|\/)(node_modules|\.git|dist|build|vendor|coverage|\.next|target|__pycache__)(\/|$)/;

export function assertPublicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error('That does not look like a valid URL.'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http(s) URLs are supported.');
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host === '0.0.0.0') throw new Error('Local addresses cannot be scanned.');
  const ip = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ip) {
    const [a, b] = [Number(ip[1]), Number(ip[2])];
    if (a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a === 0) {
      throw new Error('Private or reserved IP addresses cannot be scanned.');
    }
  }
  if (host.includes(':')) { // IPv6 literal
    const h = host.replace(/^\[|\]$/g, '');
    if (h === '::1' || /^fe[89ab]/i.test(h) || /^f[cd]/i.test(h)) throw new Error('Private or reserved IP addresses cannot be scanned.');
  }
  if (u.port && u.port !== '80' && u.port !== '443') throw new Error('Only ports 80 and 443 are fetched.');
  return u;
}

export async function fetchCapped(rawUrl, { maxBytes = MAX_ZIP, timeoutMs = TIMEOUT_MS, headers = {}, redirects = 4 } = {}) {
  let url = assertPublicUrl(rawUrl).toString();
  for (let hop = 0; hop <= redirects; hop++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(url, { redirect: 'manual', signal: ctrl.signal, headers: { 'User-Agent': 'preflight-scanner/1.0 (+https://preflight.mrdavesemailaddress.workers.dev)', ...headers } });
    } catch (e) {
      clearTimeout(timer);
      throw new Error('Fetch failed for ' + new URL(url).hostname + (e.name === 'AbortError' ? ' (timed out)' : '') + '.');
    }
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      clearTimeout(timer);
      const loc = res.headers.get('location');
      if (!loc || hop === redirects) throw new Error('Too many redirects.');
      url = assertPublicUrl(new URL(loc, url).toString()).toString();
      continue;
    }
    if (!res.ok) { clearTimeout(timer); throw Object.assign(new Error('HTTP ' + res.status + ' from ' + new URL(url).hostname), { status: res.status }); }
    const cl = Number(res.headers.get('content-length') || 0);
    if (cl && cl > maxBytes) { clearTimeout(timer); throw new Error('Download exceeds the size cap.'); }
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) { try { await reader.cancel(); } catch { } throw new Error('Download exceeds the size cap.'); }
        chunks.push(value);
      }
    } finally { clearTimeout(timer); }
    const out = new Uint8Array(total);
    let o = 0;
    for (const ch of chunks) { out.set(ch, o); o += ch.byteLength; }
    return { bytes: out, contentType: res.headers.get('content-type') || '', finalUrl: url };
  }
  throw new Error('Too many redirects.');
}

function decodeText(data) {
  const head = data.subarray(0, 1024);
  for (let i = 0; i < head.length; i++) if (head[i] === 0) return null; // binary
  return new TextDecoder('utf-8', { fatal: false }).decode(data);
}

function stripCommonRoot(entries) {
  if (!entries.length) return entries;
  const firsts = new Set(entries.map((e) => e.path.split('/')[0]));
  if (firsts.size === 1) {
    const root = [...firsts][0];
    const hasRootFiles = entries.some((e) => !e.path.slice(root.length + 1).includes('/'));
    // GitHub archive shape: single root folder containing everything.
    if (!entries.some((e) => e.path.split('/').length === 1)) {
      return entries.map((e) => ({ ...e, path: e.path.slice(root.length + 1) }));
    }
    if (hasRootFiles) return entries;
    return entries.map((e) => ({ ...e, path: e.path.slice(root.length + 1) }));
  }
  return entries;
}

// Turn raw zip entries into a scoped, capped list of text files.
function selectFiles(entries, scopeDir) {
  let candidates = entries.filter((e) => !SKIP_DIR.test(e.path));
  if (scopeDir) {
    const scoped = candidates.filter((e) => e.path === scopeDir || e.path.startsWith(scopeDir.replace(/\/?$/, '/')));
    if (scoped.length) candidates = scoped.map((e) => ({ ...e, path: e.path.slice(scopeDir.replace(/\/?$/, '/').length) || e.path }));
  }
  const largeFiles = [];
  let skippedBinary = 0;
  const files = [];
  const prio = (p) => {
    if (/(^|\/)SKILL\.md$/i.test(p)) return 100;
    if (/(^|\/)(package|server|plugin|manifest)\.json$/i.test(p)) return 90;
    if (/\.md$/i.test(p)) return 70;
    if (/\.(js|mjs|cjs|ts|py|sh|bash|ps1)$/i.test(p)) return 60;
    return 40;
  };
  candidates.sort((a, b) => prio(b.path) - prio(a.path));
  for (const e of candidates) {
    if (files.length >= MAX_FILES) break;
    const base = e.path.split('/').pop();
    if (!TEXT_EXT.test(e.path) && !TEXT_NAME.test(base)) { skippedBinary++; continue; }
    if (e.data.byteLength > MAX_FILE) { largeFiles.push({ path: e.path, size: e.data.byteLength }); continue; }
    const text = decodeText(e.data);
    if (text === null) { skippedBinary++; continue; }
    files.push({ path: e.path, content: text, size: e.data.byteLength });
  }
  return { files, largeFiles, skippedBinary };
}

function skillDirs(entries) {
  const dirs = new Set();
  for (const e of entries) {
    const m = e.path.match(/^(.*\/)?SKILL\.md$/i);
    if (m) dirs.add((m[1] || '').replace(/\/$/, ''));
  }
  return [...dirs];
}

async function githubMeta(env, owner, repo) {
  const key = 'ghmeta:' + owner + '/' + repo;
  if (env && env.CACHE) {
    const hit = await env.CACHE.get(key, 'json').catch(() => null);
    if (hit) return hit;
  }
  try {
    const { bytes } = await fetchCapped('https://api.github.com/repos/' + owner + '/' + repo, { maxBytes: 256 * 1024, headers: { Accept: 'application/vnd.github+json' } });
    const j = JSON.parse(new TextDecoder().decode(bytes));
    const meta = {
      default_branch: j.default_branch, stars: j.stargazers_count, forks: j.forks_count,
      created_at: j.created_at, pushed_at: j.pushed_at, archived: !!j.archived,
      description: j.description || '', owner_login: j.owner && j.owner.login, owner_type: j.owner && j.owner.type,
      license: j.license && j.license.spdx_id, open_issues: j.open_issues_count,
    };
    if (env && env.CACHE) await env.CACHE.put(key, JSON.stringify(meta), { expirationTtl: 21600 }).catch(() => { });
    return meta;
  } catch { return null; }
}

async function resolveGithub(env, owner, repo, { ref = null, subpath = '', skillName = null, sourceUrl }) {
  const meta = await githubMeta(env, owner, repo);
  const branches = [...new Set([ref, meta && meta.default_branch, 'main', 'master'].filter(Boolean))];
  let entries = null, usedBranch = null, lastErr = null;
  for (const b of branches) {
    try {
      const { bytes } = await fetchCapped('https://codeload.github.com/' + owner + '/' + repo + '/zip/refs/heads/' + encodeURIComponent(b), { maxBytes: MAX_ZIP });
      entries = stripCommonRoot(await unzip(bytes, { maxTotalBytes: 64 * 1024 * 1024 }));
      usedBranch = b;
      break;
    } catch (e) { lastErr = e; if (e.status && e.status !== 404) throw e; }
  }
  if (!entries) throw new Error('Could not download the repository archive from GitHub' + (lastErr ? ' (' + lastErr.message + ')' : '') + '.');

  let scope = '';
  if (subpath) {
    const clean = subpath.replace(/^\/|\/$/g, '');
    if (entries.some((e) => e.path === clean || e.path.startsWith(clean + '/'))) scope = clean;
  }
  if (!scope && skillName) {
    const dirs = skillDirs(entries);
    const exact = dirs.filter((d) => d.split('/').pop() === skillName);
    const partial = dirs.filter((d) => { const p = d.split('/').pop(); return p.includes(skillName) || skillName.includes(p); });
    // Last resort: match the name declared in a SKILL.md frontmatter.
    let byFrontmatter = [];
    if (!exact.length && !partial.length) {
      for (const d of dirs) {
        const e = entries.find((x) => x.path === (d ? d + '/SKILL.md' : 'SKILL.md'));
        if (!e) continue;
        const head = new TextDecoder('utf-8', { fatal: false }).decode(e.data.subarray(0, 600));
        const nm = head.match(/^name:\s*["']?(.+?)["']?\s*$/m);
        if (nm && nm[1].trim() === skillName) byFrontmatter.push(d);
      }
    }
    scope = (exact[0] || partial[0] || byFrontmatter[0]) || '';
  }
  if (!scope) {
    const dirs = skillDirs(entries);
    if (dirs.length === 1) scope = dirs[0];
  }
  const { files, largeFiles, skippedBinary } = selectFiles(entries, scope);
  if (!files.length) throw new Error('No readable text files (SKILL.md, scripts, manifests) found in that package.');

  const provenance = meta ? {
    platform: 'GitHub', repo: owner + '/' + repo, branch: usedBranch,
    stars: meta.stars, forks: meta.forks, created_at: meta.created_at, pushed_at: meta.pushed_at,
    archived: meta.archived, license: meta.license, owner: meta.owner_login, owner_type: meta.owner_type,
    description: meta.description,
  } : { platform: 'GitHub', repo: owner + '/' + repo, branch: usedBranch };

  return {
    pkgKey: 'github:' + owner + '/' + repo + '@' + (scope || '.'),
    name: (scope ? scope.split('/').pop() : repo) || repo,
    kind: null, sourceUrl, sourceType: 'github', version: usedBranch,
    provenance, files, largeFiles, skippedBinary,
  };
}

async function resolveClawhub(env, slug, sourceUrl) {
  let meta = null;
  try {
    const { bytes } = await fetchCapped('https://clawhub.ai/api/v1/skills/' + encodeURIComponent(slug), { maxBytes: 256 * 1024, headers: { Accept: 'application/json' } });
    meta = JSON.parse(new TextDecoder().decode(bytes));
  } catch { /* metadata is optional; the download is the package */ }
  let bytes;
  try {
    ({ bytes } = await fetchCapped('https://clawhub.ai/api/v1/skills/' + encodeURIComponent(slug) + '/download', { maxBytes: MAX_ZIP }));
  } catch {
    // Verified 2026-10-28: ClawHub's public API serves metadata and a file
    // list (names + sha256) but no package download and no file contents —
    // /download 404s on clawhub.ai and api.clawhub.ai, current and
    // versioned routes alike. Fail honestly with the workaround.
    const s0 = (meta && (meta.skill || meta)) || {};
    const label = s0.displayName || s0.name || slug;
    const ver = s0.latestVersion || (meta && meta.latestVersion && meta.latestVersion.version) || null;
    throw new Error('ClawHub lists "' + label + '"' + (ver ? ' (v' + ver + ')' : '') + ' but does not serve package downloads through its public API, so there is nothing for us to read. Paste the SKILL.md below instead, or scan the source repository URL.');
  }
  const entries = stripCommonRoot(await unzip(bytes, { maxTotalBytes: 64 * 1024 * 1024 }));
  const dirs = skillDirs(entries);
  const scope = dirs.length === 1 ? dirs[0] : '';
  const { files, largeFiles, skippedBinary } = selectFiles(entries, scope);
  if (!files.length) throw new Error('No readable text files found in that ClawHub package.');
  const s = (meta && (meta.skill || meta)) || {};
  const provenance = {
    platform: 'ClawHub', slug,
    version: s.latestVersion || s.version || (s.versions && s.versions[0]) || null,
    downloads: s.downloads ?? s.downloadCount ?? null,
    stars: s.stars ?? s.starCount ?? null,
    author: (s.owner && (s.owner.handle || s.owner.name)) || s.author || null,
    updated_at: s.updatedAt || s.updated_at || null,
  };
  return {
    pkgKey: 'clawhub:' + slug, name: s.displayName || s.name || slug,
    kind: 'skill', sourceUrl, sourceType: 'clawhub', version: provenance.version,
    provenance, files, largeFiles, skippedBinary,
  };
}

export async function resolvePackage(input, env) {
  if (input.paste !== undefined) {
    const content = String(input.paste || '').slice(0, MAX_FILE);
    if (content.trim().length < 20) throw new Error('Paste the full SKILL.md or manifest text (at least a few lines).');
    const h = await sha256Hex(content);
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    return {
      pkgKey: 'paste:' + h.slice(0, 12), name: (input.name || (nameMatch && nameMatch[1].trim()) || 'Pasted skill').slice(0, 80),
      kind: 'skill', sourceUrl: null, sourceType: 'paste', version: null,
      provenance: { platform: 'Paste' }, files: [{ path: 'SKILL.md', content, size: content.length }],
      largeFiles: [], skippedBinary: 0,
    };
  }

  const u = assertPublicUrl(String(input.url || '').trim());
  const host = u.hostname.toLowerCase();
  const segs = u.pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s));

  if (host === 'github.com' && segs.length >= 2) {
    const [owner, repoRaw] = segs;
    const repo = repoRaw.replace(/\.git$/, '');
    let ref = null, subpath = '';
    if (segs[2] === 'tree' || segs[2] === 'blob') { ref = segs[3] || null; subpath = segs.slice(4).join('/'); if (segs[2] === 'blob') subpath = subpath.split('/').slice(0, -1).join('/'); }
    return resolveGithub(env, owner, repo, { ref, subpath, sourceUrl: u.toString() });
  }
  if (host === 'raw.githubusercontent.com' && segs.length >= 4) {
    const [owner, repo, ref, ...rest] = segs;
    return resolveGithub(env, owner, repo, { ref, subpath: rest.slice(0, -1).join('/'), sourceUrl: u.toString() });
  }
  if (host === 'skills.sh' && segs.length >= 3) {
    const [owner, repo, skill] = segs;
    return resolveGithub(env, owner, repo, { skillName: skill, sourceUrl: u.toString() });
  }
  if (host === 'clawhub.ai' || host === 'www.clawhub.ai') {
    const slug = segs[segs.length - 1];
    if (!slug) throw new Error('That ClawHub URL does not name a skill.');
    return resolveClawhub(env, slug, u.toString());
  }
  if (/\.zip($|\?)/i.test(u.pathname)) {
    const { bytes } = await fetchCapped(u.toString(), { maxBytes: MAX_ZIP });
    const entries = stripCommonRoot(await unzip(bytes, { maxTotalBytes: 64 * 1024 * 1024 }));
    const dirs = skillDirs(entries);
    const { files, largeFiles, skippedBinary } = selectFiles(entries, dirs.length === 1 ? dirs[0] : '');
    if (!files.length) throw new Error('No readable text files found in that archive.');
    return {
      pkgKey: 'zip:' + host + u.pathname, name: segs[segs.length - 1].replace(/\.zip$/i, ''),
      kind: null, sourceUrl: u.toString(), sourceType: 'zip', version: null,
      provenance: { platform: 'Direct archive' }, files, largeFiles, skippedBinary,
    };
  }
  // Generic page: look for a GitHub repo link inside it.
  const { bytes, contentType } = await fetchCapped(u.toString(), { maxBytes: 1024 * 1024 });
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const gh = text.match(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/);
  if (gh && contentType.includes('html')) {
    return resolveGithub(env, gh[1], gh[2].replace(/\.git$/, ''), { sourceUrl: u.toString() });
  }
  if (/^---/.test(text.trim()) || /SKILL\.md/i.test(text)) {
    return {
      pkgKey: 'doc:' + host + u.pathname, name: segs[segs.length - 1] || host, kind: 'skill',
      sourceUrl: u.toString(), sourceType: 'document', version: null,
      provenance: { platform: 'Direct document' }, files: [{ path: 'SKILL.md', content: text.slice(0, MAX_FILE), size: text.length }],
      largeFiles: [], skippedBinary: 0,
    };
  }
  throw new Error('Could not resolve that URL to a skill or MCP package. Supported: GitHub repos, skills.sh listings, ClawHub skill pages, direct .zip archives — or paste the SKILL.md instead.');
}

export async function contentHash(pkg) {
  const parts = [pkg.pkgKey];
  const sorted = [...pkg.files].sort((a, b) => a.path.localeCompare(b.path));
  for (const f of sorted) parts.push(f.path + '\n' + (await sha256Hex(f.content)));
  const full = await sha256Hex(parts.join('\n'));
  return full.slice(0, 16);
}
