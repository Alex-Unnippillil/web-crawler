import { expect, test } from "vitest";
import {
  normalizeURL,
  getHeadingFromHTML,
  getFirstParagraphFromHTML,
  getURLsFromHTML,
  getImagesFromHTML,
  extractPageData,
} from "./crawl.js";

test("normalizeURL", () => {
  expect(normalizeURL("https://www.boot.dev/blog/path/"))
    .toBe("www.boot.dev/blog/path");
});

test("heading h1", () => {
  expect(getHeadingFromHTML("<h1>Title</h1>")).toBe("Title");
});

test("heading h2 fallback", () => {
  expect(getHeadingFromHTML("<h2>Fallback</h2>")).toBe("Fallback");
});

test("paragraph", () => {
  expect(getFirstParagraphFromHTML("<p>First</p>")).toBe("First");
});

test("paragraph main priority", () => {
  expect(
    getFirstParagraphFromHTML("<p>Outside</p><main><p>Main</p></main>")
  ).toBe("Main");
});

test("links", () => {
  expect(
    getURLsFromHTML('<a href="/one">One</a>', "https://crawler-test.com")
  ).toEqual(["https://crawler-test.com/one"]);
});

test("images", () => {
  expect(
    getImagesFromHTML('<img src="/logo.png">', "https://crawler-test.com")
  ).toEqual(["https://crawler-test.com/logo.png"]);
});

test("extractPageData basic", () => {
  const html = `
    <html><body>
      <h1>Test Title</h1>
      <p>This is the first paragraph.</p>
      <a href="/link1">Link 1</a>
      <img src="/image1.jpg">
    </body></html>
  `;

  expect(extractPageData(html, "https://crawler-test.com")).toEqual({
    url: "https://crawler-test.com",
    heading: "Test Title",
    first_paragraph: "This is the first paragraph.",
    outgoing_links: ["https://crawler-test.com/link1"],
    image_urls: ["https://crawler-test.com/image1.jpg"],
  });
});
