// Parses command-line arguments and converts them into validated crawler options.

import { parseArgs } from 'node:util';
import { validateOptions } from './options.js';
import { httpURL } from './url.js';
import type { CrawlOptions } from './types.js';
export const HELP = `BootCrawler — bounded same-origin HTML crawling and offline reports

Usage:
  npm run start <URL> <maxConcurrency> <maxPages>
  npm start -- <URL> [options]
  node dist/index.js <URL> [options]

Options:
  --concurrency N         Active page workers (default 3; maximum 32)
  --max-pages N           Candidate URL budget, including failed URLs (default 50)
  --max-depth N           Discovery depth limit; root is 0 (default 10)
  --timeout-ms N          Per HTTP attempt, including body reading (default 15000)
  --retries N             Extra tries for transient failures (default 2)
  --delay-ms N            Minimum request-start spacing (default 200)
  --max-duration-ms N     Total run deadline (default 600000)
  --max-body-bytes N      Streamed response size limit (default 2097152)
  --max-query-variants N  Per-path candidate limit (default 10)
  --path-prefix PATH     Restrict to a path and its descendants
  --strip-tracking       Remove utm_*, gclid, fbclid and msclkid parameters
  --no-robots            Disable robots.txt policy ONLY for authorized testing
  --user-agent TEXT      Crawler product token, optionally with /version
  --out PATH             Output prefix or JSON path (default report.json)
  --strict               Exit 1 if any candidate fails or the budget is exhausted
  --quiet                Suppress per-page progress; keep summary and errors
  --help                 Show this help

Outputs: JSON page array, CSV, HTML dashboard, SVG link map, summary JSON.
Exit codes: 0 = pages collected; 1 = failure/strict incomplete run; 2 = bad arguments;
            130 = SIGINT; 143 = SIGTERM. Deadlines return 1 and save partial results.
Only HTTP(S); credentials in URLs are rejected. No login or JavaScript rendering.
`;
const numeric: Record<string, keyof CrawlOptions> = {
  concurrency: 'maxConcurrency', 'max-pages': 'maxPages', 'max-depth': 'maxDepth',
  'timeout-ms': 'timeoutMs', retries: 'retries', 'delay-ms': 'delayMs',
  'max-duration-ms': 'maxDurationMs', 'max-body-bytes': 'maxBodyBytes', 'max-query-variants': 'maxQueryVariants',
};
export interface CLIConfig { help: boolean; url: string; options: CrawlOptions; output: string; strict: boolean; quiet: boolean }
export function parseCLI(args: string[]): CLIConfig {
  const definitions: Record<string, { type: 'string' | 'boolean' }> = {};
  for (const key of [...Object.keys(numeric), 'path-prefix', 'user-agent', 'out']) definitions[key] = { type: 'string' };
  for (const key of ['help', 'strip-tracking', 'no-robots', 'strict', 'quiet']) definitions[key] = { type: 'boolean' };
  const { values, positionals } = parseArgs({ args, options: definitions, allowPositionals: true, strict: true });
  if (values.help) return { help: true, url: '', options: validateOptions({}), output: 'report.json', strict: false, quiet: false };
  if (![1, 3].includes(positionals.length)) throw new Error('Provide a URL, optionally followed by concurrency and maxPages. Use --help for examples.');
  const options: Partial<CrawlOptions> = {};
  function number(name: string, value: unknown): number {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error(`${name} must be a non-negative whole number.`);
    return Number(value);
  }
  if (positionals.length === 3) {
    if (values.concurrency !== undefined || values['max-pages'] !== undefined) throw new Error('Do not mix positional limits with --concurrency or --max-pages.');
    options.maxConcurrency = number('concurrency', positionals[1]); options.maxPages = number('maxPages', positionals[2]);
  }
  for (const [flag, key] of Object.entries(numeric)) if (values[flag] !== undefined) Object.assign(options, { [key]: number(flag, values[flag]) });
  if (typeof values['path-prefix'] === 'string') options.pathPrefix = values['path-prefix'];
  if (typeof values['user-agent'] === 'string') options.userAgent = values['user-agent'];
  options.stripTracking = values['strip-tracking'] === true;
  options.respectRobots = values['no-robots'] !== true;
  const output = typeof values.out === 'string' ? values.out : 'report.json';
  if (!output.trim() || output.includes('\0')) throw new Error('Output path must be nonempty.');
  return { help: false, url: httpURL(positionals[0]!), options: validateOptions(options), output, strict: values.strict === true, quiet: values.quiet === true };
}
