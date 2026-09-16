# Security model

Web Crawler Studio is a **single-user local application**, not an internet-facing service.

## GUI protections

- Binds only to `127.0.0.1`; accepts the matching `localhost`/`127.0.0.1` Host header.
- Uses a random per-process token for every API request. No permissive CORS. Cross-site and foreign-Origin requests are denied. Reload the page after a server restart.
- Checks public IP eligibility and pins the DNS answer used by each outbound request. Reserved, private, loopback, mapped-private IPv6 and common transition ranges are denied. The built-in demo is the only GUI exception; it is a server-owned fixture, not a user-chosen private URL.
- Follows redirects manually inside the configured origin/path and repeats outbound address validation.
- Enforces robots policy, request/body/deadline budgets and GUI result limits. Paused crawls still have deadlines.
- Parses remote HTML without scripts/subresource loading. UI text is escaped and external links are restricted to HTTP(S). Remote image URLs are shown as text, never embedded.
- Ships no remote UI scripts/fonts, analytics or cloud services. CSV exports escape formula-like strings.
- Stores data under the current OS account with restrictive modes where supported; writes snapshots through temporary files and atomic renames. Up to 30 histories are retained until the user deletes them.

## Not covered

Other processes running as the same OS user may read history and the local session. Local filesystem tampering is outside this single-user trust boundary. Browser extensions and the OS are trusted. There is no multi-user authorization, encryption-at-rest, code signing, or notarization. Do not bind this server publicly or place it behind a public reverse proxy.

Target sites see your IP address and crawler requests. Extracted pages and URL query strings may contain sensitive data. Review exports before sharing. Basic content checks are not a vulnerability assessment.

The original CLI may deliberately access authorized private development sites and does not use the GUI public-IP transport. Never wrap it in an unauthenticated remote API. TLS verification is not disabled in either path.

## Reporting

For a suspected vulnerability, avoid including credentials, private crawl output, or a working exploit against a third-party site in a public issue. Use the repository's private security reporting channel when enabled; otherwise contact the maintainer through their GitHub profile to arrange a private disclosure.
