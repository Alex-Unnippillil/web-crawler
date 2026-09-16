// Repository note: Extracts page metadata, links, images, and other crawl records from HTML.
// Extracts normalized metadata, links, images, and page text from fetched HTML documents.

import { JSDOM, VirtualConsole } from 'jsdom';
import { inspectDocument } from './extract/inspection.js';
import type { ExtractionRule } from './inspection-types.js';
import { extractElements } from './elements.js';
import { safeHTTP } from './url.js';
import type { ExtractedPageData, PageDetails } from './types.js';

function text(element: Element | null): string {
  return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}
// One inert parser realm avoids allocating a Window and browsing context for every
// response. DOMParser creates a fresh detached Document, so elements and selectors
// never share page state. Scripts/resources remain disabled in the owning JSDOM.
const parserRealm = new JSDOM('', { virtualConsole: new VirtualConsole() });
const parser = new parserRealm.window.DOMParser();
function withDocument<T>(html: string, _url: string, read: (doc: Document) => T): T {
  const doc = parser.parseFromString(html, 'text/html');
  try { return read(doc); } finally { doc.replaceChildren(); }
}
function urls(doc: Document, selector: string, attribute: string, baseURL: string): string[] {
  const effectiveBase = safeHTTP(doc.querySelector('base[href]')?.getAttribute('href') ?? '', baseURL) ?? baseURL;
  const found = new Set<string>();
  for (const element of doc.querySelectorAll(selector)) {
    const value = element.getAttribute(attribute)?.trim();
    if (!value || (attribute === 'href' && value.startsWith('#'))) continue;
    const url = safeHTTP(value, effectiveBase);
    if (url) found.add(url);
  }
  return [...found];
}
function extract(doc: Document, pageURL: string): ExtractedPageData {
  return {
    url: pageURL,
    heading: text(doc.querySelector('h1') ?? doc.querySelector('h2')),
    first_paragraph: text(doc.querySelector('main p') ?? doc.querySelector('p')),
    outgoing_links: urls(doc, 'a[href]', 'href', pageURL),
    image_urls: urls(doc, 'img[src]', 'src', pageURL),
  };
}
export function getHeadingFromHTML(html: string): string {
  return withDocument(html, 'https://example.invalid/', doc => text(doc.querySelector('h1') ?? doc.querySelector('h2')));
}
export function getFirstParagraphFromHTML(html: string): string {
  return withDocument(html, 'https://example.invalid/', doc => text(doc.querySelector('main p') ?? doc.querySelector('p')));
}
export function getURLsFromHTML(html: string, baseURL: string): string[] {
  return withDocument(html, baseURL, doc => urls(doc, 'a[href]', 'href', baseURL));
}
export function getImagesFromHTML(html: string, baseURL: string): string[] {
  return withDocument(html, baseURL, doc => urls(doc, 'img[src]', 'src', baseURL));
}
export function extractPageData(html: string, pageURL: string): ExtractedPageData {
  return withDocument(html, pageURL, doc => extract(doc, pageURL));
}
export function extractPageDetails(html: string, pageURL: string, rules: ExtractionRule[] = []): PageDetails {
  // Parse once in an inert, detached Document; resolve every URL against this page explicitly.
  return withDocument(html, pageURL, doc => {
    const elements = extractElements(doc, pageURL);
    return {
    ...extract(doc, pageURL),
    elements,
    inspection: inspectDocument(doc, pageURL, rules),
    outgoing_links: [...new Set(elements.links.map(link => link.url))],
    image_urls: [...new Set(elements.images.flatMap(image => image.candidates))],
    title: text(doc.querySelector('title')),
    description: doc.querySelector('meta[name="description" i]')?.getAttribute('content')?.trim() ?? '',
    canonical_url: doc.querySelector('link[rel~="canonical" i]')?.hasAttribute('href')
      ? safeHTTP(doc.querySelector('link[rel~="canonical" i]')!.getAttribute('href')!, safeHTTP(doc.querySelector('base[href]')?.getAttribute('href') ?? '', pageURL) ?? pageURL) ?? '' : '',
  }; });
}
