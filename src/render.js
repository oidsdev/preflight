// Rendering: plain HTML strings, no framework. Design language borrowed from
// orbitaldeskllc.com (dark ink, one warm orange light family) and refined:
// disciplined whitespace, typography-led hierarchy, slow eased motion,
// glow only where it earns attention (the scan input, the grade).

export const GRADE_COLORS = { Clean: '#3fb970', Caution: '#d9a821', Risky: '#e06c1f', Hostile: '#d23c2a' };

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const CSS = `
:root{
  --ink:#0a0908; --ink2:#12100d; --panel:#161310; --line:#2a251e;
  --text:#ece5d8; --dim:#a89e8d; --faint:#6f6656;
  --orange:#ff7a1a; --amber:#ffb37a; --glow:rgba(255,122,26,.16);
  --ease:cubic-bezier(.22,1,.36,1);
  --clean:#3fb970; --caution:#d9a821; --risky:#e06c1f; --hostile:#d23c2a;
}
*{box-sizing:border-box}
html{scrollbar-color:#3a332a var(--ink)}
body{
  margin:0; background:var(--ink); color:var(--text);
  font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,"Helvetica Neue",Arial,sans-serif;
  -webkit-font-smoothing:antialiased; overflow-x:hidden;
}
body::before{
  content:""; position:fixed; inset:-20% -10% auto -10%; height:70vh; pointer-events:none; z-index:0;
  background:
    radial-gradient(42% 60% at 50% 0%, rgba(255,122,26,.13), transparent 70%),
    radial-gradient(30% 45% at 82% 12%, rgba(255,179,122,.06), transparent 70%);
  animation:drift 16s ease-in-out infinite alternate;
}
@keyframes drift{from{transform:translate3d(-1.5%,0,0) scale(1)}to{transform:translate3d(1.5%,1.5%,0) scale(1.04)}}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
main,header.site,footer.site{position:relative;z-index:1}
a{color:var(--amber);text-decoration:none}
a:hover{text-decoration:underline}
header.site{
  display:flex;justify-content:space-between;align-items:center;
  max-width:1060px;margin:0 auto;padding:22px 24px 0;
}
.wordmark{font-weight:650;letter-spacing:.01em;color:var(--text);font-size:17px}
.wordmark b{color:var(--orange);font-weight:650}
.wordmark:hover{text-decoration:none}
nav.top a{color:var(--dim);margin-left:22px;font-size:14px}
nav.top a:hover{color:var(--text);text-decoration:none}
.wrap{max-width:1060px;margin:0 auto;padding:0 24px}
.hero{max-width:760px;margin:0 auto;text-align:center;padding:9vh 24px 0}
.hero .kicker{
  font-size:12.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--orange);
  margin:0 0 22px;animation:rise .9s var(--ease) both;
}
.hero h1{
  font-size:clamp(40px,6.4vw,64px);line-height:1.06;font-weight:680;letter-spacing:-.02em;
  margin:0 0 20px;animation:rise .9s var(--ease) .08s both;
}
.hero h1 .lit{color:var(--amber);text-shadow:0 0 34px var(--glow)}
.hero p.sub{
  color:var(--dim);font-size:18px;line-height:1.55;max-width:560px;margin:0 auto 40px;
  animation:rise .9s var(--ease) .16s both;
}
.scanbox{
  max-width:680px;margin:0 auto;animation:rise .9s var(--ease) .24s both;
  background:linear-gradient(180deg,rgba(255,255,255,.025),transparent),var(--panel);
  border:1px solid var(--line);border-radius:16px;padding:10px;
  box-shadow:0 0 0 1px rgba(0,0,0,.35),0 24px 70px -30px rgba(0,0,0,.9),0 0 60px -18px var(--glow);
  transition:box-shadow .45s var(--ease),border-color .45s var(--ease);
}
.scanbox:focus-within{border-color:rgba(255,122,26,.55);box-shadow:0 0 0 1px rgba(255,122,26,.25),0 24px 70px -30px rgba(0,0,0,.9),0 0 80px -10px rgba(255,122,26,.28)}
.scanbox form{display:flex;gap:8px;margin:0}
.scanbox input[type=url]{
  flex:1;min-width:0;background:var(--ink2);border:1px solid var(--line);border-radius:10px;
  color:var(--text);font-size:16px;padding:14px 16px;outline:none;
  transition:border-color .3s var(--ease);
}
.scanbox input[type=url]::placeholder{color:var(--faint)}
.scanbox button,.btn{
  background:var(--orange);color:#170c02;border:0;border-radius:10px;cursor:pointer;
  font-size:15.5px;font-weight:650;padding:14px 26px;white-space:nowrap;
  transition:transform .3s var(--ease),box-shadow .3s var(--ease),background .3s var(--ease);
  box-shadow:0 6px 24px -8px rgba(255,122,26,.55);
}
.scanbox button:hover,.btn:hover{background:#ff8a35;transform:translateY(-1px);text-decoration:none}
.scanbox button:active{transform:translateY(0)}
.sources{color:var(--faint);font-size:13.5px;margin:16px 0 0}
.sources code{color:var(--dim);font-size:13px}
details.paste{max-width:680px;margin:18px auto 0;text-align:left;animation:rise .9s var(--ease) .3s both}
details.paste summary{cursor:pointer;color:var(--dim);font-size:14.5px;text-align:center;list-style:none}
details.paste summary:hover{color:var(--text)}
details.paste form{margin-top:14px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px}
details.paste textarea{
  width:100%;min-height:150px;background:var(--ink2);border:1px solid var(--line);border-radius:10px;
  color:var(--text);font:13.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;padding:12px;outline:none;resize:vertical;
}
details.paste input[type=text]{width:100%;background:var(--ink2);border:1px solid var(--line);border-radius:10px;color:var(--text);padding:10px 12px;margin-bottom:10px;outline:none}
details.paste button{margin-top:12px}
.err{
  max-width:680px;margin:22px auto 0;background:rgba(210,60,42,.1);border:1px solid rgba(210,60,42,.4);
  color:#f0b3a8;border-radius:12px;padding:12px 16px;font-size:14.5px;text-align:left;
}
section.block{max-width:1060px;margin:0 auto;padding:84px 24px 0}
section.block h2{font-size:15px;letter-spacing:.18em;text-transform:uppercase;color:var(--faint);font-weight:600;margin:0 0 26px}
.howgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}
.how{
  background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:22px;
}
.how h3{margin:0 0 8px;font-size:16.5px;font-weight:620}
.how p{margin:0;color:var(--dim);font-size:14.5px;line-height:1.55}
.how .n{color:var(--orange);font-size:13px;letter-spacing:.14em;display:block;margin-bottom:12px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.card{
  display:block;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 18px;
  transition:border-color .3s var(--ease),transform .3s var(--ease);
}
.card:hover{border-color:rgba(255,122,26,.4);transform:translateY(-2px);text-decoration:none}
.card .nm{color:var(--text);font-weight:600;font-size:15.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card .meta{color:var(--faint);font-size:13px;display:block;margin-top:3px}
.pill{
  display:inline-block;font-size:12px;font-weight:650;letter-spacing:.04em;
  padding:2.5px 10px;border-radius:99px;border:1px solid;
}
.pill.Clean{color:var(--clean);border-color:rgba(63,185,112,.45);background:rgba(63,185,112,.08)}
.pill.Caution{color:var(--caution);border-color:rgba(217,168,33,.45);background:rgba(217,168,33,.08)}
.pill.Risky{color:var(--risky);border-color:rgba(224,108,31,.5);background:rgba(224,108,31,.09)}
.pill.Hostile{color:#e86a55;border-color:rgba(210,60,42,.55);background:rgba(210,60,42,.1)}
footer.site{
  max-width:1060px;margin:0 auto;padding:90px 24px 44px;color:var(--faint);font-size:13.5px;
  display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;
}
/* report */
.report-head{max-width:820px;margin:0 auto;padding:6vh 24px 0;text-align:center}
.report-head .src{color:var(--faint);font-size:14px;word-break:break-all}
.grade-big{
  font-size:clamp(46px,7vw,72px);font-weight:700;letter-spacing:-.02em;line-height:1.05;margin:14px 0 6px;
}
.grade-big.Clean{color:var(--clean)} .grade-big.Caution{color:var(--caution)}
.grade-big.Risky{color:var(--risky)} .grade-big.Hostile{color:#e86a55}
.score-line{color:var(--dim);font-size:16px}
.panel{
  max-width:820px;margin:34px auto 0;background:var(--panel);border:1px solid var(--line);
  border-radius:16px;padding:26px 28px;
}
.panel h2{font-size:14px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin:0 0 18px;font-weight:600}
.bar-row{display:grid;grid-template-columns:120px 1fr 34px;align-items:center;gap:12px;margin:9px 0;font-size:14px;color:var(--dim)}
.bar{height:7px;background:var(--ink2);border-radius:99px;overflow:hidden}
.bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#c25e12,var(--orange),var(--amber));transition:width 1s var(--ease)}
.finding{border-top:1px solid var(--line);padding:15px 0}
.finding:first-of-type{border-top:0}
.finding .top{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.finding .msg{font-weight:580;color:var(--text)}
.finding .loc{color:var(--faint);font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.finding code.ev{
  display:block;margin-top:8px;background:var(--ink2);border:1px solid var(--line);border-radius:8px;
  padding:8px 11px;font-size:12.5px;color:var(--amber);word-break:break-all;white-space:pre-wrap;
}
.sev{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:2px 8px;border-radius:99px}
.sev.critical{background:rgba(210,60,42,.16);color:#e86a55}
.sev.high{background:rgba(224,108,31,.15);color:var(--risky)}
.sev.medium{background:rgba(217,168,33,.13);color:var(--caution)}
.sev.low{background:rgba(168,158,141,.14);color:var(--dim)}
.kv{display:grid;grid-template-columns:170px 1fr;gap:7px 16px;font-size:14.5px}
.kv dt{color:var(--faint)} .kv dd{margin:0;color:var(--text);word-break:break-word}
.kv dd .none{color:var(--faint)}
.chips span{
  display:inline-block;background:var(--ink2);border:1px solid var(--line);border-radius:99px;
  padding:2px 10px;margin:0 6px 6px 0;font-size:13px;color:var(--dim);
}
.embedbox{
  background:var(--ink2);border:1px solid var(--line);border-radius:10px;padding:12px 14px;
  font:12.5px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--amber);word-break:break-all;white-space:pre-wrap;
}
.interest{display:flex;gap:8px;flex-wrap:wrap}
.interest input{
  flex:1;min-width:220px;background:var(--ink2);border:1px solid var(--line);border-radius:10px;
  color:var(--text);padding:12px 14px;font-size:15px;outline:none;
}
.interest button{background:var(--orange);color:#170c02;border:0;border-radius:10px;font-weight:650;padding:12px 22px;cursor:pointer}
.note{color:var(--faint);font-size:13px;margin-top:10px}
table.stats{border-collapse:collapse;width:100%;font-size:14.5px}
table.stats td,table.stats th{border-top:1px solid var(--line);padding:8px 10px;text-align:left;color:var(--dim)}
table.stats td:first-child{color:var(--text)}
.pager{display:flex;gap:16px;justify-content:center;margin-top:30px}
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{animation:none!important;transition:none!important}
}
@media (max-width:640px){
  .scanbox form{flex-direction:column}
  .kv{grid-template-columns:1fr}
  .bar-row{grid-template-columns:92px 1fr 30px}
  .panel{padding:20px}
}
`;

function layout({ title, desc, body, canonical }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc || '')}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc || '')}">
<meta property="og:type" content="website">
<style>${CSS}</style>
</head>
<body>
<header class="site">
  <a class="wordmark" href="/">hol<b>-</b>guard</a>
  <nav class="top"><a href="/reports">Reports</a><a href="/#how">How it works</a></nav>
</header>
${body}
<footer class="site">
  <span>hol-guard is run by Orbital Desk LLC. Scans are static analysis only. Nothing you submit is ever executed.</span>
  <span><a href="/reports">All reports</a></span>
</footer>
</body>
</html>`;
}

export function homePage({ origin, recent, totals, error }) {
  const cards = recent.map((r) => `
    <a class="card" href="/r/${esc(r.hash)}">
      <span class="nm">${esc(r.name || r.pkg_key)}</span>
      <span class="meta">${esc(r.kind || 'package')} · scanned ${new Date(r.updated_at).toISOString().slice(0, 10)}</span>
      <span style="display:block;margin-top:10px"><span class="pill ${esc(r.grade)}">${esc(r.grade)} · ${r.score}</span></span>
    </a>`).join('');
  const body = `
<main>
  <div class="hero">
    <p class="kicker">Pre-install vetting for agent skills &amp; MCP servers</p>
    <h1>Check it <span class="lit">before</span> your agent runs it.</h1>
    <p class="sub">Paste a link to a skill or MCP server. hol-guard reads the code and the instructions, then shows you exactly what it touches, in plain English. Free.</p>
    <div class="scanbox">
      <form method="post" action="/api/scan">
        <input type="url" name="url" required placeholder="https://github.com/owner/repo — or a skills.sh, ClawHub link">
        <button type="submit">Scan it</button>
      </form>
    </div>
    ${error ? `<div class="err">${esc(error)}</div>` : ''}
    <p class="sources">Works with <code>github.com</code> repos, <code>skills.sh</code> listings, <code>clawhub.ai</code> skills, and direct <code>.zip</code> archives.</p>
    <details class="paste">
      <summary>No link? Paste a SKILL.md instead</summary>
      <form method="post" action="/api/scan">
        <input type="text" name="name" placeholder="Skill name (optional)" maxlength="80">
        <textarea name="paste" required placeholder="Paste the full SKILL.md or manifest text here"></textarea>
        <button type="submit">Scan the paste</button>
      </form>
    </details>
  </div>

  <section class="block" id="how">
    <h2>How it works</h2>
    <div class="howgrid">
      <div class="how"><span class="n">01</span><h3>We read, never run</h3><p>The package is downloaded and read as inert text. Static analysis only. Scanned code is never executed, imported, or installed.</p></div>
      <div class="how"><span class="n">02</span><h3>Every claim has a receipt</h3><p>Each finding names the file, the line, and the exact text that triggered it. Credential access, exfiltration shapes, shell execution, prompt injection, obfuscation. No vibes, no black-box score.</p></div>
      <div class="how"><span class="n">03</span><h3>You get a grade</h3><p>Clean, Caution, Risky, or Hostile, with the subscores behind it and a full permission summary: network, environment, shell, files. Share the report link with anyone.</p></div>
    </div>
  </section>

  ${recent.length ? `<section class="block">
    <h2>Recent reports · ${totals.reports} packages scanned</h2>
    <div class="cards">${cards}</div>
    <p style="margin-top:22px"><a href="/reports">Browse all reports →</a></p>
  </section>` : ''}
</main>`;
  return layout({
    title: 'hol-guard — check an agent skill or MCP server before you install it',
    desc: 'Free pre-install safety scanner for AI agent skills and MCP servers. Static analysis with cited evidence: credentials, exfiltration, shell execution, prompt injection.',
    body, canonical: origin + '/',
  });
}

function provRows(p) {
  if (!p) return '';
  const rows = [];
  const add = (k, v) => { if (v !== null && v !== undefined && v !== '') rows.push(`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`); };
  add('Source', p.platform);
  add('Repository', p.repo);
  add('Owner', p.owner);
  add('Author', p.author);
  add('Stars', p.stars);
  add('Forks', p.forks);
  add('Downloads', p.downloads);
  add('Repo created', p.created_at ? String(p.created_at).slice(0, 10) : null);
  add('Last push', p.pushed_at ? String(p.pushed_at).slice(0, 10) : null);
  add('License', p.license);
  add('Archived', p.archived ? 'yes' : null);
  add('Version', p.version);
  return rows.join('');
}

export function reportPage({ origin, row, report, known }) {
  const a = report.analysis;
  const url = origin + '/r/' + row.hash;
  const pass = row.grade === 'Clean' || row.grade === 'Caution';
  const badgeMd = `[![hol-guard: ${row.grade}](${origin}/badge/${row.hash}.svg)](${origin}/b/${row.hash})`;
  const findings = a.findings.length ? a.findings.map((f) => `
    <div class="finding">
      <div class="top"><span class="sev ${esc(f.severity)}">${esc(f.severity)}</span><span class="msg">${esc(f.message)}</span></div>
      <div class="loc">${esc(f.file)}${f.line ? ' · line ' + f.line : ''} · rule ${esc(f.rule)}</div>
      ${f.evidence ? `<code class="ev">${esc(f.evidence)}</code>` : ''}
    </div>`).join('')
    : '<p style="color:var(--dim)">No patterns matched. That means none of the known credential, exfiltration, execution, injection, or obfuscation shapes were found in the text we could read. It is not a guarantee.</p>';
  const bars = Object.entries(a.subscores).map(([k, v]) => `
    <div class="bar-row"><span style="text-transform:capitalize">${esc(k)}</span><span class="bar"><i style="width:${v}%"></i></span><span>${v}</span></div>`).join('');
  const perms = a.permissions;
  const chipList = (arr, empty) => arr && arr.length
    ? `<span class="chips">${arr.map((x) => `<span>${esc(x)}</span>`).join('')}</span>`
    : `<span class="none">${esc(empty)}</span>`;
  const xref = [];
  if (known && known.in_honeypot) xref.push('Listed in the Honeypot skill index');
  if (known && known.in_census) xref.push('Listed in the Agent Census directory data');
  const body = `
<main>
  <div class="report-head">
    <p class="src">${report.sourceUrl ? `<a href="${esc(report.sourceUrl)}">${esc(report.sourceUrl)}</a>` : esc(report.sourceType || 'paste')}</p>
    <h1 style="font-size:30px;margin:10px 0 0;font-weight:650">${esc(report.name || row.pkg_key)}</h1>
    <div class="grade-big ${esc(row.grade)}">${esc(row.grade)}</div>
    <p class="score-line">Score ${row.score} / 100 · ${a.files_scanned} files read · ${a.counts.critical} critical, ${a.counts.high} high, ${a.counts.medium} medium, ${a.counts.low} low findings</p>
    <p class="score-line" style="font-size:13.5px;color:var(--faint)">Report ${esc(row.hash)} · first scanned ${new Date(row.created_at).toISOString().slice(0, 10)} · scanned ${row.scan_count}× · keyed to the exact package contents, so this link always shows this version</p>
    ${xref.length ? `<p>${xref.map((x) => `<span class="pill Clean" style="margin:0 4px">${esc(x)}</span>`).join('')}</p>` : ''}
  </div>

  <div class="panel"><h2>Subscores</h2>${bars}
    <p class="note">100 is clean. Deductions come only from the cited findings below.</p></div>

  <div class="panel"><h2>Findings</h2>${findings}</div>

  <div class="panel"><h2>Permission surface</h2>
    <dl class="kv">
      <dt>Network endpoints</dt><dd>${chipList(perms.network, 'none found in the text')}</dd>
      <dt>Environment read</dt><dd>${chipList(perms.env, 'no named variables')}</dd>
      <dt>Shell execution</dt><dd>${perms.shell ? 'yes — code or scripts can run shell commands' : 'no'}</dd>
      <dt>Install hooks</dt><dd>${perms.install_hooks && perms.install_hooks.length ? perms.install_hooks.map((h) => esc(h.hook + ': ' + h.command)).join('<br>') : '<span class="none">none</span>'}</dd>
      <dt>Credential material</dt><dd>${perms.credential_paths && perms.credential_paths.length ? perms.credential_paths.map(esc).join('<br>') : '<span class="none">none referenced</span>'}</dd>
    </dl>
  </div>

  <div class="panel"><h2>Provenance</h2><dl class="kv">${provRows(report.provenance)}</dl></div>

  ${pass ? `<div class="panel"><h2>Badge for the author</h2>
    <p style="margin:0 0 12px"><img alt="hol-guard grade" src="/badge/${esc(row.hash)}.svg"></p>
    <div class="embedbox">${esc(badgeMd)}</div>
    <p class="note">The badge links back to this report and updates if the package is re-scanned at a new version.</p></div>` : ''}

  <div class="panel"><h2>Watch this package</h2>
    <form class="interest" method="post" action="/api/interest">
      <input type="hidden" name="hash" value="${esc(row.hash)}">
      <input type="text" name="contact" required maxlength="120" placeholder="Email or Oids handle">
      <button type="submit">Get alerted when it changes</button>
    </form>
    <p class="note">Interest list only. We store the address and this report link, nothing else. No mail is sent in v1.</p>
    <p class="note">Share this report: <a href="${esc(url)}">${esc(url)}</a></p>
  </div>
</main>`;
  return layout({
    title: `${report.name || row.pkg_key} — ${row.grade} (${row.score}/100) · hol-guard`,
    desc: `hol-guard scan of ${report.name || row.pkg_key}: graded ${row.grade} with cited findings on credentials, exfiltration, shell execution, and prompt injection.`,
    body, canonical: url,
  });
}

export function browsePage({ reports, page, hasNext }) {
  const cards = reports.map((r) => `
    <a class="card" href="/r/${esc(r.hash)}">
      <span class="nm">${esc(r.name || r.pkg_key)}</span>
      <span class="meta">${esc(r.pkg_key)} · ${new Date(r.updated_at).toISOString().slice(0, 10)}</span>
      <span style="display:block;margin-top:10px"><span class="pill ${esc(r.grade)}">${esc(r.grade)} · ${r.score}</span></span>
    </a>`).join('');
  const body = `<main><div class="wrap" style="padding-top:6vh">
    <h1 style="font-size:32px;font-weight:650;margin:0 0 8px">Reports</h1>
    <p style="color:var(--dim);margin:0 0 30px">Every scan is public and keyed to the exact package contents scanned.</p>
    <div class="cards">${cards || '<p style="color:var(--dim)">No reports yet.</p>'}</div>
    <div class="pager">
      ${page > 1 ? `<a href="/reports?page=${page - 1}">← Newer</a>` : ''}
      ${hasNext ? `<a href="/reports?page=${page + 1}">Older →</a>` : ''}
    </div></div></main>`;
  return layout({ title: 'Reports · hol-guard', desc: 'Public hol-guard scan reports for agent skills and MCP servers.', body });
}

export function badgeSvg(grade, score) {
  const color = GRADE_COLORS[grade] || '#888';
  const label = 'hol-guard';
  const value = grade + ' ' + score;
  const w1 = Math.round(label.length * 6.6 + 14);
  const w2 = Math.round(value.length * 6.6 + 14);
  const w = w1 + w2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="hol-guard: ${value}">
<title>hol-guard: ${value}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-opacity=".08"/></linearGradient>
<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)"><rect width="${w1}" height="20" fill="#17140f"/><rect x="${w1}" width="${w2}" height="20" fill="${color}"/><rect width="${w}" height="20" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,sans-serif" font-size="11">
<text x="${w1 / 2}" y="14">${label}</text><text x="${w1 + w2 / 2}" y="14" font-weight="bold">${value}</text></g></svg>`;
}

export function statsPage(d) {
  const topRows = d.top.map((r) => `<tr><td>${esc(r.name || r.pkg_key)}</td><td>${esc(r.grade)}</td><td>${r.scan_count}</td><td>${r.view_count}</td></tr>`).join('');
  const evRows = Object.entries(d.eventsByKind).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('');
  const gradeRows = Object.entries(d.grades).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('');
  const body = `<main><div class="wrap" style="padding-top:5vh;max-width:820px">
    <h1 style="font-size:30px">hol-guard stats (internal)</h1>
    <div class="panel" style="margin-top:20px"><h2>Traction</h2>
    <dl class="kv">
      <dt>Reports</dt><dd>${d.reports}</dd>
      <dt>Total scans</dt><dd>${d.totalScans}</dd>
      <dt>Unique scanners</dt><dd>${d.uniqueScanners}</dd>
      <dt>Repeat scans</dt><dd>${d.repeatScans}</dd>
      <dt>Report views</dt><dd>${d.reportViews}</dd>
      <dt>Badge fetches</dt><dd>${d.badgeFetches}</dd>
      <dt>Badge clicks</dt><dd>${d.badgeClicks}</dd>
      <dt>Interest signups</dt><dd>${d.interest}</dd>
    </dl></div>
    <div class="panel"><h2>Events by kind</h2><table class="stats">${evRows || '<tr><td>none</td><td>0</td></tr>'}</table></div>
    <div class="panel"><h2>Grades</h2><table class="stats">${gradeRows}</table></div>
    <div class="panel"><h2>Most scanned</h2><table class="stats"><tr><th>Package</th><th>Grade</th><th>Scans</th><th>Views</th></tr>${topRows}</table></div>
  </div></main>`;
  return layout({ title: 'Stats · hol-guard', desc: 'Internal stats.', body });
}

export function messagePage(title, msg) {
  return layout({ title: title + ' · hol-guard', desc: msg, body: `<main><div class="hero"><h1 style="font-size:38px">${esc(title)}</h1><p class="sub">${esc(msg)}</p><p><a class="btn" href="/" style="display:inline-block">Back to the scanner</a></p></div></main>` });
}
