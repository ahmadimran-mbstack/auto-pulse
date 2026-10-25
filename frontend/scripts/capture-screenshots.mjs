import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outputDir = "C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\6de641ba-276c-48d9-a6df-9869d089aa3f\\screenshots";

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const pages = [
  { slug: "overview", path: "/app" },
  { slug: "posts", path: "/app/posts" },
  { slug: "post-detail", path: "/app/posts/test-post-1" },
  { slug: "connections", path: "/app/connections" },
  { slug: "settings", path: "/app/settings" },
  { slug: "design", path: "/design" },
];

const viewports = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];

for (const page of pages) {
  for (const vp of viewports) {
    const outFile = path.join(outputDir, `${page.slug}-${vp.width}.png`);
    const url = `http://localhost:3000${page.path}`;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-ss-"));

    const start = Date.now();
    try {
      execFileSync(chrome, [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-extensions",
        "--disable-component-update",
        "--disable-background-networking",
        "--disable-sync",
        `--user-data-dir=${tempDir}`,
        `--window-size=${vp.width},${vp.height}`,
        `--screenshot=${outFile}`,
        url,
      ], { timeout: 15000 });
      console.log(`Captured ${page.slug}-${vp.width}.png in ${Date.now() - start}ms`);
    } catch (e) {
      console.error(`Failed ${page.slug}-${vp.width}.png:`, e.message);
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}

console.log("All screenshots captured successfully!");
