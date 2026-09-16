<!-- Repository note: Records user-visible changes between project versions. -->
# Changelog

## 4.0.0 — Visual Atlas

- Added a dense seven-view workspace with Insights, spiderweb explorer, URL paths, and element catalogs alongside Pages, Issues, and Activity.
- Added force, radial and discovery-depth layouts; directed connections, failure/discovery/external states, incoming/outgoing counts, neighborhood focus, route tracing, pan/zoom, node dragging, and bounded SVG/PNG plus full-index JSON exports.
- Added static, bounded image/heading/link/resource/form metadata extraction, keeping original page fields and version 3 history readable.
- Added image grid/list, source and type filters, alt checks, inspectors, lightbox navigation, pagination, and filtered CSV/JSON exports.
- Added explicit-consent raster previews with authenticated recorded-URL lookup, DNS-pinned public-address checks, redirect/size/time/concurrency limits, and no cookie/referrer forwarding.
- Added compact density, quick navigation, responsive controls, and a real 37-page local fixture with generated demo artwork.
- Extended regression and browser tests; updated installation, migration, privacy, and visualization documentation.

## 3.0.0 — Web Crawler Studio

- Adds a local browser GUI around the existing TypeScript engine, not a replacement language or hosted service.
- Adds live progress, pause/resume, stop, local checkpoints, history and confirmed deletion.
- Adds crawl presets and advanced scope/pacing controls, searchable/sortable page inventory, page inspector, content checks, interactive link map and multi-format exports.
- Adds responsive navigation, light/dark themes, keyboard shortcuts, semantic controls, native dialogs and reduced-motion support.
- Adds session-protected loopback API and DNS-pinned public-address transport for GUI requests.
- Adds source launchers for Windows/macOS/Linux, verified-runtime portable packaging and release workflows.
- Keeps the original CLI, five Boot.dev JSON fields, optional monitoring script and offline reports.

## 2.0.0 — Engine upgrade incorporated into Studio

Bounded non-recursive queue, timeouts, retry policy, robots support, same-origin redirect handling, correct URL identity, single-pass extraction, diagnostic failures and richer reports. Internal map keys changed to full URLs; failed fetches no longer produce false successful records.

## 1.0.0

Original Boot.dev TypeScript crawler submission.
