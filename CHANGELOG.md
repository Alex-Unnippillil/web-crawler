# Changelog

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
