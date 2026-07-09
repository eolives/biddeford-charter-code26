#!/usr/bin/env node
// CLI: transforms data/source/charter.json (hand-curated from the eCode360 PDF
// export) into the JSON + Markdown index the MCP server reads at runtime.
//
// This replaces nyc-charter-laws-rules' build-index.js, which parses American
// Legal Publishing's bulk XML. Biddeford's charter is on eCode360, which does
// not offer a public bulk feed, so there is no XML to parse here — instead
// data/source/charter.json is the hand-transcribed, human-reviewed source of
// truth (see its "dataQualityNote" field), and this script just reshapes it
// into the same output format nyc-charter-laws-rules used, so the MCP server
// code (src/corpus.ts, src/index.ts) barely has to change.
//
// Run: npm run build-index

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const SOURCE_PATH = join(DATA_DIR, "source", "charter.json");
const JSON_DIR = join(DATA_DIR, "index", "json");
const MD_DIR = join(DATA_DIR, "index", "markdown");

mkdirSync(JSON_DIR, { recursive: true });
mkdirSync(MD_DIR, { recursive: true });

if (!existsSync(SOURCE_PATH)) {
  console.error(`Missing ${SOURCE_PATH}.`);
  process.exit(1);
}

const source = JSON.parse(readFileSync(SOURCE_PATH, "utf8"));
const corpusKey = source.corpus; // "charter"

console.log(`\nBuilding ${corpusKey} from ${SOURCE_PATH}...`);

const sections = [];
for (const article of source.articles) {
  // One record per Article, for list_titles/get_title (mirrors NYC's
  // "Chapter N" top-level records).
  sections.push({
    corpus: corpusKey,
    id: `art-${article.article}`,
    citation: `Art. ${article.article}`,
    heading: `Article ${article.article}: ${article.title}`,
    text: "",
  });

  for (const sec of article.sections) {
    const citation = sec.sec
      ? `Art. ${article.article}, Sec. ${sec.sec}`
      : `Art. ${article.article}`;
    const tag = sec.amended
      ? ` [Amended ${sec.amended}]`
      : sec.added
      ? ` [Added ${sec.added}]`
      : "";
    sections.push({
      corpus: corpusKey,
      id: `art-${article.article}-sec-${sec.sec || "0"}`,
      citation,
      heading: sec.sec
        ? `Sec. ${sec.sec}. ${sec.heading}${tag}`
        : `${sec.heading}${tag}`,
      text: sec.text || "",
    });
  }
}

console.log(`  Built ${sections.length} records (${source.articles.length} articles + sections)`);

writeFileSync(join(JSON_DIR, `${corpusKey}.json`), JSON.stringify(sections, null, 2));
console.log(`  Saved data/index/json/${corpusKey}.json`);

// Markdown index — one file, one section per heading (same shape as NYC repo).
const md = [
  `# City of Biddeford, ME — City Charter`,
  ``,
  `> As of ${source.asOf}. Source: ${source.sourceUrl}`,
  ``,
  `_${sections.length} records indexed (${source.articles.length} articles). History: ${source.history}_`,
  ``,
  `> ⚠️ **Data quality note:** ${source.dataQualityNote}`,
  ``,
  `---`,
  ``,
  ...sections.map((s) =>
    [
      `## ${s.heading}`,
      ``,
      `**Citation:** ${s.citation}`,
      ``,
      s.text || "_No text — heading/divider record only._",
      ``,
      `---`,
      ``,
    ].join("\n")
  ),
].join("\n");

writeFileSync(join(MD_DIR, `${corpusKey}.md`), md);
console.log(`  Saved data/index/markdown/${corpusKey}.md`);

// versions.json — same shape as NYC repo's, just one corpus for now.
const versions = {
  [corpusKey]: {
    currentThrough: `As transcribed from ${source.sourceUrl} on ${source.asOf}`,
    indexedAt: new Date().toISOString(),
    sectionCount: sections.length,
  },
};

const VERSIONS_PATH = join(JSON_DIR, "versions.json");
writeFileSync(VERSIONS_PATH, JSON.stringify(versions, null, 2));
console.log("\nVersions saved to data/index/json/versions.json:");
console.log(JSON.stringify(versions, null, 2));
console.log("\nIndex build complete.");
