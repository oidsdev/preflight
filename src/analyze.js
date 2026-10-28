// hol-guard static analysis engine.
// Pure functions over text files. Every finding cites file + line + the
// matched text. No finding is ever produced from a score or a vibe:
// a named pattern in a named file is the only evidence we report.

const SEV = {
  critical: { pts: 40, sub: 45 },
  high: { pts: 18, sub: 22 },
  medium: { pts: 7, sub: 8 },
  low: { pts: 2, sub: 2 },
};

const CRED_PATHS = [
  [/\.ssh\b/, 'the SSH directory (~/.ssh)'],
  [/id_rsa|id_ed25519|id_dsa|id_ecdsa/, 'an SSH private key file'],
  [/\.aws[\\/]+credentials/, 'the AWS credentials file'],
  [/\.aws[\\/]+config/, 'the AWS config file'],
  [/\.gnupg/, 'the GPG keyring (~/.gnupg)'],
  [/find-generic-password|security\s+find-generic/, 'the macOS keychain'],
  [/\.docker[\\/]+config\.json/, 'the Docker config (registry tokens)'],
  [/\.kube[\\/]+config/, 'the Kubernetes config (cluster credentials)'],
  [/\.netrc\b/, 'the .netrc credentials file'],
  [/\.git-credentials/, 'stored git credentials'],
  [/seed phrase|mnemonic phrase|recovery phrase/i, 'a seed / recovery phrase'],
  [/Login Data/, 'a browser Login Data store'],
];

const RE = {
  envEnum: [
    /Object\.keys\(\s*process\.env/,
    /os\.environ\.(items|keys)\(/,
    /dict\(\s*os\.environ/,
    /printenv\b/,
    /^[ \t]*env[ \t]*$/m,
  ],
  netCall: /\bfetch\(|\baxios\b|XMLHttpRequest|\brequests\.(get|post|put|request|delete|patch)|\burllib\b|http\.client|https?\.(get|request)\(|\bcurl\b|\bwget\b|net\.connect|new WebSocket|got\(|undici/,
  send: /method:\s*['"]?(POST|PUT|PATCH)|\.post\(|requests\.post|--data\b|-d\s+@|FormData|JSON\.stringify/,
  downloadPipe: /(curl|wget)\b[^|\n]*\|\s*(sudo\s+)?(sh|bash|zsh|python[0-9.]?)\b/,
  remoteEval: /\beval\(|new Function\(/,
  shellExec: /child_process|\bexecSync\b|\bexecFile\b|\bspawn\(|subprocess\.|os\.system\(|os\.popen\(|shell\s*=\s*True/,
  webhook: /discord\.com\/api\/webhooks|hooks\.slack\.com|api\.telegram\.org\/bot/,
  writeCall: /writeFile|createWriteStream|fs\.write|open\([^)]*['"][wa]['"]\)|SaveFile|Set-Content|Out-File/,
  homePath: /homedir\(\)|expanduser\(|~\/\.(config|local|cache)|%USERPROFILE%|\$HOME/,
};

// C3 is procedural (see the prose block in analyzePackage): the naive regex
// version fired on ordinary API documentation ("POST /auth/token", "the
// secret is exchanged via POST ... for a short-lived token") — the exact
// cry-wolf failure this product cannot afford. The malicious shape is an
// instruction to send THE USER'S secrets OUT to an external destination, so
// a critical requires a transfer verb + a credential noun + (a possessive
// "user's/their" OR an external URL/webhook destination) in the same span,
// and never matches HTTP-method documentation forms.
const INJECTION = [
  { id: 'C4', sev: 'critical', re: /(do not|don't|never)\s+(tell|inform|notify|mention|reveal|alert)\b[^.\n]{0,45}(the\s+)?(user|owner|human|operator)/i, msg: 'Instructions tell the agent to keep actions secret from the user' },
  { id: 'C4', sev: 'critical', re: /(without|before)\s+(telling|informing|notifying)\s+(the\s+)?(user|owner|human)/i, msg: 'Instructions tell the agent to act without telling the user' },
  { id: 'C4', sev: 'critical', re: /(hide|conceal|keep secret)\b[^.\n]{0,45}(from\s+the\s+user|your\s+actions|this\s+action|your\s+activity|the\s+agent'?s\s+actions)/i, msg: 'Instructions tell the agent to hide activity from the user' },
  { id: 'H4', sev: 'high', re: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions|prompts|rules|directions)/i, msg: 'Prompt-injection pattern: ignore previous instructions' },
  { id: 'H4', sev: 'high', re: /disregard\s+(your\s+)?(instructions|rules|guidelines|safety)/i, msg: 'Prompt-injection pattern: disregard your instructions' },
  { id: 'H4', sev: 'high', re: /(this is|here is)\s+(your\s+)?(new|updated|real)\s+system\s+(prompt|instructions)/i, msg: 'Prompt-injection pattern: replacement system prompt' },
  { id: 'H4', sev: 'high', re: /override\s+(your\s+)?(safety|instructions|rules|guidelines)/i, msg: 'Prompt-injection pattern: override safety or rules' },
  { id: 'M6', sev: 'medium', re: /\bsudo\b/, msg: 'Instructions involve running commands with sudo' },
  { id: 'M6', sev: 'medium', re: /(always|must|should)\s+(approve|allow|run|execute)\b[^.\n]{0,50}without\s+(asking|confirmation|approval)/i, msg: 'Instructions push the agent to act without asking for approval' },
];

const INFRA_DOMAINS = new Set([
  'registry.npmjs.org', 'npmjs.com', 'www.npmjs.com', 'pypi.org', 'files.pythonhosted.org',
  'github.com', 'api.github.com', 'raw.githubusercontent.com', 'objects.githubusercontent.com',
  'crates.io', 'index.crates.io', 'proxy.golang.org', 'sum.golang.org', 'rubygems.org',
  'fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'unpkg.com',
  'www.w3.org', 'w3.org', // XML/SVG namespace identifiers — never contacted as endpoints
]);

function lineOf(content, idx) {
  let n = 1;
  for (let i = 0; i < idx && i < content.length; i++) if (content.charCodeAt(i) === 10) n++;
  return n;
}
function snippet(content, idx, len = 110) {
  const s = Math.max(0, idx - 20);
  return content.slice(s, idx + len).replace(/\s+/g, ' ').trim().slice(0, 140);
}
function isProse(path) { return /\.(md|mdx|txt|rst)$/i.test(path); }
function isCode(path) { return /\.(js|mjs|cjs|ts|tsx|jsx|py|sh|bash|zsh|ps1|rb|go|rs|php|pl|lua)$/i.test(path); }

export function analyzePackage(files, meta = {}) {
  const findings = [];
  const seen = new Set();
  const add = (rule, sev, cat, file, line, evidence, msg) => {
    const key = rule + '|' + file + '|' + line;
    if (seen.has(key)) return;
    seen.add(key);
    if (findings.length < 80) findings.push({ rule, severity: sev, category: cat, file, line, evidence, message: msg });
  };

  const allDomains = new Map(); // domain -> {code:boolean, docs:boolean}
  const envVars = new Set();
  const credFiles = []; // files that touch credential material
  let pkgHasSend = false;
  let pkgHasCred = false;
  let shellUsed = false;
  const hooks = [];

  const textOf = files.map((f) => f.content).join('\n');

  for (const f of files) {
    const c = f.content;
    const prose = isProse(f.path);
    const code = isCode(f.path);

    // URLs / domains
    const urlRe = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?::\d+)?[^\s'"`)\]]*/gi;
    let m;
    while ((m = urlRe.exec(c)) !== null) {
      const d = m[1].toLowerCase();
      if (d === 'localhost' || d.endsWith('.local')) continue;
      const cur = allDomains.get(d) || { code: false, docs: false };
      if (code || /\.json$|\.toml$|\.ya?ml$/.test(f.path)) cur.code = true; else cur.docs = true;
      allDomains.set(d, cur);
    }

    // env vars named
    const envRes = [/process\.env\.([A-Z][A-Z0-9_]+)/g, /process\.env\[['"]([A-Z][A-Z0-9_]+)['"]\]/g,
      /os\.environ\[['"]([A-Z][A-Z0-9_]+)['"]\]/g, /os\.environ\.get\(['"]([A-Z][A-Z0-9_]+)['"]/g,
      /os\.getenv\(['"]([A-Z][A-Z0-9_]+)['"]/g, /Deno\.env\.get\(['"]([A-Z][A-Z0-9_]+)['"]/g, /ENV\[['"]([A-Z][A-Z0-9_]+)['"]\]/g];
    for (const r of envRes) { let mm; while ((mm = r.exec(c)) !== null) envVars.add(mm[1]); }

    const hasNet = RE.netCall.test(c);
    const hasSend = hasNet && RE.send.test(c);
    if (hasSend) pkgHasSend = true;
    if (RE.shellExec.test(c)) shellUsed = true;

    if (code || prose) {
      // download-and-execute
      const dp = c.search(RE.downloadPipe);
      if (dp >= 0) add('C1', 'critical', 'execution', f.path, lineOf(c, dp), snippet(c, dp), 'Downloads a remote file and pipes it straight into a shell interpreter');
      // credential paths
      for (const [re, label] of CRED_PATHS) {
        const idx = c.search(re);
        if (idx >= 0) {
          // Only code touching credential material feeds the package-level
          // exfiltration combo. Docs that merely mention ~/.ssh in setup
          // prose are common and benign; they still get their own finding.
          if (code) { credFiles.push(f.path); pkgHasCred = true; }
          if (hasSend) add('C2', 'critical', 'exfiltration', f.path, lineOf(c, idx), snippet(c, idx), `Touches ${label} in a file that also sends data over the network`);
          else if (hasNet) add('H1', 'high', 'credentials', f.path, lineOf(c, idx), snippet(c, idx), `Touches ${label} in a file that also opens network connections`);
          else add('H1', 'high', 'credentials', f.path, lineOf(c, idx), snippet(c, idx), `References ${label}`);
        }
      }
      // env enumeration
      for (const r of RE.envEnum) {
        const idx = c.search(r);
        if (idx >= 0) {
          if (code) pkgHasCred = true;
          if (hasSend) add('C2', 'critical', 'exfiltration', f.path, lineOf(c, idx), snippet(c, idx), 'Enumerates the full environment in a file that also sends data over the network');
          else add('M2', 'medium', 'credentials', f.path, lineOf(c, idx), snippet(c, idx), 'Enumerates the full process environment (all variables, not one named key)');
          break;
        }
      }
      // individual env reads (low, transparency)
      if (envVars.size && code) {
        const idx = c.search(/process\.env|os\.environ|os\.getenv|Deno\.env/);
        if (idx >= 0) add('L1', 'low', 'credentials', f.path, lineOf(c, idx), snippet(c, idx), 'Reads named environment variables (normal for API keys; listed in the permission summary)');
      }
      // remote eval — bare eval()/new Function only. Method calls like
      // page.evaluate() / helper.eval() and eval method *definitions* are
      // browser-automation plumbing (CDP clients), not remote code execution.
      if (code && hasNet) {
        const reEval = /(?<![.\w$])eval\(|new Function\(/g;
        let em, hit = -1;
        while ((em = reEval.exec(c)) !== null) {
          const ls = c.lastIndexOf('\n', em.index) + 1;
          const le = c.indexOf('\n', em.index);
          const lineText = c.slice(ls, le < 0 ? c.length : le);
          if (/^\s*(async\s+)?eval\s*\(/.test(lineText)) continue; // method definition
          hit = em.index; break;
        }
        if (hit >= 0) add('H3', 'high', 'execution', f.path, lineOf(c, hit), snippet(c, hit), 'Evaluates code while also making network calls — check nothing remote is being executed');
      }
      // shell execution from code
      if (code && RE.shellExec.test(c)) {
        const idx = c.search(RE.shellExec);
        add('M1', 'medium', 'execution', f.path, lineOf(c, idx), snippet(c, idx), 'Can run shell commands from code');
      }
      // webhooks
      if (RE.webhook.test(c)) {
        const idx = c.search(RE.webhook);
        if (pkgHasCred || hasSend) add('H2', 'high', 'exfiltration', f.path, lineOf(c, idx), snippet(c, idx), 'Contains a chat-webhook / bot endpoint that data can be posted to');
        else add('H2', 'medium', 'exfiltration', f.path, lineOf(c, idx), snippet(c, idx), 'Contains a chat-webhook / bot endpoint (notifications are a legitimate use; confirm what is sent)');
      }
      // writes to home/system locations
      if (code && RE.writeCall.test(c) && RE.homePath.test(c)) {
        const idx = c.search(RE.writeCall);
        add('M5', 'medium', 'files', f.path, lineOf(c, idx), snippet(c, idx), 'Writes files under the user home directory');
      }
      // obfuscation
      const b64 = c.match(/[A-Za-z0-9+/]{320,}={0,2}/);
      if (b64 && code) {
        const idx = c.indexOf(b64[0]);
        if (hasNet || RE.shellExec.test(c) || RE.remoteEval.test(c)) add('H5', 'high', 'obfuscation', f.path, lineOf(c, idx), 'base64 blob (' + b64[0].length + ' chars)…', 'Large encoded blob in code that can also reach the network or a shell');
        else add('H5', 'medium', 'obfuscation', f.path, lineOf(c, idx), 'base64 blob (' + b64[0].length + ' chars)…', 'Large unexplained encoded blob in code');
      }
      const hexCount = (c.match(/\\x[0-9a-fA-F]{2}/g) || []).length;
      if (hexCount > 40 && code) add('H5', 'medium', 'obfuscation', f.path, 1, hexCount + ' hex escapes', 'Heavy hex-escape obfuscation (' + hexCount + ' escapes in one file)');
      if (prose && /[\u200B-\u200D\u2060\uFEFF]/.test(c)) {
        const idx = c.search(/[\u200B-\u200D\u2060\uFEFF]/);
        add('H5', 'medium', 'obfuscation', f.path, lineOf(c, idx), 'zero-width character', 'Hidden zero-width characters in the instructions (invisible text can hide injected instructions)');
      }
      for (const line of c.split('\n')) {
        if (line.length > 5000 && code && hasNet) { add('H5', 'medium', 'obfuscation', f.path, lineOf(c, c.indexOf(line.slice(0, 60))), 'line of ' + line.length + ' chars', 'A single code line runs past 5,000 characters and the file makes network calls (minified payload shape)'); break; }
      }
    }

    // prompt-injection patterns in prose (skills act on prose)
    if (prose) {
      for (const rule of INJECTION) {
        const idx = c.search(rule.re);
        if (idx >= 0) add(rule.id, rule.sev, 'injection', f.path, lineOf(c, idx), snippet(c, idx), rule.msg);
      }
      // C3 (procedural): instruction to send the user's secrets out.
      {
        const nounRe = /(credential|password|secret|token|api[ _-]?key|private key|\.ssh|file contents|conversation history)/i;
        const verbRe = /\b(send|upload|forward|transmit|exfiltrate|post|share)\b/gi;
        let vm, fired = false;
        while (!fired && (vm = verbRe.exec(c)) !== null) {
          const idx = vm.index;
          if (idx > 0 && c[idx - 1] === '-') continue; // hyphenated compound (fast-forward)
          const raw = vm[0];
          const after = c.slice(idx + raw.length, idx + raw.length + 6);
          if (raw === 'POST' && /^\s+`?\//.test(after)) continue; // HTTP method documentation: POST /path
          if (raw === 'post' && c[idx - 1] === '`') continue; // `post` as a code identifier
          const win = c.slice(idx, idx + 130).split(/[.\n]/)[0];
          if (!nounRe.test(win)) continue;
          if (/(user'?s|their|the user)\b/i.test(win) || /https?:\/\/|webhook/i.test(win)) {
            add('C3', 'critical', 'injection', f.path, lineOf(c, idx), snippet(c, idx), 'Instructions direct the agent to send credentials, secrets, or file contents out');
            fired = true;
          }
        }
        if (!fired) {
          // noun-first shape: "…api keys to https://…"
          const nounFirst = new RegExp(nounRe.source, 'gi');
          let nm;
          while ((nm = nounFirst.exec(c)) !== null) {
            const win = c.slice(nm.index, nm.index + 110).split(/[.\n]/)[0];
            if (/\bto\b[^.\n]{0,50}https?:\/\//i.test(win)) {
              add('C3', 'critical', 'injection', f.path, lineOf(c, nm.index), snippet(c, nm.index), 'Instructions direct credentials or secrets to an external destination');
              break;
            }
          }
        }
      }
      const dp = c.search(RE.downloadPipe);
      if (dp >= 0) add('C1', 'critical', 'execution', f.path, lineOf(c, dp), snippet(c, dp), 'Instructions tell the agent to pipe a remote download straight into a shell');
    }

    // package.json hooks
    if (/(^|\/)package\.json$/.test(f.path)) {
      try {
        const pkg = JSON.parse(c);
        const scripts = pkg.scripts || {};
        for (const hook of ['preinstall', 'postinstall', 'prepare']) {
          if (scripts[hook]) {
            hooks.push({ hook, command: String(scripts[hook]).slice(0, 120) });
            if (/(curl|wget|https?:\/\/|eval)/.test(scripts[hook])) add('H6', 'high', 'execution', f.path, 1, hook + ': ' + scripts[hook], 'Install hook downloads or evaluates remote content at install time');
            else add('M4', 'medium', 'execution', f.path, 1, hook + ': ' + scripts[hook], 'Runs a command automatically at install time (' + hook + ')');
          }
        }
      } catch { /* unparseable package.json: not a finding by itself */ }
    }
  }

  // package-level combo: credentials in one file, sending in another
  if (pkgHasCred && pkgHasSend && !findings.some((x) => x.rule === 'C2')) {
    add('H1', 'high', 'exfiltration', credFiles[0] || '(package)', 1, '', 'This package both touches credential material and sends data over the network (in different files) — review the flow before installing');
  }

  // undocumented endpoints: domains used in code but never mentioned in prose
  const docsText = files.filter((f) => isProse(f.path)).map((f) => f.content).join('\n').toLowerCase();
  for (const [d, where] of allDomains) {
    if (where.code && !docsText.includes(d) && !INFRA_DOMAINS.has(d)) {
      add('M3', 'medium', 'exfiltration', '(package)', 1, d, 'Code contacts ' + d + ', which the documentation never mentions');
    }
  }

  // large / padded files handed in via meta
  for (const lf of (meta.largeFiles || []).slice(0, 3)) {
    add('L3', 'low', 'obfuscation', lf.path, 1, (lf.size / 1048576).toFixed(1) + ' MB', 'Unusually large file in the package (' + (lf.size / 1048576).toFixed(1) + ' MB) — bulk can hide a payload; we did not parse it');
  }
  if ((meta.skippedBinary || 0) > 0) {
    add('L3', 'low', 'obfuscation', '(package)', 1, meta.skippedBinary + ' binary files', meta.skippedBinary + ' binary file(s) were not parsed (static text analysis only)');
  }

  // scores
  const total = { critical: 0, high: 0, medium: 0, low: 0 };
  const cats = { credentials: 100, exfiltration: 100, execution: 100, injection: 100, obfuscation: 100, files: 100 };
  let score = 100;
  const rulePtsUsed = {};
  for (const f of findings) {
    total[f.severity]++;
    let pts = SEV[f.severity].pts;
    // One repeated capability (e.g. shell execution in four script files) is
    // one permission, not four separate risks: cap the score deduction any
    // single medium/low rule can contribute. Criticals and highs never cap.
    if (f.severity === 'medium' || f.severity === 'low') {
      const cap = f.severity === 'medium' ? 14 : 6;
      const used = rulePtsUsed[f.rule] || 0;
      pts = Math.max(0, Math.min(pts, cap - used));
      rulePtsUsed[f.rule] = used + pts;
    }
    score -= pts;
    const cat = cats[f.category] !== undefined ? f.category : 'files';
    cats[cat] = Math.max(0, cats[cat] - SEV[f.severity].sub);
  }
  score = Math.max(0, score);
  let grade = 'Clean';
  if (total.critical > 0 || score < 35) grade = 'Hostile';
  else if (total.high > 0 || score < 65) grade = 'Risky';
  else if (total.medium > 0 || score < 90) grade = 'Caution';

  const permissions = {
    network: [...allDomains.keys()].sort(),
    env: [...envVars].sort(),
    shell: shellUsed || files.some((f) => /\.(sh|bash|ps1)$/i.test(f.path)),
    install_hooks: hooks,
    credential_paths: [...new Set(findings.filter((f) => f.category === 'credentials').map((f) => f.message))],
  };

  return {
    grade, score, subscores: cats, counts: total,
    findings: findings.sort((a, b) => (SEV[b.severity].pts - SEV[a.severity].pts) || a.file.localeCompare(b.file)),
    permissions,
    files_scanned: files.length,
    bytes_scanned: files.reduce((a, f) => a + f.content.length, 0),
    has_skill_md: files.some((f) => /(^|\/)SKILL\.md$/i.test(f.path)),
    mentions_mcp: /modelcontextprotocol|@modelcontextprotocol|mcp-server|fastmcp/i.test(textOf),
  };
}
