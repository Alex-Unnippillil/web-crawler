<!-- Repository note: Daily workflows, selection semantics and keyboard navigation for the interaction workspace. -->
# Working in Web Crawler Studio

## Start with the task

**Home** puts the website field first. Enter a domain or full HTTP(S) URL and choose **Configure crawl**. An omitted scheme becomes HTTPS; embedded credentials and unsupported schemes are rejected. This opens the crawl form for review: it does not start a crawl or send a request to the entered website. Review the mode, preset and plain-language budget summary, then choose **Start crawl**.

**New crawl** is always available in the sidebar, or in the top bar on small screens. Existing scope, robots, browser, authentication and resource protections remain unchanged. Advanced settings remain optional. An invalid field inside a closed advanced section opens that section so it can be corrected.

Use **Explore sample sites** on Home or **Examples** in a result workspace to choose the basic, visual or hybrid local demonstration. The hybrid sample requires Chromium. The samples are real locally hosted fixtures, not public website results.

## Find your way around

The sidebar groups captured results into **Explore**, **Analyze** and **Crawl tools**. Its analysis list scrolls independently; Connection check and Owner access stay reachable. Collapse it to an icon rail for more horizontal space. Icon controls keep accessible names and tooltips. On narrow screens the same analysis tablist moves into the workspace; it is not duplicated.

Select a summary metric to open the relevant pages, links, issues, images or resources. The **Run details** disclosure contains the existing technical telemetry and control center. It does not change crawl execution or hide failed-run diagnostics.

**Home** contains recent runs; **Crawl history** adds name/URL search, state filters and sorting. “Needs attention” includes interrupted/blocked/failed/stopped runs and completed runs with fetch failures. History search is distinct from result search.

## Use the page inventory

Search captured URL/title/heading text and combine it with a processing or review filter. Quick filter buttons expose common views. Column heading buttons sort in both directions; the sorted header exposes its direction to assistive technology. The sort menu provides the same ordering. Unknown measurements stay unknown and sort after known measurements, rather than becoming fake zeroes.

**Columns** chooses optional page fields. Page/URL and selection remain available. Column visibility and sidebar size are optional browser-local presentation preferences. The inventory displays 20, 50 or 100 rows per page; larger inventories stay paginated. On a narrow screen the table scrolls horizontally instead of silently hiding selected columns.

No-match states have a **Reset filters** action. Resetting a filter does not erase captured results or a deliberate selection. Selection and live refreshes preserve the table's scroll position and keyboard focus where the corresponding record still exists.

## Select and export deliberately

A row checkbox selects that URL. The header checkbox selects only the current page of results. **Select all matching** adds every URL matching the current filters. A selection remains across pagination and filter changes until cleared, the run changes, or the underlying records disappear.

The selection bar states the count and how many selected pages are outside the current filters. **Export selected CSV (N)** exports that explicit selection, including those hidden by a filter. **Copy URLs** copies the same selected set. Clear the selection to make **Export filtered CSV** export the matching view instead. Zero matches with no selection disable that export action. Clipboard failures offer CSV as a fallback.

Selection is in memory and clears on a different crawl or browser reload. It is not persisted in local storage. **Export results**, in the run header, exports the entire crawl and explicitly describes that scope; it is different from the page-level CSV action. Other analysis workspaces retain their scoped export controls.

## Inspect without losing your place

Open a page using its title or inspect button. **Previous** and **Next** walk the current filtered, sorted page inventory, including its later pages. The current inspection tab is preserved. At either end the unavailable direction is disabled. An uncollected URL has no invented position in the successful-page sequence.

Use **Alt+Left** and **Alt+Right** for the same navigation inside the inspector. Close the inspector to return focus to the initiating page control when it still exists. Remote HTML stays escaped source text; this interface does not mount it as trusted application markup.

## Keyboard and appearance

| Control | Action |
|---|---|
| Ctrl/Cmd+K | Open search and commands; type a section, supported command or captured page text. |
| Up/Down, then Enter | Choose a command result without using a mouse. |
| N | Open a new crawl when not editing a field or inside a dialog. |
| / | Focus the page search when a run is selected. |
| Arrow keys / Home / End on tabs | Navigate analysis sections or page-inspector tabs. |
| Alt+Left / Alt+Right in inspector | Inspect the previous/next captured page in the active sequence. |
| Escape | Close a native dialog; close the column picker and return focus to its trigger. |

The top-bar theme button switches light/dark mode. **Workspace settings** collects density, transparency and help. Reduced motion, forced colors and reduced-transparency preferences are supported in the styles; these automated checks are not a full assistive-technology certification.

## Design and implementation scope

This release prioritizes real interactions over adding another theme or external UI framework. Shared button sizing/hierarchy, grouped actions, restrained glass chrome and readable data surfaces coexist with the TypeScript crawler. The table is native HTML with bounded pagination, not a million-row virtualization engine or freely draggable spreadsheet. It has column visibility, not drag-to-reorder or column resizing. No crawling/network policy or owner credential lifetime is relaxed.

Reference concepts: [W3C sortable table pattern](https://www.w3.org/WAI/ARIA/apg/patterns/table/examples/sortable-table/), [W3C modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) and [W3C tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/). Native controls, visible focus and explicit export scope are implementation choices, not a claim of universal accessibility compliance.

Real screenshots are produced by `tests/interaction_e2e.py`, invoked by `python3 tests/e2e.py`. That suite covers URL review, selection and exact CSV rows, sorting, hidden columns, inspector sequence, navigation, history and four widths. Existing graph, hybrid and owner-access regression suites remain mandatory.
