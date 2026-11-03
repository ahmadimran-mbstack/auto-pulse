// Audit script to ensure all legal placeholders and TODOs are resolved before production launch
// Fails with a non-zero exit code if any TODO text is found in legal documents
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// Legal files to scan for unconfirmed legal facts and TODO placeholders
const LEGAL_FILES = [
  "lib/legal-config.ts",
  "app/privacy/page.tsx",
  "app/terms/page.tsx",
  "components/legal/LegalShell.tsx",
];

let totalTodos = 0;
const findings = [];

for (const relativePath of LEGAL_FILES) {
  const fullPath = path.join(rootDir, relativePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`Missing legal file: ${relativePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(fullPath, "utf-8");
  const lines = content.split("\n");

  lines.forEach((line, index) => {
    if (line.includes("TODO")) {
      totalTodos += 1;
      findings.push({
        file: relativePath,
        line: index + 1,
        text: line.trim(),
      });
    }
  });
}

console.log("==========================================");
console.log("       AutoPulse Legal Content Audit      ");
console.log("==========================================");

if (totalTodos > 0) {
  console.log(`\nFound ${totalTodos} unresolved TODO item(s) in legal files:\n`);
  findings.forEach((f) => {
    console.log(`  ${f.file}:${f.line}: ${f.text}`);
  });
  console.log("\nAudit failed: Please resolve all TODO items before launch.\n");
  process.exit(1);
} else {
  console.log("\nAudit passed: Zero TODO items found in legal files.\n");
  process.exit(0);
}
