// CLI entry point: parses user input, runs a crawl, and writes the requested reports.

import { parseCLI, HELP } from './cli.js';
import { runCrawl } from './engine.js';
import { writeReports } from './report.js';

async function main(): Promise<void> {
  let config: ReturnType<typeof parseCLI>;
  try { config = parseCLI(process.argv.slice(2)); }
  catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 2; return; }
  if (config.help) { console.log(HELP); return; }
  const controller = new AbortController();
  let signalExit = 0;
  const interrupt = () => { signalExit = 130; controller.abort(new Error('Interrupted by SIGINT.')); };
  const terminate = () => { signalExit = 143; controller.abort(new Error('Interrupted by SIGTERM.')); };
  process.once('SIGINT', interrupt); process.once('SIGTERM', terminate);
  try {
    const result = await runCrawl(config.url, config.options, {
      signal: controller.signal, onLog: config.quiet ? undefined : message => console.log(message),
    });
    const files = writeReports(result, config.output);
    console.log(`Finished crawling: ${result.summary.pages_crawled} HTML pages, ${result.summary.failed} failed/non-HTML candidates, ${result.summary.requests} requests.`);
    for (const filename of files) console.log(`Wrote ${filename}`);
    for (const warning of result.warnings) console.error(`Warning: ${warning}`);
    if (config.quiet) for (const error of result.errors.slice(0, 10)) console.error(`${error.kind}: ${error.url}: ${error.message}`);
    const incomplete = result.summary.failed > 0 || result.summary.limit_reached || (result.skipped.depth_limit ?? 0) > 0 || (result.skipped.query_limit ?? 0) > 0 || (result.skipped.link_limit ?? 0) > 0 || (result.skipped.image_limit ?? 0) > 0;
    process.exitCode = signalExit || (result.summary.stopped || !result.summary.pages_crawled || (config.strict && incomplete) ? 1 : 0);
  } finally { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', terminate); }
}
main().catch(error => { console.error(`Fatal: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
