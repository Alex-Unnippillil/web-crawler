/** Compare extracted facts, not executable HTML. The percentage is a word-count estimate. */
import type { PageDetails } from '../types.js';
import type { JavascriptComparison } from '../inspection-types.js';
export function compareRendering(raw: PageDetails, rendered: PageDetails): JavascriptComparison {
  const rawWords = raw.inspection?.word_count ?? 0, renderedWords = rendered.inspection?.word_count ?? 0;
  const difference = (left: string[], right: string[]) => { const previous = new Set(right); return [...new Set(left)].filter(v => !previous.has(v)).slice(0, 2000); };
  const values = (p: PageDetails): Record<string, string> => ({ title: p.title ?? '', description: p.description ?? '', canonical: p.canonical_url ?? '', H1: (p.elements?.headings.filter(h => h.level === 1).map(h => h.text) ?? [p.heading]).join(' | '), robots: p.elements?.robots ?? '' });
  const before = values(raw), after = values(rendered);
  return { raw_words: rawWords, rendered_words: renderedWords, word_delta: renderedWords - rawWords,
    added_text_percent: renderedWords ? Math.round(Math.max(0, renderedWords - rawWords) / renderedWords * 100) : 0,
    raw_links: raw.outgoing_links.length, rendered_links: rendered.outgoing_links.length,
    added_links: difference(rendered.outgoing_links, raw.outgoing_links), removed_links: difference(raw.outgoing_links, rendered.outgoing_links),
    added_images: difference(rendered.image_urls, raw.image_urls), removed_images: difference(raw.image_urls, rendered.image_urls),
    metadata_changes: Object.keys(before).filter(field => before[field] !== after[field]).map(field => ({ field, raw: before[field]!, rendered: after[field]! })),
    raw_structured: raw.inspection?.structured_data.length ?? 0, rendered_structured: rendered.inspection?.structured_data.length ?? 0 };
}
