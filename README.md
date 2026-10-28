# hol-guard

Free pre-install vetting for AI agent skills and MCP servers.

Paste a public URL — a GitHub repo, a skills.sh listing, a ClawHub skill, or a
direct .zip — and hol-guard statically reads the package (it never executes
scanned code) and returns a public report: a grade (Clean / Caution / Risky /
Hostile), cited findings with file and line for every claim, a permission
summary (network, environment, shell, files), and provenance signals.

Live: https://hol-guard.mrdavesemailaddress.workers.dev

## Layout
- `src/index.js` — Worker routes (scan API, reports, badges, interest, stats)
- `src/fetchpkg.js` — SSRF-safe fetching and package resolution
- `src/analyze.js` — the static analysis engine (evidence-only findings)
- `src/zip.js` — minimal capped ZIP reader
- `src/render.js` — pages and badge SVG
- `test/selftest.mjs` — clean/hostile fixture corpus (`node test/selftest.mjs`)
- `seed/seed.mjs` — seed-corpus builder (Honeypot index, skills.sh, Census data)

Run by Orbital Desk LLC. License: Apache-2.0.
