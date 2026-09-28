"""Real HTTP/jsdom/Studio acceptance. Fixtures are local and explicitly labelled demonstrations."""
import csv
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.request
from playwright.sync_api import sync_playwright, expect
from ui_actions import start_sample

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
url = f'http://127.0.0.1:{port}'

def no_overflow(page):
    sizes = page.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})')
    assert sizes['scroll'] <= sizes['width'] + 1, sizes

def settings(page):
    page.locator('[data-action="settings"]').filter(visible=True).first.click()
    expect(page.get_by_role('dialog', name='Workspace settings')).to_be_visible()

with tempfile.TemporaryDirectory(prefix='crawler-observatory-') as directory:
    server = subprocess.Popen(['node', 'dist/studio/server.js', '--no-open', f'--port={port}'], cwd=ROOT, env={**os.environ, 'CRAWLER_DATA_DIR':directory})
    try:
        for _ in range(150):
            try:
                urllib.request.urlopen(url, timeout=1).close()
                break
            except OSError:
                if server.poll() is not None: raise RuntimeError('Studio exited before startup')
                time.sleep(.1)
        else: raise RuntimeError('Studio startup timeout')
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, **({'executable_path':os.environ['CHROMIUM_EXECUTABLE']} if os.environ.get('CHROMIUM_EXECUTABLE') else {}))
            page = browser.new_page(viewport={'width':1440,'height':1120}, color_scheme='light')
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            violations = []
            page.on('console', lambda message: violations.append(message.text) if 'Content Security Policy' in message.text and 'observatory' in message.text else None)
            page.goto(url, wait_until='networkidle')
            expect(page.get_by_role('heading', name='Inspect a website.')).to_be_visible()
            page.screenshot(path=str(DOCS/'observatory-home.png'))
            start_sample(page, 'atlas-demo')
            expect(page.locator('#crawl-status')).to_contain_text('Completed', timeout=60000)
            expect(page.locator('#metric-pages')).to_have_text('37')
            page.get_by_role('tab', name='Observatory', exact=True).click()
            expect(page.get_by_role('heading', name='A clearer view of the web.')).to_be_visible()
            expect(page.locator('.obs-chart-grid>.obs-card')).to_have_count(4)
            expect(page.locator('.obs-radar-area')).to_have_count(1)
            expect(page.locator('#obs-scope')).to_contain_text('37 of 37')
            assert page.locator('.obs-radar').get_attribute('aria-labelledby')
            # Actual SVG geometry, not just text: strict CSP must not flatten charts.
            for selector, axis, scale in [('.obs-hbars .obs-hrow', 'width', 100), ('.obs-histogram .obs-column', 'height', 150)]:
                measured = page.locator(selector).evaluate_all("""(rows, axis) => rows.map(row => {
                    const rect = row.querySelector('rect'); const track = row.querySelector('svg');
                    return {count:Number(row.querySelector('strong').textContent.replaceAll(',','')),
                        length:Number(rect.getAttribute(axis)), rendered:rect.getBoundingClientRect()[axis],
                        track:track.getBoundingClientRect()[axis], fill:getComputedStyle(rect).fill};
                })""", axis)
                maximum = max(1, max(row['count'] for row in measured))
                for row in measured:
                    assert abs(row['length'] - row['count'] / maximum * scale) < .001, row
                    assert abs(row['rendered'] - row['count'] / maximum * row['track']) < 1, row
                    assert row['fill'] not in ['none', 'rgba(0, 0, 0, 0)'], row
            stacks = page.locator('.obs-depths .obs-hrow').evaluate_all("""rows => rows.map(row => ({
                counts: row.querySelector('strong').textContent.split('/').map(Number),
                rects:Array.from(row.querySelectorAll('rect')).map(rect => ({x:Number(rect.getAttribute('x')||0), width:Number(rect.getAttribute('width'))}))
            }))""")
            maximum = max(1, max(sum(row['counts']) for row in stacks))
            for row in stacks:
                for count, rect in zip(row['counts'], row['rects']):
                    assert abs(rect['width'] - count / maximum * 100) < .001, row
                assert abs(row['rects'][1]['x'] - row['rects'][0]['width']) < .001, row
            assert page.locator('#obs-charts [style]').count() == 0
            assert not violations, violations
            no_overflow(page)
            # Every chart has an equivalent table and keyboard-operable disclosure.
            for name in ['coverage','outcomes','durations','depth']:
                details = page.locator(f'#obs-data-{name}')
                details.locator('summary').focus()
                page.keyboard.press('Enter')
                expect(details.locator('table')).to_be_visible()
                assert details.locator('th[scope="col"]').count() >= 2
                page.keyboard.press('Enter')
            # All page rows are navigable and CSV is not restricted to the visible 20 rows.
            expect(page.locator('#obs-ranking-list tbody tr')).to_have_count(20)
            page.locator('#obs-rank-next').click()
            expect(page.locator('#obs-ranking-list tbody tr')).to_have_count(17)
            page.locator('#obs-rank').select_option('duration')
            expect(page.locator('#obs-ranking-list tbody tr')).to_have_count(20)
            with page.expect_download() as download:
                page.locator('#obs-export-pages').click()
            rows = list(csv.DictReader(io.StringIO(Path(download.value.path()).read_text())))
            assert len(rows) == 37
            assert all(row['url'].startswith('http://127.0.0.1:') for row in rows)
            # Filters are composable, keyboard focus is retained, and captured text is escaped.
            page.locator('#obs-category').select_option('Accessibility')
            page.locator('#obs-severity').select_option('review')
            assert page.locator('.obs-evidence>li').count() > 0
            assert all('Accessibility' in t for t in page.locator('.obs-evidence>li .obs-category').all_text_contents())
            with page.expect_download() as download:
                page.locator('#obs-export-findings').click()
            findings = list(csv.DictReader(io.StringIO(Path(download.value.path()).read_text())))
            assert findings and all(row['category']=='Accessibility' and row['severity']=='review' for row in findings)
            page.locator('#obs-query').fill('<img src=x onerror=alert(1)>')
            expect(page.locator('#obs-query')).to_be_focused()
            expect(page.get_by_role('heading', name='No matching findings')).to_be_visible()
            assert page.locator('#observatory img').count() == 0
            page.locator('#obs-reset').click()
            page.locator('#obs-ranking-list [data-obs-page]').first.click()
            expect(page.locator('#detail-dialog')).to_be_visible()
            page.get_by_role('button', name='Close page details').click()
            # Let transient export notifications disappear before documenting the UI.
            expect(page.locator('#toast')).not_to_be_visible(timeout=10000)
            # Capture real light, dark, chart-only, and mobile views.
            page.evaluate('window.scrollTo(0,0)')
            page.screenshot(path=str(DOCS/'observatory-desktop.png'))
            page.locator('#obs-charts').screenshot(path=str(DOCS/'observatory-charts.png'))
            settings(page)
            page.locator('#settings-dialog').get_by_role('button',name='Switch to dark mode',exact=True).click()
            page.get_by_role('button',name='Close workspace settings').click()
            page.evaluate('window.scrollTo(0,0)')
            page.screenshot(path=str(DOCS/'observatory-dark.png'))
            # Access preferences persist across reload without storing content or credentials.
            settings(page)
            page.locator('#access-text').select_option('extra')
            page.locator('#access-contrast').check()
            page.locator('#access-motion').check()
            page.locator('#access-tables').check()
            page.get_by_role('button',name='Close workspace settings').click()
            expect(page.locator('.obs-radar')).not_to_be_visible()
            assert page.locator('.obs-data[open]').count() == 4
            page.reload(wait_until='networkidle')
            assert page.locator('html').get_attribute('data-text-size') == 'extra'
            assert page.locator('html').get_attribute('data-high-contrast') == 'true'
            assert page.locator('html').get_attribute('data-reduce-motion') == 'true'
            page.get_by_role('tab',name='Observatory',exact=True).click()
            assert page.locator('.obs-data[open]').count() == 4
            settings(page)
            # Extra-large labels must not overlap descriptions or escape their controls.
            for row in page.locator('#settings-dialog .setting-row').all():
                boxes = row.evaluate("""row => {
                    const button=row.querySelector('button'); const description=row.querySelector(':scope>div');
                    return {button:button.getBoundingClientRect().toJSON(),description:description.getBoundingClientRect().toJSON(),
                        scroll:button.scrollWidth,width:button.clientWidth};
                }""")
                a,b=boxes['description'],boxes['button']
                assert a['right'] <= b['left']+1 or a['bottom'] <= b['top']+1, boxes
                assert boxes['scroll'] <= boxes['width']+1, boxes
            page.screenshot(path=str(DOCS/'observatory-accessibility.png'))
            page.locator('#access-text').select_option('normal')
            page.locator('#access-contrast').uncheck()
            page.locator('#access-tables').uncheck()
            page.locator('#settings-dialog').get_by_role('button',name='Switch to light mode',exact=True).click()
            page.get_by_role('button',name='Close workspace settings').click()
            for width in [1100,900,720,390,320]:
                page.set_viewport_size({'width':width,'height':900})
                no_overflow(page)
                page.get_by_role('tab', name='Observatory', exact=True).scroll_into_view_if_needed()
                if width == 390:
                    page.locator('#obs-title').scroll_into_view_if_needed()
                    page.screenshot(path=str(DOCS/'observatory-mobile.png'))
            # A 720 CSS-pixel viewport models 200% desktop zoom's layout width.
            # Root CSS zoom is not browser zoom: it does not update viewport media queries.
            # Native browser zoom / assistive-technology review remains a manual check.
            page.set_viewport_size({'width':720,'height':500})
            no_overflow(page)
            page.set_viewport_size({'width':1440,'height':1000})
            page.emulate_media(reduced_motion='reduce',forced_colors='active')
            page.locator('#obs-query').fill('missing')
            expect(page.locator('#obs-query')).to_be_focused()
            page.locator('#obs-reset').click()
            # Keyboard navigation leaves/returns without duplicate event listeners.
            tab = page.get_by_role('tab',name='Observatory',exact=True)
            tab.focus()
            page.keyboard.press('ArrowDown')
            expect(page.get_by_role('tab',name='Insights',exact=True)).to_have_attribute('aria-selected','true')
            page.keyboard.press('ArrowUp')
            expect(tab).to_have_attribute('aria-selected','true')
            assert page.locator('#observatory').count() == 1
            assert not errors, errors
            browser.close()
            print(json.dumps({'result':'passed','capture_pages':37,'charts':4,'viewport_widths':[1440,1100,900,720,390,320], 'checks':['actual crawl','chart tables','pagination','full CSV','combined filters','safe text','inspector','persistent preferences','enlarged settings layout','reflow','keyboard','reduced motion','forced colors','no page errors']}))
    finally:
        server.terminate()
        try: server.wait(timeout=5)
        except subprocess.TimeoutExpired: server.kill(); server.wait()
