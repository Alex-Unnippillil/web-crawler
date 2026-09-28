from pathlib import Path

def edit(path, old, new):
    p = Path(path); s = p.read_text()
    assert s.count(old) == 1, (path, old[:70], s.count(old))
    p.write_text(s.replace(old, new))

edit('ui/observatory.ts', '<div class="obs-htrack"><i class="obs-tone-${i % 4}" style="width:${b.count / max * 100}%"></i></div>', '<svg class="obs-htrack" viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true"><rect class="obs-tone-${i % 4}" width="${b.count / max * 100}" height="14"/></svg>')
edit('ui/observatory.ts', '<div class="obs-vtrack"><i style="height:${b.count / max * 100}%"></i></div>', '<svg class="obs-vtrack" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true"><rect class="obs-tone-0" x="0" y="${150 - b.count / max * 150}" width="100" height="${b.count / max * 150}"/></svg>')
edit('ui/observatory.ts', '<div class="obs-htrack obs-stack"><i class="obs-tone-0" style="width:${d.review / max * 100}%"></i><i class="obs-tone-1" style="width:${d.clear / max * 100}%"></i></div>', '<svg class="obs-htrack obs-stack" viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true"><rect class="obs-tone-0" width="${d.review / max * 100}" height="14"/><rect class="obs-tone-1" x="${d.review / max * 100}" width="${d.clear / max * 100}" height="14"/></svg>')
edit('ui/observatory.css', '.obs-htrack { background:var(--subtle); height:14px; border-radius:3px; overflow:hidden; }', '.obs-htrack { display:block; width:100%; min-width:0; background:var(--subtle); height:14px; border-radius:3px; overflow:hidden; }')
edit('ui/observatory.css', '.obs-htrack i { display:block; height:100%; min-width:0; border-radius:2px; }', '.obs-htrack rect { stroke:none; }')
edit('ui/observatory.css', '.obs-tone-0 { background:var(--green); }.obs-tone-1 { background:var(--obs-blue); }.obs-tone-2 { background:var(--obs-accent); }.obs-tone-3 { background:var(--obs-gold); }', '.obs-tone-0 { background:var(--green); fill:var(--green); }.obs-tone-1 { background:var(--obs-blue); fill:var(--obs-blue); }.obs-tone-2 { background:var(--obs-accent); fill:var(--obs-accent); }.obs-tone-3 { background:var(--obs-gold); fill:var(--obs-gold); }')
edit('ui/observatory.css', '.obs-vtrack { display:flex; align-items:flex-end;', '.obs-vtrack { display:block;')
edit('ui/observatory.css', '.obs-vtrack i { width:100%; background:var(--green); border-radius:4px 4px 0 0; }', '.obs-vtrack rect { stroke:none; }')
edit('ui/observatory.css', '.obs-stack { display:flex; }', '.obs-stack { display:block; }')
edit('ui/observatory.css', '.obs-htrack i,.obs-vtrack i { background:Highlight; forced-color-adjust:none; }.obs-stack i+ i { background:CanvasText; }', '.obs-htrack rect,.obs-vtrack rect { fill:Highlight; forced-color-adjust:none; }.obs-stack rect+rect { fill:CanvasText; }')

edit('tests/observatory_e2e.py', "            page.goto(url, wait_until='networkidle')", "            violations = []\n            page.on('console', lambda message: violations.append(message.text) if 'Content Security Policy' in message.text and 'observatory' in message.text else None)\n            page.goto(url, wait_until='networkidle')")
edit('tests/observatory_e2e.py', "            assert page.locator('.obs-radar').get_attribute('aria-labelledby')", '''            assert page.locator('.obs-radar').get_attribute('aria-labelledby')
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
            assert not violations, violations''')
edit('tests/observatory_e2e.py', "            # Capture real light, dark, chart-only, and mobile views.", "            # Let transient export notifications disappear before documenting the UI.\n            expect(page.locator('#toast')).not_to_be_visible(timeout=10000)\n            # Capture real light, dark, chart-only, and mobile views.")
# Focused test documentation includes the interaction regression suite.
p = Path('docs/OBSERVATORY.md'); text = p.read_text(); text = text.replace('node --test tests/observatory-model.test.mjs tests/observatory-extraction.test.mjs', 'node --test tests/observatory-model.test.mjs tests/observatory-extraction.test.mjs tests/observatory-ui.test.mjs'); p.write_text(text)

p=Path('tests/observatory-ui.test.mjs')
p.write_text(p.read_text()+'''\ntest('chart geometry uses SVG attributes compatible with the strict style policy', () => fixture(({root,view}) => {
  const capture=job();capture.result.pages['https://fixture.example/a'].status_code=200;capture.result.pages['https://fixture.example/a'].duration_ms=400;
  view.render(root,capture);
  assert.equal(root.querySelectorAll('#obs-charts [style]').length,0);
  const bars=Array.from(root.querySelectorAll('.obs-hbars rect'));
  assert.equal(Number(bars[0].getAttribute('width')),100);
  assert.equal(Number(bars[1].getAttribute('width')),0);
  assert.equal(root.querySelectorAll('.obs-histogram rect').length,5);
}));\n''')

edit('tests/observatory_e2e.py', '''            # Zoom/reflow, browser reduced motion and forced colors remain operable.
            page.set_viewport_size({'width':1440,'height':1000})
            page.evaluate("document.documentElement.style.zoom='2'")
            no_overflow(page)
            page.evaluate("document.documentElement.style.zoom='1'")''', '''            # A 720 CSS-pixel viewport models 200% desktop zoom's layout width.
            # Root CSS zoom is not browser zoom: it does not update viewport media queries.
            # Native browser zoom / assistive-technology review remains a manual check.
            page.set_viewport_size({'width':720,'height':500})
            no_overflow(page)
            page.set_viewport_size({'width':1440,'height':1000})''')
