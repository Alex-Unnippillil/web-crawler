import { crawlSiteAsync } from "./crawl";
import { writeJSONReport } from "./report";

async function main() {
  const args = process.argv.slice(2);

  if (args.length !== 3) {
    console.error(
      "usage: npm run start <URL> <maxConcurrency> <maxPages>"
    );
    process.exit(1);
  }

  const baseURL = args[0];
  const maxConcurrency = Number(args[1]);
  const maxPages = Number(args[2]);

  const pages = await crawlSiteAsync(
    baseURL,
    maxConcurrency,
    maxPages
  );

  console.log("Finished crawling.");

  const firstPage = Object.values(pages)[0];
  if (firstPage) {
    console.log(
      `First page record: ${firstPage.url} - ${firstPage.heading}`
    );
  }

  writeJSONReport(pages, "report.json");
  console.log(`Wrote ${Object.keys(pages).length} pages to report.json`);
}

main();
