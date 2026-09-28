from pathlib import Path

# Let long labels and enlarged text wrap without shrinking controls over descriptions.
p = Path('ui/observatory.css')
p.write_text(p.read_text() + '''\n/* Settings remain readable with enlarged text and narrow windows. */
.setting-row { flex-wrap:wrap; align-items:flex-start; gap:14px 18px; }
.setting-row>div { flex:1 1 220px; min-width:0; }
.setting-row>.button { flex-shrink:0; min-width:0; max-width:100%; white-space:normal; overflow-wrap:anywhere; }
.setting-row>.button>span { min-width:0; }
''')

p = Path('tests/observatory_e2e.py')
s = p.read_text()
old = "            settings(page)\n            page.screenshot(path=str(DOCS/'observatory-accessibility.png'))"
new = '''            settings(page)
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
            page.screenshot(path=str(DOCS/'observatory-accessibility.png'))'''
assert s.count(old)==1
s = s.replace(old,new)
s = s.replace("'persistent preferences','reflow'", "'persistent preferences','enlarged settings layout','reflow'")
p.write_text(s)

p=Path('docs/OBSERVATORY.md')
s=p.read_text().replace('the 2 MiB capture ceiling', 'the 2,097,152-code-unit text ceiling (a JavaScript string limit, not a byte limit)')
s=s.replace('responsive widths, zoom/reflow, reduced motion', 'responsive widths down to 320 pixels, a 720-CSS-pixel zoom-equivalent layout, enlarged settings without overlapping controls, reduced motion')
s += '''\n### Rendering and interaction safeguards\n\nBar dimensions use SVG geometry attributes, not inline style strings, and work under the existing strict Content Security Policy. Browser acceptance checks compare displayed bar proportions with source counts. Chart tables expose the same values without relying on color. Live result refreshes retain chart-disclosure state and focus on page/finding controls; changing the selected capture resets both stored and visible filters. Distinct incoming-link counts resolve captured requested-URL aliases to their final destination and count each source page once.\n\nNative browser zoom and screen-reader testing with assistive technology remain manual acceptance checks. A reduced CSS viewport is a layout test, not proof of a complete zoom or WCAG conformance audit.\n'''
p.write_text(s)
