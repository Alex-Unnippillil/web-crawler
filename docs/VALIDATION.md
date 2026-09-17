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

## Hybrid Workbench 4.1.0 release preparation

The reviewed feature commit `f513bb871dc4cf06b98fb649ce18b1b9327d880b` passed [Windows, macOS and Ubuntu browser/HTTP/API checks](https://github.com/Alex-Unnippillil/web-crawler/actions/runs/35162075652) and [four portable archive builds plus native Windows/Linux acceptance](https://github.com/Alex-Unnippillil/web-crawler/actions/runs/35162075656) before the additive 4.1.0 version was selected. The version metadata is validated again in PR #6 before merging. The main-branch release pipeline independently verifies the final versioned archives before publication.

Cross-platform testing found an unhandled reset on the deny proxy's accepted sockets. Each socket now owns its error/timeout/close lifecycle; shutdown explicitly destroys CONNECT sockets. Two regression tests exercise connection reset containment and CONNECT denial without changing the network policy. There is no global uncaught-exception suppression.

## Hybrid inspection engineering pass

The local candidate passed `npm run check` with **23 Vitest tests and 167 Node tests**, the original real-parser CLI demo, five POSIX monitoring tests, the existing GUI/Atlas end-to-end suite and the new hybrid GUI suite. `REQUIRE_BROWSER=1` makes missing Chromium a failure rather than silently skipping browser acceptance. Browser tests use controlled local HTTP fixtures only.

New coverage includes all three modes, Smart escalation/non-escalation, client-side redirects, lazy content, same-origin frames, open shadow roots, malicious/private destinations, non-GET/WebSocket blocking, bounded response aggregation, source/evidence storage/deletion, cancellation with queued resources, browser-context cleanup, restart persistence, CSS-selector errors, profile import/export/delete, sitemap indexes/robots, source diff limits and the 1,000-page scale fixture.

Actual new screenshots are captured by `tests/hybrid_e2e.py` at 1,600, 1,280, 900 and 390 pixels. Both old and new browser suites recorded no JavaScript console/page errors in the validated local run. Fixtures intentionally include errors; findings are not fabricated results from external websites. The container browser factory's root-only test sandbox override is not part of the production user-facing API.

The feature PR's normal cross-platform CI and final merged workflow conclusions are authoritative for the published revision. Local measurements and their limitations are in [PERFORMANCE.md](PERFORMANCE.md); feature boundaries are in [HYBRID.md](HYBRID.md).

## Glass Workbench 4.2.0

The candidate passed 23 Vitest and 197 Node tests with real Chromium required (no missing-browser skips), the original GUI/Atlas suite, hybrid GUI acceptance, the CLI demo and five POSIX monitoring tests in the development environment. The new `tests/glass_e2e.py` also runs the real app at a local HTTP origin and exercises an explicit protected test fixture before and after owner-issued authentication, Chromium-generated content, secret-free evidence/settings, filtered export, one responsive navigation tablist, four widths, reduced transparency, dark theme and history reload. All browser errors are asserted absent. Fixture credentials are deliberately non-production strings; no user's Vercel secret is used or stored in the repository.

Cross-platform and portable validation remain mandatory in the PR and release workflows. Their final commit-associated conclusions are the source of truth; these local results alone are not proof of Windows/macOS validation or a successful live crawl of unnippillil.com. The guarded transport's address-selection configuration and private-address rejection are covered with deterministic DNS/transport injection; real network conditions vary.

## Interaction workspace 4.3.0

The UI candidate passed local TypeScript checks, **23 Vitest and 205 Node tests**, the original CLI demo, five POSIX monitoring tests, and the original/Atlas, hybrid, owner-access and expanded interaction browser acceptance. Browser-dependent Node tests ran with Chromium available and `REQUIRE_BROWSER=1`; none were skipped. The development environment used the existing locked dependencies from a previously prepared snapshot because direct npm networking was unavailable. Clean dependency installation and normal-user sandboxed Chromium are independently required on CI.

`tests/interaction_e2e.py` is invoked by the existing `python3 tests/e2e.py` entry point, so both normal CI and release validation exercise it. It checks review-before-crawl, live budget text, native sorting, selection across pagination and filters, actual CSV rows, hidden-selection counts, column persistence, table scroll/focus preservation, inspector sequence/tab retention, command keyboard actions, metric navigation, history search, collapsed rail names and 1440/1100/900/390-pixel layouts. The final local browser suites recorded no page or console errors. Samples are local fixtures, not successful live protected-site crawls.

The real 1,000-page scale fixture also passed after this UI change. No hardware-independent speed improvement or universal accessibility/security certification is claimed. Automated viewport and keyboard checks do not replace a full assistive-technology audit. New static asset paths are allowlisted explicitly; existing network/authentication protections remain covered by the unchanged security suites.

The final PR and merged-commit workflow conclusions remain authoritative. The release pipeline must install locked dependencies, pass application/browser checks, build four archives and pass native Windows/Linux portable acceptance before publication. Mac source/browser CI and archive creation are not a claim of native portable acceptance on both Mac architectures.
