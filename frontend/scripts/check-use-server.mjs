import fs from "node:fs";
import path from "node:path";

const ROOTS = ["app", "lib", "components", "hooks"];
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (EXTS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

const files = ROOTS.flatMap((r) => walk(path.resolve(process.cwd(), r)));
const errors = [];

for (const file of files) {
  const raw = fs.readFileSync(file, "utf8");
  const trimmed = raw.trimStart();
  const hasTopDirective =
    trimmed.startsWith('"use server"') || trimmed.startsWith("'use server'");

  if (!hasTopDirective) continue;

  const clean = stripComments(raw);
  const lines = clean.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("export ")) continue;

    // Allow TypeScript type/interface exports (stripped at compile time)
    if (/^export\s+(?:type|interface)\b/.test(line)) continue;

    // Allow only async function declarations
    if (/^export\s+async\s+function\b/.test(line)) continue;

    // Allow export default async function
    if (/^export\s+default\s+async\s+function\b/.test(line)) continue;

    errors.push({
      file: path.relative(process.cwd(), file),
      line: i + 1,
      text: line.slice(0, 120),
    });
  }
}

if (errors.length > 0) {
  console.error('Invalid export(s) found in "use server" file(s):');
  for (const e of errors) {
    console.error(`  ${e.file}:${e.line} -> ${e.text}`);
  }
  process.exit(1);
}

console.log('check-use-server: all "use server" files are valid.');
