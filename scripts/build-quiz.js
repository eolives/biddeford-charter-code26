#!/usr/bin/env node
// Builds docs/quiz.html — a single-file, offline-capable civic quiz — from
// data/source/quiz-questions.json and scripts/quiz-template.html.
//
// Run: node scripts/build-quiz.js
// Then: open docs/quiz.html directly, or (once pushed with the rest of
// docs/) it's served alongside the explorer at the same GitHub Pages site.
//
// Live per-question "N% of respondents got this right" stats use the
// window.storage API when the file is opened as a Claude artifact (shared
// across everyone who opens it); otherwise it falls back to per-browser
// localStorage automatically — see the storage abstraction in the template.

import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SOURCE_PATH = join(ROOT, "data", "source", "quiz-questions.json");
const TEMPLATE_PATH = join(__dirname, "quiz-template.html");
const OUT_DIR = join(ROOT, "docs");
const OUT_PATH = join(OUT_DIR, "quiz.html");

// Default: same-folder deployment (docs/index.html + docs/quiz.html on
// GitHub Pages). Override for a standalone build, e.g.:
//   node scripts/build-quiz.js --explorer-url=biddeford-charter-explorer.html --out=/tmp/quiz.html
const args = process.argv.slice(2);
function argVal(flag, fallback) {
  const hit = args.find((a) => a.startsWith(`--${flag}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}
const explorerUrl = argVal("explorer-url", "index.html");
const outPath = argVal("out", OUT_PATH);

const data = JSON.parse(readFileSync(SOURCE_PATH, "utf8"));

// Safe embed: escape "</" so a literal "</script>" inside JSON text can't
// terminate the surrounding <script> tag early.
const json = JSON.stringify(data).replace(/<\//g, "<\\/");

let html = readFileSync(TEMPLATE_PATH, "utf8");
html = html.replace("/*__QUIZ_DATA__*/", json);
html = html.replace("/*__EXPLORER_URL__*/", explorerUrl);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, html);

console.log(`Built ${outPath} (${(html.length / 1024).toFixed(1)} KB)`);
console.log(`  ${data.questions.length} questions across ${Object.keys(data.themes).length} themes`);
console.log(`  explorer link: ${explorerUrl}`);
