import { expect, test } from 'vitest';
import { extractPageData, extractPageDetails } from './extract.js';
import { runCrawl } from './engine.js';
test('reject schemes/credentials and deduplicate fragments', () => {
  const html = '<a href="#x">x</a><a href="javascript:alert(1)">bad</a><a href="mailto:a@b.com">mail</a><a href="https://u:p@e.com">bad</a><a href="/ok#x">ok</a><a href="/ok#y">duplicate</a>';
  expect(extractPageData(html, 'https://e.com/').outgoing_links).toEqual(['https://e.com/ok']);
});
test('document base URL is respected', () => {
  const data = extractPageData('<base href="/assets/"><a href="page">a</a><img src="logo.png">', 'https://e.com/root/');
  expect(data.outgoing_links).toEqual(['https://e.com/assets/page']); expect(data.image_urls).toEqual(['https://e.com/assets/logo.png']);
});
test('whitespace and entities', () => {
  const data = extractPageData('<h1>A &amp; B</h1><main><p> Hello\n    world </p></main>', 'https://e.com/');
  expect(data.heading).toBe('A & B'); expect(data.first_paragraph).toBe('Hello world');
});
test('remote scripts never run', () => {
  expect(extractPageData('<h1>safe</h1><script>document.querySelector("h1").textContent="unsafe"</script>', 'https://e.com/').heading).toBe('safe');
});
test('empty document', () => {
  expect(extractPageData('', 'https://e.com/')).toEqual({ url: 'https://e.com/', heading: '', first_paragraph: '', outgoing_links: [], image_urls: [] });
});
test('metadata and canonical URL', () => {
  const data = extractPageDetails('<title>A</title><meta name="description" content="B"><link rel="canonical" href="/main">', 'https://e.com/');
  expect(data.title).toBe('A'); expect(data.description).toBe('B'); expect(data.canonical_url).toBe('https://e.com/main');
});
test('default parser pipeline with mocked HTTP', async () => {
  const result = await runCrawl('https://fixture.invalid/', { delayMs: 0, retries: 0, respectRobots: false }, {
    fetchImpl: async input => new Response(input === 'https://fixture.invalid/' ? '<h1>Home</h1><a href="/one">One</a>' : '<h1>One</h1>', { headers: { 'Content-Type': 'text/html' } }),
  });
  expect(result.summary.pages_crawled).toBe(2); expect(result.pages['https://fixture.invalid/one']?.heading).toBe('One');
});
