import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
const { build } = require("esbuild");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const built = await build({ stdin: { contents: '@import "./app/globals.css"; @import "./app/admin/design-tokens.css"; @import "./app/admin/design-system.css";', resolveDir: process.cwd(), loader: "css" }, bundle: true, write: false });
const server = createServer((req, res) => {
  if (req.url === "/styles.css") { res.setHeader("Content-Type", "text/css"); res.end(built.outputFiles[0].contents); return; }
  const studio = req.url.includes("studio");
  res.end(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body class="showrunner-admin"><div class="admin-root" style="grid-template-columns:minmax(0,1fr)"><main class="admin-main"><div class="${studio ? "product-studio-page" : "stack"}"><header class="${studio ? "product-studio-header" : "page-header"}"><h1>Module header</h1><button>Save</button></header><section style="height:2400px">Scrolling content</section></div></main></div></body></html>`);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
mkdirSync(".tmp", { recursive: true });
try {
  const page = await browser.newPage();
  for (const width of [1360, 982, 390]) for (const kind of ["module", "studio"]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`http://127.0.0.1:${server.address().port}/${kind}`);
    const inspect = () => page.evaluate(() => {
      const main = document.querySelector("main"), header = main.querySelector("header");
      const m = main.getBoundingClientRect(), h = header.getBoundingClientRect();
      return { gap: h.top - m.top, padding: getComputedStyle(main).paddingTop, headerCoversTop: header.contains(document.elementFromPoint(m.left + m.width / 2, m.top + 2)), overflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert.equal((await inspect()).padding, "0px");
    assert(Math.abs((await inspect()).gap) < 1, `${kind} header begins at the workspace top at ${width}px`);
    if (width > 860) {
      await page.locator("main").evaluate(main => { main.scrollTop = 500; });
      await page.waitForFunction(() => document.querySelector("main").scrollTop > 0);
      const scrolled = await inspect();
      assert(Math.abs(scrolled.gap) < 1, `${kind} header remains flush while scrolling at ${width}px`);
      assert(scrolled.headerCoversTop, "Scrolled content cannot appear above the header");
    }
    assert.equal((await inspect()).overflow, false);
    await page.screenshot({ path: `.tmp/admin-header-${kind}-${width}.png` });
  }
  console.log("PASS: module and studio headers sit flush before and after scrolling on desktop; mobile retains its normal header flow.");
} finally { await browser.close(); server.close(); }
