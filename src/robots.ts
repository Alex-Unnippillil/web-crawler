// Repository note: Parses and evaluates robots.txt rules for crawler access decisions.
// Parses robots.txt rules and evaluates whether crawler requests are permitted.

interface Rule { allow: boolean; length: number; pattern: string; end: boolean }
interface Group { agents: string[]; rules: Rule[]; delay: number }
/** Decode unreserved ASCII octets; preserve reserved/non-ASCII octets for URI matching. */
function octets(value: string): string {
  return encodeURI(value).replace(/%25([0-9a-f]{2})/gi, '%$1').replace(/%([0-9a-f]{2})/gi, (_, hex: string) => {
    const ch = String.fromCharCode(parseInt(hex, 16));
    return /^[A-Za-z0-9._~-]$/.test(ch) ? ch : `%${hex.toUpperCase()}`;
  });
}
/** Greedy wildcard matching: no dynamically constructed regular expressions. */
function matches(pattern: string, path: string, end: boolean): boolean {
  let i = 0, j = 0, star = -1, retry = 0;
  while (i < path.length) {
    if (j === pattern.length && !end) return true;
    if (pattern[j] === '*') { star = j++; retry = i; }
    else if (j < pattern.length && pattern[j] === path[i]) { j++; i++; }
    else if (star !== -1) { j = star + 1; i = ++retry; }
    else return false;
  }
  while (pattern[j] === '*') j++;
  return j === pattern.length;
}
export interface RobotsPolicy { allows(url: string): boolean; delayMs: number }
export function parseRobots(body: string, userAgent: string): RobotsPolicy {
  const groups: Group[] = [];
  let group: Group | undefined;
  let hasDirectives = false;
  for (const raw of body.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.split('#', 1)[0]!.trim();
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'user-agent') {
      if (!group || hasDirectives) {
        group = { agents: [], rules: [], delay: 0 }; groups.push(group); hasDirectives = false;
      }
      group.agents.push(value.toLowerCase());
    } else if (group) {
      hasDirectives = true;
      if (key === 'crawl-delay' && /^\d+(\.\d+)?$/.test(value)) group.delay = Math.max(group.delay, Number(value) * 1000);
      if ((key === 'allow' || key === 'disallow') && value.startsWith('/')) {
        const normalized = octets(value);
        const end = normalized.endsWith('$');
        if (normalized.length > 4096) throw new Error('robots.txt rule exceeds the supported length; refusing to ignore it.');
        const pattern = end ? normalized.slice(0, -1) : normalized;
        const length = pattern.replace(/\*/g, '').replace(/%[0-9a-f]{2}/gi, 'x').length;
        group.rules.push({ allow: key === 'allow', length, pattern, end });

      }
    }
  }
  const token = userAgent.split(/[\s/]/, 1)[0]!.toLowerCase();
  const scored = groups.map(g => ({ g, score: Math.max(-1, ...g.agents.map(a => a === '*' ? 0 : a && token.includes(a) ? a.length : -1)) }));
  const best = Math.max(-1, ...scored.map(x => x.score));
  const selected = scored.filter(x => x.score >= 0 && x.score === best).map(x => x.g);
  const rules = selected.flatMap(g => g.rules).sort((a, b) => b.length - a.length || Number(b.allow) - Number(a.allow));
  return {
    delayMs: Math.max(0, ...selected.map(g => g.delay)),
    allows(input) {
      const url = new URL(input);
      const path = octets(url.pathname + url.search);
      return rules.find(rule => matches(rule.pattern, path, rule.end))?.allow ?? true;
    },
  };
}
