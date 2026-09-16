<!-- Repository note: Hybrid architecture, evidence semantics, and browser limits. -->
# Hybrid crawling and inspection

## Architecture and dependency choice

The existing engine/frontier/robots/URL logic remains the common execution path. `src/crawler/browser.ts` provides a lazy Playwright pool behind an injected renderer interface. `src/extract/inspection.ts` and `contexts.ts` produce typed extraction, `src/analysis/javascript.ts` computes raw/rendered differences, and `src/studio/evidence.ts` owns bounded local evidence. GUI concerns live in separate workbench, inspector, telemetry, profiles, source-diff and existing Atlas modules rather than expanding a single file indefinitely.

Playwright 1.63.0 is a pinned production dependency; Chromium is explicitly installed, not bundled or downloaded on every launch. This gives real browser execution and managed contexts without replacing the existing crawler API/history/security transport. We evaluated Crawlee's browser-pool/autoscaling architecture as a useful reference, but did not import a second frontier, persistence system and request transport merely to gain browser rendering. Reusing isolated contexts, lazy browser startup, separate worker limits, bounded retries and lifecycle cleanup supplied the needed vertical slice with fewer compatibility changes. This is not a reimplementation of Crawlee's full scheduler.

Primary references consulted:

- [Playwright BrowserContext](https://playwright.dev/docs/api/class-browsercontext): isolated contexts, routing, service-worker caveats and explicit cleanup.
- [Crawlee PlaywrightCrawler](https://crawlee.dev/js/api/playwright-crawler/class/PlaywrightCrawler): browser lifecycle and concurrency separation.
- [Screaming Frog JavaScript crawling](https://www.screamingfrog.co.uk/seo-spider/tutorials/crawl-javascript-seo/): raw/rendered comparison as useful crawl evidence.
- [Chrome DevTools Network reference](https://developer.chrome.com/docs/devtools/network/reference): resource classification and waterfall inspection concepts.
- [jsdom](https://github.com/jsdom/jsdom): inert parsing and explicit resource/script choices.

## Modes and discovery

**HTTP** never launches Chromium. **Smart** starts from HTTP and checks sparse text/body, application roots, absent source navigation and script-related signals. Framework branding alone is not sufficient; tests protect against escalating meaningful server-rendered Next.js HTML. **Browser** renders successful HTML candidates regardless of the heuristic. Each result records the effective method, reason, outcome and timings. Smart fallback retains an HTTP page with a visible browser failure; it is never labelled as a successful render.

The browser is reused; each render owns an isolated context and closes it in `finally`. The pool limits simultaneous contexts, restarts after unhealthy/disconnected states, and retires a process after bounded use. Cancellation closes active contexts and queued work; pause gates new guarded requests. Existing in-flight work may finish. Browser crash retry is bounded; HTTP retry/backoff/Retry-After policy remains in the shared engine.

Completion uses DOMContentLoaded, bounded pending-request quietness and meaningful DOM-signature stability, not a fixed multi-second sleep. Optional scrolling has a finite iteration cap. Client-side navigation triggers fresh checks of the final URL; server redirect follow-ups are handled manually through checked navigations. The browser's fallback transport is denied even when Chromium does not expose a request to route interception.

Rendered DOM supplies the final extraction. Raw and rendered links can both contribute page candidates; raw/rendered distinctions and frame/shadow context stay in the inspection data. Same-origin frames and open shadow roots are separately extracted and labelled. Closed shadow roots, cross-origin frame contents, arbitrary button clicking and unrestricted infinite scrolling are unsupported. Declared resources, frames, forms and read-only endpoints are not indiscriminately queued as HTML pages.

Sitemap discovery reads robots directives, the root sitemap and optional supplied sitemap URLs. It handles bounded sitemap indexes and gzip, records lastmod/changefreq/priority when supplied, and rejects DTD/entity declarations. It keeps page candidates separate from sitemap files, external URLs and resource endpoints. The frontier records source URL, mechanism, discovery time, depth and lifecycle state. It remains deterministic FIFO rather than claiming an unmeasured optimal-priority scheduler.

## What the measurements mean

Raw word count and rendered word count use normalized visible-ish document text, excluding scripts/styles/templates and obvious hidden regions. Their net positive difference estimates JS-added content; it is not per-node provenance or a search-engine ranking signal. Metadata differences compare values, and links/images compare URL sets. The bounded source viewer is a line-oriented LCS comparison, not a complete DOM mutation history.

Resource inventories distinguish HTML declarations from browser-observed requests. Missing MIME/status/size values remain unknown. Resource durations include guarded-transport scheduling/pacing; response-byte accounting describes observed decoded bodies, not total wire bytes, HTTP/2 frame sizes or every memory allocation. The screenshot captures the retained viewport after bounded settling/scrolling.

A sitemap-only/no-captured-inlink indication means only that this run did not record an internal anchor to the URL. It cannot prove site-wide orphan status when scope, robots, budgets or rendering were incomplete. Issue categories are actionable heuristics with evidence, not an arbitrary SEO score. JSON-LD parsing catches malformed JSON and shows types; microdata/RDFa inventories do not validate rich-result eligibility.

## Storage and performance decisions

The compact crawl record stays bounded in memory and checkpointed as before. Large raw/rendered source, request logs and screenshots are stored separately under the run's evidence directory and fetched on demand by the inspector. Existing saved crawls without the new optional schema fields continue to open.

The 1,000-page benchmark found transient parser-window allocations, not the retained record, to be the leading memory cost. We replaced one JSDOM Window per page with a shared inert realm plus a new detached Document per parse. Origin/base/selector isolation and no-script execution have regression tests. See [PERFORMANCE.md](PERFORMANCE.md) for repeated measurements. A mandatory SQLite layer was therefore not justified in this pass. Cross-restart queue resume, million-URL indexing and true process-wide adaptive CPU scheduling remain future work.

## Browser installation and sandbox

Source: `npm ci`, then `npm run browser:install`. Portable Windows: `Install Browser.cmd`. Portable Linux/macOS: `bash install-browser.sh`. These use the included Playwright version and the portable runtime when present. Installation is explicit, not a hidden side effect of crawling. Recheck availability in the GUI after installation.

Linux may require `npx playwright install-deps chromium` with administrator approval. Use a normal user for Studio. Ubuntu systems may restrict unprivileged user namespaces through AppArmor; an administrator can review an appropriately scoped policy for the installed Chromium executable. Do not disable AppArmor, switch off TLS validation, or run production Chromium with `--no-sandbox` as a shortcut. See [Ubuntu's AppArmor guidance](https://documentation.ubuntu.com/security/security-features/privilege-restriction/apparmor/).

The local acceptance environment in this engineering pass ran as root inside a controlled container, so its fixture-only injected browser factory disabled sandboxing. This injection is not exposed by the production server or crawl options. Clean CI validates the normal non-root launch separately. On Ubuntu runners that restrict unprivileged namespaces, `.github/prepare-browser-ci.sh` installs an AppArmor namespace permission for the exact downloaded Chromium executables only. It does not disable AppArmor, change the global namespace sysctl, or turn off the Chromium sandbox. This CI-only script is not run by the application or its installer. Neither test configuration is a blanket security guarantee.

## Explicit omissions

No CAPTCHA/challenge bypass, login automation, authenticated profile import, proxy evasion, TLS disabling, fingerprint spoofing, form submission, arbitrary scripts/XPath, POST APIs, service workers or WebSockets. Context cookies are page-context-local, not a persistent cross-page authenticated session. JavaScript-driven sites that depend on these blocked features can remain incomplete. Smart detection is heuristic, not universal framework support.

No hard Chromium RSS cap, native DevTools-equivalent timing fidelity, perfect accessibility certification, full semantic DOM diff, fully virtualized million-row grid, resumed crawling after restart or automatic database migration. Tables are bounded/paginated and graphs explicitly capped. Targeted exports, schema inspection, CSS rules and local profiles are complete first implementations rather than placeholders for a paid/cloud service.
