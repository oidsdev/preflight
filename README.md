# Preflight

Free pre-install vetting for AI agent skills and MCP servers.

Paste a public URL (a GitHub repo or skill folder, a skills.sh listing, or a
direct .zip) or paste a SKILL.md. Preflight downloads the package and reads it
as inert text. Scanned code is never executed, imported, or installed. You get
a public report: a grade, cited findings, a permission summary, and provenance
signals.

Live: https://preflight.orbitaldeskllc.com (also at https://preflight.mrdavesemailaddress.workers.dev)

## How the grading works

Every finding comes from a named static-analysis rule and cites the file, the
line, and the exact text that matched. Rules look for the shapes that actually
hurt people: instructions that send the user's secrets to a third party,
download-and-pipe-to-shell installers, credential-store access, chat webhooks,
bare eval with network access, obfuscation (base64 blobs, zero-width
characters), install hooks, full-environment enumeration, endpoints the docs
never mention, and writes into the home directory.

Grades run Clean, Caution, Risky, Hostile. Any critical finding makes a
package Hostile; after that, thresholds on high and medium findings and the
numeric score decide. Repeated instances of one capability are capped, so one
permission is not counted as many risks. A clean report means none of the
known shapes were found in the text that could be read. It is not a guarantee.

Reports are keyed to a content hash of the exact package contents scanned, so
a report link always shows the version that was scanned. Re-scanning the same
contents refreshes the analysis in place.

## Layout

- `src/index.js` — Worker routes (scan API, reports, badges, interest, stats)
- `src/fetchpkg.js` — SSRF-safe fetching and package resolution
- `src/analyze.js` — the static analysis engine (evidence-only findings)
- `src/zip.js` — minimal capped ZIP reader
- `src/render.js` — pages and badge SVG
- `test/selftest.mjs` — clean/hostile fixture corpus (`node test/selftest.mjs`)
- `seed/` — seed-corpus builders (Honeypot index, skills.sh, Census data)

Run by Orbital Desk LLC. License: Apache-2.0.
