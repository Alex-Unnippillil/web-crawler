/** Bounded source/DOM heuristics, NOT an implementation of the full accessible-name algorithm. */
import type { AccessibilitySnapshot } from '../inspection-types.js';
const text = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
const hidden = (el: Element) => !!el.closest('[hidden],[aria-hidden="true" i],template,noscript');
function contentName(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll('[hidden],[aria-hidden="true" i],script,style,template').forEach(node => node.remove());
  return text(copy.textContent) || Array.from(copy.querySelectorAll('img[alt]')).map(img => text(img.getAttribute('alt'))).filter(Boolean).join(' ');
}
function hasName(el: Element, doc: Document, content = true): boolean {
  // Explicitly referenced hidden labels are allowed; hidden descendant text is not.
  const ids = text(el.getAttribute('aria-labelledby')).split(/\s+/).slice(0, 16);
  if (ids.some(id => id && text(doc.getElementById(id)?.textContent))) return true;
  if (text(el.getAttribute('aria-label'))) return true;
  const labels = (el as HTMLInputElement).labels;
  if (labels && Array.from(labels).slice(0, 32).some(label => contentName(label))) return true;
  if (el.tagName === 'INPUT') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (['submit', 'reset'].includes(type) && (!el.hasAttribute('value') || text(el.getAttribute('value')))) return true;
    if (type === 'button' && text(el.getAttribute('value'))) return true;
    if (type === 'image' && text(el.getAttribute('alt'))) return true;
  }
  return !!((content && contentName(el)) || text(el.getAttribute('title')));
}
export function inspectAccessibility(doc: Document, budget = 5000): AccessibilitySnapshot {
  const result: AccessibilitySnapshot = { version: 1, language: text(doc.documentElement.getAttribute('lang')).slice(0, 80),
    h1_count: 0, images: 0, images_missing_alt: 0, controls: 0, controls_without_name: 0,
    links: 0, links_without_name: 0, buttons: 0, buttons_without_name: 0, inspected_elements: 0, truncated: false };
  const limit = Math.max(1, Math.min(5000, Number.isFinite(budget) ? Math.floor(budget) : 5000));
  const walker = doc.createTreeWalker(doc.documentElement, 1 /* SHOW_ELEMENT */);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (result.inspected_elements >= limit) { result.truncated = true; break; }
    result.inspected_elements++;
    const el = node as Element;
    if (hidden(el)) continue;
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (el.tagName === 'H1') result.h1_count++;
    if (el.tagName === 'IMG') { result.images++; if (!el.hasAttribute('alt')) result.images_missing_alt++; }
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) && !(el.tagName === 'INPUT' && ['hidden', 'button', 'submit', 'reset', 'image'].includes(type))) {
      result.controls++; if (!hasName(el, doc, false)) result.controls_without_name++;
    }
    if (el.tagName === 'A' && el.hasAttribute('href')) { result.links++; if (!hasName(el, doc)) result.links_without_name++; }
    if (el.tagName === 'BUTTON' || (el.tagName === 'INPUT' && ['button', 'submit', 'reset', 'image'].includes(type))) {
      result.buttons++; if (!hasName(el, doc)) result.buttons_without_name++;
    }
  }
  return result;
}
