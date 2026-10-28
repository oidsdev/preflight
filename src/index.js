// hol-guard — free pre-install vetting for AI agent skills and MCP servers.
// Single Worker: scan API, public report pages, author badges, interest
// capture, and an internal stats view. Static analysis only; scanned code is
// never executed.

import { analyzePackage } from './analyze.js';
import { resolvePackage, contentHash } from './fetchpkg.js';
import { sha256Hex } from './zip.js';
import { homePage, reportPage, browsePage, badgeSvg, statsPage, messagePage, esc } from './render.js';

const JSON_H = { 'content-type': 'application/json; charset=utf-8' };
const HTML_H = { 'content-type': 'text/html; charset=utf-8' };

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: JSON_H }); }

async function logEvent(env, kind, hash, req, ref) {
  try {
    let scannerKey = null;
    if (req) {
      const ip = req.headers.get('cf-connecting-ip') || 'unknown';
      const ua = req.headers.get('user-agent') || '';
      const day = new Date().toISOString().slice(0, 10);
      scannerKey = (await sha256Hex(ip + '|' + ua + '|' + day)).slice(0, 16);
    }
    await env.DB.prepare('INSERT INTO events (ts, kind, hash, scanner_key, ref) VALUES (?, ?, ?, ?, ?)')
      .bind(Date.now(), kind, hash || null, scannerKey, ref ? String(ref).slice(0, 300) : null).run();
  } catch { /* stats must never break the product */ }
}

async function totals(env) {
  const r = await env.DB.prepare('SELECT COUNT(*) AS reports, COALESCE(SUM(scan_count),0) AS scans FROM reports').first();
  return { reports: r.reports || 0, scans: r.scans || 0 };
}

async function handleScan(req, env) {
  const ct = req.headers.get('content-type') || '';
  let input = {};
  let isForm = false;
  if (ct.includes('application/json')) {
    input = await req.json().catch(() => ({}));
  } else {
    isForm = true;
    const form = await req.formData().catch(() => null);
    if (form) for (const [k, v] of form.entries()) input[k] = v;
  }
  const scanInput = input.paste ? { paste: input.paste, name: input.name } : { url: input.url };
  if (!scanInput.url && !scanInput.paste) {
    if (isForm) return Response.redirect(new URL('/?e=' + encodeURIComponent('Give me a URL or paste a SKILL.md.'), req.url).toString(), 302);
    return json({ error: 'Provide a url or paste field.' }, 400);
  }

  let pkg, analysis, hash;
  try {
    pkg = await resolvePackage(scanInput, env);
    analysis = analyzePackage(pkg.files, { largeFiles: pkg.largeFiles, skippedBinary: pkg.skippedBinary });
    hash = await contentHash(pkg);
  } catch (e) {
    if (isForm) return Response.redirect(new URL('/?e=' + encodeURIComponent(e.message), req.url).toString(), 302);
    return json({ error: e.message }, 422);
  }

  const kind = pkg.kind || (analysis.has_skill_md ? 'skill' : analysis.mentions_mcp ? 'mcp server' : 'package');
  const now = Date.now();
  const report = {
    hash, pkgKey: pkg.pkgKey, name: pkg.name, kind,
    sourceUrl: pkg.sourceUrl, sourceType: pkg.sourceType, version: pkg.version,
    provenance: pkg.provenance, analysis, createdAt: now,
  };
  const existing = await env.DB.prepare('SELECT hash, created_at FROM reports WHERE hash = ?').bind(hash).first();
  if (existing) {
    // Same package contents, possibly a newer engine: refresh the stored
    // analysis in place so the stable URL always shows the current verdict.
    report.createdAt = existing.created_at;
    await env.DB.prepare('UPDATE reports SET scan_count = scan_count + 1, updated_at = ?, grade = ?, score = ?, report_json = ? WHERE hash = ?')
      .bind(now, analysis.grade, analysis.score, JSON.stringify(report), hash).run();
    await logEvent(env, 'scan_repeat', hash, req);
  } else {
    await env.DB.prepare(
      'INSERT INTO reports (hash, pkg_key, name, kind, source_url, source_type, version, grade, score, report_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(hash, pkg.pkgKey, pkg.name, kind, pkg.sourceUrl, pkg.sourceType, pkg.version,
      analysis.grade, analysis.score, JSON.stringify(report), now, now).run();
    await logEvent(env, 'scan_new', hash, req);
  }
  const origin = new URL(req.url).origin;
  if (isForm) return Response.redirect(origin + '/r/' + hash, 302);
  return json({ hash, url: origin + '/r/' + hash, grade: analysis.grade, score: analysis.score, name: pkg.name, kind });
}

async function handleReport(req, env, hash) {
  const row = await env.DB.prepare('SELECT * FROM reports WHERE hash = ?').bind(hash).first();
  if (!row) return new Response(messagePage('Report not found', 'No scan exists under that link yet. Run the scan and the report will live at its own permanent URL.'), { status: 404, headers: HTML_H });
  await env.DB.prepare('UPDATE reports SET view_count = view_count + 1 WHERE hash = ?').bind(hash).run();
  row.view_count += 1;
  await logEvent(env, 'report_view', hash, req, req.headers.get('referer'));
  const known = await env.DB.prepare('SELECT * FROM known_packages WHERE pkg_key = ?').bind(row.pkg_key).first().catch(() => null);
  const report = JSON.parse(row.report_json);
  const origin = new URL(req.url).origin;
  return new Response(reportPage({ origin, row, report, known }), { headers: { ...HTML_H, 'cache-control': 'no-store' } });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    try {
      if (path === '/' && req.method === 'GET') {
        const recent = (await env.DB.prepare('SELECT * FROM reports ORDER BY updated_at DESC LIMIT 12').all()).results;
        const t = await totals(env);
        return new Response(homePage({ origin: url.origin, recent, totals: t, error: url.searchParams.get('e') }), { headers: HTML_H });
      }
      if (path === '/api/scan' && req.method === 'POST') return handleScan(req, env);
      if (path === '/scan' && req.method === 'GET' && url.searchParams.get('url')) {
        // Convenience: /scan?url=... behaves like the API and redirects.
        const fake = new Request(req.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: url.searchParams.get('url') }) });
        const r = await handleScan(fake, env);
        if (r.status === 200) { const j = await r.json(); return Response.redirect(url.origin + '/r/' + j.hash, 302); }
        return r;
      }
      let m;
      if ((m = path.match(/^\/r\/([a-f0-9]{8,32})$/)) && req.method === 'GET') return handleReport(req, env, m[1]);
      if ((m = path.match(/^\/api\/report\/([a-f0-9]{8,32})$/)) && req.method === 'GET') {
        const row = await env.DB.prepare('SELECT report_json FROM reports WHERE hash = ?').bind(m[1]).first();
        if (!row) return json({ error: 'not found' }, 404);
        return json(JSON.parse(row.report_json));
      }
      if ((m = path.match(/^\/badge\/([a-f0-9]{8,32})\.svg$/)) && req.method === 'GET') {
        const row = await env.DB.prepare('SELECT grade, score FROM reports WHERE hash = ?').bind(m[1]).first();
        if (!row) return new Response('not found', { status: 404 });
        await logEvent(env, 'badge_fetch', m[1], req, req.headers.get('referer'));
        return new Response(badgeSvg(row.grade, row.score), { headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=300' } });
      }
      if ((m = path.match(/^\/b\/([a-f0-9]{8,32})$/)) && req.method === 'GET') {
        await logEvent(env, 'badge_click', m[1], req, req.headers.get('referer'));
        return Response.redirect(url.origin + '/r/' + m[1], 302);
      }
      if (path === '/api/interest' && req.method === 'POST') {
        const ct = req.headers.get('content-type') || '';
        let contact = '', hash = null, isForm = false;
        if (ct.includes('application/json')) { const j = await req.json().catch(() => ({})); contact = j.contact || ''; hash = j.hash || null; }
        else { isForm = true; const f = await req.formData().catch(() => null); if (f) { contact = f.get('contact') || ''; hash = f.get('hash') || null; } }
        contact = String(contact).trim().slice(0, 120);
        if (contact.length < 3) return isForm ? Response.redirect(url.origin + '/', 302) : json({ error: 'contact too short' }, 400);
        await env.DB.prepare('INSERT INTO interest (ts, contact, hash) VALUES (?, ?, ?)').bind(Date.now(), contact, hash).run();
        await logEvent(env, 'interest', hash, req);
        if (isForm) return new Response(messagePage('You are on the list', 'If that package changes, the new scan will be its own report. We will use this address only for that alert.'), { headers: HTML_H });
        return json({ ok: true });
      }
      if (path === '/reports' && req.method === 'GET') {
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
        const per = 48;
        const rows = (await env.DB.prepare('SELECT * FROM reports ORDER BY updated_at DESC LIMIT ? OFFSET ?').bind(per + 1, (page - 1) * per).all()).results;
        return new Response(browsePage({ reports: rows.slice(0, per), page, hasNext: rows.length > per }), { headers: HTML_H });
      }
      if (path === '/sitemap.xml' && req.method === 'GET') {
        const rows = (await env.DB.prepare('SELECT hash, updated_at FROM reports ORDER BY updated_at DESC LIMIT 1000').all()).results;
        const items = rows.map((r) => `<url><loc>${url.origin}/r/${r.hash}</loc><lastmod>${new Date(r.updated_at).toISOString().slice(0, 10)}</lastmod></url>`).join('');
        return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${url.origin}/</loc></url><url><loc>${url.origin}/reports</loc></url>${items}</urlset>`, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
      }
      if (path === '/robots.txt') {
        return new Response(`User-agent: *\nAllow: /\nSitemap: ${url.origin}/sitemap.xml\n`, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }
      if (path === '/health') return json({ ok: true, service: 'hol-guard' });
      if (path === '/stats' && req.method === 'GET') {
        if (!env.STATS_KEY || url.searchParams.get('key') !== env.STATS_KEY) return new Response('not found', { status: 404 });
        const one = async (sql) => (await env.DB.prepare(sql).first()) || {};
        const t = await totals(env);
        const uniq = await one('SELECT COUNT(DISTINCT scanner_key) AS n FROM events WHERE scanner_key IS NOT NULL');
        const kinds = (await env.DB.prepare('SELECT kind, COUNT(*) AS n FROM events GROUP BY kind').all()).results;
        const eventsByKind = Object.fromEntries(kinds.map((k) => [k.kind, k.n]));
        const gradesRows = (await env.DB.prepare('SELECT grade, COUNT(*) AS n FROM reports GROUP BY grade').all()).results;
        const top = (await env.DB.prepare('SELECT name, pkg_key, grade, scan_count, view_count FROM reports ORDER BY scan_count DESC, view_count DESC LIMIT 15').all()).results;
        const interest = await one('SELECT COUNT(*) AS n FROM interest');
        return new Response(statsPage({
          reports: t.reports, totalScans: t.scans, uniqueScanners: uniq.n || 0,
          repeatScans: eventsByKind.scan_repeat || 0, reportViews: eventsByKind.report_view || 0,
          badgeFetches: eventsByKind.badge_fetch || 0, badgeClicks: eventsByKind.badge_click || 0,
          interest: interest.n || 0, eventsByKind,
          grades: Object.fromEntries(gradesRows.map((g) => [g.grade, g.n])), top,
        }), { headers: HTML_H });
      }
      if (path === '/api/seed-xref' && req.method === 'POST') {
        if (!env.STATS_KEY || url.searchParams.get('key') !== env.STATS_KEY) return json({ error: 'unauthorized' }, 401);
        const j = await req.json().catch(() => ({}));
        const items = Array.isArray(j.items) ? j.items.slice(0, 5000) : [];
        let n = 0;
        for (const it of items) {
          if (!it.pkg_key) continue;
          await env.DB.prepare('INSERT INTO known_packages (pkg_key, in_honeypot, in_census, installs, label) VALUES (?, ?, ?, ?, ?) ON CONFLICT(pkg_key) DO UPDATE SET in_honeypot = MAX(in_honeypot, excluded.in_honeypot), in_census = MAX(in_census, excluded.in_census), installs = COALESCE(excluded.installs, installs), label = COALESCE(excluded.label, label)')
            .bind(String(it.pkg_key), it.in_honeypot ? 1 : 0, it.in_census ? 1 : 0, it.installs ?? null, it.label ?? null).run();
          n++;
        }
        return json({ ok: true, upserted: n });
      }
      return new Response(messagePage('Not here', 'That page does not exist on hol-guard.'), { status: 404, headers: HTML_H });
    } catch (e) {
      return new Response(messagePage('Something broke', 'The scan hit an error: ' + esc(e.message || 'unknown')), { status: 500, headers: HTML_H });
    }
  },
};
