"""Real Chromium acceptance test for the hybrid analysis workspaces.
Uses a local-fixture-only host; remote code is never allowed through the root test override.
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
from ui_actions import start_sample

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
with socket.socket() as sock:
    sock.bind(('127.0.0.1',0))
    port=sock.getsockname()[1]
url=f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='crawler-hybrid-ui-') as directory:
    env={**os.environ,'TEST_PORT':str(port),'TEST_DATA_DIR':directory}
    server=subprocess.Popen(['node','tests/hybrid-ui-server.mjs'],cwd=ROOT,env=env)
    try:
        for _ in range(150):
            try:
                urllib.request.urlopen(url,timeout=1).close()
                break
            except OSError:
                if server.poll() is not None: raise RuntimeError('Fixture host failed to start')
                time.sleep(.1)
        else: raise RuntimeError('Fixture host startup timeout')
        with sync_playwright() as pw:
            browser=pw.chromium.launch(headless=True,**({'executable_path':os.environ['CHROMIUM_EXECUTABLE']} if os.environ.get('CHROMIUM_EXECUTABLE') else {}))
            page=browser.new_page(viewport={'width':1600,'height':1000},color_scheme='light')
            errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.on('console',lambda message:errors.append(message.text) if message.type=='error' else None)
            page.goto(url,wait_until='networkidle')
            start_sample(page, "hybrid-demo")
            expect(page.locator('#crawl-status')).to_contain_text('Completed',timeout=45000)
            expect(page.locator('#wb-grid')).to_contain_text('BROWSER',timeout=10000)
            page.locator('[data-wb-filter="Method"]').select_option('BROWSER')
            expect(page.locator('.wb-table tbody tr')).to_have_count(1)
            page.locator('#wb-all').check()
            with page.expect_download() as event:
                page.locator('[data-wb-export="csv"]').click()
            csv=Path(event.value.path()).read_text()
            assert 'BROWSER' in csv and '/app' in csv
            page.screenshot(path=str(DOCS/'hybrid-javascript.png'),full_page=True)
            page.locator('.wb-table [data-page]').first.click()
            expect(page.locator('#detail-dialog')).to_be_visible()
            expect(page.locator('.inspect-pane')).to_contain_text('Raw words')
            expect(page.locator('.inspect-pane')).to_contain_text('Product')
            page.locator('#inspect-tab-source').click()
            expect(page.locator('.source-diff')).to_be_visible(timeout=10000)
            expect(page.locator('.source-columns')).to_contain_text('product-price')
            assert page.locator('.source-columns iframe').count()==0
            page.screenshot(path=str(DOCS/'hybrid-source.png'),full_page=True)
            page.locator('#inspect-tab-network').click()
            expect(page.locator('.network-waterfall')).to_contain_text('/api/products')
            page.screenshot(path=str(DOCS/'hybrid-network.png'),full_page=True)
            page.locator('#inspect-tab-screenshot').click()
            expect(page.locator('.inspect-screenshot')).to_be_visible(timeout=10000)
            assert page.locator('.inspect-screenshot').evaluate('(image)=>image.complete && image.naturalWidth > 0')
            page.screenshot(path=str(DOCS/'hybrid-screenshot.png'),full_page=True)
            page.get_by_role('button',name='Close page details',exact=True).click()
            page.get_by_role('tab',name='Structured data',exact=True).click()
            expect(page.locator('#wb-grid')).to_contain_text('Product')
            page.locator('[data-wb-object]').first.click()
            expect(page.locator('#wb-object')).to_contain_text('Product')
            page.get_by_role('tab',name='Resources',exact=True).click()
            page.locator('[data-wb-filter="Type"]').select_option('fetch')
            expect(page.locator('.wb-table tbody tr')).to_have_count(1)
            expect(page.locator('#wb-grid')).to_contain_text('/api/products')
            page.get_by_role('tab',name='Custom fields',exact=True).click()
            expect(page.locator('#wb-grid')).to_contain_text('$24.00')
            page.get_by_role('tab',name='Sitemaps',exact=True).click()
            expect(page.locator('#wb-grid')).to_contain_text('No captured inlink')
            page.get_by_role('tab',name='Robots',exact=True).click()
            expect(page.locator('#wb-grid')).to_contain_text('/private')
            page.get_by_role('tab',name='Issues',exact=False).click()
            page.locator('[data-issue-category="JavaScript"]').click()
            expect(page.locator('.issue')).to_have_count(1)
            with page.expect_download() as event:
                page.locator('[data-action="issues-csv"]').click()
            assert 'JavaScript' in Path(event.value.path()).read_text()
            page.get_by_role('tab',name='Link map',exact=True).click()
            page.locator('#map-rendering').select_option('browser')
            expect(page.locator('.atlas-node')).to_have_count(1)
            page.locator('#map-rendering').select_option('')
            page.locator('#map-color').select_option('rendering')
            expect(page.locator('#map-legend')).to_contain_text('Purple: Browser')
            page.screenshot(path=str(DOCS/'hybrid-atlas.png'),full_page=True)
            page.keyboard.press('Control+k')
            page.locator('#command-search').fill('javascript pages')
            page.locator('[data-command="javascript pages"]').click()
            expect(page.locator('.page-link')).to_have_count(1)
            with page.expect_download() as event:
                page.locator('[data-action="pages-csv"]').click()
            assert '/app' in Path(event.value.path()).read_text()
            page.locator('[data-action="new"]').filter(visible=True).first.click()
            expect(page.locator('[name="mode"]:checked')).to_have_value('smart')
            page.get_by_text('Saved settings profiles',exact=False).first.click()
            page.locator('#profile-name').fill('Product inspection')
            page.get_by_text('Custom extraction',exact=False).first.click()
            page.locator('#rule-add').click()
            page.locator('[data-rule="0"][data-field="name"]').fill('ProductTitle')
            page.locator('[data-rule="0"][data-field="selector"]').fill('h1')
            page.locator('#profile-save').click()
            expect(page.locator('#profile-select')).not_to_have_value('')
            with page.expect_download() as event:
                page.locator('#profile-export').click()
            profile_data=json.loads(Path(event.value.path()).read_text())
            assert profile_data[0]['rules'][0]['selector']=='h1'
            assert 'url' not in profile_data[0]['settings']
            page.locator('#profile-name').fill('Renamed profile')
            page.locator('#profile-save').click()
            expect(page.locator('#profile-select option')).to_have_count(2)
            page.locator('#profile-copy').click()
            expect(page.locator('#profile-select option')).to_have_count(3)
            with page.expect_download() as event:
                page.locator('#profile-export').click()
            import_path=event.value.path()
            page.once('dialog',lambda dialog:dialog.accept())
            page.locator('#profile-delete').click()
            expect(page.locator('#profile-select option')).to_have_count(2)
            page.once('dialog',lambda dialog:dialog.accept())
            page.locator('#profile-import').set_input_files(str(import_path))
            expect(page.locator('#profile-select option')).to_have_count(3)
            page.screenshot(path=str(DOCS/'hybrid-setup.png'),full_page=True)
            page.get_by_role('button',name='Close new crawl',exact=True).click()
            page.get_by_role('button',name='Switch to dark mode').click()
            page.get_by_role('tab',name='JavaScript',exact=True).click()
            page.screenshot(path=str(DOCS/'hybrid-dark.png'),full_page=True)
            page.get_by_role('button',name='Switch to light mode').click()
            for width,height in [(1280,800),(900,900),(390,844)]:
                page.set_viewport_size({'width':width,'height':height})
                page.wait_for_timeout(100)
                assert page.evaluate('()=>document.documentElement.scrollWidth<=innerWidth'),f'Overflow at {width}'
                if width==390:
                    page.screenshot(path=str(DOCS/'hybrid-mobile.png'),full_page=True)
                    page.locator('.mobile-new').click()
                    assert page.locator('#crawl-dialog').evaluate('(el)=>el.scrollWidth<=el.clientWidth')
                    page.get_by_role('button',name='Close new crawl',exact=True).click()
            page.set_viewport_size({'width':1600,'height':1000})
            page.reload(wait_until='networkidle')
            page.locator('[data-action="new"]').filter(visible=True).first.click()
            expect(page.locator('#profile-select option')).to_have_count(3)
            page.get_by_role('button',name='Close new crawl',exact=True).click()
            assert errors==[],errors
            print(json.dumps({'result':'PASS','checks':['Smart lab','method filter','selected CSV','JS comparison','inert source diff','network waterfall','actual screenshot','structured data','resources','custom fields','sitemaps','robots','Atlas method colors','command palette','filtered page CSV','profiles, import/export/delete and rules','grouped issue filters and CSV','themes','1600/1280/900/390 viewports','reload persistence'],'browser_errors':errors},indent=2))
            browser.close()
    finally:
        server.terminate()
        try:server.wait(timeout=10)
        except subprocess.TimeoutExpired:server.kill();server.wait()
