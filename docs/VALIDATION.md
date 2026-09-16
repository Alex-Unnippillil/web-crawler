# Validation and release checks

## Local implementation checks (2026-09-16)

- TypeScript engine, GUI backend and browser UI compile with the container's available TypeScript compiler. A local-only declaration shim stood in for unavailable third-party type packages; it is not included in the project.
- 78 existing queue/HTTP/URL/robots/report/CLI tests passed.
- 33 GUI HTTP/controller/security tests passed, including live loopback requests, pause/resume, cancellation, history persistence, deletion, exports, invalid inputs, Host/Origin checks and address classification.
- Browser interaction checks passed for new crawl presets, real local-demo requests through the test controller, pause/resume, filtering, inspection, issues, graph keyboard selection, CSV download, theme changes, history and a 390-pixel mobile viewport. No browser JavaScript errors were recorded.

The local environment had no npm network access. API tests use an explicitly fixture-specific extractor to isolate the new application/controller from jsdom. The managed local Chromium blocks URL navigation, so local visual checks rendered the same compiled UI source in an isolated document and bridged only the already-tested loopback API. This is **not** claimed to be a full production-browser-origin or full-parser end-to-end test.

## Full checks in GitHub Actions

`npm ci`, `npm run check`, `npm run demo`, Python monitoring tests and `tests/e2e.py` run on the release candidate. The full browser test launches the actual server, navigates normally to localhost and uses the actual installed jsdom parser. It exercises both desktop and mobile behavior and writes genuine application screenshots.

Only a successful validation workflow should publish a versioned portable release. Test logs and the workflow conclusion are the source of truth; this document does not claim that a pending or failed remote workflow has passed.

## Remaining limits

Windows/macOS portable archives are assembled using the official runtime for each target platform. Native startup checks are separate from the full Linux Chromium test; a successful archive build is not proof of a complete manual user-acceptance test on that OS. Builds are unsigned. Automated checks do not establish universal accessibility, SEO completeness, or security certification.
