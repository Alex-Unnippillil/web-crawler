<!-- Repository note: Inventory of the purpose of every tracked repository file, including formats that cannot safely contain inline comments. -->
# File comments and purpose inventory

Every tracked repository file is documented here. Source and comment-supporting files contain explanatory comments; the inventory covers formats that cannot safely contain inline comments. JSON, lockfiles, CSV data, images, runtime-version files, and license text are documented here instead of being modified with invalid or behavior-changing pseudo-comments.

| File | Purpose | Inline comment |
|---|---|---|
| `.editorconfig` | Keeps basic editor formatting consistent across contributors and operating systems. | Yes |
| `.env.example` | Shows optional environment variables without containing real secrets. | Yes |
| `.github/dependabot.yml` | Configures automated dependency and GitHub Actions update checks. | Yes |
| `.github/workflows/ci.yml` | Runs cross-platform validation for crawler and GUI changes. | Yes |
| `.github/workflows/release.yml` | Builds, smoke-tests, checksums, and publishes portable release archives. | Yes |
| `.gitignore` | Excludes dependencies, build outputs, reports, secrets, and local state from Git. | Yes |
| `.nvmrc` | Recommended Node.js major version for nvm. | No — format/data integrity preserved |
| `CHANGELOG.md` | Records user-visible changes between project versions. | Yes |
| `LICENSE` | ISC license and copyright grant. | No — format/data integrity preserved |
| `README.md` | Primary setup, usage, download, and troubleshooting guide for Web Crawler Studio. | Yes |
| `SECURITY.md` | Documents the local security model, reporting guidance, and crawler safety boundaries. | Yes |
| `Start Web Crawler.cmd` | Windows source launcher that prepares and starts the local Studio GUI. | Yes |
| `Start Web Crawler.command` | macOS launcher that prepares and starts the local Studio GUI. | Yes |
| `docs/FILE-COMMENTS.md` | Project documentation or reference material for Web Crawler Studio. | Yes — this inventory documents itself. |
| `docs/MONITORING.md` | Explains optional scheduled monitoring and email-report operation. | Yes |
| `docs/VALIDATION.md` | Records validation coverage, release checks, and known testing limits. | Yes |
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
| `package-lock.json` | Locked dependency versions and integrity hashes. | No — format/data integrity preserved |
| `package.json` | npm scripts, application version and declared dependencies. | No — format/data integrity preserved |
| `scripts/build-ui.mjs` | Builds browser JavaScript from the erasable TypeScript UI source. | Yes |
| `scripts/demo.mjs` | Runs the deterministic local CLI demonstration and verifies its crawl output. | Yes |
| `scripts/launch.mjs` | Prepares dependencies/build output and launches the local Studio server for source installs. | Yes |
| `scripts/monitor.py` | Optional POSIX monitoring helper for scheduled crawls and email notifications. | Yes |
| `scripts/package-portable.mjs` | Assembles portable application ZIPs with an official Node.js runtime. | Yes |
| `scripts/sample-report.mjs` | Generates repository sample reports from deterministic demonstration data. | Yes |
| `src/cli.ts` | Parses the command-line interface while preserving the original Boot.dev invocation style. | Yes |
| `src/crawl.test.ts` | Vitest compatibility tests for crawl helpers and the original course-facing API. | Yes |
| `src/crawl.ts` | Provides the compatibility-facing crawl helpers and public crawl entry points. | Yes |
| `src/engine.ts` | Implements bounded crawl scheduling, fetching, retries, pacing, cancellation, and crawl lifecycle behavior. | Yes |
| `src/extract.test.ts` | Vitest/jsdom tests for HTML metadata, links, images, and extraction behavior. | Yes |
| `src/extract.ts` | Extracts page metadata, links, images, and other crawl records from HTML. | Yes |
| `src/index.ts` | Runs the TypeScript command-line crawler and writes requested reports. | Yes |
| `src/options.ts` | Defines and validates crawler defaults and runtime option limits. | Yes |
| `src/report.ts` | Builds JSON, CSV, HTML, summary, and SVG crawl reports safely. | Yes |
| `src/robots.ts` | Parses and evaluates robots.txt rules for crawler access decisions. | Yes |
| `src/studio/demo.ts` | Creates the built-in local demonstration website used to explore Studio without contacting an external site. | Yes |
| `src/studio/jobs.ts` | Manages GUI crawl jobs, checkpoints, history, controls, and exports. | Yes |
| `src/studio/network.ts` | Applies local-GUI network safeguards, including public-address validation and DNS checks. | Yes |
| `src/studio/server.ts` | Hosts the loopback-only Studio interface and its authenticated local API. | Yes |
| `src/types.ts` | Defines shared TypeScript contracts for pages, failures, options, progress, and results. | Yes |
| `src/url.ts` | Normalizes, validates, resolves, and scopes URLs used by the crawler. | Yes |
| `start.sh` | POSIX launcher for Linux, WSL, and macOS source installations. | Yes |
| `tests/core.test.mjs` | Exercises crawler, URL, robots, networking, reporting, CLI, and core behavior. | Yes |
| `tests/e2e.py` | Runs Chromium end-to-end checks against the real local Studio interface. | Yes |
| `tests/portable_smoke.py` | Smoke-tests extracted portable distributions using their bundled runtime and launchers. | Yes |
| `tests/studio.test.mjs` | Exercises the local Studio API, security boundaries, history, controls, and exports. | Yes |
| `tests/test_monitor.py` | Tests the optional POSIX monitoring and notification helper. | Yes |
| `tsconfig.build.json` | Backend JavaScript build configuration. | No — format/data integrity preserved |
| `tsconfig.json` | Base TypeScript semantic checking options. | No — format/data integrity preserved |
| `tsconfig.ui.json` | Browser UI TypeScript semantic checking configuration. | No — format/data integrity preserved |
| `ui/app.ts` | Implements browser-side Studio interactions, views, filtering, history, controls, and exports. | Yes |
| `ui/favicon.svg` | Vector favicon used by the local Studio browser interface. | Yes |
| `ui/index.html` | Defines the accessible semantic structure of the Web Crawler Studio interface. | Yes |
| `ui/styles.css` | Defines the responsive visual system, themes, layout, controls, tables, dialogs, and link map styling. | Yes |
| `vitest.config.ts` | Configures the Vitest suite for the TypeScript crawler source. | Yes |
| `src/elements.ts` | Bounded static extraction of image candidates, headings, resources, links and form metadata. | Yes |
| `src/elements.test.ts` | Real-jsdom extraction tests, limits, URL safety and form-value exclusion. | Yes |
| `src/studio/atlas-demo.ts` | 37-page local HTTP fixture and trusted generated PNG demonstration artwork. | Yes |
| `src/studio/media.ts` | Authenticated recorded-image previews with public destination and raster-byte safeguards. | Yes |
| `ui/atlas.ts` | Coordinates the visualization views, Insights charts and URL-path tree. | Yes |
| `ui/atlas-model.ts` | Pure graph/index analysis, alias resolution, route tracing and bounded layouts. | Yes |
| `ui/atlas-graph.ts` | Interactive SVG spiderweb, filtering, node inspection and graph downloads. | Yes |
| `ui/atlas-elements.ts` | Element catalogs, source filters, image consent/preview lifecycle and inspectors. | Yes |
| `ui/atlas-shared.ts` | Safe text/link rendering, shared view contracts and CSV/download utilities. | Yes |
| `ui/atlas.css` | Visual Atlas layout, data density, graph/gallery styling and responsive themes. | Yes |
| `tests/atlas.test.mjs` | Graph, layout, preview security and real visual fixture API regression tests. | Yes |
| `tests/atlas_e2e.py` | Browser acceptance coverage for the visual views, exports and opt-in image previews. | Yes |
| `docs/VISUAL-ATLAS.md` | End-user reference for visualization semantics, interactions, limits and preview privacy. | Yes |
| `docs/atlas-spiderweb.png` | Real-browser capture of the labeled local Visual Atlas demonstration. | No — binary image |
| `docs/atlas-route.png` | Real-browser capture of the labeled local Visual Atlas demonstration. | No — binary image |
| `docs/atlas-insights.png` | Real-browser capture of the labeled local Visual Atlas demonstration. | No — binary image |
| `docs/atlas-paths.png` | Real-browser capture of the labeled local Visual Atlas demonstration. | No — binary image |
| `docs/atlas-images.png` | Real-browser capture of the labeled local Visual Atlas demonstration. | No — binary image |
| `docs/atlas-image-inspector.png` | Real-browser capture of the labeled local Visual Atlas demonstration. | No — binary image |
| `docs/atlas-dark.png` | Real-browser capture of the labeled local Visual Atlas demonstration. | No — binary image |
| `docs/atlas-mobile.png` | Real-browser capture of the labeled local Visual Atlas demonstration. | No — binary image |
