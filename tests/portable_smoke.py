# Repository note: Smoke-tests extracted portable distributions using their bundled runtime and launchers.
# Smoke-tests an extracted portable release using the runtime and launchers shipped to end users.

"""Exercise an extracted portable release with its own Node runtime, not system npm."""
import argparse
import json
import os
from pathlib import Path
import re
import signal
import socket
import subprocess
import tempfile
import time
import urllib.request
from urllib.parse import quote
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('archive', type=Path)
args = parser.parse_args()
with tempfile.TemporaryDirectory(prefix='crawler-portable-') as temporary:
    directory = Path(temporary)
    with zipfile.ZipFile(args.archive) as archive:
        for member in archive.infolist():
            path = Path(member.filename)
            if path.is_absolute() or '..' in path.parts:
                raise RuntimeError('Invalid archive path')
        archive.extractall(directory)
    roots = list(directory.glob('Web-Crawler-Studio-*'))
    assert len(roots) == 1, 'Expected one application folder'
    root = roots[0]
    runtime = root / 'runtime' / ('node.exe' if os.name == 'nt' else 'node')
    runtime.chmod(runtime.stat().st_mode | 0o100)
    with socket.socket() as socket_:
        socket_.bind(('127.0.0.1', 0))
        port = socket_.getsockname()[1]
    url = f'http://127.0.0.1:{port}'
    flags = {'creationflags': subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == 'nt' else {'start_new_session': True}
    process = subprocess.Popen([str(runtime), 'scripts/launch.mjs', '--no-open', f'--port={port}'],
                               cwd=root, env={**os.environ, 'CRAWLER_DATA_DIR': str(directory / 'history')}, **flags)
    try:
        for attempt in range(150):
            try:
                with urllib.request.urlopen(url, timeout=1) as response:
                    html = response.read().decode()
                break
            except OSError:
                if process.poll() is not None:
                    raise RuntimeError('Portable launcher exited before startup')
                time.sleep(0.1)
        else:
            raise RuntimeError('Portable launcher did not start')
        token = re.search(r'name="session-token" content="([a-f0-9]+)"', html).group(1)
        def api(path, method='GET', data=None):
            body = None if data is None else json.dumps(data).encode()
            request = urllib.request.Request(url + path, data=body, method=method,
                       headers={'X-Crawler-Token': token, 'Content-Type': 'application/json'})
            with urllib.request.urlopen(request, timeout=10) as response:
                return response.read()
        # Compare the running app with both manifests, not a fixed release number.
        expected = json.loads((Path(__file__).resolve().parents[1] / 'package.json').read_text())['version']
        bundled = json.loads((root / 'package.json').read_text())['version']
        assert bundled == expected, f'Archive {bundled} differs from source {expected}'
        assert json.loads(api('/api/state'))['version'] == bundled
        assert not json.loads(api('/api/access'))['configured']
        assert 'id="owner-dialog"' in html and 'id="connection-dialog"' in html
        assert all(f'id="{name}"' in html for name in ['quick-start','settings-dialog','page-columns','page-selection'])
        # Optional browser installation must use the bundled CLI, not globally installed npm.
        assert (root / 'Install Browser.cmd').is_file() and (root / 'install-browser.sh').is_file()
        cli_version = subprocess.check_output([str(runtime), 'node_modules/playwright/cli.js', '--version'], cwd=root, text=True)
        assert cli_version.startswith('Version '), cli_version
        browser_state = json.loads(api('/api/browser'))
        assert isinstance(browser_state['installed'], bool), browser_state
        for asset in ('/app.js', '/styles.css', '/favicon.svg', '/atlas.js',
                      '/atlas-model.js', '/atlas-graph.js', '/atlas-elements.js',
                      '/atlas-shared.js', '/atlas.css', '/inspector.js', '/profiles.js',
                      '/source-diff.js', '/telemetry.js', '/workbench-model.js',
                      '/workbench.js', '/workbench.css', '/connection.js', '/glass.css',
                      '/interaction.js', '/page-grid.js', '/interaction.css'):
            with urllib.request.urlopen(url + asset, timeout=10) as response:
                assert response.status == 200 and response.read()
        job = json.loads(api('/api/jobs', 'POST', {'demo': True}))
        for attempt in range(200):
            saved = json.loads(api('/api/jobs/' + job['id']))
            if saved['status'] in ('completed', 'failed', 'stopped'):
                break
            time.sleep(0.1)
        assert saved['status'] == 'completed', saved['status']
        assert saved['pages'] == 10 and saved['failures'] == 1
        records = json.loads(api('/api/jobs/' + job['id'] + '/export?format=json'))
        assert len(records) == 10 and 'first_paragraph' in records[0]
        assert b'Fieldnotes' in api('/api/jobs/' + job['id'] + '/export?format=csv')
        # The portable build must also contain the richer fixture, extractor and preview service.
        atlas = json.loads(api('/api/jobs', 'POST', {'demo': True, 'atlas': True}))
        for attempt in range(300):
            visual = json.loads(api('/api/jobs/' + atlas['id']))
            if visual['status'] in ('completed', 'failed', 'stopped'):
                break
            time.sleep(0.1)
        assert visual['status'] == 'completed', visual['status']
        assert visual['pages'] == 37
        pages = json.loads(api('/api/jobs/' + atlas['id'] + '/export?format=json'))
        assert len(pages) == 37
        for category in ('images', 'links', 'headings', 'resources', 'forms'):
            assert any(page.get('elements', {}).get(category) for page in pages), category
        image_urls = {image['src'] for page in pages for image in page['elements']['images']}
        assert len(image_urls) == 8
        for image_url in sorted(image_urls):
            image = api('/api/jobs/' + atlas['id'] + '/image?url=' + quote(image_url, safe=''))
            assert image.startswith(b'\x89PNG\r\n\x1a\n')
        print(json.dumps({'result': 'PASS', 'platform': os.name, 'archive': args.archive.name,
                          'version': bundled, 'pages': saved['pages'], 'atlas_pages': visual['pages'],
                          'images': len(image_urls), 'checks': ['bundled runtime', 'launcher',
                          'version manifests', 'all UI modules', 'real parser demo', 'exports',
                          'visual fixture', 'element catalogs', 'raster previews']}))
    finally:
        if os.name == 'nt':
            subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], check=False)
        else:
            os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
