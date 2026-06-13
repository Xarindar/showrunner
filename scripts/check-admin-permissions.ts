import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const roots = ["app", "modules"];
const extensions = new Set([".ts", ".tsx"]);
const ignoredSegments = new Set(["node_modules", ".next", ".git"]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (ignoredSegments.has(entry)) continue;

    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      yield* walk(fullPath);
      continue;
    }

    if (extensions.has(path.extname(fullPath))) yield fullPath;
  }
}

function lineNumber(source: string, index: number) {
  return source.slice(0, index).split(/\r?\n/).length;
}

const findings: string[] = [];

for (const root of roots) {
  for (const file of walk(root)) {
    const source = readFileSync(file, "utf8");
    if (!source.includes('"use server"') && !source.includes("'use server'")) continue;

    for (const match of source.matchAll(/\brequireAdmin\s*\(\s*\)/g)) {
      findings.push(`${file}:${lineNumber(source, match.index ?? 0)} bare requireAdmin()`);
    }

    for (const match of source.matchAll(/\brequireAuthenticatedAdmin\s*\(/g)) {
      findings.push(`${file}:${lineNumber(source, match.index ?? 0)} requireAuthenticatedAdmin() in server action`);
    }
  }
}

if (findings.length) {
  console.error("Admin permission regression check failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log("Admin permission regression check passed.");
