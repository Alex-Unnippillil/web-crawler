<!-- Repository note: Website access, diagnostics and explicit owner-issued automation authentication. -->
# Connect to your own website

Use Web Crawler Studio for education, testing and analysis on sites you own or have permission to crawl. Ownership establishes your authorization, but your hosting platform still needs to recognize the actual automated request. Browser rendering is not a substitute for that permission.

## First: check the connection

Choose **Connection check** in the sidebar, **Check a website** on the welcome screen, or **Check connection first** in New crawl. Enter the address and select **Check connection**. The application uses the same guarded HTTP transport and robots policy as a real crawl, with no saved history, no Chromium, no retries, no more than ten requests and a 20-second overall deadline.

The report separates robots policy from the starting page. It preserves the failing status, stage, URL and a next action; a page that was requested and refused is not marked as unrequested. Copy the report rather than copying credentials. An ordinary rate limit is not automatically classified as a bot challenge.

## Vercel-hosted educational sites

An explicit Vercel security checkpoint is reported as **Access needed**, not a generic fetch failure or a user-stopped crawl. The crawler does not execute or solve the checkpoint, hammer it with repeated retries, pretend that the checkpoint is your page, or disable robots/TLS checks.

For a project you control:

1. Open that project in your Vercel dashboard. In **Settings → Deployment Protection**, find **Protection Bypass for Automation** and create a dedicated secret for this educational crawler. This is a project automation secret, **not your Vercel API/account token**. Follow Vercel's current instructions for your project; secret changes can require redeployment.
2. In Studio choose **Owner access**. Enter the exact HTTPS origin, for example `https://unnippillil.com`, without a path, query or credentials.
3. Enter the secret locally in the password field, confirm that you control the deployment, and select **Use for this session**. Do not post the secret in GitHub, an issue, a screenshot, this project's README, or chat.
4. Run **Connection check** again. Start a **Quick look / Smart Hybrid** crawl only after the check is readable. Full Browser is available when source HTML alone misses important content.
5. Use **Forget secret** when finished; revoke the dedicated secret in Vercel when you no longer need it.

The exact origin matters. `https://www.unnippillil.com` is different from `https://unnippillil.com`. The crawler does not guess that another host is authorized to receive a secret. If your site redirects to `www`, configure and start at that final authorized origin. Cross-origin CDN assets never inherit the credential. Opt-in previews of recorded protected images use the same exact-origin credential and keep the normal raster/size/redirect safeguards.

Vercel documents its automation credential as supported authentication for deployment protection and certain system/bot mitigations. It does **not** override every restriction: active attack mitigations or owner-defined firewall policy may still prevent access. Review the request in the project's Firewall events and make only an appropriately narrow owner-approved change. This app never changes your Vercel configuration, fabricates a credential, or imports your normal browser profile.

[Official Vercel automation documentation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation)

## Credential lifetime and data handling

The secret stays in the server process's memory for one hour, or until forgotten or the server exits. It is sent as the documented HTTP header only to the configured exact HTTPS origin. It is not included in saved crawl settings, profiles, API state or request logs. The UI clears the password field after submission/closing. Literal reflections in response headers and bodies are redacted before parsing, rendering or persistence, including tokens split across response chunks. This does not certify arbitrary encoded/derived website output as secret-free; review site content before sharing evidence.

Credentials cannot be changed during a crawl or connection check. They are not recovered after restart. Memory-only does not protect against a compromised OS, process debugger, swap or crash dump; use a trusted local computer. No credentials are needed for public sites that permit crawling.

## Network and redirect compatibility

The public-address transport supplies the complete validated IPv4/IPv6 result set to Node's bounded address-family selection. It no longer retries the same first DNS result when another allowed address is usable. All addresses are checked before use; a response containing a private/reserved address fails closed, and DNS is pinned to the checked addresses.

The initial page may establish a canonical `www`/apex or HTTP-to-HTTPS origin on normal ports. Before following that page, Studio establishes the destination's robots policy. Later page links cannot expand the origin. Arbitrary domain changes, HTTPS downgrades, credential-bearing URLs, and unrelated custom-port transitions are rejected. The graph uses the effective entry origin so links are classified correctly after a canonical redirect.

DNS, certificate, refused-connection, unreachable-network and timeout causes remain distinct. A bad certificate must be fixed at the server/OS; there is no insecure TLS toggle. On WSL, the connection check runs from Ubuntu's network environment, which can differ from your Windows browser or GitHub Actions.

## Glass workspace

The interface uses translucent navigation/control surfaces with opaque tables and evidence panels. Desktop uses one sidebar tablist; narrow screens move that same tablist above the results rather than duplicating navigation. **Reduce transparency** provides an opaque fallback. Operating-system reduced-transparency, contrast and motion preferences are respected where the browser supports them. Light/dark themes, keyboard tab navigation and the original CLI remain available.

The design uses CSS materials inspired by [Apple's materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials); it is a local web app, not a native iOS component or an Apple-branded product.
