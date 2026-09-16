import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExtractedPageData } from "./crawl";

export function writeJSONReport(
  pageData: Record<string, ExtractedPageData>,
  filename = "report.json"
): void {
  const sorted = Object.values(pageData).sort((a, b) =>
    a.url.localeCompare(b.url)
  );

  writeFileSync(
    resolve(process.cwd(), filename),
    JSON.stringify(sorted, null, 2),
    "utf8"
  );
}
