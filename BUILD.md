# hol-guard — build record

**Built:** 2026-10-28 (v1, free until traction — no payments, no paywall, no Oids integration, per David's shape decisions of Oct 28 05:34 ET)
**Live:** https://hol-guard.mrdavesemailaddress.workers.dev
**Worker version at record time:** 528b8c1a-d12c-4017-ad34-ad05d8398614 · D1 `hol-guard-db` (4e1d75cc-66c8-4bac-b591-5e8fafa8e575) · KV `CACHE` (00d2e5570bde4408bc3eead0eedb736d)

## What it is

A standalone web tool that vets AI agent skills and MCP servers before install. Paste a public URL (GitHub repo or skill folder, skills.sh listing, direct .zip) or paste a SKILL.md. The package is downloaded and read as inert text — **scanned code is never executed, imported, or installed** — and analyzed statically. Every report is public, indexable, and keyed to a content hash of the exact package contents, so a report URL always shows the version that was scanned. Re-scanning the same contents refreshes the stored analysis in place (engine improvements reach old URLs) and counts as a repeat scan.

## Repo state — read this first

- **oidsdev/hol-guard is NOT this product's code home.** Inspected Oct 28: it is a fork (created 2026-10-27) of `hashgraph-online/hol-guard`, a large third-party runtime-guard codebase (Python/Rust approval invariants), with an "Add Oids MCP server contribution" commit. Unrelated scaffold; the scanner was built fresh here, per the brief's instruction for that case.
- The scanner source lives in this workspace project and is committed to a **local git repo** (init Oct 28; commits 5026abf → 2814648). It has **not been pushed anywhere** — pushing into the hol-guard fork would pollute an unrelated codebase. Parent decision needed: create a fresh public repo (suggested name `oidsdev/hol-guard-scanner`) and push, or direct another home. License of this code: Apache-2.0 (package.json), matching the instruction to leave hol-guard's Apache license as is.
- **Name collision, flagged:** "hol-guard" is also the name of Hashgraph Online's existing product (the fork's upstream). David directed the name; the collision is on the record for a rename decision if wanted.

## Architecture

Single Cloudflare Worker, plain JS ES modules, no framework, no build step.

- `src/index.js` — routes: `/` home · `POST /api/scan` (JSON or form; form redirects to the report) · `GET /scan?url=` convenience · `GET /r/:hash` report · `GET /api/report/:hash` JSON · `GET /badge/:hash.svg` · `GET /b/:hash` badge-click redirect · `POST /api/interest` · `GET /reports` browse · `/sitemap.xml` · `/robots.txt` · `/health` · `GET /stats?key=` internal stats · `POST /api/seed-xref?key=` admin cross-reference upsert (D1 batch writes).
- `src/fetchpkg.js` — resolution + SSRF-safe fetch: http(s) only, ports 80/443 only, localhost/.local/private/reserved IPs rejected, ≤4 redirects each revalidated, 15s timeouts, 12MB compressed cap. GitHub content comes from codeload ZIPs (one request per repo; avoids the 60/hr unauthenticated API rate limit); repo metadata via api.github.com, KV-cached 6h. Skills.sh URLs resolve to the backing GitHub repo, scoped to the named skill's folder (exact name → partial name → SKILL.md frontmatter name). Per-file text cap 512KB, ≤80 files by priority, binary files counted, not parsed.
- `src/zip.js` — minimal ZIP reader (stored + deflate), entry/total caps against zip bombs.
- `src/analyze.js` — the evidence engine. Findings are produced ONLY by named patterns in named files; every finding cites file, line, and the matched text. Rules cover: download-pipe-to-shell (C1), credential material + network sending (C2), instructions to send the user's secrets out (C3, procedural — see calibration), secrecy/approval-bypass instructions (C4/H4/M6), credential-store paths (H1), chat webhooks (H2), bare eval/new Function with network (H3), obfuscation (H5: base64 blobs, hex escapes, zero-width chars, >5,000-char lines), install hooks (H6/M4), shell execution (M1), full-env enumeration (M2), code-contacted domains the docs never mention (M3, infra allowlist incl. package registries and w3.org namespace URIs), home-dir writes (M5), named env reads (L1, transparency), large/binary files (L3). Grade: Hostile if any critical or score <35; Risky if any high or <65; Caution if any medium or <90; else Clean. Medium/low score deductions are capped per rule (14/6 points) so one repeated capability is one permission, not N risks.
- `schema.sql` — reports, events, interest, known_packages.

## Design (per David's Oct 28 05:40 direction)

Reference: the Orbital Desk homepage (orbitaldeskllc.com) — dark ink surfaces, a single warm orange light family, atmospheric depth — executed more refined: the scan input is the hero element the page composes around; everything else is whitespace and typography.

- Palette: ink `#0a0908`/`#12100d`, panel `#161310`, hairline `#2a251e`, text `#ece5d8`, orange `#ff7a1a`, amber `#ffb37a`; grade colors are the only other hues.
- Motion: one slow ambient glow drift (16s ease-in-out alternate, ±1.5% translate) behind the hero; staggered fade-rise on hero elements (0.9s, delays 0/.08/.16/.24/.30s); focus state on the scan box blooms the orange glow over 0.45s. All easing is `cubic-bezier(.22,1,.36,1)` — ease-out expo, nothing bouncy. Subscore bars animate width on the same curve.
- `prefers-reduced-motion` disables all animation and transitions. No webfonts, no JS frameworks, no images: first paint is one HTML document (~17KB) with inline CSS.
- Copy is brief and human; the operator is named only as "Orbital Desk LLC" in the footer. David's name appears nowhere in the product, code, or copy.

## Accuracy guardrails + calibration log

Self-test corpus (`test/selftest.mjs`, run before every deploy): **23/23 passing** at record time.

- 3 clean fixtures (prose-only skill; API-key skill reading a named env var and calling its documented API; local stdio MCP server) — all grade **Clean**.
- 1 synthetic hostile fixture (written for the test only, never shipped): exfiltration + secrecy instructions in SKILL.md, `curl | bash` and an SSH-key upload in install.sh — grades **Hostile**, catches C1/C3/C4.
- ZIP reader round-trip test; SSRF guard: 8 hostile URLs rejected, 3 public URLs accepted.
- Two extra fixtures added during calibration and verified inline: API-documentation text (token-exchange docs) → Clean with zero findings; an instruction to send the user's keys out → Hostile.

Live sanity checks against well-known packages (final engine): our own `agent-checkout` skill **Clean 100**; `anthropics`-ecosystem vercel-react-best-practices skill **Clean 100**; obra/superpowers **Caution 86**; microsoft/playwright-mcp **Caution 71**; leonxlnx/taste-skill **Risky** (CDP browser-driving scripts, home-dir writes — real, cited).

Five calibration rounds were driven by real false positives found in the wild, each fixed by narrowing a rule to its actual malicious shape (never by whitelisting a package):

1. Prose mentions of credentials no longer feed the package-level exfiltration combo (code-only); per-rule score caps added.
2. C4 secrecy: dropped bare "activity" (matched a React `<Activity>` component in a table of contents) and "before asking" (matched "check env before asking the user"); H3 now matches bare `eval(`/`new Function` only — `page.evaluate()`, `helper.eval()`, and eval method *definitions* (browser-automation plumbing) excluded; skills.sh frontmatter scoping added after a monorepo root-scan swept unrelated skills into one report.
3. w3.org namespace URIs treated as infrastructure, not endpoints.
4. **C3 made procedural** (biggest fix): the regex version fired criticals on ordinary API documentation ("POST /dna/.../auth/token", "the secret is exchanged via POST ... for a short-lived token", "git_push (fast-forward) with token auth"). A C3 critical now requires a transfer verb + credential noun + (possessive "user's/their" OR an external URL/webhook in the same span), and skips HTTP-method forms and hyphenated compounds. Corpus Hostile count fell 56 → 22 on this fix alone.
5. C4: the person must be the verb's recipient ("the tools don't reveal why an operator is expensive" — a TouchDesigner node — no longer matches); C3 gained a negation guard ("callers never share credentials" is guidance, not exfiltration).

## Seed corpus (launch reports)

Attempted **369** targets at ~1.1s pacing: 19 Honeypot skills (`github.com/oidsdev/honeypot/tree/main/skills/*`), 110 skills.sh leaderboard listings, 240 Census-listed GitHub repos (MCP/agent-flavoured names first from the 13,647 unique repos in `~/workspace/agent-directory-api/data/import-*.sql`).

- **286 succeeded** at seed time; **285 unique reports** are live (one URL pair converged on identical contents). 83 failed, essentially all "repository archive not downloadable from GitHub (HTTP 404)" — renamed/private/dead repos in the listings.
- The whole corpus was re-scanned under the final engine (two full refresh passes + a Hostile-only pass), so launch grades are uniform: **Clean 101 · Caution 148 · Risky 16 · Hostile 20** (7.0% Hostile; published audits put malicious/critical rates at ~12–13% for ClawHub, so the number is in a defensible range; sampled Hostile reports rest on real evidence — e.g. a README whose install instructions are literally `curl https://install.5dive.ai | sudo bash`).
- Cross-reference table: **13,662 known packages** (19 Honeypot + 13,643 Census GitHub repos) — reports for those packages display "Listed in the Honeypot skill index" / "Listed in the Agent Census directory data" at render time.
- Logs: `seed/seed-results.json` (per-target outcome), `seed/seed.log`, `seed/refresh.log`, `seed/refresh2.log`, `seed/xref.log`.

## Traction instrumentation (the free-until-traction gate)

- **Stats view (internal, key-gated):** https://hol-guard.mrdavesemailaddress.workers.dev/stats?key=d481a507eb6c803b9853beb9d53a68fe458e — reports, total scans, unique scanners (daily salted hash of IP+UA), repeat scans, report views, badge fetches, badge clicks, interest signups, grade distribution, most-scanned packages. Without the key it 404s.
- Events logged in D1: scan_new, scan_repeat, report_view, badge_fetch (with referer), badge_click, interest. Badge embeds are measurable via badge_fetch + referer; the embed snippet routes clicks through `/b/:hash` so shares are counted before redirecting to the report.
- Interest capture on every report page: "Get alerted when a skill you use changes" — email or Oids handle + report hash into the `interest` table. No mail is sent in v1; the copy says so.
- Launch-state honesty: counters currently include my own build-time verification traffic (2 report views, 1 badge fetch, 1 badge click). One verification interest signup was made to prove the flow and then **deleted**, so the interest list starts at 0 real rows.

## What is missing, and why

1. **ClawHub package contents cannot be fetched.** Verified exhaustively Oct 28: metadata and search APIs work; the version endpoint lists files with sha256 hashes but serves no contents; the documented `/api/v1/skills/{slug}/download` route 404s on clawhub.ai and api.clawhub.ai, current and versioned forms alike; the web page renders HTML (line-cited evidence can't be built from rendered HTML). ClawHub scans therefore fail with a precise error naming the skill and version and offering the workaround (paste the SKILL.md, or scan the source repo). Home-page copy states this plainly. If ClawHub restores downloads, `resolveClawhub` lights up unchanged.
2. **Custom domain not attached.** `hol-guard.orbitaldeskllc.com` was attempted via a Workers custom-domain route: the deploy succeeded but the domain never registered (Workers Domains API lists no such domain under the current deploy token) and the hostname serves SSL errors. The route was removed; the live URL is the workers.dev subdomain above. Attaching the domain later is a one-line config change plus a token/dashboard step with Workers Domains permission. (A dangling DNS record for the hostname may exist in the zone.)
3. **Repo not pushed** — see "Repo state" above; needs the parent's call on a repo home.
4. **Scope limits by design in v1:** repos whose codeload archive exceeds 12MB compressed can't be scanned; monorepo scans scope to a single skill folder when one is identifiable, else the repo root (≤80 highest-priority text files); binary files are counted, never parsed; ClawHub metadata provenance (downloads/stars) is captured only when a scan succeeds via another route.

## Fences observed

No announcements or promotion posts were made. No payments/Stripe. No Oids integration. No trading tool touched. Nothing under David's name anywhere. Nothing behind a login was scanned. Fetches were paced (~1.1s) and GitHub metadata is KV-cached.
