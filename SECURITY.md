<!-- Repository note: Trust boundaries, storage privacy, and bounded browser operation. -->
# Security model

Web Crawler Studio is a **single-user local application**, not a public crawling API or a safe multi-tenant execution service. The browser engine deliberately executes untrusted website JavaScript in sandboxed Chromium; the application interface never trusts that content as its own markup.

## Local application boundary

The server listens on `127.0.0.1`, validates Host and Origin, rejects cross-site requests, and requires an unpredictable per-process session token on API requests. Static files are allowlisted. The Content Security Policy, frame restrictions, no-store responses and no-referrer policy remain enabled. Do not rebind the server or place it behind a publicly accessible proxy.

HTTP crawling, image previews and browser-intercepted requests use the GUI's public-address checks and DNS-pinned transport. Private/reserved IPv4/IPv6, unsafe schemes, credential-bearing URLs and unsafe redirect destinations are rejected. The built-in demonstration has an explicit exact-loopback-origin exception created by the app, not a general permission to crawl local services. The developer CLI is not a substitute for this GUI boundary.

## Optional owner-issued automation authentication

Owner access supports Vercel's documented project automation secret for an exact HTTPS origin. It is configured through the session-protected local API, lives only in server memory for one hour, and is cleared on shutdown. It is never part of persisted job options/profiles/state. The browser never receives it as a JavaScript variable; the guarded transport inserts its header after origin validation. CDN/redirect destinations do not inherit the secret. Literal response reflections are redacted before extraction/storage, including chunk boundaries. Do not treat arbitrary encoded website output as proven secret-free, and review exports before sharing.

Connection checks share the crawl's robots, DNS, TLS and redirect policies and have separate time/request limits. They cannot overlap another check or crawl. Explicit security checkpoints stop without automatic retries; ordinary transient rate limits retain bounded backoff. The only origin expansion is a verified seed-page www/apex or HTTPS upgrade, followed by destination robots verification. The app never changes firewall rules or imports a user's general browser session.

See [CONNECTIONS.md](docs/CONNECTIONS.md) for lifetime, revocation and supported-host boundaries. This feature is owner-authorized access, not CAPTCHA solving or security-control circumvention.

## Chromium boundary

Production launches explicitly enable the Chromium sandbox. Do not run Studio as root. There is no user-facing switch that disables TLS verification or the browser sandbox. Browser tests may inject a fixture-only browser factory in a root-owned isolated test container; the production launcher/API never accepts that hook from user input.

One browser is reused with bounded isolated contexts; pages/contexts/listeners are closed after each render, cancellation and shutdown. Contexts are recycled rather than sharing a user's browser profile. Only cookies generated during that page context may be used for same-origin requests; normal browser profiles are not imported. Optional owner-issued automation authentication is scoped separately below.

All intercepted traffic is GET-only and fulfilled through the guarded Node transport. Non-GET traffic, form submissions, downloads, permissions, service workers and WebSockets are blocked. Document/frame navigation is additionally same-origin, path-boundary and robots checked. Resource requests may target public external hosts and are accounted for separately; discovered API endpoints are **not** automatically added to the page frontier.

Route interception alone is not treated as a complete network firewall. Chromium uses a deny-by-default local proxy (including loopback bypass suppression), blocked fallback DNS, disabled QUIC and restricted non-proxied WebRTC. Manual document redirects are restarted as checked navigations to avoid Chromium's un-intercepted redirect follow-up behavior. The final rendered URL is checked again after client-side navigation. Negative tests exercise private targets, redirect chains, WebSockets, forms and cancellation.

These controls are defense in depth, not an independent security certification. Browser vulnerabilities and unrecognized transport behavior remain possible. Do not inspect hostile sites from a machine holding valuable credentials; use an appropriately isolated OS environment for higher-risk targets. Browser resource support is intentionally narrower than a normal authenticated browsing session.

## Bounded resource use

The GUI enforces candidate, depth, duration, concurrency, response-size and record budgets. A browser render has separate request-count, aggregate decoded-response-byte, per-response-byte, navigation/settling deadline, source-size, screenshot-size, context-extraction and finite-scroll limits. Source/shot evidence is stored separately: at most 8 MiB per record and 128 MiB per run, using atomic writes and restrictive permissions where supported.

The telemetry memory number is **Node RSS only**, not combined Chromium-process RSS. Memory-aware scheduling reduces page concurrency above a soft Node threshold; Chromium's JavaScript heap flag is not a hard total browser-memory cap. Screenshots/DOM/body caps do not prevent every renderer allocation. For untrusted large sites use conservative settings and external OS/container resource limits. There is no claim of arbitrary-scale or denial-of-service-proof crawling.

## Untrusted content and local evidence

Fast HTTP parses documents in an inert jsdom realm without enabling script execution or external resource loading. Each parse gets a fresh detached document and resolves URLs explicitly against its own page/base URL. Browser rendering is the only production path that executes page scripts.

Rendered HTML, extracted HTML, JSON-LD and console messages are shown as text, not inserted into the application as trusted HTML. Source comparison is bounded. Screenshots are captured raster images, not live page embeds. External SVG previews remain prohibited; opt-in raster previews still use the guarded, bounded transport and local LRU cache. CSV exporters neutralize formula-leading text and HTML/SVG exporters escape values.

Saved crawl records, raw/rendered source, JSON-LD, console logs, screenshots and URLs may contain sensitive or copyrighted website information. Authorization/cookie response headers are not part of the inspector's allowlisted HTTP-header collection, and browser request headers are not logged. This does **not** guarantee that websites will never put sensitive values in HTML, URLs or console output. Review evidence before exporting/sharing.

Evidence filenames are derived from URL hashes, reads validate identifiers and sizes, and deletions operate within the run's own directory. Source data is never committed automatically. History lives in the OS user's data directory; profiles/views live in browser local storage. The token and environment secrets must never enter Git. Use disk encryption/OS account controls where appropriate.

## Responsible use and limitations

Use sites you own or have permission to crawl, respect robots rules and rate limits, and do not collect private/authenticated information without authorization. This application has no CAPTCHA solving, challenge bypass, credential attacks, TLS disabling or anti-bot evasion. JavaScript applications requiring POST APIs, WebSockets, service workers or cross-origin frames can remain incomplete by design.

Builds are unsigned and not notarized. SHA-256 sidecars detect mismatched downloads; they do not prove publisher identity. Browser installation is an explicit network download and may require administrator-approved OS dependencies/sandbox configuration. Never weaken system protections automatically to make tests or a crawl pass.

For a suspected vulnerability, contact the repository owner privately where possible; do not publish secrets, private URLs or exploitable details before coordinated remediation.
