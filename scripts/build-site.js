#!/usr/bin/env node
// Builds docs/index.html — a single-file, offline-capable explorer covering
// all 3 corpora — from data/index/json/{charter,ordinances,land_dev,versions}.json
// (the same files src/corpus.ts reads at runtime) and scripts/site-template.html.
//
// Run: npm run build-index && node scripts/build-site.js
// Then: open docs/index.html directly, or push this repo to GitHub and
// enable Pages (Settings > Pages > Deploy from branch > /docs) for a public URL.

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const JSON_DIR = join(ROOT, "data", "index", "json");
const TEMPLATE_PATH = join(__dirname, "site-template.html");
const OUT_DIR = join(ROOT, "docs");
const OUT_PATH = join(OUT_DIR, "index.html");

function loadIndex(corpus) {
  const path = join(JSON_DIR, `${corpus}.json`);
  if (!existsSync(path)) {
    console.error(`Missing ${path}. Run "npm run build-index" first.`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

const CORPUS_META = {
  charter: { label: "City Charter", short: "Charter" },
  ordinances: { label: "Code of Ordinances", short: "Ordinances" },
  land_dev: { label: "Land Development Regulations", short: "Land Dev." },
};

const versions = JSON.parse(readFileSync(join(JSON_DIR, "versions.json"), "utf8"));

let sections = [];
for (const corpus of Object.keys(CORPUS_META)) {
  sections = sections.concat(loadIndex(corpus));
}

const groups = [];
const seenGroups = new Set();
for (const r of sections) {
  if (!r.isDivider) continue;
  const key = `${r.corpus}::${r.group}`;
  if (seenGroups.has(key)) continue;
  seenGroups.add(key);
  groups.push({ corpus: r.corpus, group: r.group, label: r.groupLabel, citation: r.citation });
}
// count children per group
const groupCounts = {};
for (const r of sections) {
  if (r.isDivider) continue;
  const key = `${r.corpus}::${r.group}`;
  groupCounts[key] = (groupCounts[key] || 0) + 1;
}
groups.forEach((g) => {
  g.count = groupCounts[`${g.corpus}::${g.group}`] || 0;
});

const data = {
  meta: {
    sourceUrl: "https://ecode360.com/BI3074",
    corpora: Object.fromEntries(
      Object.entries(CORPUS_META).map(([key, m]) => [
        key,
        {
          label: m.label,
          short: m.short,
          asOf: versions[key]?.currentThrough?.match(/on (\S+)$/)?.[1] || "",
          sectionCount: versions[key]?.sectionCount ?? 0,
          dataQuality: versions[key]?.dataQuality ?? "unknown",
        },
      ])
    ),
  },
  groups,
  sections,
};

// Safe embed: escape "</" so a literal "</script>" inside JSON text can't
// terminate the surrounding <script> tag early.
const json = JSON.stringify(data).replace(/<\//g, "<\\/");

const template = readFileSync(TEMPLATE_PATH, "utf8");
const html = template.replace("/*__CHARTER_DATA__*/", json);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_PATH, html);

console.log(`Built ${OUT_PATH} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
console.log(`  ${groups.length} groups, ${sections.filter((s) => !s.isDivider).length} sections across 3 corpora`);
