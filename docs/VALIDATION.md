<!-- Repository note: Records validation coverage, release checks, and known testing limits. -->
# Validation and release checks

## Visual Atlas 4.0 validation

`npm run check` now covers 23 Vitest tests and 148 Node tests, including static element extraction, actual directed graph routing, bounded layout/sampling, backwards-compatible history analysis, and raster-preview safeguards. A real local API test crawls the 37-page visual fixture and verifies image previews and original-field exports. The optional POSIX monitoring suite is unchanged (five tests).

`tests/e2e.py` also invokes `tests/atlas_e2e.py` for actual pointer selection, route tracing, neighborhood focus, layouts, search/filter controls, SVG/PNG/JSON downloads, path trees, explicit thumbnail consent, lightbox navigation, element catalogs, pagination, source drill-down, themes, quick navigation, mobile layout, and reload behavior. It writes genuine captures into `docs/` when run against the application. Inspect the commit's workflow conclusion for the result.

The development container's browser blocks network navigation by policy. Local visual inspection therefore used in-memory copies of records from a real locally executed fixture crawl, without changing that policy. Those offline rendering checks are not a substitute for the normal-origin browser tests on GitHub Actions.

## Version 3 validated source candidate — September 16, 2026

The [candidate validation run](https://github.com/Alex-Unnippillil/web-crawler/actions/runs/35119654802) completed successfully on Ubuntu with Node.js 24 and the repository's locked dependencies.

- `npm ci`: successful dependency installation.
- TypeScript 7 semantic checks: engine, backend and browser UI passed.
- Vitest: 15 real-jsdom extraction and compatibility tests passed.
- Node test runner: 111 core/HTTP/report/CLI/GUI API tests passed.
- `npm run demo`: real-parser command-line demonstration passed.
- Python monitoring suite: five tests passed on supported POSIX platforms.
- Chromium end-to-end verification: passed against the actual HTTP application origin, installed jsdom parser and unchanged production Content Security Policy. No browser JavaScript/console errors were recorded.

Browser checks cover the local demo, pause/resume, filtering, inspector, issues, link-map keyboard selection, CSV download, light/dark themes, history, mobile layout, presets and reload persistence. The GUI demo returns ten pages and four intentional findings; the separate CLI fixture returns nine pages. Screenshots in `docs/` were captured by this real application test.

The browser build uses Node's built-in TypeScript syntax stripping instead of TypeScript's version-specific compiler API. Semantic validation remains a separate mandatory check. Browser tests use locator assertions rather than eval-based polling; the application CSP was not weakened to accommodate tests.

## Continuous integration and portable releases

The normal [CI workflow](https://github.com/Alex-Unnippillil/web-crawler/actions/workflows/ci.yml) repeats the npm, GUI API and CLI demo checks on Windows, macOS and Ubuntu. Ubuntu also runs Chromium end-to-end tests. The optional Python/SMTP monitoring helper uses POSIX file locks and permissions: its five tests run on Linux and macOS, not native Windows. Windows users can use that helper in WSL. This limitation does not apply to the cross-platform GUI or TypeScript CLI.

The [release workflow](https://github.com/Alex-Unnippillil/web-crawler/actions/workflows/release.yml) validates the source, packages four official-runtime ZIPs, and exercises the extracted Windows x64 and Linux x64 packages on their native runners before publishing. Portable smoke tests start the included runtime/launcher, fetch the interface and assets, complete a real-parser demo, and download exports. The runtime archive checksum is checked against the official Node HTTPS manifest; each resulting app ZIP has a SHA-256 sidecar.

Workflow conclusions and logs are the source of truth for each commit and release. Adding a workflow is not itself evidence that every target has passed; inspect the run attached to the relevant commit.

## Local development checks and limits

Initial local checks used fixture-specific parsers for the core and API tests because npm network access was unavailable in that execution environment. Local visual checks used the compiled interface with a loopback-only test bridge. Those narrower checks are not substituted for the successful full-parser, normal-origin candidate validation above.

macOS archives are assembled using the official runtime for each architecture; archive creation and source CI are not the same as a complete native portable GUI acceptance test on each Mac architecture. Builds are unsigned and not notarized. Automated checks do not establish universal accessibility, SEO completeness or security certification.
