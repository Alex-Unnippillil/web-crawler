import { JSDOM } from "jsdom";
import pLimit from "p-limit";

export type ExtractedPageData = {
  url: string;
  heading: string;
  first_paragraph: string;
  outgoing_links: string[];
  image_urls: string[];
};

export function normalizeURL(urlString: string): string {
  const url = new URL(urlString);
  const normalized = `${url.hostname}${url.pathname}`;
  return normalized.endsWith("/")
    ? normalized.slice(0, -1)
    : normalized;
}

export function getHeadingFromHTML(html: string): string {
  const doc = new JSDOM(html).window.document;
  const heading = doc.querySelector("h1") ?? doc.querySelector("h2");
  return heading?.textContent?.trim() ?? "";
}

export function getFirstParagraphFromHTML(html: string): string {
  const doc = new JSDOM(html).window.document;
  const paragraph =
    doc.querySelector("main p") ?? doc.querySelector("p");
  return paragraph?.textContent?.trim() ?? "";
}

export function getURLsFromHTML(
  html: string,
  baseURL: string
): string[] {
  const doc = new JSDOM(html).window.document;
  const urls: string[] = [];

  for (const element of doc.querySelectorAll("a")) {
    const href = element.getAttribute("href");
    if (!href) continue;

    try {
      urls.push(new URL(href, baseURL).href);
    } catch {}
  }

  return urls;
}

export function getImagesFromHTML(
  html: string,
  baseURL: string
): string[] {
  const doc = new JSDOM(html).window.document;
  const urls: string[] = [];

  for (const element of doc.querySelectorAll("img")) {
    const src = element.getAttribute("src");
    if (!src) continue;

    try {
      urls.push(new URL(src, baseURL).href);
    } catch {}
  }

  return urls;
}

export function extractPageData(
  html: string,
  pageURL: string
): ExtractedPageData {
  return {
    url: pageURL,
    heading: getHeadingFromHTML(html),
    first_paragraph: getFirstParagraphFromHTML(html),
    outgoing_links: getURLsFromHTML(html, pageURL),
    image_urls: getImagesFromHTML(html, pageURL),
  };
}

export class ConcurrentCrawler {
  baseURL: string;
  pages: Record<string, ExtractedPageData> = {};
  limit: ReturnType<typeof pLimit>;
  maxPages: number;
  shouldStop = false;
  allTasks = new Set<Promise<void>>();
  visited = new Set<string>();

  constructor(
    baseURL: string,
    maxConcurrency: number,
    maxPages: number
  ) {
    this.baseURL = baseURL;
    this.limit = pLimit(maxConcurrency);
    this.maxPages = maxPages;
  }

  private addPageVisit(normalizedURL: string): boolean {
    if (this.shouldStop) return false;

    if (this.visited.has(normalizedURL)) return false;

    if (this.visited.size >= this.maxPages) {
      this.shouldStop = true;
      console.log("Reached maximum number of pages to crawl.");
      return false;
    }

    this.visited.add(normalizedURL);
    return true;
  }

  private async getHTML(currentURL: string): Promise<string> {
    return this.limit(async () => {
      try {
        const response = await fetch(currentURL, {
          headers: {
            "User-Agent": "BootCrawler/1.0",
          },
        });

        if (response.status >= 400) {
          console.error(
            `HTTP error ${response.status}: ${currentURL}`
          );
          return "";
        }

        const contentType =
          response.headers.get("content-type") ?? "";

        if (!contentType.includes("text/html")) {
          console.error(`Not HTML: ${currentURL}`);
          return "";
        }

        return await response.text();
      } catch (error) {
        console.error(`Fetch failed: ${currentURL}`);
        return "";
      }
    });
  }

  private addTask(url: string): Promise<void> {
    let task: Promise<void>;

    task = this.crawlPage(url).finally(() => {
      this.allTasks.delete(task);
    });

    this.allTasks.add(task);
    return task;
  }

  private async crawlPage(currentURL: string): Promise<void> {
    if (this.shouldStop) return;

    let current: URL;
    let base: URL;

    try {
      current = new URL(currentURL);
      base = new URL(this.baseURL);
    } catch {
      return;
    }

    if (current.hostname !== base.hostname) return;

    const normalizedURL = normalizeURL(currentURL);

    if (!this.addPageVisit(normalizedURL)) return;

    console.log(`crawling: ${currentURL}`);

    this.pages[normalizedURL] = {
      url: currentURL,
      heading: "",
      first_paragraph: "",
      outgoing_links: [],
      image_urls: [],
    };

    const html = await this.getHTML(currentURL);
    if (!html) return;

    const data = extractPageData(html, currentURL);
    this.pages[normalizedURL] = data;

    const tasks = data.outgoing_links.map((nextURL) =>
      this.addTask(nextURL)
    );

    await Promise.all(tasks);
  }

  async crawl(): Promise<Record<string, ExtractedPageData>> {
    await this.addTask(this.baseURL);
    return this.pages;
  }
}

export async function crawlSiteAsync(
  baseURL: string,
  maxConcurrency: number,
  maxPages: number
): Promise<Record<string, ExtractedPageData>> {
  const crawler = new ConcurrentCrawler(
    baseURL,
    maxConcurrency,
    maxPages
  );

  return crawler.crawl();
}
