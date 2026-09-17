"""Real GUI owner-access and glass-layout acceptance; all remote responses are explicit test fixtures."""
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
SECRET = 'fixture-only-automation-credential'
TARGET = 'https://owner-fixture.example'
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
url = f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='crawler-glass-') as directory:
    env = {**os.environ, 'TEST_PORT': str(port), 'TEST_DATA_DIR': directory}
    server = subprocess.Popen(['node', 'tests/glass-ui-server.mjs'], cwd=ROOT, env=env)
    try:
        for _ in range(150):
            try:
                urllib.request.urlopen(url, timeout=1).close()
                break
            except OSError:
                if server.poll() is not None: raise RuntimeError('Fixture exited early')
                time.sleep(.1)
        else: raise RuntimeError('Fixture startup timeout')
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, **({'executable_path': os.environ['CHROMIUM_EXECUTABLE']} if os.environ.get('CHROMIUM_EXECUTABLE') else {}))
            page = browser.new_page(viewport={'width':1440,'height':1000}, color_scheme='light')
            errors=[]
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
            page.goto(url, wait_until='networkidle')
            # Desktop has exactly one semantic analysis tablist, not duplicate navigation.
            expect(page.locator('#workspace-navigation [role="tablist"]')).to_have_count(1)
            expect(page.locator('.result-tabs[role="tablist"]')).to_have_count(1)
            page.locator('[data-action="check-connection"]').filter(visible=True).first.click()
            page.locator('#connection-url').fill(TARGET)
            page.locator('#connection-submit').click()
            expect(page.locator('#connection-result')).to_contain_text('Site-owner access needed',timeout=15000)
            expect(page.locator('#connection-result')).to_contain_text('HTTP 429')
            expect(page.locator('#connection-result')).to_contain_text('1 request(s)')
            expect(page.locator('#connection-result')).to_contain_text('Not requested')
            page.screenshot(path=str(ROOT/'docs/glass-connection.png'),full_page=True)
            page.get_by_role('button',name='Close connection check',exact=True).click()
            # An actual crawl exposes the reason instead of generic stopped/0 dashboards.
            page.locator('[data-action="new"]').filter(visible=True).first.click()
            page.locator('#url-input').fill(TARGET)
            page.get_by_role('radio',name='Fast HTTP',exact=False).check()
            page.locator('#start-button').click()
            expect(page.locator('#crawl-status')).to_have_text('Access needed',timeout=15000)
            expect(page.locator('#connection-action-card')).to_contain_text('Vercel')
            expect(page.locator('#crawl-telemetry')).to_be_hidden()
            expect(page.locator('#job-notice')).to_be_hidden()
            expect(page.locator('#toast')).to_be_hidden(timeout=8000)
            page.screenshot(path=str(ROOT/'docs/glass-access-needed.png'),full_page=True)
            page.locator('[data-action="owner-access"]').filter(visible=True).first.click()
            page.locator('#owner-origin').fill(TARGET)
            page.locator('#owner-token').fill(SECRET)
            page.locator('#owner-confirm').check()
            page.locator('#owner-save').click()
            expect(page.locator('#owner-state')).to_contain_text('Active for',timeout=10000)
            expect(page.locator('#owner-token')).to_have_value('')
            assert SECRET not in page.locator('body').inner_text()
            page.get_by_role('button',name='Close owner access',exact=True).click()
            page.locator('[data-action="check-connection"]').filter(visible=True).first.click()
            page.locator('#connection-url').fill(TARGET)
            page.locator('#connection-submit').click()
            expect(page.locator('#connection-result')).to_contain_text('Ready to crawl',timeout=15000)
            expect(page.locator('#connection-result')).to_contain_text('2 request(s)')
            page.get_by_role('button',name='Close connection check',exact=True).click()
            page.locator('[data-action="new"]').filter(visible=True).first.click()
            page.locator('#url-input').fill(TARGET)
            page.get_by_role('radio',name='Full Browser',exact=False).check()
            page.locator('#start-button').click()
            expect(page.locator('#crawl-status')).to_have_text('Completed',timeout=45000)
            expect(page.locator('.page-link')).to_have_count(2)
            expect(page.locator('#result-content')).to_contain_text('Authorized JavaScript site')
            expect(page.locator('#result-content')).to_contain_text('BROWSER')
            expect(page.locator('#toast')).to_be_hidden(timeout=8000)
            page.screenshot(path=str(ROOT/'docs/glass-workspace.png'),full_page=True)
            with page.expect_download() as event:
                page.locator('[data-action="pages-csv"]').click()
            text = Path(event.value.path()).read_text()
            assert 'owner-fixture.example' in text and SECRET not in text
            page.locator('.page-link').first.click()
            page.locator('#inspect-tab-source').click()
            expect(page.locator('.source-columns')).to_contain_text('app.js',timeout=10000)
            assert SECRET not in page.locator('#detail-content').inner_text()
            page.get_by_role('button',name='Close page details',exact=True).click()
            # At every width, move the existing navigation rather than cloning it.
            for width in [1440,1100,900,390]:
                page.set_viewport_size({'width':width,'height':1000})
                expect(page.locator('.result-tabs[role="tablist"]')).to_have_count(1)
                expect(page.locator('#tab-pages')).to_be_visible()
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), width
                if width == 390: page.screenshot(path=str(ROOT/'docs/glass-mobile.png'),full_page=True)
            page.set_viewport_size({'width':1440,'height':1000})
            page.locator('[data-action="glass"]').click()
            assert page.locator('html').get_attribute('data-transparency') == 'reduce'
            assert page.locator('.sidebar').evaluate('(e)=>getComputedStyle(e).backdropFilter') == 'none'
            page.locator('[data-action="theme"]').filter(visible=True).first.click()
            page.screenshot(path=str(ROOT/'docs/glass-dark.png'),full_page=True)
            assert SECRET not in page.evaluate('JSON.stringify({...localStorage})')
            page.locator('[data-action="owner-access"]').filter(visible=True).first.click()
            page.locator('#owner-clear').click()
            expect(page.locator('#owner-state')).to_contain_text('No owner credential')
            page.get_by_role('button',name='Close owner access',exact=True).click()
            page.reload(wait_until='networkidle')
            expect(page.locator('#crawl-status')).to_have_text('Completed',timeout=10000)
            assert not errors, errors
            browser.close()
        for path in Path(directory).rglob('*.json'):
            assert SECRET not in path.read_text(), str(path)
        print(json.dumps({'result':'PASS','fixture':'owner-fixture.example (controlled responses, not a live public site)', 'browser_errors':errors,'checks':['checkpoint diagnostic','blocked run status','owner-issued credential','HTTP authentication','real Chromium authenticated JS extraction','scoped export','no saved secret','one tablist','four widths','reduced transparency','dark theme','history reload']}))
    finally:
        server.terminate()
        try: server.wait(timeout=15)
        except subprocess.TimeoutExpired: server.kill();server.wait()
