#!/usr/bin/env node
// Parses the two large eCode360 PDF exports (already run through `pdftotext`,
// see data/raw/*.txt) into structured data/source/{ordinances,land_dev}.json.
//
// Unlike data/source/charter.json — which was hand-transcribed and every
// displaced sub-list manually traced and reattached — these two corpora
// (1,374 + 209 sections across ~1,000 pages) are parsed automatically. That
// is disclosed in each file's "dataQualityNote" and surfaced in the MCP
// server and the web explorer. See README "Data quality" section.
//
// Run: node scripts/parse-large-docs.js
// Regenerating data/raw/*.txt (if the source PDFs change) requires poppler's
// `pdftotext`: pdftotext <file>.pdf data/raw/<name>.txt

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RAW_DIR = join(ROOT, "data", "raw");
const SOURCE_DIR = join(ROOT, "data", "source");
const SOURCE_URL = "https://ecode360.com/BI3074";
const AS_OF = "2026-07-14";

const AUTO_PARSE_NOTE =
  "This corpus was parsed automatically from a PDF export downloaded from " +
  SOURCE_URL +
  " on " +
  AS_OF +
  " — unlike data/source/charter.json, it was NOT hand-verified section by section (that was feasible for the Charter's 74 sections; it is not for a corpus this size). The parser strips repeated page headers/footers and splits on citation markers (e.g. 'Sec. 18-1.', 'Article VI'), picking the longest of the two occurrences of each section (the real content, vs. its entry in that chapter's table of contents) as the canonical text. Known limitations: a small number of '(Reserved)' placeholder sections may show a trailing title fragment from the next division; heading/body splitting uses the first sentence-ending period, which can occasionally cut a heading short if it contains an abbreviation. Always verify anything load-bearing — especially permitting, setback, or fee figures — against the live source.";

function splitHeadingAndBody(raw) {
  const text = raw.trim();
  // Heading = up to the first ". " or ".\n" (end of the title sentence);
  // body = everything after, including amendment-citation brackets.
  const m = text.match(/^(.{1,180}?\.)(?:\s|$)/s);
  if (m) {
    return { heading: m[1].trim(), body: text.slice(m[0].length).trim() };
  }
  // No period found (e.g. "(Reserved)") — use the first line as heading.
  const nl = text.indexOf("\n");
  if (nl === -1) return { heading: text, body: "" };
  return { heading: text.slice(0, nl).trim(), body: text.slice(nl).trim() };
}

function parseFlatSections(body, refPattern) {
  const re = new RegExp(refPattern, "g");
  const matches = [...body.matchAll(re)];
  const occ = matches.map((m, i) => {
    const s = m.index + m[0].length;
    const e = i + 1 < matches.length ? matches[i + 1].index : body.length;
    return { num: m[1], raw: body.slice(s, e).trim() };
  });
  const best = new Map();
  for (const o of occ) {
    const existing = best.get(o.num);
    if (!existing || o.raw.length > existing.raw.length) best.set(o.num, o);
  }
  return [...best.values()];
}

// ============================== ORDINANCES ==============================
function parseOrdinances() {
  const raw = readFileSync(join(RAW_DIR, "ordinances.txt"), "utf8");

  const text = raw
    .replace(/\f/g, "")
    .replace(/^City of Biddeford, ME$/gm, "")
    .replace(/^BIDDEFORD CODE$/gm, "")
    .replace(/^Code of Ordinances$/gm, "")
    .replace(/^Downloaded from https:\/\/ecode360\.com\/BI3074.*$/gm, "")
    .replace(
      /^Sec\. (\d+-\d+[A-Za-z]?)\n+(?:(?!Chapter |ARTICLE |DIVISION )[A-Z0-9 ,'\/&\-]+\n+){1,2}(?:Sec\. \1\n+)?/gm,
      "\n"
    )
    .replace(/\n{3,}/g, "\n\n");

  const chapterRe = /^Chapter (\d+)\n([A-Z][A-Z0-9 ,'\/&\-]+)$/gm;
  const chapterMatches = [...text.matchAll(chapterRe)];

  const chapters = chapterMatches.map((m, i) => {
    const start = m.index;
    const end = i + 1 < chapterMatches.length ? chapterMatches[i + 1].index : text.length;
    const body = text.slice(start, end);
    const rawSections = parseFlatSections(body, "Sec\\. (\\d+-\\d+[A-Za-z]?)\\.\\s*");
    rawSections.sort((a, b) => {
      const an = parseInt(a.num.split("-")[1], 10);
      const bn = parseInt(b.num.split("-")[1], 10);
      return an - bn;
    });
    return {
      chapter: m[1],
      title: titleCase(m[2].replace(/\d+$/, "").trim()),
      sections: rawSections.map(({ num, raw }) => {
        const { heading, body } = splitHeadingAndBody(raw);
        return { sec: num, heading, text: body };
      }),
    };
  });

  return {
    corpus: "ordinances",
    sourceUrl: SOURCE_URL,
    sourceLabel: "City of Biddeford, ME — Code of Ordinances (eCode360 / General Code)",
    asOf: AS_OF,
    dataQualityNote: AUTO_PARSE_NOTE,
    chapters,
  };
}

// ========================= LAND DEVELOPMENT REGS =========================
function parseLandDev() {
  const raw = readFileSync(join(RAW_DIR, "land-development.txt"), "utf8");

  const text = raw
    .replace(/\f/g, "")
    .replace(/^City of Biddeford, ME$/gm, "")
    .replace(/^BIDDEFORD CODE$/gm, "")
    .replace(/^Land Development Regulations$/gm, "")
    .replace(/^Downloaded from https:\/\/ecode360\.com\/BI3074.*$/gm, "")
    .replace(
      /^Sec\. ([A-Z]-\d+[a-z]?)\n+(?:(?!APPENDIX |Chapter |Article )[A-Z0-9 ,'\/&\-]+\n+){1,2}(?:Sec\. \1\n+)?/gm,
      "\n"
    )
    .replace(
      /^Section (\d+)\n+(?:(?!APPENDIX |Chapter |Article )[A-Z0-9 ,'\/&\-\.]+\n+){1,2}(?:Section \1\n+)?/gm,
      "\n"
    )
    .replace(/\n{3,}/g, "\n\n");

  const topRe = /^(APPENDIX [A-Z]|Chapter LDR|Chapter CCT)\n([A-Z][A-Z0-9 ,'\/&\-]*)$/gm;
  const topMatches = [...text.matchAll(topRe)];
  const parts = topMatches.map((m, i) => ({
    key: m[1],
    title: titleCase(m[2].trim()),
    start: m.index,
    end: i + 1 < topMatches.length ? topMatches[i + 1].index : text.length,
  }));

  const appendixA = parts.find((p) => p.key === "APPENDIX A");
  const chapterLDR = parts.find((p) => p.key === "Chapter LDR");
  // Chapter CCT (Code Comparative Table) is a cross-reference table, not
  // enacted regulatory text — intentionally not indexed.

  const appendixASections = appendixA
    ? parseFlatSections(text.slice(appendixA.start, appendixA.end), "Sec\\. (A-\\d+)\\.\\s*").map(
        ({ num, raw }) => {
          const { heading, body } = splitHeadingAndBody(raw);
          return { sec: num, heading, text: body };
        }
      )
    : [];

  const articleRe = /^Article ([IVXLC]+)\n([A-Z][A-Z0-9 ,'\/&\-]+)$/gm;
  const ldrBody = chapterLDR ? text.slice(chapterLDR.start, chapterLDR.end) : "";
  const articleMatches = [...ldrBody.matchAll(articleRe)];
  const articles = articleMatches.map((m, i) => {
    const start = m.index;
    const end = i + 1 < articleMatches.length ? articleMatches[i + 1].index : ldrBody.length;
    const body = ldrBody.slice(start, end);
    const rawSections = parseFlatSections(body, "Section (\\d+)\\.\\s*");
    rawSections.sort((a, b) => parseInt(a.num, 10) - parseInt(b.num, 10));
    return {
      article: m[1],
      title: titleCase(m[2].trim()),
      sections: rawSections.map(({ num, raw }) => {
        const { heading, body } = splitHeadingAndBody(raw);
        return { sec: num, heading, text: body };
      }),
    };
  });

  return {
    corpus: "land_dev",
    sourceUrl: SOURCE_URL,
    sourceLabel: "City of Biddeford, ME — Land Development Regulations (eCode360 / General Code)",
    asOf: AS_OF,
    dataQualityNote: AUTO_PARSE_NOTE,
    appendixA: { title: "Rules of City Council", sections: appendixASections },
    chapterLDR: { title: "Land Development Regulations", articles },
  };
}

function titleCase(s) {
  // "GENERAL PROVISIONS" -> "General Provisions"; keeps small connector
  // words lowercase except at the start, and leaves embedded acronyms/
  // numbers alone since .toLowerCase() only touches letters after the first.
  const small = new Set(["of", "and", "the", "or", "in", "for", "to", "a", "an"]);
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i) => {
      if (i > 0 && small.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ")
    .replace(/,\s*/g, ", ");
}

const ordinances = parseOrdinances();
const landDev = parseLandDev();

writeFileSync(join(SOURCE_DIR, "ordinances.json"), JSON.stringify(ordinances, null, 2));
writeFileSync(join(SOURCE_DIR, "land_dev.json"), JSON.stringify(landDev, null, 2));

const ordCount = ordinances.chapters.reduce((n, c) => n + c.sections.length, 0);
const ldCount =
  landDev.appendixA.sections.length +
  landDev.chapterLDR.articles.reduce((n, a) => n + a.sections.length, 0);

console.log(`ordinances.json: ${ordinances.chapters.length} chapters, ${ordCount} sections`);
console.log(
  `land_dev.json: Appendix A (${landDev.appendixA.sections.length} sections) + ` +
    `Chapter LDR (${landDev.chapterLDR.articles.length} articles, ${landDev.chapterLDR.articles.reduce((n, a) => n + a.sections.length, 0)} sections) = ${ldCount} sections total`
);
