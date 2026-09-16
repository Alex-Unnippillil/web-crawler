# Repository note: Runs Chromium end-to-end checks against the real local Studio interface.
# Browser-level acceptance test for the real Studio UI, controls, exports, themes, and responsive layout.

"""Full browser/real-jsdom integration test. Run after npm run build.
Requires: python -m pip install playwright; python -m playwright install chromium.
Screenshots are genuine application captures of the explicitly labelled local demo.
"""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.request
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
DOCS.mkdir(exist_ok=True)
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
url = f"http://127.0.0.1:{port}"
with tempfile.TemporaryDirectory(prefix="crawler-e2e-") as directory:
    environment = {**os.environ, "CRAWLER_DATA_DIR": directory}
    server = subprocess.Popen(["node", "dist/studio/server.js", "--no-open", f"--port={port}"], cwd=ROOT, env=environment)
    try:
        for attempt in range(100):
            try:
                urllib.request.urlopen(url, timeout=1).close()
                break
            except OSError:
                if server.poll() is not None:
                    raise RuntimeError("The studio server exited during startup.")
                time.sleep(0.1)
        else:
            raise RuntimeError("The studio server did not start.")
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 1080}, color_scheme="light")
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
            page.goto(url, wait_until="networkidle")
            page.screenshot(path=str(DOCS / "studio-welcome.png"), full_page=True)
            page.get_by_role("button", name="Try a local demo", exact=True).click()
            expect(page.locator("#metric-pages")).not_to_have_text("0")
            page.get_by_role("button", name="Pause", exact=True).click()
            expect(page.locator("#crawl-status")).to_have_text("Paused")
            page.wait_for_timeout(700)
            page.get_by_role("button", name="Resume", exact=True).click()
            expect(page.locator("#crawl-status")).to_contain_text("Completed", timeout=20000)
            assert page.locator("#metric-pages").inner_text() == "10"
            assert page.locator("#metric-issues").inner_text() == "4"
            page.wait_for_timeout(1000)
            page.screenshot(path=str(DOCS / "studio-desktop.png"), full_page=True)
            page.locator("#search").fill("reliability")
            expect(page.locator("tbody tr")).to_have_count(1)
            page.locator("#search").fill("")
            page.locator(".page-link").first.click()
            assert page.locator("#detail-dialog").is_visible()
            page.screenshot(path=str(DOCS / "studio-inspector.png"), full_page=True)
            page.get_by_role("button", name="Close page details").click()
            page.get_by_role("tab", name="Issues").click()
            assert page.locator(".issue").count() == 4
            page.get_by_role("tab", name="Link map").click()
            assert page.locator(".graph-node").count() == 10
            page.locator(".graph-node").first.press("Enter")
            assert page.locator("#detail-dialog").is_visible()
            page.get_by_role("button", name="Close page details").click()
            page.get_by_role("button", name="Export results", exact=True).click()
            with page.expect_download() as download:
                page.get_by_role("button", name="CSV spreadsheet").click()
            assert "Fieldnotes" in Path(download.value.path()).read_text()
            page.get_by_role("button", name="Close export").click()
            page.get_by_role("tab", name="Pages").click()
            page.get_by_role("button", name="Switch to dark mode").click()
            assert page.locator("html").get_attribute("data-theme") == "dark"
            page.screenshot(path=str(DOCS / "studio-dark.png"), full_page=True)
            page.get_by_role("button", name="Switch to light mode").click()
            assert page.locator("html").get_attribute("data-theme") == "light"
            page.get_by_role("button", name="Crawl history").click()
            assert page.locator(".history-card").count() == 1
            page.get_by_role("button", name="Open", exact=True).click()
            page.set_viewport_size({"width": 390, "height": 844})
            page.wait_for_timeout(300)
            assert page.evaluate("() => document.documentElement.scrollWidth <= innerWidth")
            page.screenshot(path=str(DOCS / "studio-mobile.png"), full_page=True)
            page.locator(".mobile-nav").get_by_role("button", name="History").click()
            assert page.locator("#history-view").is_visible()
            page.locator(".mobile-nav").get_by_role("button", name="Overview").click()
            page.locator(".mobile-new").click()
            page.locator('[name="preset"][value="200"]').check()
            assert page.locator('[name="maxPages"]').input_value() == "200"
            assert page.locator("#crawl-dialog").evaluate("el => el.scrollWidth <= el.clientWidth")
            page.get_by_role("button", name="Close new crawl").click()
            # A reload must restore saved results and retain the theme.
            page.reload(wait_until="networkidle")
            expect(page.locator("#metric-pages")).to_have_text("10")
            assert page.locator("html").get_attribute("data-theme") == "light"
            assert errors == [], errors
            print(json.dumps({"result": "PASS", "pages": 10, "issues": 4, "browser_errors": errors,
                              "checks": ["actual HTTP origin", "real jsdom parser", "demo", "pause/resume", "search", "inspector", "issues", "graph keyboard", "CSV export", "themes", "history", "mobile", "presets", "reload"]}, indent=2))
            browser.close()
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()
