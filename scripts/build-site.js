#!/usr/bin/env node
// Builds docs/index.html — a single-file, offline-capable charter explorer —
// from data/source/charter.json and scripts/site-template.html.
//
// Run: node scripts/build-site.js
// Then: open docs/index.html directly, or push this repo to GitHub and
// enable Pages (Settings > Pages > Deploy from branch > /docs) for a public URL.

import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SOURCE_PATH = join(ROOT, "data", "source", "charter.json");
const TEMPLATE_PATH = join(__dirname, "site-template.html");
const OUT_DIR = join(ROOT, "docs");
const OUT_PATH = join(OUT_DIR, "index.html");

const source = JSON.parse(readFileSync(SOURCE_PATH, "utf8"));

const articles = [];
const sections = [];

for (const article of source.articles) {
  articles.push({ id: article.article, title: article.title, count: article.sections.length });

  sections.push({
    id: `art-${article.article}`,
    articleId: article.article,
    articleTitle: article.title,
    citation: `Art. ${article.article}`,
    heading: "",
    tag: null,
    text: "",
    reassembled: null,
    isDivider: true,
  });

  for (const sec of article.sections) {
    const citation = sec.sec ? `Art. ${article.article}, Sec. ${sec.sec}` : `Art. ${article.article}`;
    const tag = sec.amended ? `Amended ${sec.amended}` : sec.added ? `Added ${sec.added}` : null;
    sections.push({
      id: `art-${article.article}-sec-${sec.sec || "0"}`,
      articleId: article.article,
      articleTitle: article.title,
      citation,
      heading: sec.sec ? `Sec. ${sec.sec}. ${sec.heading}` : sec.heading,
      tag,
      text: sec.text || "",
      reassembled: sec.reassembled || null,
      isDivider: false,
    });
  }
}

const data = {
  meta: {
    asOf: source.asOf,
    sourceUrl: source.sourceUrl,
    sourceLabel: source.sourceLabel,
    dataQualityNote: source.dataQualityNote,
    sectionCount: sections.filter((s) => !s.isDivider).length,
  },
  articles,
  sections,
};

// Safe embed: escape "</" so a literal "</script>" inside JSON text can't
// terminate the surrounding <script> tag early.
const json = JSON.stringify(data).replace(/<\//g, "<\\/");

const template = readFileSync(TEMPLATE_PATH, "utf8");
const html = template.replace("/*__CHARTER_DATA__*/", json);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_PATH, html);

console.log(`Built ${OUT_PATH}`);
console.log(`  ${articles.length} articles, ${data.meta.sectionCount} sections`);
console.log(`  ${sections.filter((s) => s.reassembled).length} sections flagged "reassembled"`);
