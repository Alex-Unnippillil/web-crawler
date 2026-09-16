"""Real-browser acceptance checks for Visual Atlas. Called by the normal GUI suite.

Uses the real, locally hosted 37-page fixture and production CSP. Previews must
stay off until requested; only generated demo PNGs are used by this test.
"""
import json
from pathlib import Path
from playwright.sync_api import expect


def run_visual_checks(page, docs: Path):
    page.set_viewport_size({"width": 1600, "height": 1100})
    page.get_by_role("button", name="Explore visual demo", exact=True).click()
    expect(page.locator("#crawl-status")).to_contain_text("Completed", timeout=30000)
    expect(page.locator("#metric-pages")).to_have_text("37")
    expect(page.locator("#metric-images")).to_have_text("8")
    expect(page.locator("#metric-resources")).to_have_text("7")
    expect(page.locator("#spiderweb")).to_be_visible()
    assert page.locator(".atlas-node").count() == 41
    page.screenshot(path=str(docs / "atlas-spiderweb.png"), full_page=True)

    # Actual pointer selection, not only a programmatic click handler.
    page.locator('.atlas-node[data-node$="/gallery/coast"] circle:not(.atlas-node-halo)').click()
    expect(page.locator("#map-inspector")).to_contain_text("Gallery / Coast")
    page.get_by_role("button", name="Trace from start", exact=True).click()
    assert page.locator(".atlas-route li").count() >= 2
    assert page.locator(".atlas-edge.traced").count() >= 1
    page.screenshot(path=str(docs / "atlas-route.png"), full_page=True)
    page.get_by_role("button", name="Focus neighborhood", exact=True).click()
    assert 1 < page.locator(".atlas-node").count() < 41
    page.get_by_role("button", name="Clear focus", exact=True).click()
    assert page.locator(".atlas-node").count() == 41
    for mode in ["radial", "columns", "web"]:
        page.locator("#map-layout").select_option(mode)
        assert page.locator(".atlas-node").count() == 41
    before = page.locator("#spiderweb").get_attribute("viewBox")
    page.get_by_role("button", name="Zoom in", exact=True).click()
    assert page.locator("#spiderweb").get_attribute("viewBox") != before
    page.get_by_role("button", name="Fit map", exact=True).click()
    assert page.locator("#spiderweb").get_attribute("viewBox") == "0 0 1000 600"
    page.locator("#map-search").fill("/gallery/coast")
    assert page.locator(".atlas-node").count() == 1
    page.locator("#map-search").fill("")
    page.get_by_label("External links", exact=True).check()
    assert page.locator(".atlas-node").count() == 42
    page.locator("#map-group").select_option("guides")
    assert page.locator(".atlas-node").count() == 6
    page.locator("#map-group").select_option("")
    page.get_by_label("Pin snapshot", exact=True).check()
    page.get_by_label("Pin snapshot", exact=True).uncheck()
    expect(page.locator("#map-live")).to_have_text("· LIVE")

    for title, suffix in [("Save SVG", ".svg"), ("Save PNG", ".png"), ("Graph JSON", ".json")]:
        with page.expect_download() as item:
            page.get_by_role("button", name=title, exact=True).click()
        assert item.value.suggested_filename.endswith(suffix)
        data = Path(item.value.path()).read_bytes()
        assert len(data) > 100
        if suffix == ".json":
            graph = json.loads(data)
            assert len(graph["nodes"]) == 42
            assert len(graph["edges"]) > 400
        if suffix == ".png":
            assert data.startswith(b"\x89PNG\r\n\x1a\n")

    page.get_by_role("tab", name="Insights", exact=True).click()
    expect(page.locator(".atlas-overview")).to_be_visible()
    page.screenshot(path=str(docs / "atlas-insights.png"), full_page=True)
    page.get_by_role("tab", name="URL paths", exact=True).click()
    page.locator("#path-search").fill("/gallery/")
    expect(page.locator("#path-tree")).to_contain_text("coast")
    page.locator("#path-search").fill("")
    page.get_by_role("button", name="Expand all", exact=True).click()
    page.screenshot(path=str(docs / "atlas-paths.png"), full_page=True)
    page.get_by_role("button", name="Collapse all", exact=True).click()

    preview_requests = []
    page.on("request", lambda request: preview_requests.append(request.url) if "/image?" in request.url else None)
    page.get_by_role("tab", name="Elements", exact=True).click()
    expect(page.locator(".atlas-image-card")).to_have_count(8)
    assert preview_requests == [], "Image previews must not make automatic network requests."
    page.locator("#element-search").fill("/media/coast.png")
    expect(page.locator(".atlas-image-card")).to_have_count(1)
    page.locator("#element-search").fill("")
    page.locator("#element-filter").select_option("missing")
    expect(page.locator(".atlas-image-card")).to_have_count(2)
    page.locator("#element-filter").select_option("")
    page.get_by_role("button", name="Load previews", exact=True).click()
    expect(page.locator(".atlas-thumbnail img")).to_have_count(8, timeout=15000)
    assert len(preview_requests) == 8
    for image in page.locator(".atlas-thumbnail img").all():
        assert image.evaluate("async e => { await e.decode(); return e.complete && e.naturalWidth > 0; }")
    page.screenshot(path=str(docs / "atlas-images.png"), full_page=True)
    page.locator(".atlas-image-open").first.click()
    expect(page.locator(".atlas-lightbox-preview img")).to_be_visible()
    page.get_by_role("button", name="Next image", exact=True).click()
    expect(page.locator(".atlas-element-dialog .atlas-kicker")).to_contain_text("2 / 8")
    page.screenshot(path=str(docs / "atlas-image-inspector.png"), full_page=True)
    page.get_by_role("button", name="Close element details").click()
    with page.expect_download() as item:
        page.get_by_role("button", name="Export filtered CSV", exact=True).click()
    assert "sources" in Path(item.value.path()).read_text()
    page.get_by_role("button", name="List view", exact=True).click()
    expect(page.locator(".atlas-element-table tbody tr")).to_have_count(8)
    for category in ["links", "headings", "resources", "forms"]:
        page.locator(f'[data-category="{category}"]').click()
        assert page.locator(".atlas-element-table tbody tr").count() > 0
        page.locator(".atlas-element-table").get_by_role("button", name="Details", exact=True).first.click()
        expect(page.locator(".atlas-element-dialog")).to_be_visible()
        page.get_by_role("button", name="Close element details").click()
    page.locator('[data-category="headings"]').click()
    page.get_by_role("button", name="Next", exact=True).click()
    expect(page.locator("#element-page")).to_contain_text("2 /")
    page.locator('[data-category="images"]').click()
    page.get_by_role("button", name="Grid view", exact=True).click()

    # No nested event handlers when navigating away and back.
    for _ in range(2):
        page.get_by_role("tab", name="Link map", exact=True).click()
        page.get_by_role("tab", name="Elements", exact=True).click()
    assert page.locator(".atlas-elements").count() == 1
    page.locator("#tab-pages").click()
    page.locator(".page-link").first.click()
    page.get_by_role("button", name="Browse this page’s elements", exact=True).click()
    assert page.locator("#element-source").input_value() != ""
    page.locator("#element-source").select_option("")
    page.get_by_role("button", name="Switch to dark mode").click()
    page.get_by_role("tab", name="Link map", exact=True).click()
    page.screenshot(path=str(docs / "atlas-dark.png"), full_page=True)
    page.get_by_role("button", name="Switch to light mode").click()
    page.keyboard.press("Control+k")
    expect(page.locator("#command-dialog")).to_be_visible()
    page.locator("#command-search").fill("elements")
    page.locator('[data-jump="elements"]').click()
    expect(page.locator(".atlas-elements")).to_be_visible()
    page.set_viewport_size({"width": 390, "height": 844})
    for tab in ["Elements", "Link map", "URL paths", "Insights"]:
        page.get_by_role("tab", name=tab, exact=True).click()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), tab
    page.get_by_role("tab", name="Elements", exact=True).click()
    page.screenshot(path=str(docs / "atlas-mobile.png"), full_page=True)
    page.reload(wait_until="networkidle")
    expect(page.locator("#metric-pages")).to_have_text("37")
    page.get_by_role("tab", name="Elements", exact=True).click()
    expect(page.get_by_role("button", name="Load previews", exact=True)).to_be_visible()
    print(json.dumps({"atlas": "PASS", "pages": 37, "images": 8, "resources": 7,
                      "checks": ["pointer graph selection", "route tracing", "focus", "three layouts", "zoom", "filters", "SVG/PNG/JSON downloads", "insights", "path tree", "opt-in thumbnails", "lightbox", "all element categories", "pagination", "source drilldown", "themes", "keyboard commands", "mobile", "reload"]}))
