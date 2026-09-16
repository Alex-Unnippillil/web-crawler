/** Merge explicitly labelled same-origin frame/open-shadow inventories into a rendered page. */
import { extractPageDetails } from '../extract.js';
import type { PageDetails } from '../types.js';
import type { BrowserEvidence, ExtractionRule } from '../inspection-types.js';
export function renderedDetails(evidence: BrowserEvidence, url: string, rules: ExtractionRule[]): PageDetails {
  const result = extractPageDetails(evidence.rendered_html, url, rules);
  if (result.elements) result.elements.links.forEach(link => { link.discovery = 'rendered'; });
  for (const [i, context] of evidence.contexts.entries()) {
    const data = extractPageDetails(context.html, context.url, rules), label = `${context.kind} ${i + 1} · ${context.url}`;
    if (!result.elements || !data.elements) continue;
    for (const image of data.elements.images) result.elements.images.push({ ...image, context: label });
    for (const link of data.elements.links) result.elements.links.push({ ...link, context: label, discovery: 'rendered' });
    for (const resource of data.elements.resources) result.elements.resources.push({ ...resource, context: label });
    result.elements.headings.push(...data.elements.headings); result.elements.forms.push(...data.elements.forms);
    result.image_urls.push(...data.image_urls); result.outgoing_links.push(...data.outgoing_links);
    if (result.inspection && data.inspection) {
      result.inspection.word_count += data.inspection.word_count;
      result.inspection.structured_data.push(...data.inspection.structured_data.map(row => ({ ...row, context: label })));
      for (const [name, values] of Object.entries(data.inspection.custom)) result.inspection.custom[name] = [...(result.inspection.custom[name] ?? []), ...values].slice(0, 30);
    }
  }
  result.image_urls = [...new Set(result.image_urls)].slice(0, 2000);
  result.outgoing_links = [...new Set(result.outgoing_links)].slice(0, 2000);
  if (result.elements) for (const key of ['images', 'links', 'resources', 'headings', 'forms'] as const) {
    if (result.elements[key].length > 500) result.elements.truncated = true;
    result.elements[key].splice(500);
  }
  if (result.inspection) result.inspection.structured_data.splice(60);
  for (const image of result.elements?.images ?? []) {
    const dimensions = evidence.image_dimensions?.find(d => image.candidates.includes(d.url));
    if (dimensions) { image.rendered_width = dimensions.width; image.rendered_height = dimensions.height; }
  }
  return result;
}
