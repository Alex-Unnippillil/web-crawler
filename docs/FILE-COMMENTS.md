<!-- Repository note: Purpose inventory; binary/data formats remain intact. -->
# File comments and purpose inventory

Source files contain explanatory comments. JSON/CSV, runtime-version files, images and license text are documented here rather than modified with pseudo-comments. This inventory describes the released application tree, not temporary engineering branches.

| File | Purpose | Inline comment |
|---|---|---|
| `.editorconfig` | Keeps basic editor formatting consistent across contributors and operating systems. | Yes |
| `.env.example` | Shows optional environment variables without containing real secrets. | Yes |
| `.github/dependabot.yml` | Configures automated dependency and GitHub Actions update checks. | Yes |
| `.github/prepare-browser-ci.sh` | CI-only, per-executable AppArmor namespace permission for sandboxed Chromium on disposable Linux runners; not an application installer. | Yes |
| `.github/workflows/ci.yml` | Runs cross-platform validation for crawler and GUI changes. | Yes |
| `.github/workflows/release.yml` | Builds, smoke-tests, checksums, and publishes portable release archives. | Yes |
| `.gitignore` | Excludes dependencies, build outputs, reports, secrets, and local state from Git. | Yes |
| `.nvmrc` | Recommended Node.js major version for nvm. | No — format/data integrity preserved |
| `CHANGELOG.md` | Records user-visible changes between project versions. | Yes |
| `Install Browser.cmd` | Explicit optional Chromium download on Windows using the bundled or system Node runtime. | Yes |
| `LICENSE` | ISC license and copyright grant. | No — format/data integrity preserved |
| `README.md` | Primary setup, usage, download, and troubleshooting guide for Web Crawler Studio. | Yes |
| `SECURITY.md` | Documents the local security model, reporting guidance, and crawler safety boundaries. | Yes |
| `Start Web Crawler.cmd` | Windows source launcher that prepares and starts the local Studio GUI. | Yes |
| `Start Web Crawler.command` | macOS launcher that prepares and starts the local Studio GUI. | Yes |
| `docs/FILE-COMMENTS.md` | Project documentation or reference material for Web Crawler Studio. | Yes — this inventory documents itself. |
| `docs/HYBRID.md` | Hybrid rendering architecture, dependency decisions, evidence semantics, limits and sandbox troubleshooting. | Yes |
| `docs/MONITORING.md` | Explains optional scheduled monitoring and email-report operation. | Yes |
| `docs/PERFORMANCE.md` | Repeated 1,000-page fixture measurements and reproducible performance methodology; not public-internet speed claims. | Yes |
| `docs/VALIDATION.md` | Records validation coverage, release checks, and known testing limits. | Yes |
| `docs/VISUAL-ATLAS.md` | End-user reference for visualization semantics, interactions, limits and preview privacy. | Yes |
| `docs/atlas-dark.png` | Real-browser capture of the labeled local Visual Atlas demonstration. | No — binary image |
| `docs/atlas-image-inspector.png` | Real-browser capture of the labeled local Visual Atlas demonstration. | No — binary image |
| `docs/atlas-images.png` | Real-browser capture of the labeled local Visual Atlas demonstration. | No — binary image |
| `docs/atlas-insights.png` | Real-browser capture of the labeled local Visual Atlas demonstration. | No — binary image |
| `docs/atlas-mobile.png` | Real-browser capture of the labeled local Visual Atlas demonstration. | No — binary image |
| `docs/atlas-paths.png` | Real-browser capture of the labeled local Visual Atlas demonstration. | No — binary image |
| `docs/atlas-route.png` | Real-browser capture of the labeled local Visual Atlas demonstration. | No — binary image |
| `docs/atlas-spiderweb.png` | Real-browser capture of the labeled local Visual Atlas demonstration. | No — binary image |
| `docs/hybrid-atlas.png` | Actual Chromium acceptance screenshot of the built-in hybrid inspection fixture: atlas. | No — format/data integrity preserved |
| `docs/hybrid-dark.png` | Actual Chromium acceptance screenshot of the built-in hybrid inspection fixture: dark. | No — format/data integrity preserved |
| `docs/hybrid-javascript.png` | Actual Chromium acceptance screenshot of the built-in hybrid inspection fixture: javascript. | No — format/data integrity preserved |
| `docs/hybrid-mobile.png` | Actual Chromium acceptance screenshot of the built-in hybrid inspection fixture: mobile. | No — format/data integrity preserved |
| `docs/hybrid-network.png` | Actual Chromium acceptance screenshot of the built-in hybrid inspection fixture: network. | No — format/data integrity preserved |
| `docs/hybrid-screenshot.png` | Actual Chromium acceptance screenshot of the built-in hybrid inspection fixture: screenshot. | No — format/data integrity preserved |
| `docs/hybrid-setup.png` | Actual Chromium acceptance screenshot of the built-in hybrid inspection fixture: setup. | No — format/data integrity preserved |
| `docs/hybrid-source.png` | Actual Chromium acceptance screenshot of the built-in hybrid inspection fixture: source. | No — format/data integrity preserved |
| `docs/performance-samples.json` | Raw results of six interleaved local parser benchmark trials, with benchmark scope and environment. | No — format/data integrity preserved |
| `docs/studio-dark.png` | Project documentation or reference material for Web Crawler Studio. | No — format/data integrity preserved |
| `docs/studio-desktop.png` | Project documentation or reference material for Web Crawler Studio. | No — format/data integrity preserved |
| `docs/studio-inspector.png` | Project documentation or reference material for Web Crawler Studio. | No — format/data integrity preserved |
| `docs/studio-mobile.png` | Project documentation or reference material for Web Crawler Studio. | No — format/data integrity preserved |
| `docs/studio-welcome.png` | Project documentation or reference material for Web Crawler Studio. | No — format/data integrity preserved |
| `examples/sample.csv` | Generated sample output that demonstrates an export format without requiring a live crawl. | No — format/data integrity preserved |
| `examples/sample.html` | Generated sample output that demonstrates an export format without requiring a live crawl. | Yes |
| `examples/sample.json` | Generated sample output that demonstrates an export format without requiring a live crawl. | No — format/data integrity preserved |
| `examples/sample.summary.json` | Generated sample output that demonstrates an export format without requiring a live crawl. | No — format/data integrity preserved |
| `examples/sample.svg` | Generated sample output that demonstrates an export format without requiring a live crawl. | Yes |
| `install-browser.sh` | Explicit optional Chromium download on Linux/WSL/macOS using the bundled or system Node runtime. | Yes |
| `package-lock.json` | Locked dependency versions and integrity hashes. | No — format/data integrity preserved |
| `package.json` | npm scripts, application version and declared dependencies. | No — format/data integrity preserved |
| `scripts/build-ui.mjs` | Builds browser JavaScript from the erasable TypeScript UI source. | Yes |
| `scripts/demo.mjs` | Runs the deterministic local CLI demonstration and verifies its crawl output. | Yes |
| `scripts/launch.mjs` | Prepares dependencies/build output and launches the local Studio server for source installs. | Yes |
| `scripts/monitor.py` | Optional POSIX monitoring helper for scheduled crawls and email notifications. | Yes |
| `scripts/package-portable.mjs` | Assembles portable application ZIPs with an official Node.js runtime. | Yes |
| `scripts/sample-report.mjs` | Generates repository sample reports from deterministic demonstration data. | Yes |
| `src/analysis/javascript.ts` | Raw/rendered metadata, URL-set and net-word-count comparisons without arbitrary SEO scores. | Yes |
| `src/cli.ts` | Parses the command-line interface while preserving the original Boot.dev invocation style. | Yes |
| `src/crawl.test.ts` | Vitest compatibility tests for crawl helpers and the original course-facing API. | Yes |
| `src/crawl.ts` | Provides the compatibility-facing crawl helpers and public crawl entry points. | Yes |
| `src/crawler/body.ts` | Streamed per-response and shared aggregate byte-limit enforcement for browser and sitemap bodies. | Yes |
| `src/crawler/browser.ts` | Managed, sandboxed Chromium contexts with DNS-checked GET-only transport, deny proxy, finite settling and cleanup. | Yes |
| `src/crawler/sitemap.ts` | Bounded same-origin sitemap/index discovery, XML validation, deduplication and provenance. | Yes |
| `src/elements.test.ts` | Real-jsdom extraction tests, limits, URL safety and form-value exclusion. | Yes |
| `src/elements.ts` | Bounded static extraction of image candidates, headings, resources, links and form metadata. | Yes |
| `src/engine.ts` | Implements bounded crawl scheduling, fetching, retries, pacing, cancellation, and crawl lifecycle behavior. | Yes |
| `src/extract.test.ts` | Vitest/jsdom tests for HTML metadata, links, images, and extraction behavior. | Yes |
| `src/extract.ts` | Extracts page metadata, links, images, and other crawl records from HTML. | Yes |
| `src/extract/contexts.ts` | Repository source or configuration for Web Crawler Studio. | Yes |
| `src/extract/inspection.ts` | Inert metadata, structured-data, framework-evidence and bounded CSS custom-field extraction. | Yes |
| `src/index.ts` | Runs the TypeScript command-line crawler and writes requested reports. | Yes |
| `src/inspection-types.ts` | Typed inspection, source comparison, network evidence, sitemap, frontier and resource telemetry contracts. | Yes |
| `src/options.ts` | Defines and validates crawler defaults and runtime option limits. | Yes |
| `src/report.ts` | Builds JSON, CSV, HTML, summary, and SVG crawl reports safely. | Yes |
| `src/robots.ts` | Parses and evaluates robots.txt rules for crawler access decisions. | Yes |
| `src/studio/atlas-demo.ts` | 37-page local HTTP fixture and trusted generated PNG demonstration artwork. | Yes |
| `src/studio/demo.ts` | Creates the built-in local demonstration website used to explore Studio without contacting an external site. | Yes |
| `src/studio/evidence.ts` | Atomic, bounded on-disk raw/rendered HTML, screenshot and network evidence storage; validated artifact IDs. | Yes |
| `src/studio/hybrid-demo.ts` | Local dynamic-page, lazy-load, frame, shadow-root, GET endpoint and sitemap fixtures for hybrid inspection. | Yes |
| `src/studio/jobs.ts` | Manages GUI crawl jobs, checkpoints, history, controls, and exports. | Yes |
| `src/studio/media.ts` | Authenticated recorded-image previews with public destination and raster-byte safeguards. | Yes |
| `src/studio/network.ts` | Applies local-GUI network safeguards, including public-address validation and DNS checks. | Yes |
| `src/studio/server.ts` | Hosts the loopback-only Studio interface and its authenticated local API. | Yes |
| `src/types.ts` | Defines shared TypeScript contracts for pages, failures, options, progress, and results. | Yes |
| `src/url.ts` | Normalizes, validates, resolves, and scopes URLs used by the crawler. | Yes |
| `start.sh` | POSIX launcher for Linux, WSL, and macOS source installations. | Yes |
| `tests/atlas.test.mjs` | Graph, layout, preview security and real visual fixture API regression tests. | Yes |
| `tests/atlas_e2e.py` | Browser acceptance coverage for the visual views, exports and opt-in image previews. | Yes |
| `tests/core.test.mjs` | Exercises crawler, URL, robots, networking, reporting, CLI, and core behavior. | Yes |
| `tests/e2e.py` | Runs Chromium end-to-end checks against the real local Studio interface. | Yes |
| `tests/hybrid-ui-server.mjs` | Fixture-only GUI acceptance host; never launched by the product and never accepts arbitrary external targets. | Yes |
| `tests/hybrid.test.mjs` | Local tri-mode, source-evidence, resource-policy, sitemap, extraction, persistence, cancellation and cleanup tests. | Yes |
| `tests/hybrid_e2e.py` | Real GUI acceptance checks for profiles, analysis, filters, exports, source/network/screenshot inspection and four viewport widths. | Yes |
| `tests/portable_smoke.py` | Smoke-tests extracted portable distributions using their bundled runtime and launchers. | Yes |
| `tests/scale.mjs` | 1,000-page local HTTP fixture and timed crawl/index/filter/graph/serialization measurements. | Yes |
| `tests/studio.test.mjs` | Exercises the local Studio API, security boundaries, history, controls, and exports. | Yes |
| `tests/test_monitor.py` | Tests the optional POSIX monitoring and notification helper. | Yes |
| `tsconfig.build.json` | Backend JavaScript build configuration. | No — format/data integrity preserved |
| `tsconfig.json` | Base TypeScript semantic checking options. | No — format/data integrity preserved |
| `tsconfig.ui.json` | Browser UI TypeScript semantic checking configuration. | No — format/data integrity preserved |
| `ui/app.ts` | Implements browser-side Studio interactions, views, filtering, history, controls, and exports. | Yes |
| `ui/atlas-elements.ts` | Element catalogs, source filters, image consent/preview lifecycle and inspectors. | Yes |
| `ui/atlas-graph.ts` | Interactive SVG spiderweb, filtering, node inspection and graph downloads. | Yes |
| `ui/atlas-model.ts` | Pure graph/index analysis, alias resolution, route tracing and bounded layouts. | Yes |
| `ui/atlas-shared.ts` | Safe text/link rendering, shared view contracts and CSV/download utilities. | Yes |
| `ui/atlas.css` | Visual Atlas layout, data density, graph/gallery styling and responsive themes. | Yes |
| `ui/atlas.ts` | Coordinates the visualization views, Insights charts and URL-path tree. | Yes |
| `ui/favicon.svg` | Vector favicon used by the local Studio browser interface. | Yes |
| `ui/index.html` | Defines the accessible semantic structure of the Web Crawler Studio interface. | Yes |
| `ui/inspector.ts` | Tabbed page inspection with escaped source diff, on-demand evidence, screenshot and request waterfall. | Yes |
| `ui/profiles.ts` | Validated, bounded browser-local configuration profiles, imports/exports, rename, duplicate and deletion. | Yes |
| `ui/source-diff.ts` | Bounded source-line alignment for readable escaped raw/rendered differences, not a semantic DOM diff. | Yes |
| `ui/styles.css` | Defines the responsive visual system, themes, layout, controls, tables, dialogs, and link map styling. | Yes |
| `ui/telemetry.ts` | Live crawl and worker telemetry with explicit rate, response-body byte and Node-only memory semantics. | Yes |
| `ui/workbench-model.ts` | Bounded derived analysis records and reusable filter/sort models, separate from DOM presentation. | Yes |
| `ui/workbench.css` | Dense analysis grids, inspector, waterfall, telemetry and responsive/reduced-motion styling. | Yes |
| `ui/workbench.ts` | Paginated analysis tables, multiple filters, column selection, row selection and scoped CSV/JSON exports. | Yes |
| `vitest.config.ts` | Configures the Vitest suite for the TypeScript crawler source. | Yes |
