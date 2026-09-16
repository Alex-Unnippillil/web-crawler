/** Regression coverage for static element inventories, privacy and resource boundaries. */
import { describe, expect, it } from 'vitest';
import { extractPageDetails } from './extract.js';
import { srcsetURLs } from './elements.js';
const parse = (html: string) => extractPageDetails(html, 'https://site.example/docs/').elements!;
describe('element inventory', () => {
  it('records all heading levels in DOM order', () => {
    expect(parse('<h1> One </h1><h3 id="part">A  part</h3><h6>Footnote</h6>').headings).toEqual([
      { level: 1, text: 'One', id: '' }, { level: 3, text: 'A part', id: 'part' }, { level: 6, text: 'Footnote', id: '' }]);
  });
  it('distinguishes missing and explicitly decorative alt text', () => {
    const images = parse('<img src="a.png"><img src="b.png" alt=""><img data-src="c.webp" alt="A cat" width="600" height="400">').images;
    expect(images.map(i => i.alt)).toEqual([null, '', 'A cat']);
    expect(images[2]).toMatchObject({ src: 'https://site.example/docs/c.webp', width: 600, height: 400 });
  });
  it('collects picture and srcset candidates without loading them', () => {
    const el = parse('<picture><source srcset="/a.avif 1x, /b.avif 2x"><img src="/c.png" srcset="/d.png 300w, /e.png 900w"></picture>');
    expect(el.images[0]!.candidates).toHaveLength(5);
    expect(srcsetURLs('data:image/png;base64,AAAA 1x, /real.png 2x')).toEqual(['/real.png']);
  });
  it('respects base URLs and ignores unsafe attributes', () => {
    const el = parse('<base href="/assets/"><img src="javascript:alert(1)"><img src="https://user:pass@site.example/x"><a href="one">One</a>');
    expect(el.images).toEqual([]); expect(el.links[0]!.url).toBe('https://site.example/assets/one');
  });
  it('catalogs scripts, styles, frames, media and linked documents', () => {
    const el = parse('<script src="/app.js"></script><link rel="stylesheet" href="/main.css"><iframe src="/frame"></iframe><video src="/clip.mp4" poster="/still.png"></video><audio><source src="/clip.ogg"></audio><a href="/doc.pdf">PDF</a>');
    expect(el.resources.map(r => r.kind)).toEqual(['script','stylesheet','frame','video','poster','audio','document']);
  });
  it('does not capture form values or inline scripts', () => {
    const el = parse('<form action="/submit" method="post"><input name="password" type="password" value="SECRET"><textarea>PRIVATE</textarea></form><script>SECRET</script>');
    expect(el.forms[0]!.method).toBe('POST'); expect(JSON.stringify(el)).not.toContain('SECRET'); expect(JSON.stringify(el)).not.toContain('PRIVATE');
  });
  it('bounds retained elements and reports truncation', () => {
    const el = parse('<h2>Heading</h2>'.repeat(510)); expect(el.headings).toHaveLength(500); expect(el.truncated).toBe(true);
  });
  it('exports lazy image URLs while retaining original fields', () => {
    const page = extractPageDetails('<img data-src="/lazy.png"><h1>Test</h1>', 'https://site.example/');
    expect(page.image_urls).toEqual(['https://site.example/lazy.png']); expect(page.heading).toBe('Test');
  });
});
