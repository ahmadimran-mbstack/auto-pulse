import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outputDir = "C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\b237e628-aa24-43b5-9adb-901d73e35641\\screenshots";

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const pages = [
  { slug: "landing", path: "/" },
  { slug: "sign-in", path: "/auth/sign-in" },
  { slug: "sign-up", path: "/auth/sign-up" },
  { slug: "forgot-password", path: "/auth/forgot-password" },
  { slug: "reset-password", path: "/auth/reset-password" },
  { slug: "verify-otp", path: "/auth/verify-otp" },
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
      execFileSync(
        chrome,
        [
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
        ],
        { timeout: 20000 }
      );
      console.log(`Captured ${page.slug}-${vp.width}.png in ${Date.now() - start}ms`);
    } catch (e) {
      console.error(`Failed ${page.slug}-${vp.width}.png:`, e.message);
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

console.log("Screenshots captured successfully.");
