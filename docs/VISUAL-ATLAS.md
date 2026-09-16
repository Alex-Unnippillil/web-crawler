<!-- Visual Atlas reference: measurements, interactions, privacy, and rendering limits. -->
# Visual Atlas 4.0

The workspace has seven views: **Insights, Pages, Link map, URL paths, Elements, Issues, and Activity**. They use the same crawl records; switching a view does not crawl the site again.

## First run

Launch the app and click **Explore visual demo**. This serves a real, 37-page HTTP fixture on your own computer and crawls it. It contains six site sections, cross-links, eight locally generated landscape PNGs, headings, a form, and intentionally missing resources. The artwork is demonstration material, not imagery scraped from a public site. **Try a local demo** remains the smaller compatibility demonstration.

## Spiderweb explorer

Open **Link map**. A point represents a known URL, and an arrow represents an actual captured hyperlink from one page to another. Directory proximity does not create links. Larger points have more incoming links within this crawl—not greater real-world popularity.

- **Spiderweb** uses bounded force relaxation. **Radial depth** arranges nodes by recorded discovery depth. **Discovery layers** uses depth columns; unvisited URLs occupy a separate layer.
- Click a point for its full URL, status, incoming/outgoing counts, and neighbors. **Inspect page** opens the page detail panel. Drag a point to move it; drag the background to pan; scroll or use +/− to zoom. **Fit map** restores the initial viewport. **Expand** requests browser fullscreen.
- **Focus neighborhood** displays the selected point and its directly connected neighbors. **Clear focus** clears the path/search/focus filters. State checkboxes and node limit remain your choices.
- **Trace from start** computes a shortest directed route using the full captured link set. It does not invent links or imply that this was the crawler's actual visitation sequence. A filtered map can omit some route nodes; the inspector still lists the complete route.
- Search URLs/titles, select a path group, or toggle successful pages, failures, discovered-only URLs, and external links. Coral indicates failures, amber discovered-only, and gray external URLs. Other colors group successful pages by first path segment.
- **Pin snapshot** freezes the displayed graph while the crawl continues. Unpin to catch up. It does not pause the crawler's HTTP requests.

The drawing is capped at **500 nodes and 3,000 connections**. Its footer reports the displayed subset; use filters to inspect larger results. **Graph JSON** exports the full indexed nodes and edges, including those outside the drawing. **Save SVG / Save PNG** export the current drawing and viewport. The older SVG in the global **Export results** dialog remains a separate static report renderer with its original 120-node/2,000-edge limits.

Keyboard: Tab to a graph node; Enter opens its inspector; Space selects it. The neighbor list provides another way to select URLs without precise pointer movement.

## URL-path tree

**URL paths** groups known same-origin URLs by their path segments. Expand/collapse directories, search paths and page titles, and include or exclude unfetched/failed URLs. Query-string variants remain distinct.

**Directory nodes are organizational groupings, not evidence of a fetched page or an observed hyperlink.** Use the spiderweb when you need actual link relationships. A directory can exist in the tree even when that directory URL was never fetched.

## Element explorer

**Elements** provides five catalogs:

| Catalog | Captured information |
|---|---|
| Images | Unique HTTP(S) image candidates from `src`, supported lazy-load attributes, `srcset`, and `<picture>`; alt text, declared dimensions, and referencing pages |
| Links | Unique anchor/area targets, captured text, rel attributes, and source pages |
| Headings | H1–H6 occurrences, text, IDs, and their page |
| Resources | Script, stylesheet, frame, video/audio, poster, embedded-object, and document URLs; declared type and source pages |
| Forms | Form action/method and control names/types; **not** control values, password values, or submitted data |

Search, filter by type/alt status, select a source page, and paginate 24 entries at a time. Images offer a grid or list. Open **Details** for captured attributes and source-page buttons. The image inspector supports Previous/Next and left/right arrows through the filtered set. **Export filtered CSV / JSON** exports every matching entry, not just the current page. CSV text is protected against formula-style prefixes.

The page inspector's **Browse this page’s elements** action opens the catalog with that source-page filter already applied. Remove the filter to return to the whole crawl.

### Image previews and privacy

Previews are **off by default** and are not loaded simply by opening the Images tab. **Load previews** enables visible thumbnails for that session; **Load this image** requests just an inspected image. Loading previews makes additional HTTP requests, separate from the crawl budget and crawl request counts. These requests can reveal your network address to the image host. They can contact a public CDN on a different origin from the crawled site.

Requests go through the authenticated local server, without browser cookies or a referrer. Only image URLs recorded in the selected crawl are eligible. Public-address checks and DNS pinning apply to every network request; redirect targets are checked again. The preview service permits supported raster image MIME types and signatures, rejects SVG/HTML, limits each response to **4 MiB**, allows at most **four server-side requests** at once, and times out after **10 seconds**. The gallery queues at most **three requests** concurrently and keeps at most **24 MiB of encoded image blobs** in its session cache. This byte limit is not a measurement of decoded browser-image memory.

Leaving the catalog stops scheduling the remaining thumbnail queue; already-started requests may finish. Turning previews off hides thumbnails, but does not undo requests already sent. A page reload resets preview consent. SVG images remain URL-only. JavaScript, frames, video/audio, forms, and stylesheets are never executed or embedded for inspection.

Opening an external URL explicitly in your browser is separate from the preview service and follows your browser's normal behavior.

### What the numbers mean

A missing `alt` attribute differs from an empty `alt=""`, which may correctly describe a decorative image. An image reused by several pages may have both descriptive and missing-alt occurrences. Responsive candidates are distinct image URLs. Dimensions are HTML attributes, **not measured intrinsic pixel sizes**. File-type filtering uses URL extensions when available, not verified MIME types.

Extraction is static, bounded HTML analysis: up to **500 entries per element category per page**, **50 candidates per image**, **20 picture sources per image**, and **100 controls per form**. Text fields are bounded. A truncation notice is shown when the category/control cap is reached. CSS background images, blob/data URLs, dynamically created elements, complex browser-specific lazy loading, and rendered visibility are not comprehensively captured. Resource URLs are not availability-checked just because they appear in the catalog.

## Insights and reading controls

**Insights** visualizes path groups, HTTP outcomes, recorded discovery depth, and frequently referenced pages. The HTML byte total covers downloaded successful page bodies. Median fetch duration is the median recorded request duration, **not a browser page-load or Core Web Vitals measurement**. These are inventory statistics, not an SEO score.

Use **Compact / Comfortable** to change density, light/dark mode for the theme, or **Ctrl/Command+K** to jump to a view. The seven tabs scroll horizontally on narrow screens; tables keep their own horizontal scrolling rather than overflowing the application.

## Older saved crawls

Version 3 histories still open. Their image/link URLs remain usable, while missing enriched element metadata is explicitly labeled as unavailable/legacy—not assumed to be absent from the site. Run a fresh crawl to populate heading/resource/form catalogs and image attributes. The original five Boot.dev page fields and CLI invocation remain supported. `elements` is an optional addition to stored page records.

## Tests

`npm run check` includes analysis, route, layout, extraction, API, and preview security tests. `python3 tests/e2e.py` runs both the original GUI flow and `tests/atlas_e2e.py` against the actual application and local HTTP fixtures. Real-browser captures are written into `docs/`. See workflow results for the commit being used; test source alone is not evidence of a passing run.

## Hybrid inspection integration

The [hybrid upgrade](HYBRID.md) adds rendering-method and sitemap filters to the Atlas, browser/sitemap node badges, and links from inspection workspaces. A sitemap page with no captured incoming link is not necessarily an orphan on the entire website. The page inspector adds raw/rendered source, a bounded text diff, screenshot, schema, headers, JavaScript changes, and observed network timing. These complement the URL-path tree and opt-in image gallery rather than replacing them.
