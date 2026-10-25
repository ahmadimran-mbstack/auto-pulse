#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

// AutoPulse Design System Drift Checker
// Ensures no arbitrary styling or raw colors drift into the codebase

const currentDir = process.cwd();
const frontendDir = fs.existsSync(path.join(currentDir, "app"))
  ? currentDir
  : path.join(currentDir, "frontend");

const targetDirs = [
  path.join(frontendDir, "app"),
  path.join(frontendDir, "components"),
  path.join(frontendDir, "lib"),
];

const extensions = new Set([".tsx", ".jsx", ".ts", ".js", ".mjs", ".css"]);

// Files exempted from drift check
const isExempt = (filePath) => {
  const normalized = filePath.replace(/\\/g, "/");
  // globals.css defines the canonical design tokens
  if (normalized.endsWith("app/globals.css")) return true;
  // Unit tests test edge cases and mock data
  if (normalized.includes(".test.")) return true;
  // Node modules and next build output
  if (normalized.includes("/node_modules/") || normalized.includes("/.next/")) return true;
  // Pure math WCAG color calculations
  if (normalized.endsWith("lib/contrast.ts")) return true;
  return false;
};

// Patterns to detect styling drift
const rules = [
  {
    name: "Raw hex color",
    regex: /#([0-9a-fA-F]{3,8})\b/g,
    description: "Use semantic tokens from globals.css instead of raw hex colors.",
  },
  {
    name: "Raw rgb/rgba color",
    regex: /\brgba?\([^)]+\)/g,
    description: "Use semantic tokens from globals.css instead of rgb/rgba colors.",
  },
  {
    name: "Raw hsl/hsla color",
    regex: /\bhsla?\([^)]+\)/g,
    description: "Use semantic tokens from globals.css instead of hsl/hsla colors.",
  },
  {
    name: "Arbitrary Tailwind bracket value",
    // Matches arbitrary values for color, spacing or radius such as [13px] or [#fff]
    regex: /(?:bg|text|border|ring|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|rounded(?:-[trblse])?)-\[[^\]]+\]/g,
    description: "Use standard Tailwind scale values (1, 2, 3, 4, 5, 6, 8, 10, 12, 16) or defined classes.",
  },
  {
    name: "Shadow class outside components/ui",
    regex: /(?<!box-)\bshadow(?:-(?:xs|sm|md|lg|xl|2xl|inner|none))?\b/g,
    description: "Flat by default. Shadows are only permitted inside components/ui for elevated floating surfaces.",
    onlyOutsideUi: true,
  },
];

const violations = [];

function checkFile(filePath) {
  if (isExempt(filePath)) return;

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const normalizedPath = filePath.replace(/\\/g, "/");
  const isInsideUi = normalizedPath.includes("components/ui/");

  lines.forEach((line, lineIndex) => {
    // Skip single-line comments in check
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
      return;
    }

    rules.forEach((rule) => {
      if (rule.onlyOutsideUi && isInsideUi) {
        return;
      }

      rule.regex.lastIndex = 0;
      let match;
      while ((match = rule.regex.exec(line)) !== null) {
        violations.push({
          file: path.relative(frontendDir, filePath).replace(/\\/g, "/"),
          line: lineIndex + 1,
          rule: rule.name,
          match: match[0],
          description: rule.description,
          context: trimmed,
        });
      }
    });
  });
}

function scanDirectory(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".next") {
        scanDirectory(fullPath);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (extensions.has(ext)) {
        checkFile(fullPath);
      }
    }
  }
}

// Execute check across all target directories
targetDirs.forEach((dir) => scanDirectory(dir));

if (violations.length > 0) {
  console.error("\x1b[31m[check:design] Design system violations found:\x1b[0m\n");
  violations.forEach((v) => {
    console.error(
      `  \x1b[33m${v.file}:${v.line}\x1b[0m - \x1b[1m${v.rule}\x1b[0m (\x1b[36m${v.match}\x1b[0m)`
    );
    console.error(`    ${v.description}`);
    console.error(`    Line: \x1b[90m${v.context}\x1b[0m\n`);
  });
  console.error(`\x1b[31mTotal violations: ${violations.length}\x1b[0m`);
  process.exit(1);
} else {
  console.log("\x1b[32m[check:design] All checks passed. Zero design token drift detected.\x1b[0m");
  process.exit(0);
}
