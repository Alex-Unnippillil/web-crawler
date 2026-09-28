# Observatory — evidence, visualization and inclusive reading

The Observatory is an additional analysis workspace in Web Crawler Studio 4.4. It reads the selected crawl; opening it never triggers requests to the target. Existing Insights, Link map, URL paths, Pages, Issues, JavaScript and other workspaces remain available. Nothing in this upgrade relaxes robots handling, rate limits, redirect validation, SSRF protection, browser isolation or exact-origin owner authentication.

## First use

Launch the portable application, or run `npm ci && npm run gui` from source. On Home, open **Explore sample sites**, then **Explore visual demo**. After the local fixture finishes, open **Observatory** in the analysis navigation. The fixture is a demonstration, not a live external website.

Start with the summary and charts, then use **Evidence & findings** to filter by category, severity and search. Select a page URL to open the existing inspector. The **Page priorities** list ranks every captured page by finding count, elapsed visit time or number of distinct linking pages. Lists display 20 records per page; their exports include **all matching records**, not only those visible on screen. Category and severity filters affect the evidence list, not the whole-capture charts or page inventory. Changing the selected crawl resets the evidence filters.

## Reading each visualization

| View | Definition | Important limits |
| --- | --- | --- |
| Coverage radar / spiderweb chart | Present title, description, H1, language, image alt and control-name observations divided by their eligible measurements | Percentages measure presence, not quality or compliance. Title/description denominators are pages with those captured fields. H1 and language use the new snapshot; image/control denominators are elements in complete snapshots. Missing data is N/A, not 0% or 100%. No polygon connects incomplete axes. |
| HTTP outcome horizontal bars | Final captured outcomes grouped into 2xx, 3xx, 4xx, 5xx, no HTTP status and other | One final outcome per URL. Eventual captured success supersedes previous errors. Robots/sitemap failures and intermediate redirect hops are excluded. No HTTP status includes failed visits without an HTTP response. |
| Visit-duration histogram | Under 250 ms, 250–999 ms, 1–2.99 s, 3 s or more, or unknown | Uses `duration_ms` from the crawler. These are visit durations including capture/rendering work, not Core Web Vitals, pure network latency or controlled speed benchmarks. Median/P95 use nearest rank over finite nonnegative measurements. |
| Discovery-depth stacked bars | Pages with/without observations grouped by recorded discovery depth | Depth reflects the crawl route, not URL folder count. Labels show with / without findings. No findings is not an accessibility or quality pass. |
| Page priorities | Complete captured-page inventory ranked by findings, duration or incoming source pages | A page can have several observations. Incoming counts deduplicate links from the same source page; they cover observed internal links, not the wider web. Unknown timings/word counts are labelled and sort last. |
| Existing Link map | Interactive node-link spiderweb of observed links | Still distinct from the new radar. Retains original graph filters, inspection and data limits. |

Each new chart has a text description, visible values, and an expandable HTML data table with headings and a caption. Data is not available only in a hover tooltip or encoded solely by color. Table-first mode hides chart graphics and opens their equivalent tables; the rest of the workspace remains operable.

## Added capture capabilities

### Static accessibility observations

The inert document inspection adds an optional `inspection.accessibility` snapshot. It records document language, visible-in-markup H1 count, images missing an `alt` attribute, native form controls without a recognized name, and unnamed links/buttons. An empty alt attribute is accepted, because an image may be decorative. Multiple H1 elements produce an informational observation rather than an automatic failure.

Naming heuristics recognize nonempty `aria-label`, up to 16 `aria-labelledby` references (including hidden referenced label text), native associated/wrapping labels, title attributes, content names, image alt text in links and native button defaults/values. Hidden/aria-hidden descendants do not supply ordinary content names. A placeholder alone is not treated as a control's name. No form values are stored in the accessibility snapshot.

Inspection stops after 5,000 traversed elements per page. A capped snapshot is marked partial and excluded from H1/image/control coverage percentages; missing language remains observable on the document root. Observed problems within partial samples can still be listed and are labelled partial. The capture budget is not a promise to inspect every element on a large page.

**This is not the complete Accessible Name computation or a WCAG conformance audit.** It does not evaluate CSS-computed visibility/contrast, focus order, keyboard behavior, landmark correctness, screen-reader output, language-tag validity or every ARIA/custom-control pattern. Captured HTTP source can differ from browser-rendered DOM. Review observations manually and test with assistive technology. These site observations are separate from improvements to Studio's own interface.

### Complete normalized body-text fingerprints

`inspection.content_fingerprint` is `sha256-text-v1:` followed by a SHA-256 hex digest. It hashes the complete whitespace-normalized body text after removing script, style, template, noscript, hidden and aria-hidden content using the existing inert inspection path. No fingerprint is emitted for empty body text or text that reaches the 2,097,152-code-unit text ceiling (a JavaScript string limit, not a byte limit). Differences after the 4,000-character preview still change the hash.

A matching fingerprint identifies identical captured normalized text, not identical HTML, equivalent meaning, matching visual layout or a search-engine duplicate-content penalty. CSS-only hidden text can still be present. Different titles/URLs with the same complete captured text are retained as separate pages and surfaced for review; no pages are automatically merged or deleted. Repeated titles are grouped separately using trimmed, case-sensitive titles; empty titles do not form groups.

### Failed internal-link source tracing

A source page is flagged only when an internal destination has a captured HTTP 4xx/5xx page failure and no eventual captured success. Duplicate links/fragments from one source count once. The source finding shows a bounded sample of up to five failed destinations and statuses; the existing Issues workspace retains failure records. Unvisited, robots-only and sitemap-only failures are not labelled broken links. An HTTP 403 can mean access policy, not permanent disappearance. This analysis never initiates a second verification request.

Noindex directives and different canonical destinations are informational; both can be intentional. Rendering failures retain their captured evidence. All findings are display text, never executable target markup.

## Studio accessibility and reading settings

Open **Workspace settings → Reading & accessibility**:

- **Interface text size:** Standard, Large or Extra large. Browser zoom remains available.
- **Higher contrast:** stronger light/dark tokens and borders.
- **Reduce motion:** suppresses animation/transitions; operating-system reduced-motion preferences are always honored.
- **Prefer Observatory data tables:** table-first representation of all four charts.

These allowlisted presentation values alone are saved under `studio-access-v1` in browser local storage. Invalid values fall back to defaults; blocked storage leaves controls usable in memory. No credentials, URLs, page content or personal preferences are transmitted to an external service. Changing the application port/browser/profile may mean different local preferences.

The design uses locally available system/Georgia fonts, opaque data surfaces, visible keyboard focus, 44-pixel primary/control targets, labelled filters, native details/summary disclosure, a polite result-count announcement, semantic tables, responsive reflow and forced-color styling. The existing skip link, command palette, tab arrow-key navigation, dialogs and inspector keyboard controls remain in place. Large tables can scroll horizontally within their labelled region, without requiring the whole page to scroll sideways.

## Compatibility and exports

All new inspection fields are optional. Existing v3/v4 histories still open; missing inspection measurements are shown as unknown rather than being invented. Recrawl to collect the new fields. New fields travel with the existing full crawl JSON export/history; the crawl schema version remains unchanged.

`observatory-findings.csv` contains severity, category, title, detail, source URL and related URL for every filtered observation. `observatory-pages.csv` contains URL, title, visit milliseconds, words, incoming source-page count and findings for all captured pages in the selected ranking. Unknown numeric values export as empty fields. Exports use the existing formula-neutralizing and quote-escaping CSV helper. Filtering to no matches disables export rather than emitting an ambiguous empty file.

The visual redesign does not add a framework, remote font, CDN chart package, hosted account or telemetry service. Browser modules are generated by the existing TypeScript-stripping build, with semantic typechecking as a separate mandatory gate. The server explicitly allowlists each new static asset; no general filesystem/static wildcard route is introduced.

## Validation and limitations

Run:

```sh
npm ci
npm run check
# Includes the Observatory pure-model and inert-extraction regression suites.
python -m pip install playwright==1.63.0
npx playwright install chromium
python tests/observatory_e2e.py
```

The browser test starts the real local Studio server, crawls the included 37-page visual fixture and checks chart tables, pagination, full CSV exports, combined filters, safe text, page inspection, saved preferences, keyboard navigation, responsive widths down to 320 pixels, a 720-CSS-pixel zoom-equivalent layout, enlarged settings without overlapping controls, reduced motion and forced colors. It writes the `docs/observatory-*.png` screenshots from the running application. Screenshots are illustrative fixtures; visit times vary by machine/run.

The existing cross-platform HTTP, browser, security, GUI and portable-release gates remain required. Automated tests are not a substitute for a manual accessibility audit or platform-specific screen-reader testing. Signed/notarized installers are not introduced: portable ZIPs keep their documented unsigned status and optional separate Chromium installation.

### Rendering and interaction safeguards

Bar dimensions use SVG geometry attributes, not inline style strings, and work under the existing strict Content Security Policy. Browser acceptance checks compare displayed bar proportions with source counts. Chart tables expose the same values without relying on color. Live result refreshes retain chart-disclosure state and focus on page/finding controls; changing the selected capture resets both stored and visible filters. Distinct incoming-link counts resolve captured requested-URL aliases to their final destination and count each source page once.

Native browser zoom and screen-reader testing with assistive technology remain manual acceptance checks. A reduced CSS viewport is a layout test, not proof of a complete zoom or WCAG conformance audit.
