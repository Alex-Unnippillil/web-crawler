/** Small end-user interaction helpers, kept independent of crawler and API policy. */
export const sectionDetails: Record<string, [string, string]> = {
  overview: ['Overview', 'Patterns, coverage, and findings across this crawl.'],
  pages: ['Pages', 'Find a page, select a set, or open its captured details.'],
  issues: ['Issues', 'Review evidence and trace each finding to its source.'],
  links: ['Links', 'Explore where links lead and which pages reference them.'],
  graph: ['Visual Atlas', 'Follow observed connections through an interactive spiderweb.'],
  paths: ['URL paths', 'Explore the directory structure of discovered URLs.'],
  elements: ['Images & elements', 'Browse images, headings, resources, and form structures.'],
  javascript: ['JavaScript', 'See what changed between source HTML and the rendered page.'],
  resources: ['Resources', 'Inspect declared assets and observed browser requests.'],
  structured: ['Structured data', 'Explore parsed objects, types, and validation evidence.'],
  sitemaps: ['Sitemaps', 'Compare sitemap discovery with the pages actually captured.'],
  robots: ['Robots', 'Understand the policy applied to this crawl.'],
  custom: ['Custom fields', 'Inspect the results of your named extraction rules.'],
  activity: ['Activity', 'Follow requests, rendering decisions, exclusions, and retries.'],
};
/** Capture focus and local scroll before replacing a live result set. */
export function preserveResultPosition(target: HTMLElement): () => void {
  const active = document.activeElement as HTMLElement | null;
  const within = !!active && target.contains(active);
  const select = active?.dataset.selectUrl;
  const page = active?.dataset.page;
  const sort = active?.dataset.pageSort;
  const id = active?.id;
  const scroller = target.querySelector('.table-scroll');
  const left = scroller?.scrollLeft ?? 0;
  const top = scroller?.scrollTop ?? 0;
  const scrollFocused = active === scroller;
  return () => {
    const scroll = target.querySelector<HTMLElement>('.table-scroll'); if (scroll) { scroll.scrollLeft = left; scroll.scrollTop = top; }
    if (scrollFocused) scroll?.focus({preventScroll:true});
    if (!within) return;
    const selector = id ? `#${CSS.escape(id)}` : select ? `[data-select-url="${CSS.escape(select)}"]` : sort ? `[data-page-sort="${CSS.escape(sort)}"]` : page ? `[data-page="${CSS.escape(page)}"]` : '';
    if (selector) target.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
  };
}
export function normalizeWebsite(value: string): string {
  const text = value.trim(); if (!text) throw new Error('Enter a website address to continue.');
  let url: URL;
  try { url = new URL(/^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`); }
  catch { throw new Error('Enter a valid website address, such as example.com or https://example.com/docs.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP or HTTPS website address without a username or password.');
  url.hash = ''; return url.href;
}
/** Pure summary: only configuration is used, never credentials or page content. */
export function describePlan(mode: string, limit: number, duration: number): string {
  const method = mode === 'http' ? 'Source HTML only. No browser will start.' : mode === 'browser' ? 'Chromium renders every eligible HTML page.' : 'HTTP first. Chromium renders pages when needed.';
  return `${method} Up to ${Number.isFinite(limit) && limit > 0 ? limit : '—'} candidate URLs, within ${Number.isFinite(duration) && duration > 0 ? duration : '—'} minutes. Results stay on this computer.`;
}
